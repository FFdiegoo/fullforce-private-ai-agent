import { DocumentProcessor } from '../lib/rag/documentProcessor';
import * as fs from 'fs';
import * as path from 'path';

const filePath = process.argv[2];

async function main() {
  if (!filePath) {
    console.error('Geef een bestandspad op als argument!');
    process.exit(1);
  }

  try {
    console.log('📄 Processing file:', filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      process.exit(1);
    }

    // Read file content
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Process the document
    await DocumentProcessor.processDocument(
      path.basename(filePath),
      content,
      { 
        file_path: filePath,
        file_name: path.basename(filePath),
        directory: path.dirname(filePath)
      }
    );
    
    console.log('✅ File processed successfully:', filePath);
  } catch (error) {
    console.error('❌ Error processing file:', error);
    process.exit(1);
  }
}

main();
