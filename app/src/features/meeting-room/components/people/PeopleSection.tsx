import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface PeopleSectionProps {
  /** Hành động dạt phải của tiêu đề ("Hạ tay tất cả", "Cho tất cả vào") — tự mang nhãn trợ năng. */
  action?: ReactNode;
  children: ReactNode;
  count: number;
  /** Mốc nhìn trước tiêu đề (icon hoặc `<HandGlyph>`) — trang trí, nghĩa nằm ở tiêu đề. */
  glyph?: ReactNode;
  title: string;
}

/**
 * Một nhóm của tấm "Người tham gia" kiểu Meet: tiêu đề + SỐ ĐẾM bằng chữ ("Đang giơ tay (2)") + hành động của nhóm, rồi các hàng.
 * ⚠️ Không dùng `Section` chung: `Section.icon` chỉ nhận tên icon BIDV mà bộ icon KHÔNG có bàn tay — nhóm giơ tay cần `<HandGlyph>`;
 * ba nhóm phải cùng MỘT khuôn tiêu đề nên cả ba đi qua đây.
 */
export function PeopleSection({ action, children, count, glyph, title }: PeopleSectionProps) {
  return (
    <View className="gap-2xs">
      <View className="min-h-11 flex-row items-center gap-xs">
        {glyph ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {glyph}
          </View>
        ) : null}
        <Text accessibilityRole="header" className="flex-1 text-label-lg font-semibold text-fg-1">
          {`${title} (${String(count)})`}
        </Text>
        {action}
      </View>
      <View>{children}</View>
    </View>
  );
}
