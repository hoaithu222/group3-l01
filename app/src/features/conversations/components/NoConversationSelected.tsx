import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';

/**
 * Khung PHẢI của bố cục hai cột khi chưa chọn hội thoại nào (`messages/index` trên
 * máy tính bảng). Không có tin/dữ liệu giả — chỉ chỉ đường: chọn ở danh sách bên
 * trái, hoặc bắt đầu cuộc trò chuyện mới.
 */
export function NoConversationSelected() {
  return (
    <Screen scrollable={false}>
      <EmptyState
        actions={[{ label: 'Nhắn tin mới', onPress: () => router.push('/messages/new') }]}
        description="Chọn một cuộc trò chuyện ở danh sách bên trái, hoặc bắt đầu một cuộc trò chuyện mới."
        fullscreen
        icon="chat-bubble"
        title="Chưa chọn cuộc trò chuyện"
      />
    </Screen>
  );
}
