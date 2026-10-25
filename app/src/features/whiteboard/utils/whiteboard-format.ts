import { formatRelative } from '@/shared/utils/format/date.utils';

import type { SnapshotView, WhiteboardView } from '../api/whiteboard.types';
import { ROLE_LABEL, SNAPSHOT_KIND_LABEL, VISIBILITY_LABEL } from '../constants/whiteboard.constants';

/** "Chị Lan · 5 phút trước" — người sửa cuối + thời điểm; chưa ai vẽ → "Bảng trống". */
export function lastEditedText(board: Pick<WhiteboardView, 'lastEditedAt' | 'lastEditedBy'>): string {
  if (!board.lastEditedAt) return 'Bảng trống';
  const when = formatRelative(board.lastEditedAt);
  return board.lastEditedBy ? `${board.lastEditedBy.name} · ${when}` : when;
}

/** Câu cho trình đọc màn hình của cả hàng: tên, chế độ hiển thị, trạng thái, số phần tử, người sửa cuối. */
export function whiteboardRowLabel(board: WhiteboardView): string {
  const parts = [board.name, VISIBILITY_LABEL[board.visibility]];
  if (board.status === 'ARCHIVED') parts.push('Đã lưu trữ');
  parts.push(`${board.elementCount} phần tử`);
  parts.push(lastEditedText(board));
  if (board.myRole === 'VIEWER') parts.push(ROLE_LABEL.VIEWER);
  return parts.join('. ');
}

/** "Thủ công · Bản gửi thầy" / "Tự động" — nhãn của bản lưu (bản tự động không có nhãn). */
export function snapshotTitle(snapshot: Pick<SnapshotView, 'kind' | 'label'>): string {
  const kind = SNAPSHOT_KIND_LABEL[snapshot.kind];
  return snapshot.label ? `${kind} · ${snapshot.label}` : kind;
}
