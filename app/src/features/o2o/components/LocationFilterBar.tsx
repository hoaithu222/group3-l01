import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';

import type { LocationType } from '../api/o2o.types';
import { LOCATION_TYPE_LABEL } from '../constants/o2o.constants';
import type { MapFilters } from '../hooks/useLocationMap';
import { AmenityFilterSheet } from './AmenityFilterSheet';

export interface LocationFilterBarProps {
  filters: MapFilters;
  onChange: (filters: MapFilters) => void;
}

const TYPE_OPTIONS: { label: string; value: LocationType | undefined }[] = [
  { label: 'Tất cả', value: undefined },
  { label: LOCATION_TYPE_LABEL.CAFE, value: 'CAFE' },
  { label: LOCATION_TYPE_LABEL.PRINT_SHOP, value: 'PRINT_SHOP' },
  { label: LOCATION_TYPE_LABEL.LIBRARY, value: 'LIBRARY' },
];

/**
 * Hàng lọc (app.md §2 `LocationFilterBar`): loại (chọn một) · "Đang mở" · "Tiện ích". Lọc ở SERVER (`type`/`amenities`/`openNow` của
 * `GET /locations/near`) nên đổi lọc là đổi khoá cache — không lọc lại mảng ở app (BE cắt ≤ 50 SAU khi lọc; lọc ở app sẽ chỉ còn vài dòng).
 */
export function LocationFilterBar({ filters, onChange }: LocationFilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const amenityCount = filters.amenities.length;

  return (
    <>
      {/* ⛔ `grow-0`: `ScrollView` của RN mặc định `flexGrow: 1` (cả khi ngang) — nằm cạnh khối `flex-1` khác thì hàng chip bị kéo cao. */}
      <ScrollView
        className="grow-0"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-xs px-md">
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              role="radio"
              selected={filters.type === option.value}
              size="sm"
              onPress={() => onChange({ ...filters, type: option.value })}
            />
          ))}
          <Chip
            label="Đang mở"
            role="checkbox"
            selected={filters.openNow}
            size="sm"
            onPress={() => onChange({ ...filters, openNow: !filters.openNow })}
          />
          <Chip
            label={amenityCount > 0 ? `Tiện ích (${amenityCount})` : 'Tiện ích'}
            role="button"
            selected={amenityCount > 0}
            size="sm"
            trailing={<Icon name="arrow-down-small" size="sm" />}
            onPress={() => setSheetOpen(true)}
          />
        </View>
      </ScrollView>
      <AmenityFilterSheet
        value={filters.amenities}
        visible={sheetOpen}
        onChange={(amenities) => onChange({ ...filters, amenities })}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
