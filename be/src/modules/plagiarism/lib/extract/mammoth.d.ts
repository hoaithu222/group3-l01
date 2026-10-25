/**
 * Khai báo kiểu tối giản cho `mammoth` (không có `@types/mammoth`, agent không được cài gói mới — chỉ khai đúng phần
 * `docx.extractor.ts` dùng: `extractRawText`). Wave 1 đã thêm `mammoth` vào `package.json`/`node_modules`.
 */
declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<ExtractRawTextResult>;
}
