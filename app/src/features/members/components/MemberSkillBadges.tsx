import { router, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { SkillBadgeRow } from '@/shared/career';
import { useFeature } from '@/shell/capabilities';

import { useMemberSkillBadges } from '../queries/member-skills.queries';

export interface MemberSkillBadgesProps {
  /** Đóng thẻ TRƯỚC khi mở màn kế tiếp (`<Modal>` còn mở thì màn kế tiếp bị che một nhịp) — cùng mẫu `GuestManageRow`. */
  onClose?: () => void;
  userId: string;
}

/**
 * Dòng huy hiệu kỹ năng xác thực trên thẻ thành viên (p6-06 app.md §1/§2: tối đa 3 huy hiệu + "+N", chạm mở danh sách đầy đủ). Chỉ vẽ khi cờ
 * `career` bật VÀ người xem được thấy huy hiệu của người này VÀ có ít nhất một huy hiệu: đang tải, 404 (không chia sẻ/không cùng nhóm) hay lỗi
 * mạng đều ẩn cả dòng — thẻ không nên nhấp nháy khung rỗng hay báo lỗi cho một thông tin phụ. Huy hiệu đã thu hồi do `SkillBadgeRow` bỏ qua.
 *
 * Đi tới màn "Huy hiệu kỹ năng" của `career` bằng ĐƯỜNG DẪN (`me/career/people/[userId]`, cùng `userSkillsHref`) — `members` không import `career`.
 * ⚠️ Ép `as Href`: route mới chưa chắc có trong `.expo/types/router.d.ts` (sinh lúc `expo start`); chuỗi thật đúng ở mọi trường hợp.
 */
export function MemberSkillBadges({ onClose, userId }: MemberSkillBadgesProps) {
  const enabled = useFeature('career') === true;
  const { data } = useMemberSkillBadges(userId, enabled);
  const active = (data ?? []).filter((badge) => !badge.revoked);
  if (!enabled || active.length === 0) return null;

  return (
    <Pressable
      accessibilityHint="Xem tất cả huy hiệu kỹ năng"
      accessibilityLabel={`Huy hiệu kỹ năng xác thực: ${active.map((badge) => badge.skill.name).join(', ')}`}
      accessibilityRole="button"
      className="min-h-11 justify-center"
      onPress={() => {
        onClose?.();
        router.push(`/me/career/people/${encodeURIComponent(userId)}` as Href);
      }}
    >
      <SkillBadgeRow badges={active} />
    </Pressable>
  );
}
