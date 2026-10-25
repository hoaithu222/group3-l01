import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import { ChannelLoadError } from '../components/ChannelLoadError';
import { PrivateGrantsList } from '../components/PrivateGrantsList';
import { PublicMembersList } from '../components/PublicMembersList';
import { useChannel } from '../queries/channels.queries';

/**
 * Public → `PublicMembersList` (presence, `FlashList` tự cuộn); Private →
 * `PrivateGrantsList` (grant, danh sách thường — nhỏ, `Screen` tự cuộn).
 * Hai nhánh cần chế độ cuộn KHÁC NHAU nên mỗi nhánh tự dựng `<Screen>` riêng
 * (xem chú thích `PublicMembersList.tsx`) — màn này chỉ lo trạng thái tải/lỗi
 * của CHÍNH `channel` trước khi biết nhánh nào để render.
 */
export function ChannelMembersScreen() {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  const { data: channel, error, isError, isLoading, refetch } = useChannel(chId);

  if (isLoading) {
    return (
      <Screen header={<AppBar title="Thành viên" onBack={router.back} />}>
        {/* Cùng hình danh sách người thật (avatar tròn + hai dòng chữ) — chưa biết kênh công khai hay riêng tư. */}
        <View className="py-xs">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonParagraphWithIcon key={index} className="py-sm" />
          ))}
        </View>
      </Screen>
    );
  }

  if (isError || !channel) {
    return (
      <Screen header={<AppBar title="Thành viên" onBack={router.back} />}>
        <ChannelLoadError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return channel.visibility === 'PUBLIC' ? (
    <PublicMembersList chId={chId} />
  ) : (
    <PrivateGrantsList canManage={channel.myPermissions.canManageGrants} chId={chId} wsId={wsId} />
  );
}
