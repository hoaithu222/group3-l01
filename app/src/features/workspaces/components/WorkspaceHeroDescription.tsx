import { useState } from 'react';
import { type NativeSyntheticEvent, Text, type TextLayoutEventData, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';

/** Mô tả thu gọn còn bấy nhiêu dòng — đủ đọc ý chính, không đẩy khung lối vào xuống dưới nếp gấp. */
const COLLAPSED_LINES = 2;

export interface WorkspaceHeroDescriptionProps {
  text: string;
}

/**
 * Mô tả nhóm ở đầu trang tổng quan: thu gọn `COLLAPSED_LINES` dòng + "Xem thêm"/"Thu gọn" — CHỈ hiện nút khi chữ thật sự dài
 * hơn (mô tả ngắn không kèm một nút vô nghĩa). Trước đây cắt cứng 3 dòng không có cách nào đọc phần còn lại: thành viên
 * thường không vào được Cài đặt để xem bản đầy đủ.
 *
 * ── Đo số dòng bằng một bản SAO ẨN ──────────────────────────────────────────────────────────────────────────────
 * `onTextLayout` của chính dòng chữ đang `numberOfLines={2}` không tin được (Android chỉ trả các dòng ĐANG HIỆN). Nên một
 * bản sao đầy đủ, cùng vai trò chữ và cùng bề rộng (`absolute inset-x-0`), nằm ẩn phía sau để đếm dòng thật — không chiếm
 * chỗ trong bố cục, đo lại tự động khi xoay máy / đổi cỡ chữ hệ thống. ⛔ Ẩn khỏi trình đọc (không đọc mô tả hai lần);
 * trình đọc màn hình vẫn đọc ĐỦ câu ở bản đang hiện (cắt bằng `numberOfLines` chỉ là cắt hình).
 *
 * ⚠️ `LinkButton` cỡ mặc định `lg`: chữ 16/24 + `hitSlop` 10 trên/dưới mới đủ 44dp; cỡ `md`/`sm` hụt vùng chạm.
 */
export function WorkspaceHeroDescription({ text }: WorkspaceHeroDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const measure = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    setOverflows(event.nativeEvent.lines.length > COLLAPSED_LINES);
  };

  return (
    <View className="w-full items-center gap-2xs">
      <View className="w-full">
        <View
          accessibilityElementsHidden
          className="absolute inset-x-0 top-0 opacity-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Text
            className="text-center text-body-md"
            testID="ws-hero-description-measure"
            onTextLayout={measure}
          >
            {text}
          </Text>
        </View>
        <Text
          className="text-center text-body-md text-fg-2"
          numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        >
          {text}
        </Text>
      </View>
      {overflows ? (
        <LinkButton
          accessibilityLabel={expanded ? 'Thu gọn mô tả nhóm' : 'Xem thêm mô tả nhóm'}
          label={expanded ? 'Thu gọn' : 'Xem thêm'}
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </View>
  );
}
