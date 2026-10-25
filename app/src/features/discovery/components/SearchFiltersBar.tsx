import { ScrollView, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { formatDate } from '@/shared/utils/format/date.utils';

import {
  countActiveFilters,
  FILE_FILTER_LABEL,
  hasDateRange,
  type SearchFilters,
} from '../utils/search-params';

export interface SearchFiltersBarProps {
  filters: SearchFilters;
  onClear: () => void;
  onOpen: () => void;
}

/** Nhãn từng bộ lọc ĐANG bật — chạm chip nào cũng mở tờ bộ lọc để sửa. */
function activeLabels(filters: SearchFilters): string[] {
  const labels: string[] = [];
  if (filters.author) labels.push(`Người gửi: ${filters.author.name}`);
  if (hasDateRange(filters)) {
    const start = formatDate(filters.range.start ?? filters.range.end);
    const end = formatDate(filters.range.end ?? filters.range.start);
    labels.push(start === end ? start : `${start} – ${end}`);
  }
  if (filters.file) labels.push(FILE_FILTER_LABEL[filters.file]);
  if (!filters.includeThreads) labels.push('Không gồm luồng');
  return labels;
}

/**
 * Hàng chip dưới ô tìm (app.md p1-09 §3): nút "Bộ lọc (n)" + chip từng bộ lọc đang bật + "Xoá bộ lọc". Cuộn ngang khi
 * nhiều chip — không xuống dòng để danh sách kết quả không bị đẩy xuống mỗi lần bật thêm một lọc.
 */
export function SearchFiltersBar({ filters, onClear, onOpen }: SearchFiltersBarProps) {
  const count = countActiveFilters(filters);

  return (
    // ⛔ `grow-0`: `ScrollView` của RN mặc định `flexGrow: 1` (cả khi ngang). Nằm trong cột cùng một `flex-1` khác (danh sách kết quả
    // bên dưới) thì hàng chip bị kéo cao ~nửa màn và chip trôi giữa khoảng trống — không lỗi nào báo.
    <ScrollView
      className="grow-0"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center gap-xs px-md">
        <Chip
          label={count > 0 ? `Bộ lọc (${count})` : 'Bộ lọc'}
          leading={<Icon name="filter" size="sm" />}
          role="button"
          selected={count > 0}
          size="sm"
          onPress={onOpen}
        />
        {activeLabels(filters).map((label) => (
          <Chip key={label} label={label} role="button" selected size="sm" onPress={onOpen} />
        ))}
        {count > 0 ? <LinkButton label="Xoá bộ lọc" size="sm" onPress={onClear} /> : null}
      </View>
    </ScrollView>
  );
}
