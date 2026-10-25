import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { TabItem } from './TabItem';
import { TabsIndicator, type TabLayout } from './TabsIndicator';
import type { TabItemData, TabsVariant } from './tab.types';

/**
 * Hàng tab chuyển nội dung trong cùng một màn hình.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB / Tab" (`259:93761`).
 *
 * ```tsx
 * <Tabs
 *   items={[{ key: 'in', label: 'Tiền vào' }, { key: 'out', label: 'Tiền ra' }]}
 *   value={tab}
 *   onChange={setTab}
 * />
 * ```
 *
 * ⚠️ Component chỉ VẼ hàng tab, không chứa nội dung tab. Ghép nội dung vào là
 * mời người ta nhét cả màn hình vào một prop `children` và mất khả năng dùng
 * `Tabs` để lọc một danh sách đã có sẵn.
 */
const tabs = tv(
  {
    slots: { root: 'flex-row' },
    variants: {
      variant: {
        // Khay bo tròn, đệm 4dp quanh các tab — đúng cấu trúc Figma (tab 40dp
        // trong khay 48dp). Nền trắng: khay này nằm trên nền xám của trang.
        pill: { root: 'rounded-full bg-bg-1 p-1' },
        underline: {},
      },
    },
    defaultVariants: { variant: 'pill' },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

export interface TabsProps {
  /**
   * Lớp phụ cho khung NGOÀI CÙNG của `Tabs` — hàng tab khi `scrollable={false}`,
   * và chính `ScrollView` khi `scrollable`. Nhờ vậy `className="mb-4"` luôn đẩy
   * được nội dung bên dưới, không phụ thuộc chế độ cuộn.
   */
  className?: string;
  items: TabItemData[];
  onChange: (key: string) => void;
  /**
   * Cuộn ngang thay vì chia đều bề rộng. Bật khi số tab không cố định (danh mục
   * dịch vụ) — chia đều 6 tab thì nhãn nào cũng bị cắt cụt.
   *
   * ⚠️ Ngưỡng thực tế thấp hơn nhiều so với cảm giác: trên máy HẸP 320dp, chia
   * đều đã đủ chỗ cho khoảng 3 nhãn ngắn ("Tất cả" · "Tiền vào" · "Tiền ra").
   * Từ tab thứ tư, hoặc với nhãn dài hơn một từ, hãy bật `scrollable` — ⛔ đừng
   * trông vào việc thu nhỏ chữ hay đệm cho vừa: `docs/rules/responsive.md` chốt
   * "cho xuống dòng hoặc cuộn, đừng thu nhỏ control".
   *
   * ⛔ Component KHÔNG tự bật giúp: nó không đo được bề rộng chữ, nên mọi quy
   * tắc tự động ("quá 3 tab thì cuộn") đều sai ở một trong hai phía — hoặc bắt
   * cuộn khi vẫn còn thừa chỗ, hoặc vẫn cắt chữ khi nhãn dài. Nơi gọi biết nhãn
   * của mình.
   */
  scrollable?: boolean;
  /** Khoá của tab đang chọn. Component KHÔNG tự giữ state — nơi gọi giữ. */
  value: string;
  variant?: TabsVariant;
}

export function Tabs({
  className,
  items,
  onChange,
  scrollable = false,
  value,
  variant = 'pill',
}: TabsProps) {
  /** Vị trí từng tab (chỉ kiểu `underline` đo) — để `TabsIndicator` trượt vạch tới tab đang chọn. */
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const measure = (key: string, { width, x }: TabLayout) =>
    setLayouts((prev) =>
      prev[key]?.x === x && prev[key]?.width === width ? prev : { ...prev, [key]: { width, x } },
    );

  const row = (
    <View
      /**
       * ⛔ Đừng đặt `accessible` cho hàng: nó gộp mọi tab con thành MỘT phần tử
       * và người dùng khiếm thị hết đường bấm từng tab. `tablist` chỉ để trình
       * đọc màn hình đọc thêm "danh sách tab, N mục".
       */
      accessibilityRole="tablist"
      /**
       * ⚠️ Khi cuộn ngang thì `className` đi lên `ScrollView` chứ không xuống
       * hàng này: đặt ở đây thì `margin` nằm BÊN TRONG vùng cuộn và không đẩy
       * được nội dung bên dưới — lớp từ ngoài rơi vào khoảng không.
       */
      className={tabs({ variant }).root({ className: scrollable ? undefined : className })}
    >
      {items.map((item) => (
        <TabItem
          key={item.key}
          grow={!scrollable}
          item={item}
          selected={item.key === value}
          variant={variant}
          onLayout={
            variant === 'underline'
              ? (event) => measure(item.key, event.nativeEvent.layout)
              : undefined
          }
          onPress={() => onChange(item.key)}
        />
      ))}
      {variant === 'underline' ? <TabsIndicator layout={layouts[value]} /> : null}
    </View>
  );

  if (!scrollable) return row;

  return (
    <ScrollView
      className={className}
      horizontal
      /**
       * ⚠️ `keyboardShouldPersistTaps="handled"`: hàng tab hay nằm ngay trên một
       * danh sách có ô tìm kiếm. Thiếu prop này thì cú chạm đầu tiên chỉ đóng bàn
       * phím và KHÔNG tới được tab.
       */
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {row}
    </ScrollView>
  );
}
