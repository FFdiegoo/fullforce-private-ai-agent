#!/usr/bin/env ts-node

/**
 * Test Document Processing Script
 * 
 * This script tests the document processing pipeline:
 * 1. Tests connection to Supabase and OpenAI
 * 2. Processes a small batch of documents
 * 3. Tests vector search functionality
 * 4. Provides detailed feedback on the processing pipeline
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
};

async function testConnections(): Promise<boolean> {
  console.log('🔍 Testing connections...');
  
  try {
    // Test Supabase connection
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
    
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    
    // Test OpenAI connection
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    
    await openai.models.list();
    console.log('✅ OpenAI connection successful');
    
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function testVectorSearch(processor: DocumentProcessor): Promise<void> {
  console.log('\n🔍 Testing vector search...');
  
  try {
    const testQueries = [
      'How to operate a generator safely',
      'Maintenance procedures for equipment',
      'Safety guidelines for machinery'
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔎 Query: "${query}"`);
      
      const results = await processor.testVectorSearch(query, 3);
      
      if (results.length === 0) {
        console.log('   📭 No results found');
      } else {
        console.log(`   📊 Found ${results.length} results:`);
        results.forEach((result, index) => {
          console.log(`   ${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
          console.log(`      Content: ${result.content.substring(0, 80)}...`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Vector search test failed:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function main(): Promise<void> {
  console.log('🧪 Document Processing Pipeline Test');
  console.log('===================================');
  
  // Validate environment variables
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY || !CONFIG.OPENAI_API_KEY) {
    console.error('❌ Missing required environment variables');
    console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY are set');
    process.exit(1);
  }
  
  try {
    // Test connections
    const connectionsOk = await testConnections();
    if (!connectionsOk) {
      console.error('❌ Connection tests failed');
      process.exit(1);
    }
    
    // Initialize processor
    const processor = new DocumentProcessor(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_SERVICE_KEY,
      CONFIG.OPENAI_API_KEY,
      {
        chunkSize: 500, // Smaller chunks for testing
        chunkOverlap: 100
      }
    );
    
    // Test processing a small batch
    console.log('\n📄 Testing document processing...');
    const results = await processor.processDocuments(2); // Process only 2 documents for testing
    
    console.log(`\n📊 Test processing results:`);
    console.log(`   Documents processed: ${results.processed}`);
    console.log(`   Successful: ${results.successful}`);
    console.log(`   Failed: ${results.failed}`);
    
    if (results.results.length > 0) {
      console.log(`\n📋 Detailed results:`);
      results.results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${result.filename}: ${result.success ? `${result.chunksCreated} chunks` : result.error}`);
      });
    }
    
    // Test vector search if we have processed documents
    if (results.successful > 0) {
      await testVectorSearch(processor);
    } else {
      console.log('\n⚠️ Skipping vector search test (no documents processed successfully)');
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Start the test
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal test error:', error);
    process.exit(1);
  });
}

export { main };