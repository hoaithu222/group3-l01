import { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

/** Chiều cao một dòng ≥ 44dp (vùng chạm tối thiểu — `check:touch-targets`). Khớp `h-11` bên dưới. */
const ROW_HEIGHT = 44;

export interface TimeColumnProps {
  /** Nhãn cột cho trình đọc màn hình ("Giờ"/"Phút"). */
  label: string;
  onSelect: (value: number) => void;
  options: readonly number[];
  selected: number;
}

/**
 * Một cột chọn (giờ hoặc phút) của `TimePicker`: danh sách cuộn, dòng đang chọn tô `action-tint` + chữ đậm (không chỉ màu).
 * Mở ra là cuộn tới dòng đang chọn (một lần, khi nội dung đã đo xong) để người dùng thấy giá trị hiện tại thay vì bắt đầu ở 00;
 * cuộn lại theo mỗi lần chọn sẽ làm danh sách giật đúng lúc ngón tay đang trên nó.
 */
export function TimeColumn({ label, onSelect, options, selected }: TimeColumnProps) {
  const scroll = useRef<ScrollView>(null);
  const positioned = useRef(false);

  function positionOnce(): void {
    if (positioned.current) return;
    positioned.current = true;
    const index = Math.max(0, options.indexOf(selected));
    scroll.current?.scrollTo({ animated: false, y: Math.max(0, index - 2) * ROW_HEIGHT });
  }

  return (
    <View accessibilityLabel={label} className="h-56 flex-1 overflow-hidden rounded-md bg-bg-2">
      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={positionOnce}
      >
        {options.map((option) => {
          const isSelected = option === selected;
          const text = String(option).padStart(2, '0');
          return (
            <Pressable
              key={option}
              accessibilityLabel={`${label} ${text}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`h-11 items-center justify-center ${isSelected ? 'bg-action-tint' : ''}`}
              onPress={() => onSelect(option)}
            >
              {/* Hàng cao CỨNG 44dp (`h-11`): chữ 16/24 phóng 2× cao 48dp và bị cắt — chặn TRẦN 1.3× (31dp). */}
              <Text
                className={`text-body-lg ${isSelected ? 'font-semibold text-fg-1' : 'text-fg-2'}`}
                maxFontSizeMultiplier={1.3}
              >
                {text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
