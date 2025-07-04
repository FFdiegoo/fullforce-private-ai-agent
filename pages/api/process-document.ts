import { NextApiRequest, NextApiResponse } from 'next';
import { RAGPipeline } from '@/lib/rag/pipeline';
import { supabase, openaiApiKey, RAG_CONFIG } from '@/lib/rag/config';
import { DocumentMetadata } from '@/lib/rag/types';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing document ID' });
  }

  try {
    console.log(`🔄 Processing document with ID: ${id}`);

    // Check if environment variables are properly loaded
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.OPENAI_API_KEY) {
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
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`✅ Found document: ${document.filename} (${document.mime_type})`);

    // Download document from storage
    console.log(`📥 Downloading document from storage: ${document.storage_path}`);
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('company-docs')
      .download(document.storage_path);

    if (downloadError) {
      console.error('❌ Error downloading document:', downloadError.message);
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
        console.log(`✅ Extracted ${extractedText.length} characters from PDF`);
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
        console.log(`✅ Extracted ${extractedText.length} characters from DOCX`);
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
        } catch (docError) {
          console.error('❌ Error extracting text from DOC:', docError);
          extractedText = `[Error extracting text from DOC file: ${document.filename}]`;
        }
      }
      else if (
        document.mime_type === 'text/plain' || 
        document.filename.toLowerCase().endsWith('.txt')
      ) {
        // Plain text
        extractedText = await fileData.text();
        console.log(`✅ Extracted ${extractedText.length} characters from text file`);
      }
      else {
        // Fallback for other formats - try as text
        try {
          extractedText = await fileData.text();
          console.log(`⚠️ Using fallback text extraction for ${document.mime_type}`);
        } catch (textError) {
          console.error('❌ Fallback text extraction failed:', textError);
          extractedText = `[Unsupported file format: ${document.mime_type}]`;
        }
      }
    } catch (extractionError) {
      console.error('❌ Text extraction error:', extractionError);
      return res.status(500).json({ 
        error: 'Failed to extract text from document', 
        details: extractionError.message 
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      console.error('❌ No text could be extracted from document');
      return res.status(422).json({ error: 'No text could be extracted from document' });
    }

    console.log(`📊 Extracted ${extractedText.length} characters of text`);

    // Create RAG pipeline
    const pipeline = new RAGPipeline(supabase, openaiApiKey);

    // Process document with extracted text
    console.log('🧠 Starting RAG pipeline processing...');
    
    // Create a modified metadata object with the extracted text
    const documentWithText = {
      ...document,
      extractedText // Add the extracted text to the metadata
    } as DocumentMetadata;

    await pipeline.processDocument(documentWithText, {
      chunkSize: RAG_CONFIG.chunkSize,
      chunkOverlap: RAG_CONFIG.chunkOverlap,
      skipExisting: false,
    });

    // Update document status to processed
    await supabase
      .from('documents_metadata')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', id);

    console.log(`✅ Document processed successfully: ${document.filename}`);

    return res.status(200).json({ 
      success: true,
      message: `Document ${document.filename} processed successfully`,
      textLength: extractedText.length
    });
  } catch (error: any) {
    console.error('❌ Error processing document:', error);
    return res.status(500).json({ 
      error: 'Failed to process document', 
      details: error.message 
    });
  }
}