/**
 * Upload guards — kiểm tra file TRƯỚC khi gửi server.
 *
 * Kiểm tệp TRƯỚC khi gửi: kích thước, kiểu, tên, và nội dung đáng ngờ.
 * Phủ ca: sai kiểu, quá cỡ, tệp rỗng, tên quá dài, đuôi nguy hiểm, chứa mã kịch bản.
 *
 * Bổ sung so với `src/shared/ui/upload/utils.ts`:
 * - Blank file (0 byte)
 * - Filename length (mặc định 255 ký tự — POSIX/Windows filesystem limit)
 * - Dangerous extension blocklist (.exe, .bat, .sh, .msi, .dll, .vbs, ...)
 * - Scan HTML / script tag trong file text-based (SVG, HTML, XML)
 * - Image dimension check (min/max width/height)
 *
 * Cách dùng:
 *   import { validateFileStrict, validateImageDimensions } from './upload-guards';
 *
 *   const err = validateFileStrict(file, {
 *     maxSize: 10 * 1024 * 1024,
 *     accept: '.pdf,.xlsx',
 *     maxNameLength: 255,
 *     blockDangerous: true,
 *     scanScriptTag: true,
 *   });
 *   if (err) return showToast('error', err.message);
 */
import { formatFileSize, matchesAccept } from '@/shared/utils/format/file-size.utils';

export interface UploadGuardError {
  code:
    | 'file-blank'
    | 'file-too-large'
    | 'file-invalid-type'
    | 'file-name-too-long'
    | 'file-dangerous-extension'
    | 'file-has-script'
    | 'image-invalid-dimension';
  message: string;
}

/**
 * Extension nguy hiểm — luôn từ chối bất kể `accept` cho phép hay không.
 * Nguồn: MIME sniffing checklist + OWASP file upload cheatsheet.
 */
export const DANGEROUS_EXTENSIONS = new Set<string>([
  // Executables
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'scr',
  'pif',
  'cpl',
  // Scripts
  'vbs',
  'vbe',
  'js',
  'jse',
  'ws',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  // System / library
  'dll',
  'sys',
  'drv',
  'ocx',
  // Shell
  'sh',
  'bash',
  'zsh',
  'ksh',
  // Server-side templates
  'jsp',
  'jspx',
  'php',
  'phtml',
  'asp',
  'aspx',
  'cgi',
  'pl',
  'py',
  // Java archives (chỉ block khi không dùng cho app Java)
  'jar',
  'war',
  'ear',
  // App package
  'apk',
  'app',
  'deb',
  'rpm',
  'dmg',
]);

export interface ValidateFileStrictOptions {
  /** Max size per file in bytes */
  maxSize?: number;
  /** Accept string (extension `.pdf` hoặc MIME `image/*`) */
  accept?: string;
  /** Tối đa số ký tự trong tên file. Mặc định 255. */
  maxNameLength?: number;
  /**
   * Chặn extension nguy hiểm (xem `DANGEROUS_EXTENSIONS`).
   * Mặc định `true` — chỉ tắt khi thực sự cần upload script.
   */
  blockDangerous?: boolean;
  /**
   * Scan magic bytes / text đầu file phát hiện HTML/script tag.
   * Chỉ áp cho file text-based (svg, xml, html, txt, csv, json).
   * Mặc định `true`.
   */
  scanScriptTag?: boolean;
}

/**
 * Extract extension từ tên file — lowercase, không dấu chấm.
 * `foo.tar.gz` → `gz`. `foo` → `''`.
 */
export function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/** Basic sync validation — trả `UploadGuardError` hoặc `null`. */
export function validateFileStrict(
  file: File,
  options: ValidateFileStrictOptions = {},
): UploadGuardError | null {
  const { maxSize, accept, maxNameLength = 255, blockDangerous = true } = options;

  // 1. Blank file (0 byte)
  if (file.size === 0) {
    return { code: 'file-blank', message: 'Tệp trống, vui lòng chọn tệp khác' };
  }

  // 2. Max size
  if (maxSize && file.size > maxSize) {
    return {
      code: 'file-too-large',
      message: `Tệp vượt quá ${formatFileSize(maxSize)}`,
    };
  }

  // 3. Filename length
  if (file.name.length > maxNameLength) {
    return {
      code: 'file-name-too-long',
      message: `Tên tệp tối đa ${maxNameLength} ký tự`,
    };
  }

  // 4. Dangerous extension
  if (blockDangerous) {
    const ext = getExtension(file.name);
    if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
      return {
        code: 'file-dangerous-extension',
        message: `Tệp .${ext} không được phép tải lên`,
      };
    }
  }

  // 5. Accept
  if (accept && !matchesAccept(file, accept)) {
    return {
      code: 'file-invalid-type',
      message: 'Định dạng tệp không được hỗ trợ',
    };
  }

  return null;
}

