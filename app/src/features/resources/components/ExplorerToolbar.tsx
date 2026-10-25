import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Chip } from '@/shared/ui/chip';
import { SelectSheet } from '@/shared/ui/select';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ResourceType } from '../api';
import {
  SORT_OPTIONS,
  sortKeyOf,
  sortLabelOf,
  type ExplorerPrefs,
  type ViewMode,
} from '../utils/explorer-prefs';
import { TYPE_FILTERS } from '../utils/resource-icon';

export interface ExplorerToolbarProps {
  onOpenTrash: () => void;
  onSortChange: (option: (typeof SORT_OPTIONS)[number]) => void;
  onTypeChange: (type: ResourceType | 'ALL') => void;
  onViewChange: (view: ViewMode) => void;
  prefs: ExplorerPrefs;
  typeFilter: ResourceType | 'ALL';
}

const SORT_SHEET_OPTIONS = SORT_OPTIONS.map((option) => ({
  label: option.label,
  value: option.key,
}));

/**
 * MỘT dải công cụ của FileExplorer (app.md p3-01 §2): lọc loại tệp (chip `role="radio"`, chọn MỘT, "Tất cả" đứng đầu,
 * cuộn ngang để không tràn máy 320dp) và menu "⋯" ở cuối gom ba thao tác hiếm dùng — Sắp xếp · Dạng lưới/danh sách ·
 * Thùng rác.
 *
 * ✅ Trước đây là HAI hàng chip chồng nhau (sắp xếp/dạng/thùng rác rồi mới tới lọc loại) + breadcrumb + banner: 4 dải
 * điều khiển trước dòng dữ liệu đầu tiên (tối đa cho phép là 2). Giờ chỉ còn dải này (và breadcrumb khi đang ở trong
 * thư mục con). Giá trị hiện tại vẫn nói bằng CHỮ ở dòng mô tả của mục menu ("Sắp xếp — Mới nhất"), chữ chứ không chỉ
 * màu (app.md §7).
 */
export function ExplorerToolbar({
  onOpenTrash,
  onSortChange,
  onTypeChange,
  onViewChange,
  prefs,
  typeFilter,
}: ExplorerToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const isGrid = prefs.view === 'grid';

  return (
    <View className="flex-row items-center pr-xs">
      {/* `flex-1`: ScrollView ngang chiếm phần còn lại của hàng, để nút "⋯" luôn ghim mép phải và không bị cuộn đi. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-xs px-md"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {TYPE_FILTERS.map((filter) => (
          <Chip
            key={filter.key}
            label={filter.label}
            role="radio"
            selected={typeFilter === filter.key}
            size="sm"
            onPress={() => {
              // Đổi bộ lọc loại = đổi lựa chọn ⇒ nhịp `selection`.
              hapticSelection();
              onTypeChange(filter.key);
            }}
          />
        ))}
      </ScrollView>

      <ActionMenu
        accessibilityLabel="Sắp xếp, dạng hiển thị và thùng rác"
        items={[
          {
            description: sortLabelOf(prefs),
            icon: 'arrow-data-transfer-vertical',
            key: 'sort',
            label: 'Sắp xếp',
            onPress: () => setSortOpen(true),
          },
          {
            description: `Đang xem: ${isGrid ? 'Lưới' : 'Danh sách'}`,
            icon: 'contact-list',
            key: 'view',
            label: isGrid ? 'Xem dạng danh sách' : 'Xem dạng lưới',
            onPress: () => onViewChange(isGrid ? 'list' : 'grid'),
          },
          {
            description: 'Tệp và thư mục đã xoá',
            icon: 'delete',
            key: 'trash',
            label: 'Thùng rác',
            onPress: onOpenTrash,
          },
        ]}
      />

      <SelectSheet
        closeOnSelect
        options={SORT_SHEET_OPTIONS}
        title="Sắp xếp theo"
        value={sortKeyOf(prefs)}
        visible={sortOpen}
        onChange={(key) => {
          const option = SORT_OPTIONS.find((candidate) => candidate.key === key);
          if (option) onSortChange(option);
        }}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}
