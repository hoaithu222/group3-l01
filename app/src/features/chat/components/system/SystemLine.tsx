import { Pressable, Text, View } from 'react-native';

import type { MessageView, ResolveChatAuthor } from '../../api/chat.types';
import { IntegrationMessage } from './IntegrationMessage';
import { systemLineText } from './system-line-text';
import { getSystemMessageRenderer } from './system-renderer.registry';
import { UnsupportedSystem } from './UnsupportedSystem';

export interface SystemLineProps {
  message: MessageView;
  resolveAuthor?: ResolveChatAuthor;
  /** `MESSAGE_PINNED` → "Xem" nhảy tới tin đã ghim (`systemPayload.messageId`). */
  onViewPinned?: (messageId: string) => void;
}

/** Dòng giữa màn, chữ nhỏ — thành viên/đổi tên/ghim… (app.md §3, be.md §5.7). */
export function SystemLine({ message, resolveAuthor, onViewPinned }: SystemLineProps) {
  // Module ngoài đăng ký thẻ riêng (vd `WALLET_REMINDER` — p6-04) qua `registerSystemMessageRenderer`.
  const custom = getSystemMessageRenderer(message.systemType);
  if (custom) return <>{custom(message, { resolveAuthor })}</>;
  // p5-03: thẻ webhook GitHub/GitLab/Figma — payload là hợp đồng chung p1-04, thẻ nằm trong chat.
  if (message.systemType === 'INTEGRATION') return <IntegrationMessage message={message} />;

  const text = systemLineText(message, resolveAuthor);
  if (text === null) return <UnsupportedSystem />;

  const pinnedMessageId =
    message.systemType === 'MESSAGE_PINNED' && typeof message.systemPayload?.messageId === 'string'
      ? message.systemPayload.messageId
      : undefined;

  return (
    // Viên nền `bg-2` bo 16 quanh chữ: dòng hệ thống đọc ra là MỘT mốc sự kiện giữa cuộc trò chuyện (như các app nhắn tin quen thuộc),
    // không lẫn với tin người gửi. Chỉ thêm một `View` tĩnh — không hook/state nào cho hàng của danh sách ảo.
    <View className="items-center px-md py-2xs">
      <View className="max-w-full flex-row items-center gap-2xs rounded-sm bg-bg-2 px-sm py-3xs">
        <Text className="flex-shrink text-center text-caption-sm text-fg-2">{text}</Text>
        {pinnedMessageId ? (
          // Liên kết CHỮ nhỏ (~16dp): nới dọc 12 mỗi phía lên ≥ 40dp, ngang chỉ 6 — luật "nút chỉ có chữ nhỏ" của `mobile-ux.md`
          // (`hitSlop={8}` cũ chỉ ra ~32dp).
          <Pressable
            accessibilityLabel="Xem tin đã ghim"
            accessibilityRole="button"
            hitSlop={{ bottom: 12, left: 6, right: 6, top: 12 }}
            onPress={() => onViewPinned?.(pinnedMessageId)}
          >
            <Text className="text-caption-sm font-semibold text-link">Xem</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
