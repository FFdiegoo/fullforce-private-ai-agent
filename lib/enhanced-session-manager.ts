import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { auditLogger } from './enhanced-audit-logger';
import { NextRequest } from 'next/server';

export interface SessionInfo {
  userId: string;
  email: string;
  lastActivity: number;
  deviceInfo: {
    userAgent: string;
    ipAddress: string;
    deviceId: string;
  };
  isActive: boolean;
  expiresAt: number;
}

export class EnhancedSessionManager {
  private static readonly SESSION_TIMEOUT = parseInt((typeof process !== 'undefined' && process.env) ? process.env.SESSION_TIMEOUT_MINUTES || '30' : '30') * 60 * 1000;
  private static readonly REFRESH_THRESHOLD = parseInt((typeof process !== 'undefined' && process.env) ? process.env.SESSION_REFRESH_THRESHOLD_MINUTES || '5' : '5') * 60 * 1000;
  private static readonly MAX_CONCURRENT_SESSIONS = 3;

  private static activeSessions = new Map<string, SessionInfo>();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  static init(): void {
    // Only initialize cleanup in full Node.js environment (not Edge Runtime)
    if (typeof setInterval !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
      // Cleanup expired sessions every 2 minutes
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredSessions();
      }, 2 * 60 * 1000);

