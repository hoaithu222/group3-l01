import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticTap } from '@/shared/utils/haptics';

import { ReadOnlyBar } from '../components/ReadOnlyBar';
import { useDirectConversation } from '../hooks/useDirectConversation';
import { useDraftDirectSend } from '../hooks/useDraftDirectSend';

/**
 * app.md §3 — "nháp": chưa có `Conversation` thật nên KHÔNG dùng `<ChatRoom>`
 * (cần `scopeId` thật, be.md §4.1) — chỉ header + gợi ý + composer tối giản,
 * gửi tin đầu mới thật sự tạo hội thoại rồi điều hướng sang màn thật (§4.3).
 */
export function DraftDirectScreen() {
  const { userId, name, avatarUrl } = useLocalSearchParams<{
    userId: string;
    name?: string;
    avatarUrl?: string;
  }>();
  const peerName = name || 'Người dùng';
  const direct = useDirectConversation(userId);
  const { sending, error, send } = useDraftDirectSend(userId);
  const [text, setText] = useState('');

  useEffect(() => {
    if (direct.status === 'existing') {
      router.replace({
        pathname: '/messages/[conversationId]',
        params: { conversationId: direct.conversation.id },
      });
    }
  }, [direct]);

  if (direct.status === 'loading' || direct.status === 'existing') {
    return (
      <Screen
        header={<AppBar title={peerName} onBack={router.back} />}
        padded={false}
        scrollable={false}
      >
        <View className="gap-sm p-md">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (direct.status === 'error') {
    return (
      <Screen
        header={<AppBar title={peerName} onBack={router.back} />}
        padded={false}
        scrollable={false}
      >
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: direct.retry }]}
          description={toErrorMessage(direct.error)}
          fullscreen
          icon="alert-warning"
          title="Không tải được"
          tone="danger"
        />
      </Screen>
    );
  }

  const canMessage = direct.eligibility.canMessage;

  return (
    <Screen
      footer={
        canMessage ? (
          <BottomActionBar>
            <View className="flex-row items-end gap-sm">
              <View className="flex-1">
                <Input
                  accessibilityLabel="Nội dung tin nhắn"
                  multiline
                  placeholder="Nhắn tin…"
                  value={text}
                  onChangeText={setText}
                />
              </View>
              <Button
                accessibilityLabel="Gửi"
                disabled={text.trim().length === 0}
                iconLeft="direct"
                iconOnly
                loading={sending}
                onPress={() => {
                  const content = text;
                  // Rung nhẹ xác nhận cú chạm GỬI — cùng nhịp nút Gửi của ô soạn tin trong phòng chat.
                  hapticTap();
                  setText('');
                  void send(content);
                }}
              />
            </View>
          </BottomActionBar>
        ) : undefined
      }
      header={
        <AppBar
          leading={
            <Avatar name={peerName} size="sm" source={avatarUrl ? { uri: avatarUrl } : undefined} />
          }
          title={peerName}
          onBack={router.back}
        />
      }
      keyboardAware
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        <EmptyState
          description={error}
          icon="chat-bubble"
          title={`Hãy gửi lời chào tới ${peerName} 👋`}
        />
      </View>
      {/* ⛔ Không đặt ở `footer` của Screen: `Screen` KHÔNG đệm vùng an toàn cho khe đó, thanh chỉ-đọc sẽ đè lên vạch
          gạt ngang. Trong thân màn thì phần đệm đáy do `Screen` lo (cùng chỗ với `ConversationScreen`). */}
      {canMessage ? null : (
        <ReadOnlyBar peer={{ userId, name: peerName }} reason={direct.eligibility.reason} />
      )}
    </Screen>
  );
}
