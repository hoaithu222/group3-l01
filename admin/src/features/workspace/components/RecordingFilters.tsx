import { memo } from 'react';

import { Button, Checkbox, MultiSelect, RangeDatePicker, Toolbar } from '@/shared/ui';
import type { DateRange } from '@/shared/ui';

import { RECORDING_STATUS_OPTIONS } from '../constants/workspace-recordings.constants';
import type { RecordingStatusValue } from '../types/workspace-recordings.types';

const STATUS_OPTIONS = RECORDING_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export interface RecordingFiltersProps {
  statuses: readonly RecordingStatusValue[];
  range: DateRange;
  /** "Chỉ bản sắp hết hạn" — READY còn ≤ 7 ngày lưu trữ. */
  expiring: boolean;
  includeDeleted: boolean;
  /** Đang có bộ lọc nào — hiện nút "Xoá bộ lọc". */
  filtered: boolean;
  onStatusesChange: (next: RecordingStatusValue[]) => void;
  onRangeChange: (next: DateRange) => void;
  onExpiringChange: (next: boolean) => void;
  onIncludeDeletedChange: (next: boolean) => void;
  onClear: () => void;
}

/**
 * Thanh lọc của tab "Ghi hình" (admin.md p2-06 §2.2): trạng thái (chọn nhiều), khoảng ngày bắt đầu ghi, "Chỉ bản sắp hết hạn", "Bao gồm đã xoá".
 * Chỉ vẽ — trạng thái sống trên URL do `WorkspaceRecordingsTab` giữ (`useQueryParams`). Lọc workspace do trang chứa quyết định (tab của một
 * workspace thì đã cố định).
 */
const RecordingFilters = memo(function RecordingFilters({
  statuses,
  range,
  expiring,
  includeDeleted,
  filtered,
  onStatusesChange,
  onRangeChange,
  onExpiringChange,
  onIncludeDeletedChange,
  onClear,
}: RecordingFiltersProps) {
  return (
    <Toolbar
      left={
        <>
          <MultiSelect
            aria-label="Lọc theo trạng thái"
            className="w-56"
            clearable
            options={STATUS_OPTIONS}
            placeholder="Mọi trạng thái"
            size="sm"
            value={[...statuses]}
            onValueChange={(next) => onStatusesChange(next as RecordingStatusValue[])}
          />
          <RangeDatePicker
            align="end"
            className="w-64"
            placeholder="Khoảng ngày bắt đầu ghi"
            range={range}
            showQuickSelect
            size="sm"
            onRangeChange={onRangeChange}
          />
          <Checkbox
            checked={expiring}
            label="Chỉ bản sắp hết hạn"
            size="sm"
            onCheckedChange={onExpiringChange}
          />
          <Checkbox
            checked={includeDeleted}
            label="Bao gồm đã xoá"
            size="sm"
            onCheckedChange={onIncludeDeletedChange}
          />
          {filtered && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Xoá bộ lọc
            </Button>
          )}
        </>
      }
    />
  );
});

export default RecordingFilters;
