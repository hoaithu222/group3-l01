import type { UploadKindLimit } from '../types/storage.types';

/**
 * Đọc `capabilities.limits.upload.kinds` — BE trả trường này thật (`limits` = `LIMITS` ⊕ ghi đè runtime,
 * `getLimits()` nhân bản cả `upload.kinds`) nhưng kiểu `Capabilities['limits']` là `Record<string, unknown>`.
 *
 * Plan p0-05 ghi `capabilities.upload.kinds`; BE thật đặt nó dưới `limits.upload` còn `upload` chỉ có
 * `{ maxFileBytes, allowedMime, signedUrlTtlSeconds }`. Đọc phòng thủ (không ném khi thiếu/sai hình dạng)
 * để bản BE cũ hơn vẫn hiện được bảng chung.
 */
export function readUploadKinds(
  limits: Record<string, unknown> | undefined,
): Array<[string, UploadKindLimit]> {
  const kinds = (limits?.upload as { kinds?: unknown } | undefined)?.kinds;
  if (!kinds || typeof kinds !== 'object') return [];

  return Object.entries(kinds as Record<string, unknown>).flatMap(([kind, raw]) => {
    const v = raw as Partial<UploadKindLimit> | null;
    if (!v || typeof v.maxBytes !== 'number' || !Array.isArray(v.mime)) return [];
    const limit: UploadKindLimit = {
      maxBytes: v.maxBytes,
      mime: v.mime.filter((m): m is string => typeof m === 'string'),
      ...(typeof v.maxSeconds === 'number' && { maxSeconds: v.maxSeconds }),
    };
    return [[kind, limit]];
  });
}

const MIME_SHORT: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/zip': 'ZIP',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'video/quicktime': 'MOV',
  'video/mp4': 'MP4',
  'audio/mpeg': 'MP3',
  'audio/mp4': 'M4A',
};

/** `image/jpeg` → `JPEG`, MIME dài của Office → `DOCX`… — bảng giới hạn không nên in cả chuỗi MIME. */
export function mimeShortLabel(mime: string): string {
  return MIME_SHORT[mime] ?? (mime.split('/')[1] ?? mime).toUpperCase();
}
