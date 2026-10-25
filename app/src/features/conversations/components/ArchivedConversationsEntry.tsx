import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import { useHasArchivedConversations } from '../hooks/useArchivedCount';

/**
 * Lối vào "Đã lưu trữ" ở CUỐI danh sách hội thoại (app.md §3) — cùng khung thẻ với các hội thoại phía trên (`ConversationCard`),
 * ô icon 48 thẳng cột với avatar: đọc ra MỘT thẻ "thư mục" chứ không phải dòng chú thích lạc cuối danh sách. Chỉ hiện khi có
 * ít nhất một hội thoại lưu trữ — BE không trả tổng số nên không có "(N)" (xem `useArchivedCount`).
 */
export function ArchivedConversationsEntry() {
  const hasArchived = useHasArchivedConversations();
  if (!hasArchived) return null;

  return (
    <View className="px-md pt-xs">
      <Card
        className="flex-row items-center gap-sm border-hairline border-border-1 p-sm"
        padded={false}
        onPress={() => router.push('/messages/archived')}
      >
        <IconTile name="history" size="lg" tone="neutral" />
        <Text className="flex-1 text-label-lg font-medium text-fg-1">Đã lưu trữ</Text>
        <Icon color="fg-2" name="arrow-right-small" size={20} />
      </Card>
    </View>
  );
}
