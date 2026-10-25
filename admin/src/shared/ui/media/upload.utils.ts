/**
 * Upload utilities — pure helpers, no React.
 *
 * `formatFileSize` và `matchesAccept` đã chuyển xuống
 * `@/shared/utils/format/file-size.utils` và chỉ được XUẤT LẠI ở đây cho các
 * component kit2 đang import quen tay. Lý do chuyển: `shared/utils/validation/
 * upload-guards.ts` cần chúng, mà `utils → ui` là phụ thuộc runtime ngược chiều.
 *
 * - `getFileTypeStyle` — mapping extension/MIME → badge icon + color. Phân loại
 *   chi tiết để FileCard hiển thị badge giống Figma (PDF đỏ, DOCX xanh, …).
 * - `validateFile` — kiểm tra size + accept; trả về `ValidationError` hoặc null.
 * - `matchesAccept` — match File với accept string (extension hoặc MIME wildcard).
 * - `generateFileId` — UUID-ish id ngắn dùng làm React key.
 */
import { formatFileSize, matchesAccept } from '@/shared/utils/format/file-size.utils';

import type { FileTypeStyle, ValidationError } from './upload.types';

export { formatFileSize, matchesAccept };

const FILE_TYPE_MAP: Record<string, FileTypeStyle> = {
  pdf: { iconName: 'file-bold', label: 'PDF', skin: 'red' },
  doc: { iconName: 'file-lines-bold', label: 'DOC', skin: 'blue' },
  docx: { iconName: 'file-lines-bold', label: 'DOCX', skin: 'blue' },
  xls: { iconName: 'file-lines-bold', label: 'XLS', skin: 'green' },
  xlsx: { iconName: 'file-lines-bold', label: 'XLSX', skin: 'green' },
  csv: { iconName: 'file-lines-bold', label: 'CSV', skin: 'green' },
  ppt: { iconName: 'file-bold', label: 'PPT', skin: 'orange' },
  pptx: { iconName: 'file-bold', label: 'PPTX', skin: 'orange' },
  txt: { iconName: 'file-lines-bold', label: 'TXT', skin: 'neutral' },
  zip: { iconName: 'folder-bold', label: 'ZIP', skin: 'purple' },
  rar: { iconName: 'folder-bold', label: 'RAR', skin: 'purple' },
  '7z': { iconName: 'folder-bold', label: '7Z', skin: 'purple' },
  png: { iconName: 'image-bold', label: 'PNG', skin: 'sky' },
  jpg: { iconName: 'image-bold', label: 'JPG', skin: 'sky' },
  jpeg: { iconName: 'image-bold', label: 'JPG', skin: 'sky' },
  webp: { iconName: 'image-bold', label: 'WEBP', skin: 'sky' },
  gif: { iconName: 'image-bold', label: 'GIF', skin: 'sky' },
  svg: { iconName: 'image-bold', label: 'SVG', skin: 'sky' },
  dwg: { iconName: 'file-bold', label: 'DWG', skin: 'orange' },
  ifc: { iconName: 'file-bold', label: 'IFC', skin: 'purple' },
  rvt: { iconName: 'file-bold', label: 'RVT', skin: 'blue' },
  mp4: { iconName: 'file-bold', label: 'MP4', skin: 'purple' },
  mov: { iconName: 'file-bold', label: 'MOV', skin: 'purple' },
};

const DEFAULT_TYPE_STYLE: FileTypeStyle = {
  iconName: 'file-bold',
  label: 'FILE',
  skin: 'neutral',
};

export function getFileTypeStyle(name: string): FileTypeStyle {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPE_MAP[ext] ?? DEFAULT_TYPE_STYLE;
}

export function isImageFile(file: { type?: string; name: string }): boolean {
  if (file.type?.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
}

export interface ValidateFileOptions {
  accept?: string;
  /** Max size per file in bytes */
  maxSize?: number;
}

export function validateFile(file: File, options: ValidateFileOptions): ValidationError | null {
  const { accept, maxSize } = options;
  if (maxSize && file.size > maxSize) {
    return {
      code: 'file-too-large',
      message: `Tệp vượt quá ${formatFileSize(maxSize)}`,
    };
  }
  if (accept && !matchesAccept(file, accept)) {
    return {
      code: 'file-invalid-type',
      message: `Định dạng tệp không được hỗ trợ`,
    };
  }
  return null;
}

let _idSeq = 0;
export function generateFileId(): string {
  _idSeq = (_idSeq + 1) % 1_000_000;
  return `upl_${Date.now().toString(36)}_${_idSeq.toString(36)}`;
}
