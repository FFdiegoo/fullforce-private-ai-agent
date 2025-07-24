#!/usr/bin/env ts-node

/**
 * Process Unindexed Documents Script
 * 
 * This script processes unindexed documents from Supabase Storage:
 * 1. Scans for unprocessed files in documents_metadata table
 * 2. Downloads files from Supabase Storage
 * 3. Extracts text content using appropriate parsers
 * 4. Chunks the text into manageable pieces
 * 5. Generates embeddings using OpenAI
 * 6. Stores embeddings in Supabase pgvector
 * 7. Updates metadata to mark files as processed
 */

import { DocumentProcessor } from '../lib/document-processor';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200,
  DEFAULT_LIMIT: 10
};

// Validate environment variables
function validateConfig(): void {
  const missing: string[] = [];
  
  if (!CONFIG.SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!CONFIG.SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!CONFIG.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(var_name => console.error(`   - ${var_name}`));
    console.error('\nPlease ensure these are set in your .env.local file');
    process.exit(1);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Document Processing Pipeline');
  console.log('======================================');
  
  // Validate configuration
  validateConfig();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.DEFAULT_LIMIT;
  
  const testMode = args.includes('--test');
  const verboseMode = args.includes('--verbose');
  
  console.log(`📋 Configuration:`);
  console.log(`   Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`   Chunk size: ${CONFIG.CHUNK_SIZE} words`);
  console.log(`   Chunk overlap: ${CONFIG.CHUNK_OVERLAP} words`);
  console.log(`   Processing limit: ${limit} documents`);
  console.log(`   Test mode: ${testMode ? 'Yes' : 'No'}`);
  console.log(`   Verbose mode: ${verboseMode ? 'Yes' : 'No'}`);
  console.log('');

  try {
    // Initialize document processor
    const processor = new DocumentProcessor(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_SERVICE_KEY,
      CONFIG.OPENAI_API_KEY,
      {
        chunkSize: CONFIG.CHUNK_SIZE,
        chunkOverlap: CONFIG.CHUNK_OVERLAP
      }
    );

    if (testMode) {
      // Test mode: just test vector search
      console.log('🧪 Running in test mode - testing vector search...');
      
      const testQuery = 'How to operate a generator safely';
      console.log(`🔍 Testing vector search with query: "${testQuery}"`);
      
      const searchResults = await processor.testVectorSearch(testQuery, 3);
      
      console.log(`📊 Vector search results: ${searchResults.length} matches found`);
      searchResults.forEach((result, index) => {
        console.log(`   ${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
        console.log(`      Content: ${result.content.substring(0, 100)}...`);
        console.log(`      Metadata: ${JSON.stringify(result.metadata)}`);
      });
      
      return;
    }

    // Production mode: process documents
    const startTime = Date.now();
    
    const results = await processor.processDocuments(limit);
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 PROCESSING COMPLETE');
    console.log('='.repeat(60));
    console.log(`⏱️ Duration: ${duration} seconds`);
    console.log(`📊 Results:`);
    console.log(`   Documents processed: ${results.processed}`);
    console.log(`   Successful: ${results.successful}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Success rate: ${results.processed > 0 ? ((results.successful / results.processed) * 100).toFixed(1) : 0}%`);
    
    // Show failed documents if any
    const failedResults = results.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log(`\n❌ Failed documents:`);
      failedResults.forEach(result => {
        console.log(`   - ${result.filename}: ${result.error}`);
      });
    }
    
    // Show successful documents if verbose
    if (verboseMode) {
      const successfulResults = results.results.filter(r => r.success);
      if (successfulResults.length > 0) {
        console.log(`\n✅ Successful documents:`);
        successfulResults.forEach(result => {
          console.log(`   - ${result.filename}: ${result.chunksCreated} chunks`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Processing failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Processing interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️ Processing terminated');
  process.exit(0);
});

// Start the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { main };