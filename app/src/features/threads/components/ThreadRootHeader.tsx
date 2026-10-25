import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import dayjs from 'dayjs';

import { previewText, TextContent, type MessageView } from '@/features/chat';
import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

export interface ThreadRootHeaderProps {
  root: MessageView;
  /** Tên tác giả tin gốc — `undefined` (chưa tra được / đã rời kênh) thì chỉ hiện giờ, không bịa tên. */
  authorName?: string;
  /** Ảnh tác giả (danh bạ kênh đã tải — `useThreadAuthors`). Thiếu thì chữ viết tắt; không tra được tên thì ô icon bong bóng chat. */
  authorAvatarUrl?: string | null;
}

/** Số dòng khi thu gọn — app.md p1-06 §3 "thu gọn 3 dòng, chạm mở rộng". */
const COLLAPSED_LINES = 3;

/**
 * Tin gốc GHIM trên đầu màn luồng. Thu gọn 3 dòng (chữ thuần, KHÔNG in marker nhắc tên thô — `previewText`
 * đã đổi `@{u:…}` thành `@Tên`); chạm để mở rộng bằng đúng renderer của bong bóng (markdown-lite + chip).
 *
 * Tin gốc đã THU HỒI: chỉ còn dòng "Tin nhắn đã được thu hồi" — luồng vẫn xem/trả lời được (MSG-35).
 * Tên tác giả chỉ hiện khi tra được; không tra được thì để trống chứ không bịa "Thành viên".
 */
export function ThreadRootHeader({ root, authorName, authorAvatarUrl }: ThreadRootHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const time = dayjs(root.createdAt).format('HH:mm DD/MM');
  // Mốc nhìn đầu luồng: ảnh THẬT của tác giả tin gốc (trang trí — tên đã nằm trong nhãn trợ năng của cả khối); không có tên thì ô icon.
  const avatar = authorName ? (
    <Avatar
      name={authorName}
      size="sm"
      source={authorAvatarUrl ? { uri: authorAvatarUrl } : undefined}
    />
  ) : (
    <IconTile name="chat-bubble" size="sm" />
  );

  if (root.deleted) {
    return (
      <View
        accessibilityLabel="Tin gốc đã được thu hồi"
        className="border-b border-divider-1 bg-bg-1 px-md py-sm"
      >
        <Text className="text-body-md italic text-fg-2">Tin nhắn đã được thu hồi</Text>
      </View>
    );
  }

  const plain = previewText(root, 2000);
  const canExpand = plain.length > 120 || plain.includes('\n');

  return (
    <Pressable
      accessibilityHint={
        canExpand ? (expanded ? 'Chạm để thu gọn' : 'Chạm để xem đầy đủ') : undefined
      }
      accessibilityLabel={`Tin gốc${authorName ? ` của ${authorName}` : ''}, ${time}: ${plain}`}
      accessibilityRole={canExpand ? 'button' : undefined}
      // `expanded` là trạng thái, không phải gợi ý: hint có thể bị người dùng tắt, còn state thì trình đọc màn hình luôn đọc
      // ("đã mở rộng"/"đã thu gọn") — và cùng câu với hint để họ biết chạm sẽ làm gì.
      accessibilityState={canExpand ? { expanded } : undefined}
      className="border-b border-divider-1 bg-bg-1 px-md py-sm"
      disabled={!canExpand}
      onPress={() => setExpanded((v) => !v)}
    >
      <View className="flex-row items-start gap-sm">
        {avatar}
        <View className="flex-1">
          <Text className="pb-3xs text-label-xs text-fg-2">
            Tin gốc{authorName ? ` của ${authorName}` : ''} · {time}
          </Text>
          {expanded && root.content ? (
            <TextContent content={root.content} mentions={root.mentions} />
          ) : (
            <Text className="text-body-md text-fg-1" numberOfLines={COLLAPSED_LINES}>
              {plain}
            </Text>
          )}
          {canExpand ? (
            <View className="flex-row items-center gap-3xs pt-3xs">
              <Text className="text-label-sm text-link">{expanded ? 'Thu gọn' : 'Xem thêm'}</Text>
              {/* `link` cùng màu chữ bên cạnh (≥ 3:1) — `fg-3` cũ chỉ 2.96:1, mũi tên gần như không thấy. */}
              <Icon
                color="link"
                name={expanded ? 'arrow-up-small' : 'arrow-down-small'}
                size={16}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
