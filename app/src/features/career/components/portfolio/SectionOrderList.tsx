import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Divider } from '@/shared/ui/divider';
import { Toggle } from '@/shared/ui/toggle';

import type { PortfolioSection, PortfolioSectionKind } from '../../api/portfolio.types';
import { SECTION_HINTS, SECTION_LABELS } from '../../constants/portfolio.constants';

export interface SectionOrderListProps {
  /** Đã sắp theo `order`. */
  sections: PortfolioSection[];
  disabled?: boolean;
  onToggle: (kind: PortfolioSectionKind, visible: boolean) => void;
  onMove: (kind: PortfolioSectionKind, direction: -1 | 1) => void;
}

/**
 * Bật/tắt + sắp xếp các mục của trang (Giới thiệu · Dự án · Huy hiệu kỹ năng · Liên hệ) — app.md p6-07 §3. Sắp xếp bằng nút lên/xuống, KHÔNG kéo thả (§7, README §2: màn
 * điện thoại không làm được canvas kéo thả dùng được, và người dùng TalkBack không kéo được). Mỗi nút có nhãn nói rõ mục nào ("Chuyển mục Dự án lên").
 * Bốn mục luôn đủ và đúng một lần (BE bắt `sections.length === 4`, mỗi loại một lần) nên chỉ BẬT/TẮT chứ không xoá.
 */
export function SectionOrderList({
  disabled = false,
  onMove,
  onToggle,
  sections,
}: SectionOrderListProps) {
  return (
    <View accessibilityLabel="Các mục trên trang" accessibilityRole="list" className="gap-xs">
      {sections.map((section, index) => {
        const label = SECTION_LABELS[section.kind];
        return (
          <View key={section.kind} className="gap-xs">
            <View className="flex-row items-center gap-xs">
              <View className="flex-1">
                <Toggle
                  description={SECTION_HINTS[section.kind]}
                  disabled={disabled}
                  label={label}
                  value={section.visible}
                  onChange={(visible) => onToggle(section.kind, visible)}
                />
              </View>
              <Button
                accessibilityLabel={`Chuyển mục ${label} lên`}
                disabled={disabled || index === 0}
                iconLeft="arrow-up-small"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => onMove(section.kind, -1)}
              />
              <Button
                accessibilityLabel={`Chuyển mục ${label} xuống`}
                disabled={disabled || index === sections.length - 1}
                iconLeft="arrow-down-small"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => onMove(section.kind, 1)}
              />
            </View>
            {index < sections.length - 1 ? <Divider /> : null}
          </View>
        );
      })}
    </View>
  );
}
