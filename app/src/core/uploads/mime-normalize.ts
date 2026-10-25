/**
 * Chuẩn hoá MIME MÁY BÁO về đúng MIME mà BE nhận (`LIMITS.upload.kinds`, `be/src/core/constants/limits.ts`).
 *
 * BE so MIME khai báo với allowlist THEO NGUYÊN VĂN — sai một ký tự là `400 VAL_001` ("Dữ liệu không hợp lệ") dù tệp hợp lệ.
 * Trình chọn tệp Android/iOS lại hay báo MIME "lạ": `image/jpg`, `audio/x-m4a`/`audio/m4a`, `text/plain; charset=utf-8`,
 * hoặc chỉ `application/octet-stream` khi tệp lấy từ Drive/Zalo. Nên chuẩn hoá MỘT chỗ ở biên (lúc chọn tệp) thay vì để mỗi
 * màn tự đoán — module `study` từng phải tự viết bảng riêng (`features/study/utils/media-policy.ts`) vì thiếu chỗ này.
 */

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/heif': 'image/heic',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-aac': 'audio/aac',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'application/x-zip-compressed': 'application/zip',
  'application/csv': 'text/csv',
  'text/comma-separated-values': 'text/csv',
};

/** Đuôi tệp → MIME, chỉ dùng khi máy KHÔNG báo được MIME (rỗng hoặc `application/octet-stream`). */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

const UNKNOWN_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function extensionOf(fileName: string | undefined): string {
  const dot = fileName?.lastIndexOf('.') ?? -1;
  return dot < 0 || !fileName ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * @param mime MIME máy báo (có thể `undefined`/rỗng/kèm tham số `; charset=…`).
 * @param fileName Tên tệp — chỉ để suy MIME từ đuôi khi `mime` không dùng được.
 * @returns MIME viết thường, không tham số, đã quy về dạng BE nhận; giữ nguyên nếu không có luật nào áp (BE quyết định cuối).
 */
export function normalizeMime(mime: string | null | undefined, fileName?: string): string {
  const base = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (UNKNOWN_MIMES.has(base)) return MIME_BY_EXTENSION[extensionOf(fileName)] ?? base;
  return MIME_ALIASES[base] ?? base;
}

/**
 * HEIC/HEIF (kể cả `image/heic-sequence`) — định dạng BE KHÔNG giải mã được (`be.md` §10 "HEIC chuyển JPEG ở client"; log Railway
 * 2026-09-27: `heif: Decoder plugin generated an error`). Nhận MIME ĐÃ qua `normalizeMime`.
 */
export function isHeicMime(mime: string): boolean {
  return /^image\/hei[cf]/.test(mime);
}
