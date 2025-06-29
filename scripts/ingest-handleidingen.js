#!/usr/bin/env node

/**
 * RAG Ingest Script for Handleidingen
 * 
 * This script processes documents from the "120 Handleidingen" folder in Supabase Storage,
 * creates embeddings, and stores them in the vector database for AI retrieval.
 */

const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  STORAGE_BUCKET: 'company-docs',
  TARGET_FOLDER: '120 Handleidingen',
  EMBEDDING_MODEL: 'text-embedding-ada-002',
  CHUNK_SIZE: 500,
  CHUNK_OVERLAP: 50,
  BATCH_SIZE: 10
};

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

// Statistics tracking
const stats = {
  totalDocuments: 0,
  processedDocuments: 0,
  failedDocuments: 0,
  totalChunks: 0,
  embeddingsCreated: 0,
  startTime: Date.now(),
  errors: []
};

// Main function
async function main() {
  console.log('🚀 Starting RAG Ingest Process for Handleidingen');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`📁 Target folder: ${CONFIG.TARGET_FOLDER}`);
  console.log(`🧠 Embedding model: ${CONFIG.EMBEDDING_MODEL}`);
  console.log(`📏 Chunk size: ${CONFIG.CHUNK_SIZE} characters`);
  console.log(`📏 Chunk overlap: ${CONFIG.CHUNK_OVERLAP} characters`);
  console.log('');

  try {
    // Verify Supabase connection
    console.log('🔍 Verifying Supabase connection...');
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('count')
      .limit(1);

    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
    console.log('✅ Supabase connection verified');

    // Get documents that need processing
    console.log('🔍 Finding documents to process...');
    const { data: documents, error: docsError } = await supabase
      .from('documents_metadata')
      .select('*')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('processed', false)
      .eq('ready_for_indexing', true)
      .order('last_updated', { ascending: false });

    if (docsError) {
      throw new Error(`Failed to fetch documents: ${docsError.message}`);
    }

    stats.totalDocuments = documents?.length || 0;
    console.log(`✅ Found ${stats.totalDocuments} documents to process`);

    if (stats.totalDocuments === 0) {
      console.log('ℹ️ No documents to process. Checking for unindexed documents...');
      
      // Check if there are documents that need to be marked for indexing
      const { data: unindexedDocs, error: unindexedError } = await supabase
        .from('documents_metadata')
        .select('id, filename')
        .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
        .eq('ready_for_indexing', false)
        .limit(10);
        
      if (unindexedError) {
        throw new Error(`Failed to check unindexed documents: ${unindexedError.message}`);
      }
      
      if (unindexedDocs?.length > 0) {
        console.log(`ℹ️ Found ${unindexedDocs.length} documents that need to be marked for indexing.`);
        console.log('Example documents:');
        unindexedDocs.slice(0, 5).forEach(doc => {
          console.log(`   - ${doc.filename} (ID: ${doc.id})`);
        });
        
        const shouldMarkReady = await promptYesNo('Would you like to mark these documents as ready for indexing?');
        
        if (shouldMarkReady) {
          const { error: updateError } = await supabase
            .from('documents_metadata')
            .update({ ready_for_indexing: true })
            .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
            .eq('ready_for_indexing', false);
            
          if (updateError) {
            throw new Error(`Failed to update documents: ${updateError.message}`);
          }
          
          console.log('✅ Documents marked as ready for indexing. Please run this script again.');
          return;
        }
      } else {
        console.log('ℹ️ No unindexed documents found.');
      }
    }

    // Process documents in batches
    const batches = chunkArray(documents || [], CONFIG.BATCH_SIZE);
    console.log(`📦 Created ${batches.length} batches for processing`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} documents)`);
      
      for (const document of batch) {
        await processDocument(document);
        
        // Show progress
        const progress = ((stats.processedDocuments + stats.failedDocuments) / stats.totalDocuments * 100).toFixed(2);
        const elapsedSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
        const processRate = elapsedSeconds > 0 ? stats.processedDocuments / elapsedSeconds : 0;
        
        console.log(`Progress: ${progress}% | Speed: ${processRate.toFixed(2)} docs/sec | Processed: ${stats.processedDocuments} | Failed: ${stats.failedDocuments}`);
      }
    }

    // Generate final report
    generateReport();

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Process a single document
async function processDocument(document) {
  console.log(`\n🔄 Processing document: ${document.filename} (ID: ${document.id})`);
  
  try {
    // Step 1: Download document from Supabase Storage
    console.log(`   📥 Downloading from ${document.storage_path}...`);
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(CONFIG.STORAGE_BUCKET)
      .download(document.storage_path);

    if (downloadError) {
      throw new Error(`Download failed: ${downloadError.message}`);
    }

    // Step 2: Extract text content
    console.log('   📄 Extracting text content...');
    const text = await extractText(fileData, document.mime_type);
    
    if (!text || text.trim().length === 0) {
      throw new Error('Failed to extract text or document is empty');
    }
    
    console.log(`   ✅ Extracted ${text.length} characters`);

    // Step 3: Split text into chunks
    console.log('   ✂️ Splitting into chunks...');
    const chunks = splitIntoChunks(text, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
    console.log(`   ✅ Created ${chunks.length} chunks`);
    stats.totalChunks += chunks.length;

    // Step 4: Generate embeddings for each chunk
    console.log('   🧠 Generating embeddings...');
    const embeddedChunks = await generateEmbeddings(chunks, document);
    console.log(`   ✅ Generated ${embeddedChunks.length} embeddings`);
    stats.embeddingsCreated += embeddedChunks.length;

    // Step 5: Store chunks in database
    console.log('   💾 Storing chunks in database...');
    await storeChunks(embeddedChunks);
    console.log(`   ✅ Stored ${embeddedChunks.length} chunks in database`);

    // Step 6: Mark document as processed
    console.log('   ✅ Marking document as processed...');
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

    stats.processedDocuments++;
    console.log(`✅ Successfully processed document: ${document.filename}`);
    
  } catch (error) {
    console.error(`❌ Failed to process document ${document.filename}: ${error.message}`);
    stats.failedDocuments++;
    stats.errors.push({
      documentId: document.id,
      filename: document.filename,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Extract text from document
async function extractText(fileData, mimeType) {
  // For this simple implementation, we'll assume all files are text-based
  // In a production environment, you would use different parsers based on mimeType
  // (e.g., pdf.js for PDFs, mammoth for DOCX, etc.)
  
  try {
    // For text files
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return new TextDecoder().decode(fileData);
    }
    
    // For other file types, we'd need specific parsers
    // This is a simplified implementation
    return new TextDecoder().decode(fileData);
    
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
      console.error(`   ⚠️ Error generating embedding for chunk ${i}: ${error.message}`);
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
      console.error(`   ⚠️ Error storing chunk: ${error.message}`);
      // Continue with other chunks
    }
  }
}

// Helper function to split array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to format time in HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// Helper function to prompt for yes/no
function promptYesNo(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question(`${question} (y/n): `, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Generate a detailed report
function generateReport() {
  const endTime = Date.now();
  const elapsedSeconds = Math.floor((endTime - stats.startTime) / 1000);
  const elapsedFormatted = formatTime(elapsedSeconds);
  
  console.log('\n📋 RAG Ingest Report');
  console.log('===================');
  console.log(`⏱️ Duration: ${elapsedFormatted}`);
  console.log('');
  console.log('📊 Overall Statistics:');
  console.log(`   Total documents: ${stats.totalDocuments}`);
  console.log(`   Documents processed: ${stats.processedDocuments}`);
  console.log(`   Documents failed: ${stats.failedDocuments}`);
  console.log(`   Total chunks created: ${stats.totalChunks}`);
  console.log(`   Embeddings created: ${stats.embeddingsCreated}`);
  
  if (stats.totalDocuments > 0) {
    const successRate = ((stats.processedDocuments / stats.totalDocuments) * 100).toFixed(2);
    console.log(`   Success rate: ${successRate}%`);
  }
  
  if (stats.processedDocuments > 0 && elapsedSeconds > 0) {
    const processRate = stats.processedDocuments / elapsedSeconds;
    console.log(`   Processing rate: ${processRate.toFixed(2)} documents/second`);
  }
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.filename}: ${error.error}`);
    });
    
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }
  
  // Save detailed report to file
  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      targetFolder: CONFIG.TARGET_FOLDER,
      embeddingModel: CONFIG.EMBEDDING_MODEL,
      chunkSize: CONFIG.CHUNK_SIZE,
      chunkOverlap: CONFIG.CHUNK_OVERLAP
    },
    statistics: {
      totalDocuments: stats.totalDocuments,
      processedDocuments: stats.processedDocuments,
      failedDocuments: stats.failedDocuments,
      totalChunks: stats.totalChunks,
      embeddingsCreated: stats.embeddingsCreated,
      duration: elapsedSeconds,
      successRate: stats.totalDocuments > 0 ? (stats.processedDocuments / stats.totalDocuments) * 100 : 0
    },
    errors: stats.errors
  };
  
  const reportPath = path.join(process.cwd(), 'rag-ingest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide next steps
  console.log('\n🚀 Next Steps:');
  console.log('   - Test the RAG system by asking questions about the ingested documents');
  console.log('   - Check the admin dashboard to verify document processing status');
  console.log('   - Run the script again if there are more documents to process');
  
  console.log('\n✅ Ingest process completed!');
}

// Start the script
main().catch(console.error);