      console.log('🔐 Enhanced Session Manager initialized');
      console.log(`   Session timeout: ${this.SESSION_TIMEOUT / 60000} minutes`);
      console.log(`   Refresh threshold: ${this.REFRESH_THRESHOLD / 60000} minutes`);
    }
  }

  static async createSession(userId: string, email: string, deviceInfo: SessionInfo['deviceInfo']): Promise<string> {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const sessionInfo: SessionInfo = {
      userId,
      email,
      lastActivity: now,
      deviceInfo,
      isActive: true,
      expiresAt: now + this.SESSION_TIMEOUT
    };

    this.activeSessions.set(sessionId, sessionInfo);

    // Check for multiple sessions
    const userSessions = this.getUserSessions(userId);

    if (userSessions.length > this.MAX_CONCURRENT_SESSIONS) {
      // Remove oldest session
      const oldestSession = userSessions
        .sort((a, b) => a.lastActivity - b.lastActivity)[0];

      await this.invalidateSession(this.getSessionIdByInfo(oldestSession), 'max_sessions_exceeded');

      await auditLogger.logSecurity({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARN',
        details: {
          reason: 'max_concurrent_sessions_exceeded',
          sessionCount: userSessions.length,
          removedOldestSession: true
        }
      }, userId, deviceInfo.ipAddress);
    }

    // Check for suspicious activity
    await this.detectSuspiciousActivity(userId, deviceInfo);

    await auditLogger.logAuth('SESSION_CREATED', userId, {
      sessionId,
      deviceInfo,
      expiresAt: new Date(sessionInfo.expiresAt).toISOString()
    }, deviceInfo.ipAddress);

    return sessionId;
  }

  static async validateSession(sessionId: string, updateActivity: boolean = true): Promise<SessionInfo | null> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return null;
    }

    const now = Date.now();

    // Check if session has expired
    if (now > session.expiresAt) {
      await this.invalidateSession(sessionId, 'expired');
      return null;
    }

    // Update last activity if requested
    if (updateActivity) {
      session.lastActivity = now;
      this.activeSessions.set(sessionId, session);
    }

    return session;
  }

  // DeepAgent update: validate session from NextRequest (middleware)
  static async validateSessionFromRequest(request: NextRequest): Promise<SessionInfo | null> {
    const sessionId = request.cookies.get('session-id')?.value;
    if (!sessionId) return null;

    const deviceInfo = {
      userAgent: request.headers.get('user-agent') || 'unknown',
      ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      deviceId: request.headers.get('x-device-id') || 'unknown'
    };

    return await this.validateSession(sessionId, true);
  }

  static async refreshSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return false;
    }

    const now = Date.now();
    const timeUntilExpiry = session.expiresAt - now;

    // Only refresh if close to expiration
    if (timeUntilExpiry < this.REFRESH_THRESHOLD) {
      try {
        // Refresh Supabase session
        const { error } = await supabase.auth.refreshSession();

        if (error) {
          await this.invalidateSession(sessionId, 'refresh_failed');
          return false;
        }

        // Extend session
        session.lastActivity = now;
        session.expiresAt = now + this.SESSION_TIMEOUT;
        this.activeSessions.set(sessionId, session);

        await auditLogger.logAuth('SESSION_REFRESHED', session.userId, {
          sessionId,
          newExpiresAt: new Date(session.expiresAt).toISOString()
        });

        return true;
      } catch (error) {
        await auditLogger.logError(error as Error, 'SESSION_REFRESH_ERROR', session.userId);
        return false;
      }
    }

    return true;
  }

  static async invalidateSession(sessionId: string, reason: string = 'manual'): Promise<void> {
    const session = this.activeSessions.get(sessionId);

    if (session) {
      session.isActive = false;

      await auditLogger.logAuth('SESSION_INVALIDATED', session.userId, {
        sessionId,
        reason,
        duration: Date.now() - session.lastActivity,
        wasExpired: Date.now() > session.expiresAt
      });
    }

    this.activeSessions.delete(sessionId);
  }

  static async invalidateAllUserSessions(userId: string, reason: string = 'security', excludeSessionId?: string): Promise<void> {
    const userSessions = Array.from(this.activeSessions.entries())
      .filter(([id, session]) => session.userId === userId && id !== excludeSessionId);

    for (const [sessionId] of userSessions) {
      await this.invalidateSession(sessionId, reason);
    }

    await auditLogger.logSecurity({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'WARN',
      details: {
        reason: 'all_user_sessions_invalidated',
        sessionCount: userSessions.length,
        invalidationReason: reason,
        excludedSession: excludeSessionId
      }
    }, userId);
  }

  static async detectSuspiciousActivity(userId: string, newDeviceInfo: SessionInfo['deviceInfo']): Promise<boolean> {
    const userSessions = this.getUserSessions(userId);

    // Check for sessions from different IP addresses
    const uniqueIPs = new Set(userSessions.map(session => session.deviceInfo.ipAddress));

    if (uniqueIPs.size > 1 && !uniqueIPs.has(newDeviceInfo.ipAddress)) {
      await auditLogger.logSecurity({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARN',
        details: {
          reason: 'login_from_new_ip',
          newIP: newDeviceInfo.ipAddress,
          existingIPs: Array.from(uniqueIPs),
          userAgent: newDeviceInfo.userAgent
        }
      }, userId, newDeviceInfo.ipAddress);

      return true;
    }

    // Check for rapid session creation
    const recentSessions = userSessions.filter(
      session => Date.now() - session.lastActivity < 5 * 60 * 1000 // 5 minutes
    );

    if (recentSessions.length > 2) {
      await auditLogger.logSecurity({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARN',
        details: {
          reason: 'rapid_session_creation',
          sessionCount: recentSessions.length,
          timeWindow: '5_minutes'
        }
      }, userId, newDeviceInfo.ipAddress);

      return true;
    }

    return false;
  }

  static getUserSessions(userId: string): SessionInfo[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId && session.isActive);
  }

  static getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    uniqueUsers: number;
    averageSessionDuration: number;
  } {
    const allSessions = Array.from(this.activeSessions.values());
    const activeSessions = allSessions.filter(session => session.isActive);
    const expiredSessions = allSessions.filter(session => Date.now() > session.expiresAt);
    const uniqueUsers = new Set(activeSessions.map(session => session.userId)).size;

    const totalDuration = activeSessions.reduce((sum, session) =>
      sum + (Date.now() - session.lastActivity), 0);
    const averageSessionDuration = activeSessions.length > 0
      ? totalDuration / activeSessions.length / 60000 // in minutes
      : 0;

    return {
      totalSessions: this.activeSessions.size,
      activeSessions: activeSessions.length,
      expiredSessions: expiredSessions.length,
      uniqueUsers,
      averageSessionDuration: Math.round(averageSessionDuration)
    };
  }

  private static cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.invalidateSession(sessionId, 'cleanup_expired');
    });

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  private static getSessionIdByInfo(sessionInfo: SessionInfo): string {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session === sessionInfo) {
        return sessionId;
      }
    }
    return '';
  }

  private static generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  static destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Initialize enhanced session manager on server side (not Edge Runtime)
if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
  EnhancedSessionManager.init();
}

// Cleanup on process exit (only in full Node.js environment, not Edge Runtime)
if (typeof process !== 'undefined' && process.versions && process.versions.node && process.on) {
  process.on('beforeExit', () => {
    EnhancedSessionManager.destroy();
  });
}