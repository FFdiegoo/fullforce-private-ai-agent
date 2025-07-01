declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: {
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      type?: string;
      quality?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string>;

  export function toBuffer(
    text: string,
    options?: any
  ): Promise<Buffer>;

  export function toString(
    text: string,
    options?: any
  ): Promise<string>;

  export default {
    toDataURL,
    toBuffer,
    toString
  };
}