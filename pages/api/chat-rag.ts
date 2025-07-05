import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { supabase } from '../../lib/supabaseClient';
import { RAGPipeline } from '../../lib/rag/pipeline';
import { openaiApiKey } from '../../lib/rag/config';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Define response type
interface ChatResponse {
  reply: string;
  modelUsed?: string;
  sources?: Array<{
    content: string;
    metadata: any;
    similarity: number;
  }>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse | { error: string }>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract request data
  const { prompt, mode = 'technical', model = 'simple' } = req.body;

  // Validate request data
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }

  try {
    console.log(`🔍 Processing chat request: "${prompt.substring(0, 50)}..."`);
    
    // Validate environment variables
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // 1. Create RAG pipeline
    const pipeline = new RAGPipeline(supabase, openaiApiKey);

    // 2. Search for relevant documents
    console.log(`🔍 Searching for documents relevant to: "${prompt.substring(0, 50)}..."`);
    const similarDocuments = await pipeline.searchSimilarDocuments(prompt);
    
    // 3. Prepare context from similar documents
    let context = '';
    const sources: any[] = [];
    
    if (similarDocuments && similarDocuments.length > 0) {
      console.log(`✅ Found ${similarDocuments.length} relevant documents`);
      
      // Extract content and format as context
      context = similarDocuments.map((doc, index) => {
        // Save source for response
        sources.push({
          content: doc.content.substring(0, 150) + '...',
          metadata: doc.metadata,
          similarity: doc.similarity
        });
        
        // Format as context
        return `[Document ${index + 1}]: ${doc.content}`;
      }).join('\n\n');
    } else {
      console.log('⚠️ No relevant documents found');
    }

    // 4. Choose the appropriate system prompt based on mode
    const systemPrompt = mode === 'technical' 
      ? `Je bent CeeS, een technische AI-assistent voor CS Rental. Help gebruikers met technische documentatie en ondersteuning. Geef duidelijke, praktische antwoorden.
      
${context ? 'Gebruik de volgende context om je antwoorden te verbeteren:' : 'Ik kon geen relevante informatie vinden in de documentatie. Geef een algemeen antwoord of stel voor om de vraag anders te formuleren.'}

${context}`
      : `Je bent ChriS, een inkoop AI-assistent voor CS Rental. Help gebruikers met inkoop en onderdelen informatie. Focus op praktische inkoop-gerelateerde vragen.
      
${context ? 'Gebruik de volgende context om je antwoorden te verbeteren:' : 'Ik kon geen relevante informatie vinden in de documentatie. Geef een algemeen antwoord of stel voor om de vraag anders te formuleren.'}

${context}`;

    // 5. Choose the appropriate model based on complexity
    let selectedModel;
    if (model === 'complex') {
      selectedModel = process.env.OPENAI_MODEL_COMPLEX || 'gpt-4';
    } else {
      selectedModel = process.env.OPENAI_MODEL_SIMPLE || 'gpt-4-turbo';
    }

    // 6. Generate response with OpenAI
    console.log(`🤖 Generating response using ${selectedModel}...`);
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: model === 'complex' ? 2000 : 1000,
      temperature: model === 'complex' ? 0.3 : 0.7,
    });

    // 7. Extract the response
    const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis bij het genereren van een antwoord.';
    
    // 8. Log the prompt, context, and response to chat_logs table
    try {
      await supabase.from('chat_logs').insert({
        prompt,
        context: context || 'No relevant context found',
        response: reply,
        model: selectedModel,
        mode,
        timestamp: new Date().toISOString(),
        has_context: context.length > 0
      });
    } catch (logError) {
      console.error('Failed to log chat:', logError);
      // Continue even if logging fails
    }

    // 9. Return the response
    return res.status(200).json({ 
      reply, 
      modelUsed: selectedModel,
      sources: sources.length > 0 ? sources : undefined
    });

  } catch (error: any) {
    console.error('❌ Error in chat-rag API:', error);

    // Fallback response if context retrieval fails but we can still use OpenAI
    if (error.message.includes('match_documents') || error.message.includes('vector')) {
      try {
        console.log('⚠️ Vector search failed, falling back to direct OpenAI query');
        
        // Choose the appropriate model based on complexity
        let selectedModel;
        if (model === 'complex') {
          selectedModel = process.env.OPENAI_MODEL_COMPLEX || 'gpt-4';
        } else {
          selectedModel = process.env.OPENAI_MODEL_SIMPLE || 'gpt-4-turbo';
        }
        
        // Generate fallback response
        const fallbackSystemPrompt = mode === 'technical'
          ? 'Je bent CeeS, een technische AI-assistent voor CS Rental. Help gebruikers met technische documentatie en ondersteuning. Geef duidelijke, praktische antwoorden. Als je het antwoord niet weet, geef dan aan dat je geen relevante informatie in de documentatie kon vinden.'
          : 'Je bent ChriS, een inkoop AI-assistent voor CS Rental. Help gebruikers met inkoop en onderdelen informatie. Focus op praktische inkoop-gerelateerde vragen. Als je het antwoord niet weet, geef dan aan dat je geen relevante informatie in de documentatie kon vinden.';
        
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: 'system', content: fallbackSystemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: model === 'complex' ? 2000 : 1000,
          temperature: model === 'complex' ? 0.3 : 0.7,
        });
        
        const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis bij het genereren van een antwoord.';
        
        return res.status(200).json({ 
          reply, 
          modelUsed: selectedModel + ' (fallback)'
        });
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      }
    }

    // Handle different error types
    if (error.name === 'AuthenticationError') {
      return res.status(500).json({ 
        error: 'OpenAI API authenticatie mislukt. Neem contact op met de beheerder.'
      });
    }
    
    if (error.name === 'RateLimitError') {
      return res.status(429).json({ 
        error: 'Te veel verzoeken. Probeer het over een paar minuten opnieuw.'
      });
    }
    
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ 
        error: 'Het verzoek duurde te lang. Probeer het opnieuw met een kortere vraag.'
      });
    }

    // Generic error response
    return res.status(500).json({ 
      error: 'Er is een fout opgetreden bij het verwerken van je verzoek. Probeer het later opnieuw.'
    });
  }
}