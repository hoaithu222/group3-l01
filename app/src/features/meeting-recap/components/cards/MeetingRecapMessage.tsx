import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import { openRecap } from '../../utils/recap-navigation';

/** Phần của `MessageView` (chat) renderer này cần — khai cấu trúc để KHÔNG import chéo feature `chat`. */
export interface MeetingSystemMessageProps {
  message: { systemPayload: Record<string, unknown> | null; systemType: string | null };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * Thẻ tin hệ thống `MEETING_RECAP` trong nhóm chat họp (app.md §3 "Thẻ chat `MeetingRecapCard`"): tiêu đề cuộc họp, đoạn trích 3 dòng (BE đã
 * bỏ ký hiệu markdown), "N tệp đính kèm", nút "Xem biên bản". Tin do SERVER ghi (không ai giả được); công bố lại → BE SỬA payload tại chỗ
 * (`message:updated`), thẻ tự vẽ lại. Chỉ đọc các trường biết trước — BE có lỡ nhét thêm gì cũng không ra màn.
 * Đăng ký bằng `registerSystemMessageRenderer('MEETING_RECAP', …)` ở nơi lắp ráp (`app/(app)/_layout.tsx`).
 */
export function MeetingRecapMessage({ message }: MeetingSystemMessageProps) {
  const p = message.systemPayload ?? {};
  const meetingId = str(p.meetingId);
  const title = str(p.title) ?? 'Cuộc họp';
  const excerpt = str(p.excerpt);
  const files = typeof p.attachmentCount === 'number' && p.attachmentCount > 0 ? Math.floor(p.attachmentCount) : 0;

  return (
    <View className="mx-md my-2xs gap-xs self-stretch rounded-md border-hairline border-border-1 bg-bg-1 p-sm">
      {/* Ô icon tài liệu (tông `info`, cùng tông lối vào biên bản ở chi tiết cuộc họp) — thẻ hệ thống nổi khỏi dòng tin nhắn thường. */}
      <View className="flex-row items-center gap-sm">
        <IconTile name="document" size="sm" tone="info" />
        <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={2}>{`Biên bản: ${title}`}</Text>
      </View>
      {excerpt ? (
        <Text className="text-body-md text-fg-2" numberOfLines={3}>
          {excerpt}
        </Text>
      ) : null}
      {files > 0 ? (
        <View className="flex-row items-center gap-2xs">
          <Icon color="fg-2" name="file-2" size={14} />
          <Text className="text-caption-lg text-fg-2">{`${String(files)} tệp đính kèm`}</Text>
        </View>
      ) : null}
      {meetingId ? <Button iconLeft="view" label="Xem biên bản" size="sm" variant="secondary" onPress={() => openRecap(meetingId)} /> : null}
    </View>
  );
}