/**
 * Async guard — cover TC "upload file có tag HTML / script tag".
 * Đọc first ~4KB của file text-based và scan `<script`, `<iframe`, `javascript:`,
 * `onerror=`, `onload=` (SVG có thể chứa script embed).
 *
 * Chỉ chạy với file có MIME/ext text-based: svg, html, xml, txt, csv, json.
 * Với file binary khác → skip.
 */
const TEXT_BASED_EXTS = new Set(['svg', 'html', 'htm', 'xml', 'xhtml', 'txt', 'csv', 'json', 'md']);

const SCRIPT_PATTERNS = [
  /<script\b/i,
  /<iframe\b/i,
  /<embed\b/i,
  /<object\b/i,
  /javascript:/i,
  /\bon[a-z]+\s*=\s*["'`]/i, // onerror=, onload=, onclick=…
  /<meta\b[^>]+http-equiv\s*=\s*["']refresh/i,
];

export async function scanFileForScriptTag(file: File, bytesToRead = 4096): Promise<boolean> {
  const ext = getExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  const isTextBased =
    TEXT_BASED_EXTS.has(ext) ||
    mime.startsWith('text/') ||
    mime === 'image/svg+xml' ||
    mime === 'application/json' ||
    mime === 'application/xml';

  if (!isTextBased) return false;

  const slice = file.slice(0, bytesToRead);
  const text = await slice.text();
  return SCRIPT_PATTERNS.some((re) => re.test(text));
}

/**
 * Async wrapper: sync guard + optional script scan.
 * Dùng ở boundary trước khi push vào queue upload.
 */
export async function validateFileAsync(
  file: File,
  options: ValidateFileStrictOptions = {},
): Promise<UploadGuardError | null> {
  const syncErr = validateFileStrict(file, options);
  if (syncErr) return syncErr;

  if (options.scanScriptTag !== false) {
    const hasScript = await scanFileForScriptTag(file);
    if (hasScript) {
      return {
        code: 'file-has-script',
        message: 'Tệp chứa mã script không được phép',
      };
    }
  }

  return null;
}

// ─── Image dimension ──────────────────────────────────────────────────

export interface ImageDimensionOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Tỉ lệ mong muốn (width/height). Ví dụ 16/9. */
  aspectRatio?: number;
  /** Tolerance cho aspect ratio (mặc định 0.02 = 2%). */
  aspectTolerance?: number;
}

interface ImageDim {
  width: number;
  height: number;
}

/**
 * Load ảnh vào memory + đọc naturalWidth/Height.
 * KHÔNG lock main thread — dùng `createImageBitmap` fallback `<img>`.
 */
export async function readImageDimensions(file: File): Promise<ImageDim> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File không phải ảnh');
  }

  // Chrome/Firefox/Safari mới hỗ trợ createImageBitmap
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const dim = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return dim;
    } catch {
      // fallback
    }
  }

  return await new Promise<ImageDim>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dim = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dim);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được kích thước ảnh'));
    };
    img.src = url;
  });
}

export async function validateImageDimensions(
  file: File,
  options: ImageDimensionOptions,
): Promise<UploadGuardError | null> {
  let dim: ImageDim;
  try {
    dim = await readImageDimensions(file);
  } catch (e) {
    return {
      code: 'image-invalid-dimension',
      message: (e as Error).message,
    };
  }

  const { minWidth, minHeight, maxWidth, maxHeight, aspectRatio, aspectTolerance = 0.02 } = options;

  if (minWidth && dim.width < minWidth) {
    return {
      code: 'image-invalid-dimension',
      message: `Chiều rộng tối thiểu ${minWidth}px`,
    };
  }
  if (minHeight && dim.height < minHeight) {
    return {
      code: 'image-invalid-dimension',
      message: `Chiều cao tối thiểu ${minHeight}px`,
    };
  }
  if (maxWidth && dim.width > maxWidth) {
    return {
      code: 'image-invalid-dimension',
      message: `Chiều rộng tối đa ${maxWidth}px`,
    };
  }
  if (maxHeight && dim.height > maxHeight) {
    return {
      code: 'image-invalid-dimension',
      message: `Chiều cao tối đa ${maxHeight}px`,
    };
  }
  if (aspectRatio && dim.height > 0) {
    const actual = dim.width / dim.height;
    if (Math.abs(actual - aspectRatio) > aspectTolerance) {
      return {
        code: 'image-invalid-dimension',
        message: `Ảnh phải có tỉ lệ ${aspectRatio.toFixed(2)}`,
      };
    }
  }

  return null;
}
