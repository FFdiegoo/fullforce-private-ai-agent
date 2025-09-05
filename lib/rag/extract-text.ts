import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import path from 'path';

export type ExtractKind =
  | 'pdf'
  | 'docx'
  | 'txt'
  | 'md'
  | 'image'
  | 'pdf-scan'
  | 'unknown';

export interface ExtractTextResult {
  kind: ExtractKind;
  mime: string;
  text: string;
}

export async function extractText(
  buffer: Buffer,
  filename = ''
): Promise<ExtractTextResult> {
  const { fileTypeFromBuffer } = await import('file-type');

  let detectedMime = '';
  try {
    const type = await fileTypeFromBuffer(buffer);
    if (type?.mime) detectedMime = type.mime;
  } catch {}

  const ext = path.extname(filename).toLowerCase();
  if (!detectedMime) {
    if (ext === '.txt') detectedMime = 'text/plain';
    else if (ext === '.md' || ext === '.markdown') detectedMime = 'text/markdown';
  }

  switch (detectedMime) {
    case 'application/pdf': {
      try {
        const pdfData = await pdfParse(buffer);
        const text = (pdfData.text || '').trim();
        if (!text) {
          return { kind: 'pdf-scan', mime: detectedMime, text: '' };
        }
        return { kind: 'pdf', mime: detectedMime, text };
      } catch {
        return { kind: 'pdf-scan', mime: detectedMime, text: '' };
      }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      try {
        const docxData = await mammoth.extractRawText({ buffer });
        const text = (docxData.value || '').trim();
        return { kind: 'docx', mime: detectedMime, text };
      } catch {
        return { kind: 'docx', mime: detectedMime, text: '' };
      }
    }
    case 'text/plain': {
      const text = buffer.toString('utf-8');
      return { kind: 'txt', mime: detectedMime, text };
    }
    case 'text/markdown': {
      const text = buffer.toString('utf-8');
      return { kind: 'md', mime: detectedMime, text };
    }
    case 'image/png':
    case 'image/jpeg':
    case 'image/jpg':
    case 'image/tiff': {
      try {
        const worker = await createWorker('nld+eng');
        const { data } = await worker.recognize(buffer);
        await worker.terminate();
        const text = (data.text || '').trim();
        return { kind: 'image', mime: detectedMime, text };
      } catch {
        return { kind: 'image', mime: detectedMime, text: '' };
      }
    }
    default:
      return { kind: 'unknown', mime: detectedMime, text: '' };
  }
}
