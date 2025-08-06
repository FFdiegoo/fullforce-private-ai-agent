import crypto from 'crypto';

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FileMetadata {
  originalName: string;
  safeFilename: string;
  size: number;
  type: string;
  checksum: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export class UploadUtils {
  private static readonly SUPPORTED_TYPES = [
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
  ];

  private static readonly MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
  private static readonly RECOMMENDED_MAX_SIZE = 100 * 1024 * 1024; // 100MB

  static validateFile(file: File, existingFiles: File[] = []): FileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file type
    if (!this.SUPPORTED_TYPES.includes(file.type)) {
      errors.push(`Unsupported file type: ${file.type}`);
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      errors.push(`File too large: ${this.formatFileSize(file.size)} (max: ${this.formatFileSize(this.MAX_FILE_SIZE)})`);
    } else if (file.size > this.RECOMMENDED_MAX_SIZE) {
      warnings.push(`Large file: ${this.formatFileSize(file.size)} (recommended max: ${this.formatFileSize(this.RECOMMENDED_MAX_SIZE)})`);
    }

    // Check for empty files
    if (file.size === 0) {
      errors.push('File is empty');
    }

    // Check filename
    if (!file.name || file.name.trim().length === 0) {
      errors.push('Invalid filename');
    }

    // Check for duplicates
    const isDuplicate = existingFiles.some(f => 
      f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );
    if (isDuplicate) {
      warnings.push('Duplicate file detected');
    }

    // Check filename length
    if (file.name.length > 255) {
      warnings.push('Filename is very long and will be truncated');
    }

    // Check for special characters
    if (/[<>:"/\\|?*]/.test(file.name)) {
      warnings.push('Filename contains special characters that will be replaced');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  static generateSafeFilename(originalName: string): string {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const safeName = originalName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 200); // Limit length
    
    return `${timestamp}_${randomId}_${safeName}`;
  }

  static calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static getFileTypeInfo(mimeType: string): { icon: string; name: string; category: string } {
    const typeMap: Record<string, { icon: string; name: string; category: string }> = {
      'application/pdf': { icon: '📄', name: 'PDF', category: 'document' },
      'application/msword': { icon: '📝', name: 'Word', category: 'document' },
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: '📝', name: 'Word', category: 'document' },
      'text/plain': { icon: '📄', name: 'Text', category: 'document' },
      'text/csv': { icon: '📊', name: 'CSV', category: 'spreadsheet' },
      'text/markdown': { icon: '📄', name: 'Markdown', category: 'document' },
      'application/vnd.ms-excel': { icon: '📊', name: 'Excel', category: 'spreadsheet' },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: '📊', name: 'Excel', category: 'spreadsheet' },
      'application/vnd.ms-powerpoint': { icon: '📊', name: 'PowerPoint', category: 'presentation' },
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': { icon: '📊', name: 'PowerPoint', category: 'presentation' },
      'application/rtf': { icon: '📝', name: 'RTF', category: 'document' },
      'text/rtf': { icon: '📝', name: 'RTF', category: 'document' },
      'image/jpeg': { icon: '🖼️', name: 'JPEG', category: 'image' },
      'image/png': { icon: '🖼️', name: 'PNG', category: 'image' },
      'image/gif': { icon: '🖼️', name: 'GIF', category: 'image' },
      'image/bmp': { icon: '🖼️', name: 'BMP', category: 'image' },
      'image/tiff': { icon: '🖼️', name: 'TIFF', category: 'image' }
    };

    return typeMap[mimeType] || { icon: '📄', name: 'Unknown', category: 'unknown' };
  }

  static estimateProcessingTime(fileSize: number, fileType: string): number {
    // Rough estimates in seconds based on file type and size
    const baseTime = 5; // Base processing time
    const sizeMultiplier = fileSize / (1024 * 1024); // MB
    
    let typeMultiplier = 1;
    if (fileType.includes('pdf')) typeMultiplier = 2;
    else if (fileType.includes('word')) typeMultiplier = 1.5;
    else if (fileType.includes('excel')) typeMultiplier = 1.8;
    else if (fileType.includes('image')) typeMultiplier = 0.5;

    return Math.round(baseTime + (sizeMultiplier * typeMultiplier));
  }

  static detectFileEncoding(buffer: Buffer): string {
    // Simple encoding detection
    const sample = buffer.slice(0, 1024).toString();
    
    // Check for BOM
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return 'utf-8';
    }
    
    // Check for common encodings
    try {
      buffer.toString('utf-8');
      return 'utf-8';
    } catch {
      return 'binary';
    }
  }

  static generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        resolve(''); // No thumbnail for non-images
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set thumbnail size
          const maxSize = 100;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          
          // Draw thumbnail
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  static validateBatch(files: File[]): {
    valid: File[];
    invalid: Array<{ file: File; errors: string[] }>;
    totalSize: number;
    estimatedTime: number;
  } {
    const valid: File[] = [];
    const invalid: Array<{ file: File; errors: string[] }> = [];
    let totalSize = 0;
    let estimatedTime = 0;

    files.forEach(file => {
      const validation = this.validateFile(file, files);
      if (validation.valid) {
        valid.push(file);
        totalSize += file.size;
        estimatedTime += this.estimateProcessingTime(file.size, file.type);
      } else {
        invalid.push({ file, errors: validation.errors });
      }
    });

    return { valid, invalid, totalSize, estimatedTime };
  }
}