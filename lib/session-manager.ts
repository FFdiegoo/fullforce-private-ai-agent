import { supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { auditLogger } from './enhanced-audit-logger';

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
}

export class SessionManager {
  private static readonly SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30') * 60 * 1000;
  private static readonly REFRESH_THRESHOLD = parseInt(process.env.SESSION_REFRESH_THRESHOLD_MINUTES || '5') * 60 * 1000;
  
  private static activeSessions = new Map<string, SessionInfo>();
  private static cleanupInterval: NodeJS.Timeout;

  static init(): void {
    // Cleanup expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  static async createSession(userId: string, email: string, deviceInfo: SessionInfo['deviceInfo']): Promise<string> {
    const sessionId = this.generateSessionId();
    
    const sessionInfo: SessionInfo = {
      userId,
      email,
      lastActivity: Date.now(),
      deviceInfo,
      isActive: true
    };

    this.activeSessions.set(sessionId, sessionInfo);

    // Check for multiple sessions
    const userSessions = Array.from(this.activeSessions.entries())
      .filter(([_, session]) => session.userId === userId && session.isActive);

    if (userSessions.length > 1) {
      await auditLogger.logSecurity({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARN',
        details: {
          reason: 'multiple_concurrent_sessions',
          sessionCount: userSessions.length,
          devices: userSessions.map(([id, session]) => ({
            sessionId: id,
            userAgent: session.deviceInfo.userAgent,
            ipAddress: session.deviceInfo.ipAddress
          }))
        }
      }, userId, deviceInfo.ipAddress);
    }

    await auditLogger.logAuth('SESSION_CREATED', userId, {
      sessionId,
      deviceInfo
    }, deviceInfo.ipAddress);

    return sessionId;
  }

  static async validateSession(sessionId: string): Promise<SessionInfo | null> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    const now = Date.now();
    const timeSinceLastActivity = now - session.lastActivity;

    // Check if session has expired
    if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
      await this.invalidateSession(sessionId, 'timeout');
      return null;
    }

    // Update last activity
    session.lastActivity = now;
    this.activeSessions.set(sessionId, session);

    return session;
  }

  static async refreshSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastActivity = now - session.lastActivity;

    // Only refresh if close to expiration
    if (timeSinceLastActivity > (this.SESSION_TIMEOUT - this.REFRESH_THRESHOLD)) {
      try {
        // Refresh Supabase session
        const { error } = await supabase.auth.refreshSession();
        
        if (error) {
          await this.invalidateSession(sessionId, 'refresh_failed');
          return false;
        }

        session.lastActivity = now;
        this.activeSessions.set(sessionId, session);

        await auditLogger.logAuth('SESSION_REFRESHED', session.userId, {
          sessionId
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
        duration: Date.now() - session.lastActivity
      });
    }

    this.activeSessions.delete(sessionId);
  }

  static async invalidateAllUserSessions(userId: string, reason: string = 'security'): Promise<void> {
    const userSessions = Array.from(this.activeSessions.entries())
      .filter(([_, session]) => session.userId === userId);

    for (const [sessionId, _] of userSessions) {
      await this.invalidateSession(sessionId, reason);
    }

    await auditLogger.logSecurity({
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'WARN',
      details: {
        reason: 'all_sessions_invalidated',
        sessionCount: userSessions.length,
        invalidationReason: reason
      }
    }, userId);
  }

  static async detectSuspiciousActivity(userId: string, newDeviceInfo: SessionInfo['deviceInfo']): Promise<boolean> {
    const userSessions = Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId && session.isActive);

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

    if (recentSessions.length > 3) {
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
    uniqueUsers: number;
  } {
    const activeSessions = Array.from(this.activeSessions.values())
      .filter(session => session.isActive);

    const uniqueUsers = new Set(activeSessions.map(session => session.userId)).size;

    return {
      totalSessions: this.activeSessions.size,
      activeSessions: activeSessions.length,
      uniqueUsers
    };
  }

  private static cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.invalidateSession(sessionId, 'cleanup');
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  private static generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  static destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Initialize session manager
SessionManager.init();

// Cleanup on process exit
process.on('beforeExit', () => {
  SessionManager.destroy();
});