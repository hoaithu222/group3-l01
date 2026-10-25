import { Text } from 'react-native';

/**
 * Nhãn nhóm ngày trong danh sách Hoạt động ("Hôm nay", "Hôm qua"…). Vai `header` để trình đọc màn hình nhảy giữa các nhóm ngày thay vì vuốt
 * qua từng mục. Lề trái/phải 16 như mục (`ActivityItem`); cách nhóm trên `pt-md`, sát nhóm mình `pb-3xs` — nhóm-trong ≤ nhóm-ngoài.
 */
export function ActivityDayHeader({ label }: { label: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-md pb-3xs pt-md text-label-md font-semibold text-fg-2"
    >
      {label}
    </Text>
  );
}
