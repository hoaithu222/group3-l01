import { memo } from 'react';

import { Button, Input, SegmentToggle } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useImeSafeSearchInput } from '@/shared/hooks';

import { BADGE_NAME_MAX } from '../schemas/badge.schema';

export type BadgeActiveFilter = 'all' | 'true' | 'false';

const FILTER_OPTIONS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'true', label: 'Đang bật' },
  { key: 'false', label: 'Đã tắt' },
];

export interface BadgesToolbarProps {
  /** Từ khoá đang áp (URL `?q=`) — ô nhập uncontrolled lấy làm giá trị đầu, KHÔNG điều khiển từng phím (IME-safe). */
  search: string;
  onSearchChange: (value: string) => void;
  filter: BadgeActiveFilter;
  onFilterChange: (value: BadgeActiveFilter) => void;
  /** Có `gamification:update` — hiện nút "Tạo huy hiệu". */
  canCreate: boolean;
  onCreate: () => void;
}

/**
 * Thanh công cụ tab "Huy hiệu": ô tìm theo TÊN (IME-safe — `useImeSafeSearchInput`, gõ tiếng Việt Telex/VNI không mất dấu), lọc Bật/Tắt, nút Tạo.
 * Việc debounce + gọi `?q=` nằm ở `BadgesTab` (tìm phía SERVER; không lọc trên một trang của danh sách phân trang server).
 */
const BadgesToolbar = memo(function BadgesToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  canCreate,
  onCreate,
}: BadgesToolbarProps) {
  const { inputProps } = useImeSafeSearchInput(search, onSearchChange);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          {...inputProps}
          clearable
          maxLength={BADGE_NAME_MAX} // BE `q` ≤ tên tối đa (60) — dài hơn bị `VAL_001`
          placeholder="Tìm theo tên huy hiệu…"
          size="sm"
          startIcon={<SystemIcon name="magnifying-glass-outline" size={16} />}
          wrapperClassName="w-64"
        />
        <SegmentToggle
          aria-label="Lọc theo trạng thái huy hiệu"
          options={FILTER_OPTIONS}
          value={filter}
          onValueChange={(v) => onFilterChange(v as BadgeActiveFilter)}
        />
      </div>
      {canCreate ? (
        <Button size="sm" variant="primary" onClick={onCreate}>
          Tạo huy hiệu
        </Button>
      ) : null}
    </div>
  );
});

export default BadgesToolbar;
