import { NextApiRequest, NextApiResponse } from 'next';
import { DocumentService } from '../../lib/database/documents';
import { EmbeddingStatus } from '../../lib/types/database';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { document_id, safe_filename } = req.body;

    if (!document_id && !safe_filename) {
      return res.status(400).json({ error: 'Document ID or safe filename required' });
    }

    // Get document
    let document;
    if (document_id) {
      document = await DocumentService.getDocumentWithChunks(document_id);
    } else {
      document = await DocumentService.getDocumentBySafeFilename(safe_filename);
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update status to processing
    await DocumentService.updateProcessingStatus(document.id, EmbeddingStatus.PROCESSING);

    try {
      // Read file content
      const filePath = document.uploadPath;
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found on disk');
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      // Simple text chunking (in production, use more sophisticated chunking)
      const chunkSize = 1000;
      const chunks = [];
      
      for (let i = 0; i < fileContent.length; i += chunkSize) {
        const chunk = fileContent.slice(i, i + chunkSize);
        chunks.push({
          chunk_index: Math.floor(i / chunkSize),
          content: chunk,
          metadata: {
            start_char: i,
            end_char: i + chunk.length,
            chunk_size: chunk.length,
          },
        });
      }

      // Create document chunks
      await DocumentService.createDocumentChunks(document.id, chunks);

      // Update document status to completed
      await DocumentService.updateProcessingStatus(
        document.id,
        EmbeddingStatus.COMPLETED,
        chunks.length,
        fileContent.slice(0, 5000), // First 5000 chars as preview
        `Document processed with ${chunks.length} chunks` // Simple summary
      );

      res.status(200).json({
        success: true,
        document_id: document.id,
        chunks_created: chunks.length,
        embedding_status: EmbeddingStatus.COMPLETED,
        processed_date: new Date(),
      });

    } catch (processingError) {
      // Update status to failed
      await DocumentService.updateProcessingStatus(document.id, EmbeddingStatus.FAILED);
      
      throw processingError;
    }

  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({
      error: 'Document ingestion failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}