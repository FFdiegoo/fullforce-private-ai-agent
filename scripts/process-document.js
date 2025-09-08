#!/usr/bin/env node

/**
 * Process Document Script
 * 
 * This script processes a single document from the documents_metadata table,
 * creates embeddings, and stores them in the vector database for AI retrieval.
 * 
 * Usage: node scripts/process-document.js <document-id>
 */

const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
require('dotenv').config({ path: '.env.local' });
require('ts-node/register');
const { extractText: extractTextFromLib } = require('../lib/rag/extract-text');

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  STORAGE_BUCKET: 'company-docs',
  EMBEDDING_MODEL: 'text-embedding-ada-002',
  CHUNK_SIZE: 500,
  CHUNK_OVERLAP: 50
};

// Get document ID from command line arguments
const documentId = process.argv[2];

if (!documentId) {
  console.error('❌ Usage: node scripts/process-document.js <document-id>');
  process.exit(1);
}

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.OPENAI_API_KEY) {
  console.error('❌ Missing OpenAI API key. Please check your .env.local file.');
  process.exit(1);
}

// Initialize clients
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

// Main function
async function main() {
  console.log(`🚀 Processing document with ID: ${documentId}`);
  
  try {
    // Step 1: Get document metadata
    console.log('🔍 Fetching document metadata...');
    const { data: document, error: metadataError } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('id', documentId)
      .single();

    if (metadataError) {
      throw new Error(`Failed to fetch document metadata: ${metadataError.message}`);
    }

    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }

    console.log(`✅ Found document: ${document.filename}`);

    // Step 2: Download document from Supabase Storage
    console.log(`📥 Downloading from ${document.storage_path}...`);
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(CONFIG.STORAGE_BUCKET)
      .download(document.storage_path);

    if (downloadError) {
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    // Step 3: Extract text content
    console.log('📄 Extracting text content...');
    const text = await extractText(fileData, document.filename);
    
    if (!text || text.trim().length === 0) {
      throw new Error('Failed to extract text or document is empty');
    }
    
    console.log(`✅ Extracted ${text.length} characters`);

    // Step 4: Split text into chunks
    console.log('✂️ Splitting into chunks...');
    const chunks = splitIntoChunks(text, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
    console.log(`✅ Created ${chunks.length} chunks`);

    // Step 5: Generate embeddings for each chunk
    console.log('🧠 Generating embeddings...');
    const embeddedChunks = await generateEmbeddings(chunks, document);
    console.log(`✅ Generated ${embeddedChunks.length} embeddings`);

    // Step 6: Store chunks in database
    console.log('💾 Storing chunks in database...');
    await storeChunks(embeddedChunks);
    console.log(`✅ Stored ${embeddedChunks.length} chunks in database`);

    // Step 7: Mark document as processed
    console.log('✅ Marking document as processed...');
    const { error: updateError } = await supabase
      .from('documents_metadata')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', document.id);

    if (updateError) {
      throw new Error(`Failed to update document status: ${updateError.message}`);
    }

    console.log(`🎉 Successfully processed document: ${document.filename}`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Extract text from document
async function extractText(fileData, filename) {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await extractTextFromLib(buffer, filename);
    return result.text;
  } catch (error) {
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}

// Split text into chunks with overlap
function splitIntoChunks(text, chunkSize, chunkOverlap) {
  const chunks = [];
  const sentences = text.split(/[.!?]+\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep the overlap from the previous chunk
      currentChunk = currentChunk.slice(-chunkOverlap) + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Generate embeddings for chunks
async function generateEmbeddings(chunks, document) {
  const embeddedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunk = chunks[i];
      
      // Generate embedding using OpenAI
      const embeddingResponse = await openai.embeddings.create({
        model: CONFIG.EMBEDDING_MODEL,
        input: chunk,
      });

      const [embedding] = embeddingResponse.data;

      embeddedChunks.push({
        content: chunk,
        embedding: embedding.embedding,
        metadata: {
          id: document.id,
          filename: document.filename,
          storage_path: document.storage_path,
          afdeling: document.afdeling,
          categorie: document.categorie,
          onderwerp: document.onderwerp,
          versie: document.versie
        },
        chunk_index: i
      });
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`⚠️ Error generating embedding for chunk ${i}: ${error.message}`);
      // Continue with other chunks
    }
  }

  return embeddedChunks;
}

// Store chunks in database
async function storeChunks(chunks) {
  for (const chunk of chunks) {
    try {
      const { error } = await supabase
        .from('document_chunks')
        .insert({
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
          chunk_index: chunk.chunk_index
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(`⚠️ Error storing chunk: ${error.message}`);
      // Continue with other chunks
    }
  }
}

// Start the script
main().catch(console.error);