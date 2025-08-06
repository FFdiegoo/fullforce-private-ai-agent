// Application constants
export const APP_CONFIG = {
  name: 'CSrental AI',
  version: '1.0.0',
  description: 'Private AI Agent for CS Rental',
  author: 'FullForce AI',
  supportEmail: 'support@csrental.nl'
} as const;

export const API_ROUTES = {
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    signup: '/api/auth/signup',
    setup2FA: '/api/auth/setup-2fa',
    validateInvite: '/api/auth/validate-invite',
    verifyEmail: '/api/auth/verify-email',
    diegoBypass: '/api/auth/diego-bypass'
  },
  chat: {
    basic: '/api/chat',
    rag: '/api/chat-rag',
    withContext: '/api/chat-with-context'
  },
  upload: {
    document: '/api/upload-document',
    enhanced: '/api/upload-document-enhanced'
  },
  admin: {
    invites: '/api/admin/invites',
    createInvite: '/api/admin/create-invite',
    reset2FA: '/api/admin/reset-2fa',
    emergencyAccess: '/api/admin/emergency-access'
  }
} as const;

export const FILE_UPLOAD = {
  maxFileSize: 1024 * 1024 * 1024, // 1GB
  recommendedMaxSize: 100 * 1024 * 1024, // 100MB
  supportedTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/rtf',
    'text/rtf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff'
  ],
  chunkSize: 1000,
  chunkOverlap: 200
} as const;

export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  upload: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  chat: { windowMs: 15 * 60 * 1000, maxRequests: 50 },
  admin: { windowMs: 15 * 60 * 1000, maxRequests: 20 },
  general: { windowMs: 15 * 60 * 1000, maxRequests: 100 }
} as const;

export const SESSION_CONFIG = {
  timeoutMinutes: 30,
  refreshThresholdMinutes: 5,
  maxConcurrentSessions: 3
} as const;

export const SECURITY_CONFIG = {
  twoFactor: {
    issuer: 'CSrental',
    window: 2,
    period: 30
  },
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false
  }
} as const;

export const AI_CONFIG = {
  models: {
    simple: 'gpt-4-turbo',
    complex: 'gpt-4'
  },
  embedding: {
    model: 'text-embedding-3-small',
    dimensions: 1536
  },
  rag: {
    similarityThreshold: 0.7,
    maxContextTokens: 4000,
    maxChunks: 5
  }
} as const;