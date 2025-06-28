#!/usr/bin/env node

/**
 * Create Test Documents for RAG Pipeline Testing
 * Generates sample documents and uploads them to test the RAG system
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('📄 Creating Test Documents for RAG Pipeline...\n');

const testDocuments = [
  {
    filename: 'technical_manual.txt',
    content: `TECHNICAL MANUAL - CS RENTAL EQUIPMENT

SECTION 1: SAFETY PROCEDURES
All equipment must be inspected before use. Check for damage, wear, and proper functioning.
Always wear appropriate personal protective equipment (PPE) including safety glasses, hard hats, and steel-toed boots.
Ensure all safety guards are in place and functioning properly.

SECTION 2: EQUIPMENT OPERATION
1. Generator Operation:
   - Check fuel levels before starting
   - Ensure proper ventilation
   - Connect loads gradually
   - Monitor temperature and oil pressure

2. Compressor Operation:
   - Check air filter condition
   - Drain moisture from tank daily
   - Monitor pressure levels
   - Use proper hose connections

SECTION 3: MAINTENANCE SCHEDULE
Daily: Visual inspection, fluid levels, safety checks
Weekly: Filter cleaning, belt tension, lubrication
Monthly: Comprehensive inspection, calibration, parts replacement

SECTION 4: TROUBLESHOOTING
Common issues and solutions:
- Engine won't start: Check fuel, battery, spark plug
- Low pressure: Check for leaks, filter blockage
- Overheating: Check coolant, ventilation, load

For technical support, contact: support@csrental.nl`,
    category: 'Technical',
    department: 'Operations'
  },
  {
    filename: 'procurement_guide.txt',
    content: `PROCUREMENT GUIDE - CS RENTAL

SUPPLIER MANAGEMENT
Primary suppliers for construction equipment:
- Caterpillar: Heavy machinery, excavators, bulldozers
- Komatsu: Wheel loaders, dump trucks
- Atlas Copco: Compressors, generators, lighting towers
- JCB: Backhoe loaders, telehandlers
- Manitou: Forklifts, aerial platforms

PURCHASING PROCEDURES
1. Request for Quotation (RFQ) Process:
   - Minimum 3 suppliers for orders over €10,000
   - Technical specifications must be clearly defined
   - Delivery terms and warranty requirements
   - Payment terms negotiation

2. Vendor Evaluation Criteria:
   - Price competitiveness (40%)
   - Quality and reliability (30%)
   - Delivery performance (20%)
   - Service and support (10%)

INVENTORY MANAGEMENT
- Minimum stock levels for critical parts
- Seasonal demand planning
- Supplier lead times tracking
- Cost optimization strategies

CONTRACTS AND AGREEMENTS
- Master service agreements with key suppliers
- Volume discount negotiations
- Warranty and service level agreements
- Emergency procurement procedures

Contact procurement team: procurement@csrental.nl`,
    category: 'Procurement',
    department: 'Purchasing'
  },
  {
    filename: 'safety_protocols.txt',
    content: `SAFETY PROTOCOLS - CS RENTAL

GENERAL SAFETY REQUIREMENTS
All personnel must complete safety training before equipment operation.
Safety meetings are mandatory every Monday at 8:00 AM.
Incident reporting is required within 24 hours.

EQUIPMENT-SPECIFIC SAFETY
1. Aerial Platforms:
   - Maximum wind speed: 12.5 m/s
   - Fall protection harness required
   - Ground spotter mandatory
   - Pre-use inspection checklist

2. Excavators:
   - Operator certification required
   - 360-degree visibility check
   - Underground utility marking
   - Proper entry/exit procedures

3. Generators:
   - Carbon monoxide awareness
   - Electrical safety protocols
   - Fuel handling procedures
   - Noise level monitoring

EMERGENCY PROCEDURES
Fire: Evacuate, call 112, use appropriate extinguisher
Injury: First aid, call emergency services, report incident
Equipment failure: Stop operation, secure area, notify supervisor

PERSONAL PROTECTIVE EQUIPMENT
Required PPE for all sites:
- Safety helmet with chin strap
- High-visibility vest
- Safety glasses or goggles
- Steel-toed safety boots
- Work gloves

Additional PPE as required:
- Hearing protection
- Respiratory protection
- Fall protection harness
- Cut-resistant gloves

Emergency contact: safety@csrental.nl`,
    category: 'Safety',
    department: 'HSE'
  },
  {
    filename: 'customer_service_manual.txt',
    content: `CUSTOMER SERVICE MANUAL - CS RENTAL

SERVICE STANDARDS
Response time targets:
- Phone calls: Answer within 3 rings
- Emails: Respond within 2 hours
- Emergency calls: Immediate response
- Service requests: Same day acknowledgment

CUSTOMER COMMUNICATION
Professional communication guidelines:
- Use customer's name
- Listen actively to understand needs
- Provide clear, accurate information
- Follow up on commitments
- Document all interactions

RENTAL PROCESS
1. Inquiry Handling:
   - Understand customer requirements
   - Check equipment availability
   - Provide accurate pricing
   - Explain terms and conditions

2. Booking Confirmation:
   - Written confirmation required
   - Delivery details coordination
   - Payment terms clarification
   - Insurance requirements

3. Equipment Delivery:
   - On-time delivery commitment
   - Equipment demonstration
   - Safety briefing
   - Documentation handover

PROBLEM RESOLUTION
Escalation process:
Level 1: Customer service representative
Level 2: Supervisor
Level 3: Manager
Level 4: Director

Common issues and solutions:
- Equipment breakdown: Immediate replacement
- Delivery delays: Proactive communication
- Billing disputes: Detailed investigation
- Damage claims: Fair assessment process

Customer feedback: feedback@csrental.nl`,
    category: 'Customer Service',
    department: 'Sales'
  },
  {
    filename: 'equipment_specifications.txt',
    content: `EQUIPMENT SPECIFICATIONS - CS RENTAL

GENERATORS
Model: CAT DE110E0
- Power output: 110 kVA / 88 kW
- Fuel consumption: 22.7 L/h at 75% load
- Fuel tank capacity: 400 L
- Noise level: 65 dB(A) at 7m
- Dimensions: 3.2m x 1.2m x 1.8m
- Weight: 1,850 kg

Model: Atlas Copco QAS 60
- Power output: 60 kVA / 48 kW
- Fuel consumption: 14.5 L/h at 75% load
- Fuel tank capacity: 200 L
- Noise level: 62 dB(A) at 7m
- Dimensions: 2.8m x 1.1m x 1.6m
- Weight: 1,200 kg

COMPRESSORS
Model: Atlas Copco XAHS 186
- Free air delivery: 10.5 m³/min
- Working pressure: 7 bar
- Engine power: 129 kW
- Fuel consumption: 32 L/h
- Noise level: 75 dB(A) at 7m
- Weight: 2,100 kg

AERIAL PLATFORMS
Model: JLG 450AJ
- Maximum working height: 15.9m
- Maximum outreach: 7.5m
- Platform capacity: 230 kg
- Drive speed: 4.8 km/h
- Weight: 7,030 kg
- Power: Electric/Diesel hybrid

EXCAVATORS
Model: CAT 320D2
- Operating weight: 20,300 kg
- Engine power: 121 kW
- Bucket capacity: 0.9 m³
- Maximum dig depth: 6.5m
- Maximum reach: 9.9m
- Fuel tank capacity: 410 L

For detailed specifications: specs@csrental.nl`,
    category: 'Technical',
    department: 'Engineering'
  }
];

async function createTestDocument(doc) {
  try {
    console.log(`📝 Creating test document: ${doc.filename}`);

    // Create the document content as a blob
    const blob = new Blob([doc.content], { type: 'text/plain' });
    const buffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Generate safe filename
    const timestamp = Date.now();
    const safeFileName = `test_${timestamp}_${doc.filename}`;
    const storagePath = `test-documents/${safeFileName}`;

    // Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('company-docs')
      .upload(storagePath, uint8Array, {
        contentType: 'text/plain',
        upsert: false
      });

    if (storageError) {
      throw storageError;
    }

    console.log(`   ✅ Uploaded to storage: ${storagePath}`);

    // Save metadata to database
    const { data: metadataData, error: metadataError } = await supabase
      .from('documents_metadata')
      .insert({
        filename: doc.filename,
        safe_filename: safeFileName,
        storage_path: storagePath,
        file_size: doc.content.length,
        mime_type: 'text/plain',
        afdeling: doc.department,
        categorie: doc.category,
        onderwerp: 'RAG Test Document',
        versie: '1.0',
        uploaded_by: 'test-system',
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false
      })
      .select()
      .single();

    if (metadataError) {
      throw metadataError;
    }

    console.log(`   ✅ Metadata saved with ID: ${metadataData.id}`);

    return {
      success: true,
      documentId: metadataData.id,
      filename: doc.filename,
      size: doc.content.length
    };

  } catch (error) {
    console.error(`   ❌ Failed to create ${doc.filename}:`, error.message);
    return {
      success: false,
      filename: doc.filename,
      error: error.message
    };
  }
}

async function createAllTestDocuments() {
  console.log('🚀 Creating test documents for RAG pipeline testing...\n');

  const results = [];

  for (const doc of testDocuments) {
    const result = await createTestDocument(doc);
    results.push(result);
    
    // Small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

async function generateTestReport(results) {
  console.log('\n📋 Test Document Creation Report');
  console.log('================================');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successfully created: ${successful.length} documents`);
  console.log(`❌ Failed to create: ${failed.length} documents`);

  if (successful.length > 0) {
    console.log('\n📄 Created Documents:');
    successful.forEach(doc => {
      console.log(`   - ${doc.filename} (${doc.size} bytes) [ID: ${doc.documentId}]`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed Documents:');
    failed.forEach(doc => {
      console.log(`   - ${doc.filename}: ${doc.error}`);
    });
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length
    },
    documents: results
  };

  const reportPath = path.join(process.cwd(), 'test-documents-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Report saved to: ${reportPath}`);

  return report;
}

async function main() {
  try {
    // Test Supabase connection
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('count')
      .limit(1);

    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }

    console.log('✅ Supabase connection verified\n');

    // Create test documents
    const results = await createAllTestDocuments();
    
    // Generate report
    const report = await generateTestReport(results);

    console.log('\n🎯 Next Steps:');
    console.log('1. Go to /admin/rag-test to test the RAG pipeline');
    console.log('2. Select a test document and run the tests');
    console.log('3. Verify embeddings generation and vector search');
    console.log('4. Test AI responses with the uploaded content');

    if (report.summary.successful > 0) {
      console.log('\n🎉 Test documents created successfully!');
      console.log('Ready for RAG pipeline testing.');
    } else {
      console.log('\n⚠️  No test documents were created successfully.');
      console.log('Please check the errors above and try again.');
    }

  } catch (error) {
    console.error('❌ Test document creation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createTestDocument, createAllTestDocuments };