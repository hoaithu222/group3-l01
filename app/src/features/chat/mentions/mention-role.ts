import type { MentionRoleRef, MessageMention } from '../api/chat.types';

/**
 * `@role` (p3-04, BE `ROLE_REF_LABEL`): nhãn tiếng Việt của vai trò — chỉ là PHƯƠNG ÁN DỰ PHÒNG khi tin không mang ảnh chụp nhãn
 * (`mentions[].label`) hoặc khi nạp lại tin cũ để sửa. Nhãn thật lúc chọn lấy từ `GET …/mentionables` (`roles[].label`).
 */
const ROLE_LABEL: Record<MentionRoleRef, string> = { ADMIN: 'Quản trị viên', MEMBER: 'Thành viên' };
const DEFAULT_ROLE_LABEL = 'vai trò';

export function isMentionRoleRef(value: string | null | undefined): value is MentionRoleRef {
  return value === 'ADMIN' || value === 'MEMBER';
}

/** Nhãn hiển thị của một `@{r:…}`: ảnh chụp trên tin (nếu có) → bảng dự phòng → "vai trò" (tuyệt đối không in `ADMIN`/`MEMBER` thô ra chữ). */
export function roleMentionLabel(
  targetId: string | null | undefined,
  mentions: readonly MessageMention[] = [],
): string {
  const snapshot = mentions.find((m) => m.type === 'ROLE' && m.targetId === targetId)?.label;
  if (snapshot) return snapshot;
  return isMentionRoleRef(targetId) ? ROLE_LABEL[targetId] : DEFAULT_ROLE_LABEL;
}

/** Khoá phân biệt MỘT đích nhắc (`USER:<id>` · `ROLE:ADMIN` · `ALL:`) — BE bắt marker DISTINCT khớp 1-1 với `mentions[]`. */
export function mentionTargetKey(range: {
  type: string;
  userId?: string;
  roleRef?: string;
}): string {
  return `${range.type}:${range.type === 'ROLE' ? (range.roleRef ?? '') : (range.userId ?? '')}`;
}

/**
 * Dòng nhắc NHẸ dưới ô soạn khi tin có chip `@role` (p3-04 app.md §3): "Sẽ thông báo cho khoảng N người". N = `recipientCount` của
 * `GET …/mentionables` LÚC chọn chip (đã trừ chính mình). `ADMIN` ⊂ `MEMBER` nên chọn cả hai thì người nhận là tập LỚN hơn, không phải tổng.
 * Không có số (chip nạp lại từ tin đang SỬA — BE chỉ báo vai trò MỚI) ⇒ không có dòng nhắc thay vì đoán.
 */
export function roleAudienceNotice(
  ranges: readonly { type: string; recipientCount?: number }[],
): string | undefined {
  const counts = ranges.flatMap((r) =>
    r.type === 'ROLE' && r.recipientCount !== undefined ? [r.recipientCount] : [],
  );
  if (counts.length === 0) return undefined;
  return `Sẽ thông báo cho khoảng ${Math.max(...counts)} người`;
}
