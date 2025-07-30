import { PrismaClient } from '@prisma/client';
import { Document, DocumentChunk, EmbeddingStatus, DocumentStatus } from '../types/database';

const prisma = new PrismaClient();

export class DocumentService {
  
  // Create new document with RAG pipeline fields
  static async createDocument(data: {
    filename: string;
    safe_filename: string;
    file_size: number;
    content_type: string;
    uploadPath: string;
    uploadedBy: string;
    department?: string;
    category?: string;
    subject?: string;
    description?: string;
    metadata?: any;
  }): Promise<Document> {
    return await prisma.document.create({
      data: {
        filename: data.filename,
        originalName: data.filename,
        fileSize: data.file_size,
        mimeType: data.content_type,
        uploadPath: data.uploadPath,
        safe_filename: data.safe_filename,
        file_size: data.file_size,
        content_type: data.content_type,
        upload_date: new Date(),
        embedding_status: EmbeddingStatus.PENDING,
        uploadedBy: data.uploadedBy,
        department: data.department,
        category: data.category,
        subject: data.subject,
        description: data.description,
        metadata: data.metadata,
      },
    });
  }

  // Update document processing status
  static async updateProcessingStatus(
    documentId: string, 
    status: EmbeddingStatus,
    chunkCount?: number,
    content?: string,
    summary?: string
  ): Promise<Document> {
    const updateData: any = {
      embedding_status: status,
      updatedAt: new Date(),
    };

    if (status === EmbeddingStatus.COMPLETED) {
      updateData.processed_date = new Date();
      updateData.processedAt = new Date();
      updateData.status = DocumentStatus.PROCESSED;
    }

    if (chunkCount !== undefined) {
      updateData.chunk_count = chunkCount;
    }

    if (content !== undefined) {
      updateData.content = content;
    }

    if (summary !== undefined) {
      updateData.summary = summary;
    }

    return await prisma.document.update({
      where: { id: documentId },
      data: updateData,
    });
  }

  // Get documents by embedding status
  static async getDocumentsByStatus(status: EmbeddingStatus): Promise<Document[]> {
    return await prisma.document.findMany({
      where: { embedding_status: status },
      orderBy: { upload_date: 'desc' },
    });
  }

  // Get document by safe filename
  static async getDocumentBySafeFilename(safeFilename: string): Promise<Document | null> {
    return await prisma.document.findUnique({
      where: { safe_filename: safeFilename },
      include: { chunks: true },
    });
  }

  // Get documents ready for search
  static async getSearchableDocuments(): Promise<Document[]> {
    return await prisma.document.findMany({
      where: { embedding_status: EmbeddingStatus.COMPLETED },
      orderBy: { upload_date: 'desc' },
    });
  }

  // Create document chunks
  static async createDocumentChunks(
    documentId: string,
    chunks: Array<{
      chunk_index: number;
      content: string;
      embedding?: string;
      metadata?: any;
    }>
  ): Promise<DocumentChunk[]> {
    const chunkData = chunks.map(chunk => ({
      document_id: documentId,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: chunk.metadata,
    }));

    return await prisma.documentChunk.createMany({
      data: chunkData,
    });
  }

  // Search document chunks by similarity (placeholder for vector search)
  static async searchChunks(
    query: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<DocumentChunkWithDocument[]> {
    // This is a placeholder - in production you'd use vector similarity search
    // For now, we'll do text-based search
    return await prisma.documentChunk.findMany({
      where: {
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            safe_filename: true,
            content_type: true,
            upload_date: true,
          },
        },
      },
      take: limit,
      orderBy: { created_at: 'desc' },
    }) as DocumentChunkWithDocument[];
  }

  // Get document with chunks
  static async getDocumentWithChunks(documentId: string): Promise<Document | null> {
    return await prisma.document.findUnique({
      where: { id: documentId },
      include: { chunks: true },
    });
  }

  // Delete document and all chunks
  static async deleteDocument(documentId: string): Promise<void> {
    await prisma.document.delete({
      where: { id: documentId },
    });
  }

  // Get processing statistics
  static async getProcessingStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const [total, pending, processing, completed, failed] = await Promise.all([
      prisma.document.count(),
      prisma.document.count({ where: { embedding_status: EmbeddingStatus.PENDING } }),
      prisma.document.count({ where: { embedding_status: EmbeddingStatus.PROCESSING } }),
      prisma.document.count({ where: { embedding_status: EmbeddingStatus.COMPLETED } }),
      prisma.document.count({ where: { embedding_status: EmbeddingStatus.FAILED } }),
    ]);

    return { total, pending, processing, completed, failed };
  }
}

export default DocumentService;