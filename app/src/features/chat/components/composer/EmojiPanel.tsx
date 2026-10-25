import { FlatList, Pressable, Text, View } from 'react-native';

import { EMOJI_GROUPS } from '../actions/emoji-data.constants';

/** Số cột: 7 ⇒ ô rộng ≥ 45dp ngay cả máy 320dp (đủ ngưỡng chạm 44dp) mà vẫn thấy ~7 emoji mỗi hàng như Zalo. */
const COLUMNS = 7;

type Row =
  | { key: string; kind: 'title'; title: string }
  | { key: string; kind: 'emojis'; emojis: readonly (string | null)[] };

/**
 * Phẳng hoá `EMOJI_GROUPS` thành các hàng: tiêu đề nhóm rồi từng hàng 7 ô. Hàng cuối của nhóm ĐỆM `null` cho đủ 7 ô — ô nào cũng `flex-1`
 * nên hàng thiếu ô sẽ giãn rộng và lệch cột với hàng trên. Dựng MỘT lần ở phạm vi module (bảng là hằng).
 */
const ROWS: readonly Row[] = EMOJI_GROUPS.flatMap((group) => {
  const rows: Row[] = [{ key: `${group.id}-title`, kind: 'title', title: group.title }];
  for (let i = 0; i < group.emojis.length; i += COLUMNS) {
    const slice: (string | null)[] = group.emojis.slice(i, i + COLUMNS);
    while (slice.length < COLUMNS) slice.push(null);
    rows.push({ key: `${group.id}-${i}`, kind: 'emojis', emojis: slice });
  }
  return rows;
});

export interface EmojiPanelProps {
  /** Chạm một emoji — chèn tại con trỏ (`useComposerText.insertText`); bảng KHÔNG đóng để chèn liền nhiều cái. */
  onSelect: (emoji: string) => void;
}

/**
 * Bảng emoji DƯỚI ô nhập (kiểu Zalo/Messenger, bám `EmojiPanel` của vci-sun-mobile): lưới cuộn, chạm là chèn.
 *
 * Dùng lại `EMOJI_GROUPS` của `EmojiPickerSheet` (thả cảm xúc) — cùng bộ, cùng luật "≤ Unicode 12, không chuỗi ZWJ dài" (máy Android cũ
 * vẽ ô vuông "tofu" cho emoji mới hơn) và đã có test khoá; không chép một danh sách thứ hai để hai bản lệch nhau.
 *
 * ⚠️ `FlatList` chứ không đổ ~330 nút cùng lúc: mở bảng là dựng ngay, `initialNumToRender` đủ phủ màn đầu tiên. Cao CỐ ĐỊNH 240dp (5 hàng × 48)
 * — cỡ một bàn phím ảo, không phụ thuộc chiều cao bàn phím thật nên bảng không giật khi bàn phím vừa hạ. `keyboardShouldPersistTaps="handled"`
 * để chạm emoji khi bàn phím còn đang hạ dở không bị nuốt.
 */
export function EmojiPanel({ onSelect }: EmojiPanelProps) {
  return (
    <View accessibilityLabel="Bảng biểu tượng cảm xúc" className="h-60 border-t border-divider-1 bg-bg-1">
      <FlatList
        contentContainerClassName="px-xs pb-xs"
        data={ROWS}
        initialNumToRender={8}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row) => row.key}
        renderItem={({ item }) =>
          item.kind === 'title' ? (
            <Text accessibilityRole="header" className="px-xs pb-2xs pt-xs text-label-sm font-semibold text-fg-2">
              {item.title}
            </Text>
          ) : (
            <View className="flex-row">
              {item.emojis.map((emoji, index) =>
                emoji === null ? (
                  <View key={`empty-${index}`} className="h-12 flex-1" />
                ) : (
                  <Pressable
                    key={emoji}
                    accessibilityLabel={`Chèn ${emoji}`}
                    accessibilityRole="button"
                    className="h-12 flex-1 items-center justify-center"
                    onPress={() => onSelect(emoji)}
                  >
                    {/* Ô cao CỨNG 48dp: emoji 24px phóng 2× (cỡ chữ hệ thống) cao ~64dp và bị cắt — chặn TRẦN 1.3× (cùng `EmojiPickerSheet`). */}
                    <Text className="text-header-md" maxFontSizeMultiplier={1.3}>
                      {emoji}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          )
        }
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
