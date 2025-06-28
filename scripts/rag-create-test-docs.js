#!/usr/bin/env node

/**
 * RAG Test Documents Generator
 * Creates realistic test documents for RAG system testing
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🚀 Starting RAG Test Documents Generator...\n');

// Define test documents with realistic content
const testDocuments = [
  {
    filename: 'technical_manual_cs2500.txt',
    content: `TECHNICAL MANUAL - CS2500 GENERATOR

SECTION 1: SPECIFICATIONS
Model: CS2500 Portable Generator
Power Output: 2500W continuous, 3000W peak
Engine: 4-stroke OHV, 196cc
Fuel Type: Unleaded gasoline (minimum 87 octane)
Fuel Capacity: 15 liters
Run Time: 12 hours at 50% load
Noise Level: 68 dB at 7m
Dimensions: 59 x 44 x 45 cm
Weight: 48 kg

SECTION 2: SAFETY PRECAUTIONS
• Never operate in enclosed spaces - carbon monoxide hazard
• Keep generator at least 1 meter from structures and combustible materials
• Never refuel while running or hot
• Always ground the generator before operation
• Keep away from water and wet conditions
• Wear appropriate PPE including hearing protection

SECTION 3: STARTUP PROCEDURE
1. Place generator on level surface
2. Check oil level (SAE 10W-30 recommended)
3. Check fuel level
4. Turn fuel valve to ON position
5. Move choke lever to CLOSED position
6. Turn engine switch to ON
7. Pull recoil starter until engine starts
8. Gradually move choke to OPEN position as engine warms up
9. Allow engine to run for 3 minutes before connecting loads

SECTION 4: SHUTDOWN PROCEDURE
1. Remove all loads from generator
2. Allow engine to run for 2 minutes to cool down
3. Turn engine switch to OFF position
4. Turn fuel valve to OFF position
5. Allow generator to cool completely before storing

SECTION 5: MAINTENANCE SCHEDULE
After first 20 hours:
• Change engine oil

Every 50 hours or 3 months:
• Change engine oil
• Clean air filter
• Clean fuel sediment cup

Every 100 hours or 6 months:
• Clean spark plug
• Adjust valve clearance
• Clean fuel tank and filter

Every 300 hours or annually:
• Replace spark plug
• Replace air filter
• Check and adjust idle speed

SECTION 6: TROUBLESHOOTING
Engine won't start:
• Check fuel level
• Verify engine switch is ON
• Check oil level (low oil shutdown protection)
• Clean or replace spark plug
• Clean fuel line and carburetor

No electrical output:
• Check circuit breakers
• Verify connections are secure
• Reset overload protection
• Check for short circuits in connected devices

Engine runs erratically:
• Clean air filter
• Clean fuel system
• Check spark plug
• Verify choke is fully open when engine is warm

For technical support, contact: support@csrental.nl or call +31 20 123 4567`,
    category: 'Technical',
    department: 'Equipment'
  },
  {
    filename: 'safety_procedures_excavators.txt',
    content: `SAFETY PROCEDURES - EXCAVATOR OPERATION
CS RENTAL SAFETY PROTOCOL DOCUMENT

1. PRE-OPERATION SAFETY CHECKS

1.1 Operator Qualifications
• Valid excavator operator certification required
• Site-specific induction must be completed
• Minimum 2 years experience for machines >8 tons

1.2 Personal Protective Equipment (PPE)
• Hard hat with chin strap (EN 397 certified)
• High-visibility vest or clothing (EN ISO 20471 class 2 or higher)
• Safety boots with steel toe and midsole (EN ISO 20345)
• Safety glasses (EN 166)
• Hearing protection when noise exceeds 85 dB
• Gloves for maintenance activities

1.3 Machine Inspection
• Complete 360° walk-around inspection
• Check for fluid leaks (hydraulic, fuel, coolant)
• Verify all guards and panels are secure
• Inspect tracks/wheels for damage or excessive wear
• Check bucket, boom, and arm for cracks or damage
• Verify all lights and alarms are functional
• Test emergency stop function
• Check fire extinguisher is present and charged

2. OPERATIONAL SAFETY

2.1 Starting Procedure
• Adjust seat and mirrors before starting
• Fasten seatbelt
• Ensure all controls are in neutral position
• Check that work area is clear of personnel
• Sound horn twice before starting engine
• Allow hydraulic fluid to warm up before operation

2.2 Working Area Safety
• Establish and mark exclusion zone (minimum 5m from maximum reach)
• Verify underground utilities have been marked
• Maintain minimum 5m clearance from overhead power lines
• Use a spotter when working near obstacles or in confined spaces
• Never lift or carry personnel with excavator
• Maintain communication with ground workers at all times

2.3 Load Handling
• Never exceed rated lift capacity
• Use load charts to determine safe lifting capacity
• Keep loads as close to the machine as possible
• Travel with loads in lowest practical position
• Never swing loads over personnel
• Use tag lines for load control when necessary

3. SHUTDOWN PROCEDURES

3.1 Parking
• Park on level ground when possible
• Lower bucket to ground
• Set all controls to neutral
• Engage hydraulic locks
• Allow engine to idle for 2 minutes before shutdown
• Turn key to OFF position and remove

3.2 Securing the Machine
• Close and lock all windows, doors, and access panels
• Remove key
• Install vandal protection if required
• Place barriers or cones around machine if parked in traffic areas

4. EMERGENCY PROCEDURES

4.1 Machine Rollover
• Remain in cab with seatbelt fastened
• Brace yourself and hold onto steering wheel
• Wait until machine comes to complete rest before exiting
• Exit through uppermost door or window if possible

4.2 Fire
• Shut down machine immediately
• Use fire extinguisher if safe to do so
• Evacuate to safe location
• Contact emergency services
• Notify site supervisor

4.3 Contact with Utilities
• If contact with electrical lines occurs, remain in cab
• Instruct others to stay clear of machine
• If forced to leave machine due to fire, jump clear with feet together
• Shuffle away with small steps

5. ENVIRONMENTAL CONSIDERATIONS

5.1 Spill Prevention
• Inspect for leaks before operation
• Use drip trays during refueling
• Keep spill kits accessible
• Report all spills immediately

5.2 Noise and Dust Control
• Maintain engine covers closed during operation
• Avoid unnecessary idling
• Use water for dust suppression when necessary
• Respect working hour restrictions in residential areas

For questions or clarifications regarding these safety procedures, contact the CS Rental Safety Department at safety@csrental.nl`,
    category: 'Safety',
    department: 'HSE'
  },
  {
    filename: 'procurement_supplier_list.txt',
    content: `APPROVED SUPPLIER LIST - CS RENTAL PROCUREMENT
CONFIDENTIAL DOCUMENT - INTERNAL USE ONLY

HEAVY MACHINERY SUPPLIERS

1. Caterpillar (CAT)
   Primary Contact: Jan Visser
   Email: j.visser@cat-benelux.com
   Phone: +31 20 721 9000
   Products: Excavators, Bulldozers, Wheel Loaders
   Contract: #CAT-2025-0342 (expires 31/12/2025)
   Payment Terms: Net 60
   Discount Structure: 12% volume discount on orders >€100,000
   Delivery: 4-6 weeks standard, 2 weeks expedited
   Warranty: 24 months or 2,000 hours
   Performance Rating: 4.8/5

2. Komatsu Europe
   Primary Contact: Marieke de Vries
   Email: m.devries@komatsu-europe.com
   Phone: +31 76 578 2300
   Products: Excavators, Dump Trucks, Bulldozers
   Contract: #KOM-2024-1187 (expires 15/09/2024)
   Payment Terms: Net 45
   Discount Structure: 8% on orders >€75,000
   Delivery: 6-8 weeks standard
   Warranty: 36 months or 3,000 hours
   Performance Rating: 4.5/5

3. Volvo Construction Equipment
   Primary Contact: Thomas Bergman
   Email: thomas.bergman@volvo.com
   Phone: +46 8 553 335 00
   Products: Wheel Loaders, Articulated Haulers, Excavators
   Contract: #VOL-2025-0089 (expires 30/06/2025)
   Payment Terms: Net 30
   Discount Structure: 10% on orders >€150,000
   Delivery: 5-7 weeks standard
   Warranty: 24 months standard
   Performance Rating: 4.7/5

COMPRESSORS AND GENERATORS

1. Atlas Copco
   Primary Contact: Sophie Jansen
   Email: s.jansen@atlascopco.nl
   Phone: +31 78 623 0230
   Products: Air Compressors, Generators, Light Towers
   Contract: #ATL-2024-0567 (expires 31/03/2025)
   Payment Terms: Net 45
   Discount Structure: 15% on orders >€50,000
   Delivery: 3-4 weeks standard
   Warranty: 12 months standard, extended available
   Performance Rating: 4.9/5

2. HIMOINSA
   Primary Contact: Carlos Rodriguez
   Email: c.rodriguez@himoinsa.com
   Phone: +34 968 191 128
   Products: Generators, Lighting Towers
   Contract: #HIM-2024-0231 (expires 31/12/2024)
   Payment Terms: Net 60
   Discount Structure: 7% on orders >€25,000
   Delivery: 4-5 weeks standard
   Warranty: 24 months or 1,000 hours
   Performance Rating: 4.3/5

AERIAL PLATFORMS

1. JLG Industries
   Primary Contact: Frank Müller
   Email: f.muller@jlg-europe.com
   Phone: +49 7666 9300
   Products: Boom Lifts, Scissor Lifts, Telehandlers
   Contract: #JLG-2025-0112 (expires 28/02/2026)
   Payment Terms: Net 45
   Discount Structure: 10% on orders >€80,000
   Delivery: 6-8 weeks standard
   Warranty: 12 months or 1,500 hours
   Performance Rating: 4.6/5

2. Genie (Terex)
   Primary Contact: Emma Wilson
   Email: emma.wilson@terex.com
   Phone: +44 1476 584333
   Products: Boom Lifts, Scissor Lifts, Material Lifts
   Contract: #GEN-2024-0398 (expires 30/09/2024)
   Payment Terms: Net 30
   Discount Structure: 8% on orders >€60,000
   Delivery: 5-7 weeks standard
   Warranty: 24 months or 2,000 hours
   Performance Rating: 4.4/5

PARTS AND CONSUMABLES

1. TVH Parts
   Primary Contact: Pieter Janssen
   Email: p.janssen@tvh.com
   Phone: +32 56 43 42 11
   Products: Filters, Hydraulic Components, Electrical Parts
   Contract: #TVH-2024-0765 (expires 31/12/2024)
   Payment Terms: Net 30
   Discount Structure: 20% on orders >€10,000
   Delivery: 1-3 days standard
   Warranty: Varies by product
   Performance Rating: 4.8/5

2. Kramp Group
   Primary Contact: Lotte Bakker
   Email: l.bakker@kramp.com
   Phone: +31 57 145 9000
   Products: Filters, Oils, Mechanical Parts
   Contract: #KRA-2025-0023 (expires 31/01/2026)
   Payment Terms: Net 45
   Discount Structure: 15% on orders >€5,000
   Delivery: 2-4 days standard
   Warranty: Varies by product
   Performance Rating: 4.7/5

EMERGENCY PROCUREMENT PROCEDURE
For urgent requirements outside normal procurement channels:
1. Obtain verbal approval from Department Manager
2. Complete Emergency Procurement Form (EPF-2023)
3. Submit to Procurement within 24 hours
4. Maximum authorization: €25,000

For procurement inquiries: procurement@csrental.nl`,
    category: 'Procurement',
    department: 'Purchasing'
  },
  {
    filename: 'maintenance_schedule_pumps.txt',
    content: `MAINTENANCE SCHEDULE - WATER PUMPS
CS RENTAL TECHNICAL DOCUMENT

PREVENTIVE MAINTENANCE SCHEDULE FOR WATER PUMPS

MODEL: GRUNDFOS CR 32-2

DAILY CHECKS (BEFORE OPERATION)
• Visual inspection for leaks or damage
• Check inlet strainer for debris
• Verify proper priming
• Check oil level in motor (if applicable)
• Inspect power cables for damage
• Verify all guards are in place
• Check discharge hose condition

WEEKLY MAINTENANCE
• Clean exterior of pump
• Check and tighten all fasteners
• Inspect impeller for wear or damage
• Test all safety devices
• Check valve operation
• Lubricate bearings if required
• Test run for unusual noise or vibration

MONTHLY MAINTENANCE
• Complete inspection of mechanical seal
• Check shaft alignment
• Inspect and clean check valves
• Measure and record amperage draw
• Check pressure gauge accuracy
• Inspect foot valve
• Clean and flush cooling system

QUARTERLY MAINTENANCE
• Change oil in motor (if applicable)
• Replace mechanical seal if showing signs of wear
• Check wear ring clearance
• Disassemble and clean impeller
• Check shaft runout
• Calibrate pressure switches
• Test efficiency against baseline

ANNUAL MAINTENANCE
• Complete disassembly and inspection
• Replace all gaskets and O-rings
• Replace mechanical seal
• Check and replace bearings if necessary
• Pressure test casing
• Replace wear rings
• Repaint exterior if needed
• Recalibrate all gauges and sensors

LUBRICATION SCHEDULE
• Motor bearings: Every 2,000 hours or 3 months
• Pump bearings: Every 1,500 hours or 2 months
• Recommended grease: Lithium-based NLGI Grade 2
• Quantity: 15-20g per bearing

TROUBLESHOOTING GUIDE

1. Pump Not Priming
   • Check for air leaks in suction line
   • Verify foot valve operation
   • Check for clogged strainer
   • Ensure adequate water supply
   • Verify correct rotation direction

2. Insufficient Flow
   • Check for partially clogged impeller
   • Verify correct speed (RPM)
   • Check for worn wear rings
   • Inspect for air leaks
   • Check for partially closed valves
   • Verify system head requirements

3. Excessive Noise or Vibration
   • Check for cavitation
   • Inspect for worn bearings
   • Check for impeller damage
   • Verify proper alignment
   • Check for loose mounting bolts
   • Inspect for pipe strain

4. Overheating
   • Check for proper ventilation
   • Verify correct voltage
   • Check for overload condition
   • Inspect for bearing failure
   • Verify adequate cooling water flow
   • Check for operation against closed valve

SPARE PARTS INVENTORY (MINIMUM STOCK LEVELS)
• Mechanical seals: 5 units
• Impellers: 2 units
• Wear rings: 4 sets
• Bearings: 3 sets
• Gasket kits: 5 sets
• Shaft sleeves: 2 units
• O-ring kits: 5 sets

For technical support: maintenance@csrental.nl
Emergency service: +31 20 555 7890`,
    category: 'Maintenance',
    department: 'Technical'
  },
  {
    filename: 'rental_terms_conditions.txt',
    content: `RENTAL TERMS AND CONDITIONS
CS RENTAL B.V.

1. DEFINITIONS
1.1 "Company" means CS Rental B.V., registered in the Netherlands (KvK: 12345678).
1.2 "Customer" means the person, firm, company or other organization hiring the Equipment.
1.3 "Equipment" means any machine, article, tool, and/or device, together with accessories and attachments hired to a Customer.
1.4 "Rental Period" means the period commencing when the Equipment leaves the Company's premises and ending when the Equipment is returned to the Company's premises.

2. GENERAL CONDITIONS
2.1 These terms and conditions apply to all contracts entered into by the Company.
2.2 No variation to these terms and conditions shall be binding unless agreed in writing by an authorized representative of the Company.
2.3 The Customer acknowledges that it has not relied on any statement, promise, or representation made or given by or on behalf of the Company which is not set out in the contract.

3. RENTAL RATES AND PAYMENT
3.1 Equipment is hired subject to the minimum Rental Period and at the rates shown in the Company's current price list.
3.2 The Company's prices are exclusive of any applicable VAT.
3.3 Payment terms are strictly 30 days from invoice date unless otherwise agreed in writing.
3.4 The Company reserves the right to charge interest on overdue invoices at a rate of 8% above the European Central Bank base rate.
3.5 Rental rates include normal wear and tear but exclude:
    a) Fuel, oil, and lubricants
    b) Transport to and from the Company's premises
    c) Replacements due to damage or loss
    d) Cleaning costs for Equipment returned in an unclean condition

4. CUSTOMER OBLIGATIONS
4.1 The Customer shall:
    a) Operate the Equipment in accordance with the manufacturer's instructions and recommendations
    b) Keep the Equipment in good condition and return it clean and in good working order
    c) Notify the Company immediately of any breakdown or damage
    d) Not repair or attempt to repair the Equipment without prior written consent
    e) Not remove the Equipment from the site specified in the contract without prior consent
    f) Allow the Company access to inspect the Equipment at all reasonable times
    g) Not sell, assign, or pledge the Equipment
    h) Insure the Equipment against all risks for full replacement value

5. DELIVERY AND COLLECTION
5.1 Delivery and collection dates are approximate only.
5.2 The Company shall not be liable for any delay in delivery or collection.
5.3 The Customer shall be responsible for providing clear access for delivery and collection.
5.4 The Customer shall be present at delivery to sign the delivery note and confirm the condition of the Equipment.

6. BREAKDOWN AND REPAIRS
6.1 In the event of breakdown, the Customer must immediately notify the Company.
6.2 The Company will repair or replace the Equipment at its discretion.
6.3 The Company shall not be liable for any losses or damages arising from breakdown or stoppage of the Equipment.
6.4 Breakdown time will not be charged if the breakdown is due to fair wear and tear and has been reported promptly.

7. LOSS, DAMAGE, AND INSURANCE
7.1 The Customer shall be responsible for all loss or damage to the Equipment during the Rental Period.
7.2 The Customer shall pay to the Company the full replacement cost of any Equipment lost or damaged beyond economic repair.
7.3 The Customer must maintain insurance covering the full replacement value of the Equipment.

8. TERMINATION
8.1 The Company may terminate the contract immediately if:
    a) The Customer breaches any of these terms and conditions
    b) The Customer becomes insolvent or enters into any arrangement with creditors
    c) The Equipment is at risk of damage or loss

9. LIABILITY
9.1 The Company shall not be liable for any indirect or consequential losses.
9.2 The Company's total liability shall not exceed the total rental charges paid by the Customer.
9.3 Nothing in these conditions excludes or limits the liability of the Company for death or personal injury caused by the Company's negligence.

10. FORCE MAJEURE
10.1 The Company shall not be liable for any failure or delay in performing its obligations where such failure or delay results from events beyond its reasonable control.

11. GOVERNING LAW
11.1 These terms and conditions shall be governed by and construed in accordance with Dutch law.
11.2 All disputes arising in connection with the agreement shall be finally settled by the competent court in Amsterdam.

For inquiries: contracts@csrental.nl
Version: January 2025`,
    category: 'Legal',
    department: 'Administration'
  }
];

// Function to create a test document
async function createTestDocument(doc) {
  try {
    console.log(`📝 Creating test document: ${doc.filename}`);

    // Create temporary file
    const tempFilePath = path.join(__dirname, `temp_${doc.filename}`);
    fs.writeFileSync(tempFilePath, doc.content);

    // Generate safe filename with timestamp
    const timestamp = Date.now();
    const safeFileName = `test_${timestamp}_${doc.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `test-documents/${safeFileName}`;

    // Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('company-docs')
      .upload(storagePath, fs.createReadStream(tempFilePath), {
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
      .select();

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    if (metadataError) {
      throw metadataError;
    }

    console.log(`   ✅ Metadata saved with ID: ${metadataData[0].id}`);

    return {
      success: true,
      documentId: metadataData[0].id,
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

// Function to create all test documents
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

// Function to generate a report
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

  const reportPath = path.join(process.cwd(), 'rag-test-documents-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Report saved to: ${reportPath}`);

  return report;
}

// Main function
async function main() {
  try {
    // Test Supabase connection
    console.log('🔗 Testing Supabase connection...');
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

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createTestDocument, createAllTestDocuments };