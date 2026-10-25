import { ScrollView, View } from 'react-native';

import { Badge, BadgeAnchor } from '@/shared/ui/badge';
import { LinkButton } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';

import type { WorkspaceSearchType } from '../api';
import { activeFilterLabels } from '../utils/filter-labels';
import { countActiveFilters, type SearchFilters } from '../utils/search-params';

export interface SearchFiltersBarProps {
  filters: SearchFilters;
  /** Tab đang mở — quyết định bộ lọc nào có nghĩa (`hasFile` chỉ ở Tin nhắn). */
  type: WorkspaceSearchType;
  onClear: () => void;
  onOpen: () => void;
}

/**
 * Hàng dưới tab (app.md p5-04 §3): nút "Bộ lọc" CÓ CHẤM khi đang lọc + chip từng bộ lọc đang bật + "Xoá bộ lọc". Cuộn ngang khi
 * nhiều chip — không xuống dòng để danh sách kết quả không bị đẩy xuống mỗi lần bật thêm một lọc. Chạm chip nào cũng mở tờ
 * bộ lọc để sửa. Chấm có nhãn "Đang lọc" cho trình đọc màn hình: màu/vị trí chấm không phải dấu hiệu duy nhất.
 */
export function SearchFiltersBar({ filters, type, onClear, onOpen }: SearchFiltersBarProps) {
  const count = countActiveFilters(filters, type);
  const labels = activeFilterLabels(filters, type);

  return (
    // `grow-0`: ScrollView ngang mặc định `flexGrow: 1` — nằm cạnh khối kết quả `flex-1` thì thanh lọc CHIA ĐÔI phần chiều cao còn trống
    // với danh sách (thanh chip cao nửa màn hình). Cả hai màn dùng nó (tìm toàn nhóm, tìm trong phạm vi) đều có anh em `flex-1`.
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
          leading={
            <BadgeAnchor
              badge={count > 0 ? <Badge accessibilityLabel="Đang lọc" dot size="sm" /> : undefined}
            >
              <Icon name="filter" size="sm" />
            </BadgeAnchor>
          }
          role="button"
          selected={count > 0}
          size="sm"
          onPress={onOpen}
        />
        {labels.map(({ key, label }) => (
          <Chip key={key} label={label} role="button" selected size="sm" onPress={onOpen} />
        ))}
        {count > 0 ? <LinkButton label="Xoá bộ lọc" size="sm" onPress={onClear} /> : null}
      </View>
    </ScrollView>
  );
}
