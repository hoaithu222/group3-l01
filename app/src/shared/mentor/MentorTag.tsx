import { Badge } from '@/shared/ui/badge';

export interface MentorTagProps {
  /** "còn 12 ngày" hoặc "Còn 12 ngày" (chữ đầu được hạ thường) — bỏ trống khi không cần nêu hạn. */
  remaining?: string;
}

/**
 * Nhãn "Cố vấn · còn N ngày" cạnh tên cố vấn (p6-03 app.md §7) — nhãn bằng CHỮ, không chỉ màu. Thuần hiển thị: nơi gọi tự tính `remaining`
 * (`mentor` — `remainingText`; danh sách thành viên — `MemberMentorTag`). Ở `shared` vì `mentor` (đợt cố vấn), `members` (danh sách/thẻ thành viên)
 * cùng vẽ mà hai feature không được import nhau.
 */
export function MentorTag({ remaining }: MentorTagProps) {
  const label = remaining
    ? `Cố vấn · ${remaining.charAt(0).toLowerCase()}${remaining.slice(1)}`
    : 'Cố vấn';
  return <Badge accessibilityLabel={label} label={label} size="sm" variant="brand" />;
}
