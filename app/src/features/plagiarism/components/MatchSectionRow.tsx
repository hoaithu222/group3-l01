import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { PlagiarismSection } from '../api/plagiarism.types';

interface MatchSectionRowProps {
  onSelect: (sectionId: string) => void;
  section: PlagiarismSection;
  selected: boolean;
}

/**
 * Một đoạn trùng trong danh sách của tệp đích — chạm để đưa đoạn đó vào khung đối chiếu bên dưới.
 *
 * ⚠️ Đang chọn = viền + nền thương hiệu VÀ `accessibilityState.selected` (trình đọc màn hình không thấy màu); ô icon đổi
 * tông theo, không chỉ dựa vào nền. `cn()` thay template string cũ (NativeWind áp class theo độ ưu tiên, không theo thứ tự
 * chuỗi — nối chuỗi thì lúc đè được lúc không). `min-h-14` ⇒ vùng chạm ≥ 44dp dù chỉ một dòng chữ.
 */
export function MatchSectionRow({ onSelect, section, selected }: MatchSectionRowProps) {
  const lines = `dòng ${section.target.lineStart}-${section.target.lineEnd}`;
  return (
    <Pressable
      accessibilityLabel={`${section.sourceName}, ${lines}, giống ${section.similarity}%`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'min-h-14 flex-row items-center gap-sm rounded-sm border-hairline px-sm py-xs active:opacity-70',
        selected ? 'border-border-brand bg-surface-primary' : 'border-border-1 bg-bg-1',
      )}
      onPress={() => {
        hapticSelection();
        onSelect(section.id);
      }}
    >
      <IconTile name="copy" size="sm" tone={selected ? 'brand' : 'neutral'} />
      <View className="flex-1 gap-3xs">
        <Text className="text-body-md font-semibold text-fg-1" numberOfLines={1}>
          {section.sourceName}
        </Text>
        <Text className="text-caption-lg text-fg-2">Trong tệp này: {lines}</Text>
      </View>
      <Badge label={`${section.similarity}%`} variant={selected ? 'brand' : 'neutral'} />
    </Pressable>
  );
}
