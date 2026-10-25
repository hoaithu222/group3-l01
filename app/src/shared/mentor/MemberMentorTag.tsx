import { useNow } from '@/shared/hooks/useNow';
import { formatGuestRemaining, getGuestRemaining } from '@/shared/utils/format/guest-expiry.utils';

import { MentorTag } from './MentorTag';

export interface MemberMentorTagProps {
  /**
   * Hạn đợt cố vấn (= hạn của khách). BE chỉ gửi `expiresAt` cho OWNER/ADMIN (`member.presenter.ts`) — vắng mặt thì chỉ hiện "Cố vấn",
   * không đoán hạn.
   */
  expiresAt?: string | null;
}

/**
 * Nhãn cố vấn ở danh sách/thẻ thành viên: "Cố vấn · còn 12 ngày" (dưới 48 giờ đổi sang giờ, như hạn khách). "Bây giờ" nằm trong state
 * (`useNow`) chứ không đọc `Date.now()` lúc vẽ — React Compiler sẽ ghi nhớ kết quả và "còn N ngày" đứng im mãi.
 */
export function MemberMentorTag({ expiresAt }: MemberMentorTagProps) {
  const now = useNow();
  const remaining = getGuestRemaining(expiresAt, now);
  return <MentorTag remaining={remaining ? formatGuestRemaining(remaining) : undefined} />;
}
