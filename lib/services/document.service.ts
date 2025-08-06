// Document management service
import { BaseService } from './base.service';
import { supabase } from '../database/client';
import { supabaseAdmin } from '../database/admin';
import { 
  documentFilterSchema, 
  documentActionSchema,
  type DocumentFilterRequest,
  type DocumentActionRequest 
} from '../validators/upload';
import type { Document, PaginatedResponse, Result } from '../types';

export class DocumentService extends BaseService {
  constructor() {
    super('DocumentService');
  }

  async getDocuments(filter: DocumentFilterRequest, userId: string): Promise<Result<PaginatedResponse<Document>>> {
    return this.executeWithLogging(
      'GET_DOCUMENTS',
      async () => {
        const validation = this.validateInput(documentFilterSchema, filter);
        if (!validation.success) {
          throw validation.error;
        }

        const { 
          status, 
          embeddingStatus, 
          department, 
          category, 
          uploadedBy, 
          startDate, 
          endDate, 
          limit, 
          offset 
        } = validation.data;

        let query = supabase
          .from('documents_metadata')
          .select('*', { count: 'exact' });

        // Apply filters
        if (status) query = query.eq('status', status);
        if (embeddingStatus) query = query.eq('embedding_status', embeddingStatus);
        if (department) query = query.eq('afdeling', department);
        if (category) query = query.eq('categorie', category);
        if (uploadedBy) query = query.eq('uploaded_by', uploadedBy);
        if (startDate) query = query.gte('upload_date', startDate);
        if (endDate) query = query.lte('upload_date', endDate);

        // Apply pagination
        query = query
          .range(offset, offset + limit - 1)
          .order('upload_date', { ascending: false });

        const { data, error, count } = await query;

        if (error) {
          throw new Error(`Failed to fetch documents: ${error.message}`);
        }

        const documents: Document[] = (data || []).map(this.mapDatabaseToDocument);
        const total = count || 0;
        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.floor(offset / limit) + 1;

        return {
          success: true,
          data: documents,
          pagination: {
            page: currentPage,
            limit,
            total,
            totalPages,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
          },
          timestamp: new Date().toISOString()
        };
      },
      userId,
      { filter }
    );
  }

  async performBulkAction(action: DocumentActionRequest, userId: string): Promise<Result<{ processed: number; successful: number; failed: number }>> {
    return this.executeWithLogging(
      'BULK_DOCUMENT_ACTION',
      async () => {
        const validation = this.validateInput(documentActionSchema, action);
        if (!validation.success) {
          throw validation.error;
        }

        const { action: actionType, documentIds } = validation.data;
        
        let successful = 0;
        let failed = 0;

        for (const documentId of documentIds) {
          try {
            await this.performSingleAction(documentId, actionType, userId);
            successful++;
          } catch (error) {
            this.logger.error(`Failed to ${actionType} document ${documentId}`, { error });
            failed++;
          }
        }

        return {
          processed: documentIds.length,
          successful,
          failed
        };
      },
      userId,
      { action: action.action, documentCount: action.documentIds.length }
    );
  }

  private async performSingleAction(documentId: string, action: 'approve' | 'reject' | 'reprocess', userId: string): Promise<void> {
    const { data: document, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      throw new Error('Document not found');
    }

    switch (action) {
      case 'approve':
        await this.approveDocument(documentId);
        break;
      case 'reject':
        await this.rejectDocument(document);
        break;
      case 'reprocess':
        await this.reprocessDocument(documentId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async approveDocument(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('documents_metadata')
      .update({
        ready_for_indexing: true,
        last_error: null,
        last_updated: new Date().toISOString()
      })
      .eq('id', documentId);

    if (error) {
      throw new Error(`Failed to approve document: ${error.message}`);
    }
  }

  private async rejectDocument(document: any): Promise<void> {
    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('company-docs')
      .remove([document.storage_path]);

    if (storageError) {
      this.logger.warn('Failed to delete file from storage', { 
        storagePath: document.storage_path, 
        error: storageError 
      });
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('documents_metadata')
      .delete()
      .eq('id', document.id);

    if (dbError) {
      throw new Error(`Failed to delete document: ${dbError.message}`);
    }
  }

  private async reprocessDocument(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('documents_metadata')
      .update({
        processed: false,
        embedding_status: 'PENDING',
        last_error: null,
        chunk_count: 0,
        processed_date: null,
        last_updated: new Date().toISOString()
      })
      .eq('id', documentId);

    if (error) {
      throw new Error(`Failed to reset document for reprocessing: ${error.message}`);
    }
  }

  private mapDatabaseToDocument(dbDoc: any): Document {
    return {
      id: dbDoc.id,
      filename: dbDoc.filename,
      safeFilename: dbDoc.safe_filename,
      originalName: dbDoc.filename,
      fileSize: dbDoc.file_size || 0,
      mimeType: dbDoc.mime_type || 'application/octet-stream',
      contentType: dbDoc.content_type || dbDoc.mime_type || 'application/octet-stream',
      storagePath: dbDoc.storage_path,
      uploadPath: dbDoc.storage_path,
      status: dbDoc.processed ? 'PROCESSED' : dbDoc.last_error ? 'FAILED' : 'PENDING',
      embeddingStatus: dbDoc.embedding_status || 'PENDING',
      processedAt: dbDoc.processed_at ? new Date(dbDoc.processed_at) : undefined,
      uploadDate: new Date(dbDoc.upload_date || dbDoc.last_updated),
      processedDate: dbDoc.processed_date ? new Date(dbDoc.processed_date) : undefined,
      chunkCount: dbDoc.chunk_count,
      content: dbDoc.content,
      summary: dbDoc.summary,
      metadata: dbDoc.metadata,
      department: dbDoc.afdeling,
      category: dbDoc.categorie,
      subject: dbDoc.onderwerp,
      description: dbDoc.description,
      uploadedBy: dbDoc.uploaded_by,
      userId: dbDoc.user_id || dbDoc.uploaded_by,
      readyForIndexing: dbDoc.ready_for_indexing || false,
      processed: dbDoc.processed || false,
      lastError: dbDoc.last_error
    };
  }
}

// Export singleton instance
export const documentService = new DocumentService();