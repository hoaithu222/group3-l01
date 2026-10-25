import { Text, View } from 'react-native';

import { SkillBadgeRow } from '@/shared/career';
import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { CareerVisibility } from '../../api/career.types';
import { useMySkills } from '../../queries/career.queries';

export interface RecruiterVisibilityPreviewProps {
  draft: { headline: string; location: string; roles: string[] };
  visibility: CareerVisibility;
}

/**
 * "Doanh nghiệp sẽ thấy gì" (app.md §2 `RecruiterVisibilityPreview`): thẻ giả lập ứng viên dựng từ dữ liệu CỦA CHÍNH MÌNH, hiện ĐÚNG các trường BE đưa cho doanh nghiệp
 * (`TalentCard`): tên hiển thị, ảnh, tiêu đề, vị trí/khu vực, huy hiệu (theo quyền riêng tư), điểm đóng góp (chỉ khi bật). Nói thẳng những gì KHÔNG bao giờ hiện —
 * để người dùng thấy trước rồi mới bật, không phải đoán. Phản ánh cả phần đang gõ dở (chưa lưu). Điểm đóng góp thật do server tính nên ở đây chỉ nói CÓ/KHÔNG hiện.
 */
export function RecruiterVisibilityPreview({ draft, visibility }: RecruiterVisibilityPreviewProps) {
  const user = useAuthStore((state) => state.user);
  const skills = useMySkills();
  const badges = visibility.showSkills ? (skills.data ?? []) : [];

  return (
    <Card title="Doanh nghiệp sẽ thấy gì">
      <View className="gap-sm">
        <View className="flex-row items-center gap-sm">
          <Avatar
            name={user?.name}
            size="md"
            source={user?.avatar ? { uri: user.avatar } : undefined}
          />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={1}>
              {user?.name ?? 'Bạn'}
            </Text>
            <Text className="text-body-md text-fg-1" numberOfLines={2}>
              {draft.headline || 'Chưa có tiêu đề'}
            </Text>
          </View>
        </View>
        {draft.roles.length > 0 ? (
          <Text className="text-caption-lg text-fg-2">{`Vị trí: ${draft.roles.join(', ')}`}</Text>
        ) : null}
        {draft.location ? (
          <Text className="text-caption-lg text-fg-2">{`Khu vực: ${draft.location}`}</Text>
        ) : null}
        {badges.length > 0 ? (
          <SkillBadgeRow badges={badges} />
        ) : (
          <Text className="text-caption-lg text-fg-2">
            {visibility.showSkills
              ? 'Huy hiệu kỹ năng: bạn chưa có huy hiệu nào.'
              : 'Huy hiệu kỹ năng: đang ẩn với doanh nghiệp.'}
          </Text>
        )}
        <Text className="text-caption-lg text-fg-2">
          {visibility.showContribution
            ? 'Điểm đóng góp: hiển thị (tổng hợp các nhóm bạn tham gia).'
            : 'Điểm đóng góp: đang ẩn.'}
        </Text>
      </View>
      <Text className="pt-sm text-caption-lg font-semibold text-fg-1">
        Không hiển thị email, số điện thoại, tên nhóm.
      </Text>
    </Card>
  );
}
