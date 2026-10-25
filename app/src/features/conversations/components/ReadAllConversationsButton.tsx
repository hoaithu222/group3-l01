import { useState } from 'react';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { useUnreadSummary } from '@/shell/notifications';

import { useReadAllConversations } from '../hooks/useReadAllConversations';

/**
 * "Đánh dấu tất cả đã đọc" (p1-07 `app.md` §4.5) — dòng "N cuộc trò chuyện chưa đọc · [Đánh dấu đã đọc hết]" ở ĐẦU danh sách
 * hội thoại (cuộn theo danh sách, không phải dải cố định). Chỉ hiện khi tóm tắt cho biết còn hội thoại chưa đọc (không hiện
 * nút vô nghĩa) và LUÔN xác nhận trước — thao tác đụng mọi hội thoại, khó hoàn lại.
 *
 * Trước đây là icon "✓✓" thứ ba trên `AppBar` (cạnh Lịch sử gọi + Soạn tin, vượt 2 khe của bản vẽ) và icon đó không có chữ nên
 * không ai đoán được nó làm gì. Dòng có chữ + con số cho biết vì sao nên bấm, và trả lại một khe cho thanh tiêu đề.
 */
export function ReadAllConversationsButton() {
  const [confirming, setConfirming] = useState(false);
  const unread = useUnreadSummary().data?.conversations.unreadConversations ?? 0;
  const readAll = useReadAllConversations();

  if (unread === 0) return null;

  const confirm = () => {
    readAll.mutate(new Date().toISOString());
    setConfirming(false);
  };

  return (
    <>
      <View className="flex-row items-center gap-sm px-md">
        {/* `flex-1`: `Text` của RN mặc định KHÔNG co — thiếu nó, máy hẹp/cỡ chữ lớn đẩy nút ra ngoài mép. */}
        <Text className="flex-1 text-caption-sm text-fg-2">{`${String(unread)} cuộc trò chuyện chưa đọc`}</Text>
        <LinkButton
          accessibilityLabel="Đánh dấu tất cả cuộc trò chuyện đã đọc"
          label="Đánh dấu đã đọc hết"
          size="md"
          onPress={() => setConfirming(true)}
        />
      </View>
      <Dialog
        description="Mọi cuộc trò chuyện hiện có sẽ được đánh dấu đã đọc. Tin nhắn đến sau bây giờ vẫn chưa đọc."
        primaryAction={{ label: 'Đánh dấu đã đọc', onPress: confirm }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title="Đánh dấu tất cả đã đọc?"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
