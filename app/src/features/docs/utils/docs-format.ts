import { formatRelative } from '@/shared/utils/format/date.utils';

import type { DocumentView, SnapshotView } from '../api/docs.types';
import { ROLE_LABEL, SNAPSHOT_KIND_LABEL, VISIBILITY_LABEL } from '../constants/docs.constants';

/** "Chị Lan · 5 phút trước" — người sửa cuối + thời điểm; chưa ai sửa → "Chưa có nội dung". */
export function lastEditedText(doc: Pick<DocumentView, 'lastEditedAt' | 'lastEditedBy'>): string {
  if (!doc.lastEditedAt) return 'Chưa có nội dung';
  const when = formatRelative(doc.lastEditedAt);
  return doc.lastEditedBy ? `${doc.lastEditedBy.name} · ${when}` : when;
}

/** Câu cho trình đọc màn hình của cả hàng: tiêu đề, chế độ hiển thị, trạng thái, người sửa cuối. */
export function documentRowLabel(doc: DocumentView): string {
  const parts = [doc.title, VISIBILITY_LABEL[doc.visibility]];
  if (doc.status === 'ARCHIVED') parts.push('Đã lưu trữ');
  parts.push(lastEditedText(doc));
  if (doc.myRole === 'VIEWER') parts.push(ROLE_LABEL.VIEWER);
  return parts.join('. ');
}

/** "Thủ công · Kế hoạch tuần 3" / "Tự động" — nhãn của bản lưu (bản tự động không có nhãn). */
export function snapshotTitle(snapshot: Pick<SnapshotView, 'kind' | 'label'>): string {
  const kind = SNAPSHOT_KIND_LABEL[snapshot.kind];
  return snapshot.label ? `${kind} · ${snapshot.label}` : kind;
}

/** "12,3 KB" — dung lượng bản lưu (byte → KB/MB, 1 chữ số thập phân). */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}
