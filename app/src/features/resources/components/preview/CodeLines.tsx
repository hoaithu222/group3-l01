import { useState } from 'react';
import { FlatList, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { SPACING, TEXT_STYLES, useThemeColors, type ThemeColorKey } from '@/shared/theme';

import type { CodeToken, CodeTokenKind } from '../../utils/code-tokens';

/** Vai trò màu của token → TOKEN màu của app (đổi sáng/tối theo theme; không mang mã hex thô như theme Prism). */
const COLOR_BY_KIND: Record<CodeTokenKind, ThemeColorKey> = {
  comment: 'fg-2',
  function: 'info',
  keyword: 'fg-brand',
  number: 'warning',
  plain: 'fg-1',
  punctuation: 'fg-2',
  string: 'success',
};

const FONT = TEXT_STYLES['caption-lg'];
/** Bề rộng ký tự monospace ≈ 0,6 × cỡ chữ — dùng ước bề rộng dòng dài nhất để cuộn ngang. */
const CHAR_WIDTH = (FONT.fontSize ?? 13) * 0.6;
const GUTTER = 48;
/** Kẹp bề rộng nội dung: một dòng 10.000 ký tự không được tạo vùng cuộn dài vô tận. */
const MAX_VISIBLE_CHARS = 400;
const MONO = Platform.select({ android: 'monospace', default: 'Menlo' });

export interface CodeLinesProps {
  lines: readonly (readonly CodeToken[])[];
}

/**
 * Vẽ mã đã tô màu: số dòng + cuộn ngang, danh sách ẢO HOÁ theo dòng (2.000 dòng
 * × hàng chục token là hàng chục nghìn `<Text>` lồng nếu vẽ hết một lần). Chọn/sao
 * chép từng dòng bằng `selectable`; cả tệp có nút "Sao chép" ở `CodePreview`.
 *
 * Font monospace đặt bằng `style` (`fontFamily`): bộ token chữ chỉ có Plus
 * Jakarta Sans, không có họ monospace — cỡ chữ/giãn dòng vẫn theo token `caption-lg`.
 */
export function CodeLines({ lines }: CodeLinesProps) {
  const colors = useThemeColors();
  const { fontScale, width } = useWindowDimensions();
  /* ⚠️ Bề rộng THẬT của khung cuộn (đo bằng `onLayout`), ⛔ không phải bề rộng cửa sổ: trên máy tính bảng `Screen` kẹp
     nội dung ở 720dp (`max-w-content`) ⇒ lấy bề rộng cửa sổ là danh sách rộng hơn khung và cuộn ngang ra một dải trống
     (1280dp nằm ngang: hơn 500dp). Trước lần đo đầu tạm dùng bề rộng cửa sổ — chỉ một nhịp vẽ. */
  const [viewportWidth, setViewportWidth] = useState(width);
  const longest = lines.reduce(
    (max, line) =>
      Math.max(
        max,
        line.reduce((n, token) => n + token.text.length, 0),
      ),
    0,
  );
  const contentWidth = Math.max(
    viewportWidth,
    GUTTER + Math.min(longest, MAX_VISIBLE_CHARS) * CHAR_WIDTH * fontScale + SPACING.md * 2,
  );

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
    >
      <FlatList
        data={lines}
        initialNumToRender={40}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ index, item }) => (
          <View className="flex-row px-md">
            <Text
              className="w-10 pr-sm text-right text-caption-lg text-fg-2"
              style={{ fontFamily: MONO }}
            >
              {index + 1}
            </Text>
            <Text className="flex-1 text-caption-lg" selectable style={{ fontFamily: MONO }}>
              {item.length === 0
                ? ' '
                : item.map((token, tokenIndex) => (
                    <Text key={tokenIndex} style={{ color: colors[COLOR_BY_KIND[token.kind]] }}>
                      {token.text}
                    </Text>
                  ))}
            </Text>
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={{ width: contentWidth }}
        windowSize={7}
      />
    </ScrollView>
  );
}
