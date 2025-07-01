import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { supabase } from '@/lib/supabaseClient';
import { RAGPipeline } from '@/lib/rag/pipeline';
import { openaiApiKey } from '@/lib/rag/config';

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
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      reply: 'Method not allowed',
      error: 'Only POST requests are supported'
    });
  }

  // Extract request data
  const { prompt, mode = 'technical', model = 'simple' } = req.body;

  // Validate request data
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ 
      reply: 'Invalid request',
      error: 'Prompt is required and must be a string'
    });
  }

  try {
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
      
Gebruik de volgende context om je antwoorden te verbeteren:

${context}`
      : `Je bent ChriS, een inkoop AI-assistent voor CS Rental. Help gebruikers met inkoop en onderdelen informatie. Focus op praktische inkoop-gerelateerde vragen.
      
Gebruik de volgende context om je antwoorden te verbeteren:

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

    // 7. Extract and return the response
    const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis bij het genereren van een antwoord.';
    
    // 8. Return structured response
    return res.status(200).json({ 
      reply, 
      modelUsed: selectedModel,
      sources: sources.length > 0 ? sources : undefined
    });

  } catch (error: any) {
    console.error('❌ Error in chat-rag API:', error);

    // Handle different error types
    if (error.name === 'AuthenticationError') {
      return res.status(500).json({ 
        reply: 'OpenAI API authenticatie mislukt. Neem contact op met de beheerder.',
        error: 'Authentication failed'
      });
    }
    
    if (error.name === 'RateLimitError') {
      return res.status(429).json({ 
        reply: 'Te veel verzoeken. Probeer het over een paar minuten opnieuw.',
        error: 'Rate limit exceeded'
      });
    }
    
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ 
        reply: 'Het verzoek duurde te lang. Probeer het opnieuw met een kortere vraag.',
        error: 'Request timeout'
      });
    }

    // Generic error response
    return res.status(500).json({ 
      reply: 'Er is een fout opgetreden bij het verwerken van je verzoek. Probeer het later opnieuw.',
      error: error.message || 'Unknown error'
    });
  }
}