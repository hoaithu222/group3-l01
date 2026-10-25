import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { DirectInfo } from '../components/InfoSections/DirectInfo';
import { GroupInfo } from '../components/InfoSections/GroupInfo';
import { useConversationDetail } from '../hooks/useConversationDetail';

/** Khung xương ĐÚNG dáng màn thật (ảnh tròn 64 + tên + các thẻ hàng) — dữ liệu về thì nội dung nằm đè đúng chỗ, không nhảy bố cục. */
function InfoSkeleton() {
  return (
    <View
      accessibilityLabel="Đang tải thông tin cuộc trò chuyện"
      accessible
      className="gap-xl py-xs"
    >
      <View className="items-center gap-sm">
        <Skeleton className="h-16 w-16" variant="circle" />
        <Skeleton width="45%" />
        <Skeleton width="30%" />
      </View>
      <Skeleton className="h-36" variant="card" />
      <Skeleton className="h-44" variant="card" />
    </View>
  );
}

/**
 * app.md §3 — `ConversationInfoScreen` chọn biến thể theo `kind`.
 *
 * `Screen padded` (mặc định, lề 16): hai biến thể xếp THẺ (`InfoGroup`, `Section`) nên lề là của màn — hàng trong thẻ không tự có `px-md`.
 */
export function ConversationInfoScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { data: conversation, error, isLoading, refetch } = useConversationDetail(conversationId);

  return (
    <Screen header={<AppBar title="Thông tin" onBack={router.back} />} scrollable>
      {isLoading ? (
        <InfoSkeleton />
      ) : !conversation ? (
        <EmptyState
          // "Thử lại" chỉ khi là LỖI tải; `!conversation` không kèm lỗi là không tìm thấy — bấm thử lại chẳng ra gì.
          actions={error ? [{ label: 'Thử lại', onPress: () => void refetch() }] : undefined}
          description={error ? toErrorMessage(error) : 'Không tìm thấy cuộc trò chuyện này.'}
          fullscreen
          // Lỗi tải ⇒ cảnh báo đỏ; không tìm thấy (bị xoá/mất quyền) ⇒ khoá vàng — hai ca khác nhau thì hình cũng khác.
          icon={error ? 'alert-warning' : 'lock'}
          title={error ? 'Không tải được' : 'Không tìm thấy'}
          tone={error ? 'danger' : 'warning'}
        />
      ) : conversation.kind === 'DIRECT' ? (
        <DirectInfo conversation={conversation} />
      ) : (
        <GroupInfo conversation={conversation} />
      )}
    </Screen>
  );
}
