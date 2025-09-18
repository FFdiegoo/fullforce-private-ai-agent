import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import path from 'path';

import sharp from 'sharp';
import { RAG_CONFIG } from './config';

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
  ocrAttempted: boolean;
  usedOcr: boolean;
}

const normaliseText = (text: string) => text?.replace(/\u0000/g, '').trim();

async function recogniseImages(buffers: Buffer[]): Promise<string> {
  if (!buffers.length) return '';

  const worker = await createWorker('nld+eng');
  try {
    const pieces: string[] = [];
    for (const buffer of buffers) {
      const processed = await sharp(buffer).ensureAlpha().grayscale().toFormat('png').toBuffer();
      const { data } = await worker.recognize(processed);
      if (data?.text) {
        pieces.push(data.text);
      }
    }
    return normaliseText(pieces.join('\n\n')) || '';
  } finally {
    await worker.terminate();
  }
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  try {
    const base = sharp(buffer, { density: 300 });
    const metadata = await base.metadata();
    const pages = metadata.pages && metadata.pages > 0 ? metadata.pages : 1;
    const images: Buffer[] = [];

    for (let page = 0; page < pages; page++) {
      const pageBuffer = await sharp(buffer, { density: 300, page })
        .grayscale()
        .toFormat('png')
        .toBuffer();
      images.push(pageBuffer);
    }

    return await recogniseImages(images);
  } catch (error) {
    console.error('❌ PDF OCR failed', error);
    return '';
  }
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
    else if (ext === '.docx') {
      detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }

  switch (detectedMime) {
    case 'application/pdf': {
      try {
        const pdfData = await pdfParse(buffer);
        const text = normaliseText(pdfData.text || '') || '';
        if (text.length >= RAG_CONFIG.ocrMinTextLength) {
          return { kind: 'pdf', mime: detectedMime, text, ocrAttempted: false, usedOcr: false };
        }

        const ocrText = await ocrPdf(buffer);
        return {
          kind: 'pdf-scan',
          mime: detectedMime,
          text: normaliseText(ocrText) || '',
          ocrAttempted: true,
          usedOcr: true,
        };
      } catch (error) {
        console.error('❌ PDF parse failed', error);
        const ocrText = await ocrPdf(buffer);
        return {
          kind: 'pdf-scan',
          mime: detectedMime,
          text: normaliseText(ocrText) || '',
          ocrAttempted: true,
          usedOcr: Boolean(ocrText),
        };
      }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      try {
        const docxData = await mammoth.extractRawText({ buffer });
        const text = normaliseText(docxData.value || '') || '';
        return { kind: 'docx', mime: detectedMime, text, ocrAttempted: false, usedOcr: false };
      } catch (error) {
        console.error('❌ DOCX parse failed', error);
        return { kind: 'docx', mime: detectedMime, text: '', ocrAttempted: false, usedOcr: false };
      }
    }
    case 'text/plain': {
      const text = normaliseText(buffer.toString('utf-8')) || '';
      return { kind: 'txt', mime: detectedMime, text, ocrAttempted: false, usedOcr: false };
    }
    case 'text/markdown': {
      const text = normaliseText(buffer.toString('utf-8')) || '';
      return { kind: 'md', mime: detectedMime, text, ocrAttempted: false, usedOcr: false };
    }
    case 'image/png':
    case 'image/jpeg':
    case 'image/jpg':
    case 'image/tiff':
    case 'image/tif':
    case 'image/bmp':
    case 'image/gif': {
      const ocrText = await recogniseImages([buffer]);
      return {
        kind: 'image',
        mime: detectedMime,
        text: normaliseText(ocrText) || '',
        ocrAttempted: true,
        usedOcr: true,
      };
    }
    default: {
      return { kind: 'unknown', mime: detectedMime, text: '', ocrAttempted: false, usedOcr: false };
    }
  }
}
