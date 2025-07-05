import { DocumentProcessor } from '../lib/document-processor';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse'; // ✅

const parse = pdfParse.default ?? pdfParse; // ✅ fallback voor module-type compatibiliteit

const filePath = process.argv[2];

async function main() {
  if (!filePath) {
    console.error('Geef een PDF-bestandspad op als argument!');
    process.exit(1);
  }

  try {
    console.log('📄 Processing PDF:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found:', filePath);
      process.exit(1);
    }

    const pdfBuffer = await fs.promises.readFile(filePath);
    const pdfData = await parse(pdfBuffer); // ✅

    console.log('📖 Extracted text length:', pdfData.text.length);

    await DocumentProcessor.processDocument(
      path.basename(filePath),
      pdfData.text,
      {
        file_path: filePath,
        file_name: path.basename(filePath),
        directory: path.dirname(filePath),
        pages: pdfData.numpages
      }
    );

    console.log('✅ PDF processed successfully:', filePath);
  } catch (error) {
    console.error('❌ Error processing PDF:', error);
    process.exit(1);
  }
}

main();
