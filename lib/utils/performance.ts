// Performance monitoring and optimization utilities
import { Logger } from './logger';

export class PerformanceMonitor {
  private static logger = new Logger('PerformanceMonitor');
  private static metrics = new Map<string, number[]>();

  static startTimer(operation: string): () => number {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(operation, duration);
      return duration;
    };
  }

  static async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; duration: number }> {
    const endTimer = this.startTimer(operation);
    
    try {
      const result = await fn();
      const duration = endTimer();
      
      this.logger.debug(`Performance: ${operation} completed`, {
        duration,
        metadata,
        success: true
      });

      return { result, duration };
    } catch (error) {
      const duration = endTimer();
      
      this.logger.warn(`Performance: ${operation} failed`, {
        duration,
        metadata,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });

      throw error;
    }
  }

  static recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);
    
    // Keep only last 100 measurements
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }
  }

  static getMetrics(operation?: string): Record<string, any> {
    if (operation) {
      const metrics = this.metrics.get(operation) || [];
      return this.calculateStats(operation, metrics);
    }

    const allMetrics: Record<string, any> = {};
    this.metrics.forEach((metrics, operation) => {
      allMetrics[operation] = this.calculateStats(operation, metrics);
    });

    return allMetrics;
  }

  private static calculateStats(operation: string, durations: number[]) {
    if (durations.length === 0) {
      return { operation, count: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      operation,
      count: durations.length,
      average: Math.round(sum / durations.length * 100) / 100,
      median: sorted[Math.floor(sorted.length / 2)],
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  static clearMetrics(operation?: string): void {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }
}

// Memory monitoring
export class MemoryMonitor {
  private static logger = new Logger('MemoryMonitor');

  static getMemoryUsage(): NodeJS.MemoryUsage | null {
    if (typeof process === 'undefined') return null;
    return process.memoryUsage();
  }

  static logMemoryUsage(context: string): void {
    const usage = this.getMemoryUsage();
    if (!usage) return;

    const formatBytes = (bytes: number) => {
      return Math.round(bytes / 1024 / 1024 * 100) / 100; // MB
    };

    this.logger.debug(`Memory usage in ${context}`, {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external),
      unit: 'MB'
    });
  }

  static checkMemoryLeak(threshold: number = 500): boolean {
    const usage = this.getMemoryUsage();
    if (!usage) return false;

    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > threshold) {
      this.logger.warn('Potential memory leak detected', {
        heapUsedMB,
        threshold,
        rss: usage.rss / 1024 / 1024
      });
      return true;
    }

    return false;
  }
}

// Cache utilities
export class CacheUtils {
  private static cache = new Map<string, { data: any; expires: number }>();
  private static logger = new Logger('CacheUtils');

  static set(key: string, data: any, ttlMs: number = 300000): void { // 5 minutes default
    const expires = Date.now() + ttlMs;
    this.cache.set(key, { data, expires });
    
    this.logger.debug('Cache set', { key, ttlMs, expires });
  }

  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.logger.debug('Cache miss', { key });
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.logger.debug('Cache expired', { key });
      return null;
    }

    this.logger.debug('Cache hit', { key });
    return entry.data as T;
  }

  static delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.logger.debug('Cache delete', { key, deleted });
    return deleted;
  }

  static clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info('Cache cleared', { previousSize: size });
  }

  static cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    this.cache.forEach((entry, key) => {
      if (now > entry.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.logger.debug('Cache cleanup completed', { cleaned, remaining: this.cache.size });
    }
  }

  static getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Auto cleanup cache every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    CacheUtils.cleanup();
  }, 5 * 60 * 1000);
}