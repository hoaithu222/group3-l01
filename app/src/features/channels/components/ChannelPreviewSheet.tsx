import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';

import { useJoinChannel } from '../queries/channel-membership.queries';
import { useChannel } from '../queries/channels.queries';
import {
  CHANNEL_TYPE_ICON,
  CHANNEL_TYPE_LABEL,
  CHANNEL_TYPE_TONE,
} from '../utils/channel-type-art';

export interface ChannelPreviewSheetProps {
  channelId: string | null;
  onClose: () => void;
  wsId: string;
}

/**
 * Xem trước + nút Tham gia — kênh PUBLIC chưa tham gia, chạm từ "Khám phá" (app.md §3). Ô icon theo LOẠI kênh (cùng icon + tông
 * với dòng ở danh sách), huy hiệu loại, số thành viên (BE đã trả trong `ChannelDetail`) rồi mô tả — đủ để quyết có vào hay không.
 */
export function ChannelPreviewSheet({ channelId, onClose, wsId }: ChannelPreviewSheetProps) {
  const { data: channel, error, isError, isLoading, refetch } = useChannel(channelId ?? undefined);
  const joinChannel = useJoinChannel(wsId);

  // Tấm luôn dựng (chỉ đổi `channelId`) ⇒ lỗi tham gia của kênh trước phải xoá khi đóng, không thì mở kênh khác vẫn thấy lỗi cũ.
  function close(): void {
    joinChannel.reset();
    onClose();
  }

  function handleJoin(): void {
    if (!channel) return;
    joinChannel.mutate(channel.id, {
      onSuccess: () => {
        hapticSuccess(); // đã vào kênh — rung báo xong trước lượt chuyển màn
        close();
        router.push({
          params: { chId: channel.id, wsId },
          pathname: '/workspaces/[wsId]/channels/[chId]',
        });
      },
    });
  }

  return (
    <BottomSheet
      // ❌ Trước đây lỗi tham gia là toast — toast vẽ ở gốc app, NẰM DƯỚI cửa sổ `Modal` của tấm ⇒ nút thôi quay mà không lời nào.
      // ✅ Khe `alert` (ghim dưới tiêu đề), tấm còn mở để bấm "Tham gia" lại.
      alert={
        joinChannel.error ? (
          <Alert description={toErrorMessage(joinChannel.error)} tone="error" />
        ) : undefined
      }
      dismissOnBackdrop={!joinChannel.isPending}
      footer={
        channel ? (
          <Button fullWidth label="Tham gia" loading={joinChannel.isPending} onPress={handleJoin} />
        ) : undefined
      }
      // ⚠️ Tiêu đề giữ chỗ lúc đang tải: tiêu đề rỗng thì tấm vẽ thanh kéo thay cho hàng tiêu đề + ✕, dữ liệu về là cả đầu tấm nhảy.
      title={channel?.name ?? 'Kênh'}
      visible={channelId !== null}
      onClose={close}
    >
      {isError && !channel ? (
        // ❌ Trước đây lỗi tải rơi vào nhánh khung xương — tấm nhấp nháy mãi, không lời nào, không cách thử lại.
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
          description={toErrorMessage(error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được thông tin kênh"
          tone="danger"
        />
      ) : isLoading || !channel ? (
        <SkeletonParagraphWithIcon />
      ) : (
        <View className="gap-sm">
          <View className="flex-row items-center gap-sm">
            <IconTile
              name={CHANNEL_TYPE_ICON[channel.type]}
              size="lg"
              tone={CHANNEL_TYPE_TONE[channel.type]}
            />
            <View className="flex-1 items-start gap-2xs">
              <Badge
                label={CHANNEL_TYPE_LABEL[channel.type] ?? channel.type}
                size="sm"
                variant="neutral"
              />
              <Text className="text-caption-sm text-fg-2">{channel.memberCount} thành viên</Text>
            </View>
          </View>
          <Text className="text-body-md text-fg-2">
            {channel.description || 'Kênh này chưa có mô tả.'}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}
