// Authentication and authorization types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'user' | 'admin';

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface InviteData {
  id: string;
  email: string;
  name: string;
  phone?: string;
  inviteCode: string;
  expiresAt: Date;
  used: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface SessionInfo {
  userId: string;
  email: string;
  lastActivity: number;
  deviceInfo: DeviceInfo;
  isActive: boolean;
  expiresAt: number;
}

export interface DeviceInfo {
  userAgent: string;
  ipAddress: string;
  deviceId: string;
}