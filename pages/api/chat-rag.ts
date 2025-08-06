import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { OpenAI } from 'openai';
import { auditLogger } from '../../lib/audit-logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface SearchResult {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { prompt, mode, model = 'simple' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log(`🔍 RAG Query: "${prompt}" (mode: ${mode}, model: ${model})`);

    // Step 1: Generate embedding for the user query
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: prompt,
      encoding_format: 'float'
    });

    // Step 2: Search for relevant document chunks
    const { data: searchResults, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding.data[0].embedding,
      match_threshold: 0.7,
      match_count: 5
    });

    if (searchError) {
      console.error('Vector search error:', searchError);
      throw new Error(`Vector search failed: ${searchError.message}`);
    }

    const relevantChunks: SearchResult[] = searchResults || [];
    console.log(`📊 Found ${relevantChunks.length} relevant chunks`);

    // Step 3: Prepare context and generate response
    let response: string;
    let sources: any[] = [];
    let contextUsed = false;
    let context = ''; // Declare context in higher scope
    let modelUsed = model === 'complex' ? 'GPT-4.1' : 'GPT-4 Turbo';

    if (relevantChunks.length === 0) {
      // No relevant documents found - use general AI response
      console.log('⚠️ No relevant documents found, using general AI response');
      
      const systemPrompt = mode === 'technical'
        ? `Je bent CeeS, de interne kennisbank-chatbot voor CSrental, gespecialiseerd in technische ondersteuning. 
           Er zijn geen relevante documenten gevonden voor deze vraag. Geef een algemeen technisch advies en 
           suggereer dat de gebruiker relevante documenten kan uploaden voor betere ondersteuning.`
        : `Je bent ChriS, de digitale inkoopassistent van CSrental. Er zijn geen relevante documenten gevonden 
           voor deze vraag. Geef algemeen inkoop-advies en suggereer dat de gebruiker relevante documenten 
           kan uploaden voor betere ondersteuning.`;

      const completion = await openai.chat.completions.create({
        model: model === 'complex' ? 'gpt-4' : 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      response = completion.choices[0]?.message?.content || 
        'Sorry, ik kon geen relevante informatie vinden. Probeer relevante documenten te uploaden voor betere ondersteuning.';

    } else {
      // Relevant documents found - use RAG approach
      contextUsed = true;
      
      // Step 4: Build context from relevant chunks
      context = relevantChunks
        .map((chunk, index) => {
          const metadata = chunk.metadata || {};
          const filename = metadata.filename || 'Unknown document';
          return `[Document ${index + 1}: ${filename}]\n${chunk.content}`;
        })
        .join('\n\n');

      // Limit context to ~4000 tokens (roughly 16,000 characters)
      const maxContextLength = 16000;
      const truncatedContext = context.length > maxContextLength 
        ? context.substring(0, maxContextLength) + '\n\n[Context truncated...]'
        : context;

      console.log(`📝 Using context: ${truncatedContext.length} characters`);

      // Step 5: Generate AI response with context
      const systemPrompt = mode === 'technical'
        ? `Je bent CeeS, de interne kennisbank-chatbot voor CSrental, gespecialiseerd in technische ondersteuning.
           Gebruik de onderstaande documentcontext om nauwkeurige, technische antwoorden te geven.
           Verwijs naar specifieke documenten waar relevant. Als de context niet voldoende is, zeg dat duidelijk.
           
           Beschikbare documentcontext:
           ${truncatedContext}`
        : `Je bent ChriS, de digitale inkoopassistent van CSrental.
           Gebruik de onderstaande documentcontext om nauwkeurige inkoop- en leveranciersinformatie te geven.
           Verwijs naar specifieke documenten waar relevant. Als de context niet voldoende is, zeg dat duidelijk.
           
           Beschikbare documentcontext:
           ${truncatedContext}`;

      const completion = await openai.chat.completions.create({
        model: model === 'complex' ? 'gpt-4' : 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.3, // Lower temperature for more factual responses
      });

      response = completion.choices[0]?.message?.content || 
        'Sorry, er is een fout opgetreden bij het genereren van het antwoord.';

      // Step 6: Prepare source information
      sources = relevantChunks.map((chunk, index) => {
        const metadata = chunk.metadata || {};
        return {
          document_id: metadata.id || 'unknown',
          filename: metadata.filename || 'Unknown document',
          chunk_index: metadata.chunk_index || index,
          similarity_score: Math.round(chunk.similarity * 100) / 100,
          content_preview: chunk.content.substring(0, 200) + '...',
          afdeling: metadata.afdeling,
          categorie: metadata.categorie
        };
      });
    }

    // Log the RAG interaction
    await auditLogger.logAuth('RAG_QUERY', user.id, {
      prompt: prompt.substring(0, 200),
      mode,
      model,
      contextUsed,
      chunksFound: relevantChunks.length,
      responseLength: response.length
    });

    // Return response
    res.status(200).json({
      reply: response,
      modelUsed,
      contextUsed,
      sources,
      documentsSearched: relevantChunks.length,
      searchQuery: prompt,
      processingInfo: {
        embeddingGenerated: true,
        vectorSearchPerformed: true,
        contextLength: contextUsed ? context?.length || 0 : 0,
        relevanceThreshold: 0.7
      }
    });

  } catch (error) {
    console.error('RAG chat error:', error);
    await auditLogger.logError(error as Error, 'RAG_CHAT');
    
    res.status(500).json({
      error: 'RAG chat failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}