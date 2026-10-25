import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Section } from '@/shared/ui/section';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { MessageView } from '../../api/chat.types';
import { EMOJI_GROUPS } from './emoji-data.constants';

/**
 * Bề rộng TỐI THIỂU của một ô (vùng chạm 44 + khe 4). Số cột = bề rộng lưới / 48 làm tròn XUỐNG, rồi chia đều bề rộng cho số cột ⇒
 * hàng nào cũng đầy mép phải. ⚠️ Bản cũ là ô 44dp cứng trong `flex-wrap`: 343dp chứa 7 ô = 308, dư 35dp dồn hết về mép phải — lưới lệch
 * trái, mép phải lởm chởm so với tiêu đề nhóm.
 */
const MIN_CELL_WIDTH = 48;

export interface EmojiPickerSheetProps {
  visible: boolean;
  /** Tin đang thả cảm xúc — để đánh dấu emoji CHÍNH MÌNH đã thả (bấm lại là bỏ, như thanh nhanh). */
  message: MessageView | undefined;
  onClose: () => void;
  onSelect: (message: MessageView, emoji: string) => void;
}

/**
 * Một ô emoji. ⚠️ Không dùng `PressableScale` dù đây là lưới: tấm có gần 280 ô, mỗi `PressableScale` là một `useAnimatedStyle` riêng
 * trên luồng UI — mở tấm chậm hẳn trên máy yếu; `active:opacity-70` đủ phản hồi cho ô nhỏ, và tấm đóng NGAY sau cú chạm.
 */
function EmojiCell({
  emoji,
  selected,
  width,
  onPress,
}: {
  emoji: string;
  selected: boolean;
  width: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Thả cảm xúc ${emoji}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="h-11 items-center justify-center active:opacity-70"
      style={{ width }}
      onPress={onPress}
    >
      {/* Vòng nền CHỈ có ở ô đang chọn ⇒ ⛔ `collapsable={false}`: Android "làm phẳng" View không nền rồi dựng lại thiếu `rounded-full`
          (vệt vuông) — `docs/rules/styling-nativewind.md` → "Cạm bẫy". Cùng tint `action-tint` với thanh nhanh (`QuickReactionBar`). */}
      <View
        className={cn(
          'size-11 items-center justify-center rounded-full',
          selected && 'bg-action-tint',
        )}
        collapsable={false}
      >
        {/* Ô cao CỨNG 44dp (`h-11`): emoji 24px phóng 2× (cỡ chữ hệ thống) cao ~64dp và bị cắt — chặn TRẦN 1.3× (đúng mẫu `Badge`/`Chip`). */}
        <Text className="text-header-sm" maxFontSizeMultiplier={1.3}>
          {emoji}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Chọn cảm xúc NGOÀI bộ nhanh (app.md p1-04 §3 `EmojiPickerSheet`) — mở từ nút "+" của
 * `QuickReactionBar`. Chọn xong đóng ngay và gọi lại đúng đường `toggleReaction` của thanh nhanh
 * (cùng optimistic ±1 + `me`, cùng khôi phục khi lỗi) — không có đường phản ứng thứ hai.
 *
 * Danh sách emoji ràng buộc bởi luật `isValidEmoji` của BE — xem `emoji-data.constants.ts`.
 * Không có ô tìm: bộ nhỏ (≈ 200), nhóm theo chủ đề, cuộn được; tìm theo tên cần dữ liệu tên
 * tiếng Việt cho từng emoji mà app chưa có nguồn — thêm khi có nhu cầu UX rõ hơn.
 *
 * Nhịp: tiêu đề nhóm là `Section tone="default"` (khe 8 xuống lưới), giữa hai nhóm đúng MỘT khe `gap-md` — bản cũ cộng `pb-sm` của nhóm
 * với khe 8 của thân tấm thành 20, và thừa thêm 12 dưới nhóm cuối.
 */
export function EmojiPickerSheet({ visible, message, onClose, onSelect }: EmojiPickerSheetProps) {
  // Bề rộng THẬT của lưới (thân tấm trừ lề, kẹp 720dp `max-w-content` ở máy tính bảng, trừ tai thỏ khi xoay ngang) — đo chứ không suy từ màn hình.
  const [gridWidth, setGridWidth] = useState(0);
  if (!message) return null;
  const mine = new Set(message.reactions.filter((r) => r.me).map((r) => r.emoji));

  const columns = Math.max(1, Math.floor(gridWidth / MIN_CELL_WIDTH));
  // Làm tròn XUỐNG 0,01dp: tổng bề rộng các ô vượt lưới dù chỉ một phần tỉ (sai số dấu phẩy động) là ô cuối rớt sang hàng mới.
  const cellWidth = gridWidth > 0 ? Math.floor((gridWidth / columns) * 100) / 100 : MIN_CELL_WIDTH;
  const handleLayout = (event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width);

  return (
    <BottomSheet scrollable title="Chọn cảm xúc" visible={visible} onClose={onClose}>
      <View className="gap-md" onLayout={handleLayout}>
        {EMOJI_GROUPS.map((group) => (
          <Section key={group.id} title={group.title} tone="default">
            <View className="flex-row flex-wrap">
              {group.emojis.map((emoji) => (
                <EmojiCell
                  key={emoji}
                  emoji={emoji}
                  selected={mine.has(emoji)}
                  width={cellWidth}
                  onPress={() => {
                    // Rung nhẹ xác nhận THẢ cảm xúc — cùng nhịp thanh nhanh (`QuickReactionBar`) và chip cảm xúc dưới bong bóng.
                    hapticTap();
                    onClose();
                    onSelect(message, emoji);
                  }}
                />
              ))}
            </View>
          </Section>
        ))}
      </View>
    </BottomSheet>
  );
}
