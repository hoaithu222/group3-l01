import { formatFileSize } from '@/shared/utils/format/file-size.utils';

import { STUDY_MEDIA_LIMITS } from '../constants/study.constants';

export type StudyMediaKind = keyof typeof STUDY_MEDIA_LIMITS;
export type StudyAudioMime = (typeof STUDY_MEDIA_LIMITS.AUDIO.mime)[number];

/**
 * MIME máy báo → MIME BE nhận. Android hay báo `audio/x-m4a`/`audio/mp3`, còn tệp lấy từ Drive/Zalo thường chỉ có
 * `application/octet-stream`; BE CHỈ nhận đúng `audio/mpeg` và `audio/mp4` (`scopeRestrict.STUDY.AUDIO`) nên gửi nguyên
 * chuỗi máy báo là `ASSET_001` dù tệp hoàn toàn hợp lệ.
 */
const AUDIO_MIME_ALIASES: Record<string, StudyAudioMime> = {
  'audio/m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
};
const AUDIO_EXT_ALIASES: Record<string, StudyAudioMime> = { m4a: 'audio/mp4', mp3: 'audio/mpeg' };

/** `null` = không phải MP3/M4A. Máy không báo MIME (rỗng/`octet-stream`) thì dựa vào đuôi tên tệp. */
export function normalizeAudioMime(mime: string, fileName: string): StudyAudioMime | null {
  const known = AUDIO_MIME_ALIASES[mime.trim().toLowerCase()];
  if (known) return known;
  const unknown = mime.trim() === '' || mime.toLowerCase() === 'application/octet-stream';
  if (!unknown) return null;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return AUDIO_EXT_ALIASES[ext] ?? null;
}

/** Câu lỗi tiếng Việt khi tệp không đạt luật scope `STUDY`; `null` = hợp lệ. BE vẫn kiểm lại (đọc magic bytes). */
export function checkStudyFile(kind: StudyMediaKind, mime: string, size: number): string | null {
  const limit = STUDY_MEDIA_LIMITS[kind];
  if (!(limit.mime as readonly string[]).includes(mime)) {
    return `Định dạng không hỗ trợ. Chỉ nhận ${limit.label}.`;
  }
  if (size <= 0) return 'Không đọc được tệp đã chọn. Hãy chọn tệp khác.';
  if (size > limit.maxBytes) {
    return `Tệp quá lớn (tối đa ${formatFileSize(limit.maxBytes)}).`;
  }
  return null;
}

/** Đổi đuôi tên tệp thành `.jpg` — ảnh luôn được nén ra JPEG trước khi tải (HEIC/PNG lớn không qua được trần 5 MB). */
export function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'anh'}.jpg`;
}
