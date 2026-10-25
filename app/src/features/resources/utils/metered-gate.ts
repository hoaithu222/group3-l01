import { EXPENSIVE_DOWNLOAD_BYTES } from '../constants/resource-limits.constants';
import type { PreviewKind } from './preview-kind';

/** Khung xem trước phải TẢI cả tệp (hoặc phát trực tiếp) — chữ/mã đã bị chặn ở 512 KiB nên không cần hỏi. */
const HEAVY_KINDS: ReadonlySet<PreviewKind> = new Set<PreviewKind>([
  'audio',
  'image',
  'pdf',
  'video',
]);

/**
 * Có nên HỎI trước khi tải không (app.md p3-01 §7): tệp > 5 MB VÀ đang dùng dữ liệu
 * di động (`isConnectionExpensive` của NetInfo) VÀ khung xem trước thuộc loại nặng.
 * Người dùng đã đồng ý (`allowed`) thì thôi — hỏi một lần cho mỗi lần mở tệp.
 */
export function shouldAskBeforeLoading(input: {
  allowed: boolean;
  expensive: boolean;
  kind: PreviewKind;
  size: number;
}): boolean {
  return (
    !input.allowed &&
    input.expensive &&
    input.size > EXPENSIVE_DOWNLOAD_BYTES &&
    HEAVY_KINDS.has(input.kind)
  );
}
