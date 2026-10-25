import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import type {
  PortfolioAccent,
  PortfolioTemplate,
  PortfolioTemplateInfo,
} from '../../api/portfolio.types';

export interface TemplatePickerProps {
  /** Danh mục từ `GET /portfolio/templates`; `undefined` khi đang tải. */
  templates: PortfolioTemplateInfo[] | undefined;
  template: PortfolioTemplate;
  accent: PortfolioAccent;
  disabled?: boolean;
  onTemplate: (template: PortfolioTemplate) => void;
  onAccent: (accent: PortfolioAccent) => void;
}

/**
 * Chọn mẫu (4) + màu nhấn (6) — app.md p6-07 §3. Mỗi mẫu là MỘT dòng có MÔ TẢ CHỮ ("Mẫu Lập trình viên — nền tối, nhấn vào kỹ năng", §7) và nhãn nền sáng/tối:
 * BE chưa cấp ảnh xem mẫu (`previewImageUrl` luôn `null`, ảnh do app đóng gói) nên không dựng ảnh giả — nút "Xem trước với mẫu này" mới cho thấy trang thật.
 * Đang chọn = `selected` của `ListItem` (đó là thứ DUY NHẤT đưa trạng thái tới TalkBack) + dấu tick nhìn thấy được (không để MÀU làm dấu hiệu duy nhất).
 * Màu nhấn lấy mã từ SERVER (đã kiểm tương phản cả 6 màu) — dữ liệu, không phải màu chép cứng trong app.
 */
/** Ô icon theo MẪU — gợi hình "mẫu này dành cho ai" cạnh mô tả chữ (mô tả vẫn là thứ nói đủ nghĩa). Mẫu lạ rơi về `document`. */
const TEMPLATE_ICON: Partial<Record<string, IconName>> = {
  CLASSIC: 'document',
  DESIGNER: 'magic-wand-01',
  DEVELOPER: 'lap',
  MINIMAL: 'document-2',
};

export function TemplatePicker({
  accent,
  disabled = false,
  onAccent,
  onTemplate,
  template,
  templates,
}: TemplatePickerProps) {
  if (!templates) {
    return (
      <View className="gap-sm">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </View>
    );
  }
  const current = templates.find((item) => item.template === template);

  return (
    <View className="gap-md">
      <View accessibilityLabel="Mẫu trình bày" accessibilityRole="radiogroup">
        {templates.map((item, index) => {
          const selected = item.template === template;
          return (
            <ListItem
              key={item.template}
              description={item.description}
              disabled={disabled}
              divider={index < templates.length - 1}
              emphasis="title"
              label={`Mẫu ${item.name}`}
              leading={
                <IconTile
                  name={TEMPLATE_ICON[item.template] ?? 'document'}
                  size="sm"
                  tone={selected ? 'brand' : 'neutral'}
                />
              }
              selected={selected}
              trailing={
                selected ? (
                  <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" />
                ) : undefined
              }
              value={item.dark ? 'Nền tối' : 'Nền sáng'}
              onPress={() => {
                if (!selected) hapticSelection();
                onTemplate(item.template);
              }}
            />
          );
        })}
      </View>

      <View className="gap-xs">
        <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
          Màu nhấn
        </Text>
        <View
          accessibilityLabel="Màu nhấn"
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-xs"
        >
          {(current?.accents ?? []).map((item) => (
            <Chip
              key={item.accent}
              disabled={disabled}
              label={item.name}
              leading={
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              }
              role="radio"
              selected={item.accent === accent}
              onPress={() => {
                if (item.accent !== accent) hapticSelection();
                onAccent(item.accent);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
