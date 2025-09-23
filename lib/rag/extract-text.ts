import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import path from 'path';

import sharp from 'sharp';
import { RAG_CONFIG } from './config';
import { ContentError, NeedsOcrError } from './errors';

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

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/tif',
  'image/bmp',
  'image/gif',
]);

const FALLBACK_MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

const MIN_IMAGE_DIMENSION = 32;
const MIN_IMAGE_BYTES = 2048;

async function validateImageBuffer(buffer: Buffer): Promise<void> {
  const byteLength = buffer?.length ?? 0;
  if (!buffer || byteLength === 0) {
    throw new ContentError('image-empty', 'image buffer empty');
  }

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width;
    const height = metadata.height;
    if (
      typeof width === 'number' &&
      typeof height === 'number' &&
      (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION)
    ) {
      throw new ContentError('image-too-small', `image-dimensions-too-small:${width}x${height}`);
    }
  } catch (error) {
    if (error instanceof ContentError) {
      throw error;
    }
    const message = (error as Error)?.message ?? 'metadata-error';
    if (/too small/i.test(message)) {
      throw new ContentError('image-too-small', message);
    }
    throw new NeedsOcrError('ocr-processing-failed', message);
  }
}

async function recogniseImages(buffers: Buffer[]): Promise<string> {
  if (!buffers.length) return '';

  let worker;
  try {
    worker = await createWorker('nld+eng');
  } catch (error) {
    const message = (error as Error)?.message ?? 'worker-initialisation-failed';
    throw new NeedsOcrError('ocr-initialisation-failed', message);
  }

  try {
    const pieces: string[] = [];
    for (const buffer of buffers) {
      await validateImageBuffer(buffer);

      let processed: Buffer;
      try {
        processed = await sharp(buffer).ensureAlpha().grayscale().toFormat('png').toBuffer();
      } catch (error) {
        if (error instanceof ContentError) {
          throw error;
        }
        const message = (error as Error)?.message ?? 'image-processing-failed';
        throw new NeedsOcrError('ocr-processing-failed', message);
      }

      const { data } = await worker.recognize(processed);
      if (data?.text) {
        pieces.push(data.text);
      }
    }

    return normaliseText(pieces.join('\n\n')) || '';
  } catch (error) {
    if (error instanceof NeedsOcrError || error instanceof ContentError) {
      throw error;
    }
    const message = (error as Error)?.message ?? 'ocr-processing-failed';
    throw new NeedsOcrError('ocr-processing-failed', message);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  try {
    const base = sharp(buffer, { density: 300 });
    const metadata = await base.metadata();
    const pages = metadata.pages && metadata.pages > 0 ? metadata.pages : 1;
    const images: Buffer[] = [];

    for (let page = 0; page < pages; page++) {
      try {
        const pageBuffer = await sharp(buffer, { density: 300, page })
          .ensureAlpha()
          .grayscale()
          .toFormat('png')
          .toBuffer();
        await validateImageBuffer(pageBuffer);
        images.push(pageBuffer);
      } catch (error) {
        if (error instanceof ContentError) {
          throw error;
        }
        const message = (error as Error)?.message ?? 'pdf-ocr-page-failed';
        throw new NeedsOcrError('ocr-processing-failed', message);
      }
    }

    if (!images.length) {
      throw new NeedsOcrError('ocr-processing-failed', 'pdf-no-pages-rendered');
    }

    return await recogniseImages(images);
  } catch (error) {
    if (error instanceof NeedsOcrError || error instanceof ContentError) {
      throw error;
    }
    const message = (error as Error)?.message ?? 'pdf-ocr-failed';
    throw new NeedsOcrError('ocr-processing-failed', message);
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
  } catch (error) {
    const message = (error as Error)?.message ?? 'file-type-detection-failed';
    console.warn(`⚠️ Failed to detect file type for ${filename}: ${message}`);
  }

  const ext = path.extname(filename).toLowerCase();
  if (!detectedMime && ext && FALLBACK_MIME_BY_EXTENSION[ext]) {
    detectedMime = FALLBACK_MIME_BY_EXTENSION[ext];
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
        if (error instanceof NeedsOcrError || error instanceof ContentError) {
          throw error;
        }
        const message = (error as Error)?.message ?? 'pdf-parse-failed';
        throw new NeedsOcrError('ocr-processing-failed', message);
      }
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      try {
        const docxData = await mammoth.extractRawText({ buffer });
        const text = normaliseText(docxData.value || '') || '';
        return { kind: 'docx', mime: detectedMime, text, ocrAttempted: false, usedOcr: false };
      } catch (error) {
        const message = (error as Error)?.message ?? 'docx-parse-failed';
        console.error('❌ DOCX parse failed', message);
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
    default: {
      if (detectedMime && IMAGE_MIME_TYPES.has(detectedMime)) {
        const ocrText = await recogniseImages([buffer]);
        return {
          kind: 'image',
          mime: detectedMime,
          text: normaliseText(ocrText) || '',
          ocrAttempted: true,
          usedOcr: true,
        };
      }

      if (!detectedMime && ext) {
        throw new ContentError('unsupported-mime', `unsupported-extension:${ext}`);
      }

      throw new ContentError('unsupported-mime', detectedMime || 'unknown-mime');
    }
  }
}
