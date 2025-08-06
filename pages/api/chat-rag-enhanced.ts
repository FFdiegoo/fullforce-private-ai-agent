// Enhanced RAG chat endpoint with professional architecture
import { NextApiResponse } from 'next';
import { ragService } from '../../lib/services/rag.service';
import { withApiMiddleware } from '../../lib/middleware/error-handler';
import { withValidation, type ValidatedRequest } from '../../lib/middleware/validation';
import { chatMessageSchema, type ChatMessageRequest } from '../../lib/validators/chat';
import { auditLogger } from '../../lib/utils/audit-logger';
import { PerformanceMonitor } from '../../lib/utils/performance';
import type { AuthenticatedRequest } from '../../lib/middleware/auth';

async function handler(
  req: ValidatedRequest<ChatMessageRequest> & AuthenticatedRequest,
  res: NextApiResponse
) {
  const { user, validatedData: request, requestId } = req;

  // Performance monitoring
  const { result: response, duration } = await PerformanceMonitor.measureAsync(
    'RAG_CHAT_REQUEST',
    async () => {
      const result = await ragService.generateResponse(request, user.id);
      
      if (!result.success) {
        throw result.error;
      }

      return result.data;
    },
    {
      userId: user.id,
      mode: request.mode,
      model: request.model,
      promptLength: request.prompt.length
    }
  );

  // Log successful interaction
  await auditLogger.log({
    action: 'RAG_CHAT_COMPLETED',
    resource: 'chat',
    userId: user.id,
    metadata: {
      mode: request.mode,
      model: request.model,
      promptLength: request.prompt.length,
      responseLength: response.reply.length,
      contextUsed: response.contextUsed,
      documentsSearched: response.documentsSearched,
      duration,
      requestId
    },
    severity: 'INFO'
  });

  return res.status(200).json({
    success: true,
    data: response,
    timestamp: new Date().toISOString(),
    requestId,
    performance: {
      duration,
      cached: false
    }
  });
}

// Apply middleware stack
export default withApiMiddleware(
  withValidation(chatMessageSchema)(handler),
  {
    requireAuth: true,
    rateLimit: 'chat',
    cors: true
  }
);