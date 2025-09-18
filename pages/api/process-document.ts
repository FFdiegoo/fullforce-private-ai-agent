import { NextApiRequest, NextApiResponse } from 'next';
import { RAGPipeline } from '@/lib/rag/pipeline';
import { supabase, openaiApiKey, RAG_CONFIG } from '@/lib/rag/config';
import { DocumentMetadata } from '@/lib/rag/types';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;

  if (!id) {
    console.error('❌ Missing document ID in request');
    return res.status(400).json({ error: 'Missing document ID' });
  }

  try {
    console.log(`[PROCESSING STARTED] Document ID: ${id}`);

    // Check if environment variables are properly loaded
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.OPENAI_API_KEY) {
      console.error('❌ Missing required environment variables');
      throw new Error('Missing required environment variables');
    }

    // Fetch document metadata
    const { data: document, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      console.error('❌ Error fetching document metadata:', fetchError?.message || 'Document not found');
      
      // Update document with error if it exists but couldn't be fetched properly
      if (fetchError) {
        await supabaseAdmin
          .from('documents_metadata')
          .update({
            last_error: `Failed to fetch metadata: ${fetchError.message}`
          })
          .eq('id', id);
      }
      
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`✅ Found document: ${document.filename} (${document.mime_type || 'unknown type'})`);

    // Download document from storage
    console.log(`📥 Downloading document from storage: ${document.storage_path}`);
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('company-docs')
      .download(document.storage_path);

    if (downloadError) {
      console.error('❌ Error downloading document:', downloadError.message);
      
      // Update document with error
      await supabaseAdmin
        .from('documents_metadata')
        .update({
          last_error: `Download failed: ${downloadError.message}`
        })
        .eq('id', id);
        
      return res.status(500).json({ error: 'Failed to download document', details: downloadError.message });
    }

    // Extract text based on file type
    console.log(`📄 Extracting text from ${document.mime_type} document...`);
    let extractedText = '';

    try {
      if (document.mime_type === 'application/pdf' || document.filename.toLowerCase().endsWith('.pdf')) {
        // PDF extraction
        const pdfData = await pdfParse(Buffer.from(await fileData.arrayBuffer()));
        extractedText = pdfData.text;
        const wordCount = extractedText.split(/\s+/).length;
        console.log(`[EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from PDF`);
      } 
      else if (
        document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        document.filename.toLowerCase().endsWith('.docx')
      ) {
        // DOCX extraction
        const docxData = await mammoth.extractRawText({
          buffer: Buffer.from(await fileData.arrayBuffer())
        });
        extractedText = docxData.value;
        const wordCount = extractedText.split(/\s+/).length;
        console.log(`[EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from DOCX`);
      }
      else if (
        document.mime_type === 'application/msword' || 
        document.filename.toLowerCase().endsWith('.doc')
      ) {
        // DOC extraction (limited support)
        console.log('⚠️ DOC format has limited support, attempting extraction');
        try {
          const docData = await mammoth.extractRawText({
            buffer: Buffer.from(await fileData.arrayBuffer())
          });
          extractedText = docData.value;
          const wordCount = extractedText.split(/\s+/).length;
          console.log(`[EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from DOC`);
        } catch (docError) {
          const error = docError as Error;
          console.error('❌ Error extracting text from DOC:', error);
          extractedText = `[Error extracting text from DOC file: ${document.filename}]`;
        }
      }
      else if (
        document.mime_type === 'text/plain' || 
        document.filename.toLowerCase().endsWith('.txt')
      ) {
        // Plain text
        extractedText = await fileData.text();
        const wordCount = extractedText.split(/\s+/).length;
        console.log(`[EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from text file`);
      }
      else {
        // Fallback for other formats - try as text
        try {
          extractedText = await fileData.text();
          const wordCount = extractedText.split(/\s+/).length;
          console.log(`[EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) using fallback for ${document.mime_type}`);
        } catch (textError) {
          const error = textError as Error;
          console.error('❌ Fallback text extraction failed:', error);
          extractedText = `[Unsupported file format: ${document.mime_type}]`;
        }
      }
    } catch (extractionError) {
      const error = extractionError as Error;
      console.error('❌ Text extraction error:', error);
      
      // Update document with error
      await supabaseAdmin
        .from('documents_metadata')
        .update({
          last_error: `Text extraction failed: ${error.message}`
        })
        .eq('id', id);
        
      return res.status(500).json({ 
        error: 'Failed to extract text from document', 
        details: error.message 
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      console.error(`[❌ EMPTY TEXT] ${document.filename} - No text could be extracted`);
      
      // Update document with error
      await supabaseAdmin
        .from('documents_metadata')
        .update({
          processed: false,
          processed_at: new Date().toISOString(),
          last_error: 'No text could be extracted from document'
        })
        .eq('id', id);
        
      // Return error response
      return res.status(422).json({ error: 'No text could be extracted from document' });
    }

    console.log(`📊 Extracted ${extractedText.length} characters of text`);

    // Create RAG pipeline with admin client for service-level operations
    const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);

    // Process document with extracted text and track chunk count
    console.log('🧠 Starting RAG pipeline processing...');
    
    // Add the extracted text to the metadata object
    document.extractedText = extractedText;

    await pipeline.processDocument(document, {
      chunkSize: RAG_CONFIG.chunkSize,
      chunkOverlap: RAG_CONFIG.chunkOverlap,
    });

    // Get chunk count after processing
    const { count: chunkCount, error: countError } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('doc_id', id);

    if (countError) {
      console.error('❌ Error getting chunk count:', countError);
    }

    // Update document status to processed with chunk count
    const updateData = {
      processed: true,
      processed_at: new Date().toISOString(),
      chunk_count: chunkCount || 0,
      last_error: null // Clear any previous errors
    };
    
    await supabase
      .from('documents_metadata')
      .update(updateData)
      .eq('id', id);

    console.log(`[✅ PROCESSED] ${document.filename} → ${chunkCount || 0} chunks`);

    return res.status(200).json({ 
      success: true,
      message: `Document ${document.filename} processed successfully`,
      textLength: extractedText.length,
      chunkCount: chunkCount || 0
    });
  } catch (error: any) {
    console.error(`[❌ RAG ERROR] ${error.message}`);
    
    // Update document with error
    await supabaseAdmin
      .from('documents_metadata')
      .update({
        last_error: `Processing failed: ${error.message}`
      })
      .eq('id', id);
      
    return res.status(500).json({ 
      error: 'Failed to process document', 
      details: error.message 
    });
  }
}