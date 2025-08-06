// Common types used across the application
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditableEntity extends BaseEntity {
  createdBy?: string;
  updatedBy?: string;
}

export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';

export interface StatusEntity extends BaseEntity {
  status: EntityStatus;
}