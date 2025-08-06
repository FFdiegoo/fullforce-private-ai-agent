// Authentication middleware for API routes
import { NextApiRequest, NextApiResponse } from 'next/server';
import { supabase } from '../database/client';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { Logger } from '../utils/logger';
import type { User } from '../types';

const logger = new Logger('AuthMiddleware');

export interface AuthenticatedRequest extends NextApiRequest {
  user: User;
  requestId: string;
}

export function withAuth(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('No authorization header provided');
      }

      const token = authHeader.replace('Bearer ', '');
      
      // Verify token with Supabase
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        throw new AuthenticationError('Invalid or expired token');
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', authUser.email)
        .single();

      if (profileError || !profile) {
        throw new AuthenticationError('User profile not found');
      }

      // Create user object
      const user: User = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        twoFactorEnabled: profile.two_factor_enabled,
        createdAt: new Date(profile.created_at),
        updatedAt: new Date(profile.updated_at)
      };

      // Add user and request ID to request object
      const authenticatedRequest = req as AuthenticatedRequest;
      authenticatedRequest.user = user;
      authenticatedRequest.requestId = requestId;

      logger.debug('User authenticated successfully', {
        requestId,
        userId: user.id,
        userEmail: user.email,
        userRole: user.role
      });

      // Call the actual handler
      await handler(authenticatedRequest, res);

    } catch (error) {
      if (error instanceof AuthenticationError) {
        logger.warn('Authentication failed', {
          requestId,
          method: req.method,
          url: req.url,
          error: error.message
        });

        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          timestamp: error.timestamp,
          requestId
        });
      }

      logger.error('Auth middleware error', { requestId }, error instanceof Error ? error : new Error(String(error)));
      
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        requestId
      });
    }
  };
}

// Role-based authorization middleware
export function withRole(requiredRole: 'admin' | 'user' = 'user') {
  return function roleMiddleware(
    handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
  ) {
    return withAuth(async (req: AuthenticatedRequest, res: NextApiResponse) => {
      try {
        const userRole = req.user.role;

        // Admin can access everything
        if (userRole === 'admin') {
          return await handler(req, res);
        }

        // Check if user has required role
        if (requiredRole === 'admin' && userRole !== 'admin') {
          throw new AuthorizationError('Admin access required');
        }

        logger.debug('Authorization check passed', {
          requestId: req.requestId,
          userId: req.user.id,
          userRole,
          requiredRole
        });

        await handler(req, res);

      } catch (error) {
        if (error instanceof AuthorizationError) {
          logger.warn('Authorization failed', {
            requestId: req.requestId,
            userId: req.user.id,
            userRole: req.user.role,
            requiredRole,
            error: error.message
          });

          return res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code,
            timestamp: error.timestamp,
            requestId: req.requestId
          });
        }

        throw error; // Re-throw non-authorization errors
      }
    });
  };
}

// Combined auth and role middleware
export function withAdminAuth(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
) {
  return withRole('admin')(handler);
}