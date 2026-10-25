import type { BadgeVariant } from '@/shared/ui/badge';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import type { ProgressRingTone } from '@/shared/ui/progress-ring';

import type { PlagiarismLevel, ScanMode, ScanStatus } from '../api/plagiarism.types';

/** Mức luôn có CHỮ (app.md §7 UX riêng) — không dùng riêng màu để phân biệt (trợ năng). */
export function levelLabel(level: PlagiarismLevel | null): string {
  if (level === 'HIGH') return 'Cao';
  if (level === 'MEDIUM') return 'Trung bình';
  if (level === 'LOW') return 'Thấp';
  return 'Chưa có';
}

/**
 * Tông `Badge` bổ trợ cho `levelLabel` — ⛔ KHÔNG phải cách duy nhất phân biệt mức (chữ luôn đi kèm).
 * ⚠️ `LOW` để `neutral` chứ không `success`: điểm thấp không phải "đạt", kết quả chỉ là gợi ý đối chiếu (app.md §7).
 */
export function levelBadgeVariant(level: PlagiarismLevel | null): BadgeVariant {
  if (level === 'HIGH') return 'error';
  if (level === 'MEDIUM') return 'warning';
  return 'neutral';
}

/** Màu cung của vòng điểm — `ProgressRing` chỉ có ba tông; chỉ mức CAO mới đỏ, còn lại màu thương hiệu (không phán xét). */
export function levelRingTone(level: PlagiarismLevel | null): ProgressRingTone {
  return level === 'HIGH' ? 'error' : 'brand';
}

/** Một dòng mô tả chế độ so sánh — dòng danh sách và thẻ tóm tắt báo cáo nói CÙNG một câu. */
export function scanModeLabel(mode: ScanMode): string {
  return mode === 'WORKSPACE' ? 'So với toàn bộ tài liệu nhóm' : 'So trong các tệp đã chọn';
}

const ACTIVE_STATUSES: ReadonlySet<ScanStatus> = new Set(['QUEUED', 'INDEXING', 'SCANNING']);

/** Lượt quét còn đang chạy (chưa có báo cáo) — dùng chung cho dòng danh sách và màn báo cáo. */
export function isScanActive(status: ScanStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function scanStatusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return 'Đang xếp hàng';
    case 'INDEXING':
      return 'Đang chuẩn bị tệp';
    case 'SCANNING':
      return 'Đang quét';
    case 'COMPLETED':
      return 'Đã xong';
    case 'FAILED':
      return 'Không hoàn tất';
    case 'CANCELLED':
      return 'Đã huỷ';
    case 'EXPIRED':
      return 'Đã hết hạn';
    default:
      return status;
  }
}

export interface ScanStatusArt {
  badge: BadgeVariant;
  icon: IconName;
  tone: IconTileTone;
}

/**
 * Hình + tông theo trạng thái lượt quét (ô icon đầu dòng, huy hiệu trạng thái) — luôn đi CÙNG chữ `scanStatusLabel`.
 * ⚠️ `FAILED` là `warning` ở ô icon (tông `danger` để dành cho hành động phá huỷ), `error` ở huy hiệu chữ.
 */
export function scanStatusArt(status: ScanStatus): ScanStatusArt {
  switch (status) {
    case 'COMPLETED':
      return { badge: 'success', icon: 'checkmark-circle', tone: 'success' };
    case 'FAILED':
      return { badge: 'error', icon: 'alert-warning', tone: 'warning' };
    case 'CANCELLED':
      return { badge: 'neutral', icon: 'cancel', tone: 'neutral' };
    case 'EXPIRED':
      return { badge: 'neutral', icon: 'timer', tone: 'neutral' };
    case 'INDEXING':
      return { badge: 'info', icon: 'reload', tone: 'info' };
    case 'SCANNING':
      return { badge: 'info', icon: 'search', tone: 'info' };
    default:
      return { badge: 'info', icon: 'clock', tone: 'info' };
  }
}

export function fingerprintStatusLabel(status: string): string | null {
  switch (status) {
    case 'PENDING':
      return 'Đang chuẩn bị';
    case 'NO_TEXT':
      return 'Không trích được chữ (chưa hỗ trợ OCR)';
    case 'UNSUPPORTED':
      return 'Chưa hỗ trợ định dạng này';
    case 'TOO_LARGE':
      return 'Tệp quá lớn';
    case 'FAILED':
      return 'Lỗi khi chuẩn bị tệp';
    default:
      return null;
  }
}

export function failureCodeLabel(code: string | null): string {
  if (code === 'INDEX_TIMEOUT') return 'Tệp chuẩn bị quá lâu, hãy thử quét lại';
  if (code === 'ALL_TARGETS_SKIPPED') return 'Không có tệp nào đủ điều kiện so sánh';
  return 'Lượt quét không hoàn tất';
}
