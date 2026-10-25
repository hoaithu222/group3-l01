import { memo } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import { Button, Dropdown, Input, MultiSelect, RangeDatePicker, Toolbar } from '@/shared/ui';
import type { DateRange } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  ALL_FILTER,
  MEETING_PLATFORM_OPTIONS,
  MEETING_STATUS_OPTIONS,
} from '../../constants/meeting.constants';
import type { MeetingPlatformValue, MeetingStatusValue } from '../../types/meeting.types';
import WorkspaceFilter from '../common/WorkspaceFilter';

const STATUS_OPTIONS = MEETING_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export interface MeetingFiltersProps {
  search: string;
  statuses: readonly MeetingStatusValue[];
  platform: MeetingPlatformValue | undefined;
  workspaceId: string;
  range: DateRange;
  /** Đang có bộ lọc nào — hiện nút "Xoá bộ lọc". */
  filtered: boolean;
  onSearchChange: (value: string) => void;
  onStatusesChange: (next: MeetingStatusValue[]) => void;
  onPlatformChange: (next: MeetingPlatformValue | null) => void;
  onWorkspaceChange: (next: string | null) => void;
  onRangeChange: (next: DateRange) => void;
  onClear: () => void;
}

/**
 * Thanh lọc của tab "Cuộc họp" (admin.md p2-07 §2.2): ô tìm tiêu đề/mã họp (IME-safe, không controlled), trạng thái (chọn nhiều), workspace,
 * nền tảng, khoảng ngày bắt đầu. Chỉ vẽ — trạng thái sống trên URL do `useMeetingListState` giữ. KHÔNG có bộ lọc theo người tham dự/chủ trì (OPC-05).
 */
const MeetingFilters = memo(function MeetingFilters({
  search,
  statuses,
  platform,
  workspaceId,
  range,
  filtered,
  onSearchChange,
  onStatusesChange,
  onPlatformChange,
  onWorkspaceChange,
  onRangeChange,
  onClear,
}: MeetingFiltersProps) {
  const { inputProps } = useImeSafeSearchInput(search, onSearchChange);

  return (
    <Toolbar
      left={
        <>
          <Input
            {...inputProps}
            aria-label="Tìm theo tiêu đề hoặc mã họp"
            className="w-64"
            clearable
            placeholder="Tìm tiêu đề hoặc mã họp…"
            size="sm"
            startIcon={<SystemIcon name="magnifying-glass-outline" size={14} />}
          />
          <MultiSelect
            aria-label="Lọc theo trạng thái"
            className="w-52"
            clearable
            options={STATUS_OPTIONS}
            placeholder="Mọi trạng thái"
            size="sm"
            value={[...statuses]}
            onValueChange={(next) => onStatusesChange(next as MeetingStatusValue[])}
          />
          <WorkspaceFilter workspaceId={workspaceId} onChange={onWorkspaceChange} />
          <Dropdown
            aria-label="Lọc theo nền tảng"
            className="w-44"
            options={MEETING_PLATFORM_OPTIONS}
            size="sm"
            value={platform ?? ALL_FILTER}
            onValueChange={(v) =>
              onPlatformChange(v === ALL_FILTER ? null : (v as MeetingPlatformValue))
            }
          />
          <RangeDatePicker
            align="end"
            className="w-64"
            placeholder="Khoảng ngày bắt đầu"
            range={range}
            showQuickSelect
            size="sm"
            onRangeChange={onRangeChange}
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

export default MeetingFilters;
