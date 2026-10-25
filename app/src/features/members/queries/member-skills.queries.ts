import { useQuery } from '@tanstack/react-query';

import { membersService } from '../api';

/**
 * Huy hiệu kỹ năng xác thực của một thành viên (thẻ thành viên — p6-06 §1). Chỉ tải khi cờ `career` BẬT (`enabled`) — cờ tắt thì BE trả 404
 * cho cả nhánh, không đáng một request mỗi lần mở thẻ. 404/403 = "không chia sẻ / không cùng nhóm" là ca bình thường ⇒ không thử lại
 * (thử lại chỉ làm dòng huy hiệu chậm biến mất) và nơi gọi ẩn dòng, không hiện lỗi.
 *
 * ⚠️ Khoá ở đây KHÔNG dùng chung với `careerKeys.userSkills` (feature `career`): hai feature không import nhau, khoá riêng thì hai cache
 * riêng — chấp nhận một request thừa khi mở "Xem tất cả" thay vì phụ thuộc chéo.
 */
export function useMemberSkillBadges(userId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && userId.length > 0,
    queryFn: () => membersService.skillBadges(userId),
    queryKey: ['members', 'skills', userId] as const,
    retry: false,
    staleTime: 60_000,
  });
}
