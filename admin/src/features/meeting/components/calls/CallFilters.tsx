import { memo } from 'react';

import { Badge, Button, Dropdown, MultiSelect, RangeDatePicker, Toolbar } from '@/shared/ui';
import type { DateRange } from '@/shared/ui';

import {
  CALL_END_REASON_OPTIONS,
  CALL_MEDIA_OPTIONS,
  CALL_MODE_OPTIONS,
  CALL_SCOPE_OPTIONS,
  CALL_STATUS_OPTIONS,
} from '../../constants/call.constants';
import { ALL_FILTER } from '../../constants/meeting.constants';
import type { CallEndReasonValue, CallStatusValue } from '../../types/call.types';
import WorkspaceFilter from '../common/WorkspaceFilter';

const STATUS_OPTIONS = CALL_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const END_REASON_OPTIONS = CALL_END_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export interface CallFiltersProps {
  scopeType: string;
  mode: string;
  mediaKind: string;
  statuses: readonly CallStatusValue[];
  endReasons: readonly CallEndReasonValue[];
  workspaceId: string;
  /** Có = đang xem các phiên gọi của MỘT cuộc họp (đến từ liên kết "Xem cuộc gọi"); phạm vi bị khoá là `MEETING`. */
  meetingId: string;
  range: DateRange;
  filtered: boolean;
  onScopeTypeChange: (next: string | null) => void;
  onModeChange: (next: string | null) => void;
  onMediaKindChange: (next: string | null) => void;
  onStatusesChange: (next: CallStatusValue[]) => void;
  onEndReasonsChange: (next: CallEndReasonValue[]) => void;
  onWorkspaceChange: (next: string | null) => void;
  onClearMeeting: () => void;
  onRangeChange: (next: DateRange) => void;
  onClear: () => void;
}

const orNull = (v: string): string | null => (v === ALL_FILTER ? null : v);

/**
 * Thanh lọc của tab "Cuộc gọi" (admin.md p2-07 §2.3): phạm vi, chế độ, media, trạng thái, lý do kết thúc, workspace, khoảng ngày bắt đầu. ⛔ KHÔNG có ô
 * tìm/lọc theo người dùng (OPC-05: lọc theo người = lộ ai gọi ai ở cuộc gọi 1-1). Chỉ vẽ — trạng thái sống trên URL do `useCallListState` giữ.
 */
const CallFilters = memo(function CallFilters({
  scopeType,
  mode,
  mediaKind,
  statuses,
  endReasons,
  workspaceId,
  meetingId,
  range,
  filtered,
  onScopeTypeChange,
  onModeChange,
  onMediaKindChange,
  onStatusesChange,
  onEndReasonsChange,
  onWorkspaceChange,
  onClearMeeting,
  onRangeChange,
  onClear,
}: CallFiltersProps) {
  return (
    <Toolbar
      left={
        <>
          <Dropdown
            aria-label="Lọc theo phạm vi"
            className="w-40"
            disabled={!!meetingId}
            options={CALL_SCOPE_OPTIONS}
            size="sm"
            value={meetingId ? 'MEETING' : scopeType || ALL_FILTER}
            onValueChange={(v) => onScopeTypeChange(orNull(v))}
          />
          <Dropdown
            aria-label="Lọc theo chế độ"
            className="w-40"
            options={CALL_MODE_OPTIONS}
            size="sm"
            value={mode || ALL_FILTER}
            onValueChange={(v) => onModeChange(orNull(v))}
          />
          <Dropdown
            aria-label="Lọc theo loại media"
            className="w-40"
            options={CALL_MEDIA_OPTIONS}
            size="sm"
            value={mediaKind || ALL_FILTER}
            onValueChange={(v) => onMediaKindChange(orNull(v))}
          />
          <MultiSelect
            aria-label="Lọc theo trạng thái"
            className="w-48"
            clearable
            options={STATUS_OPTIONS}
            placeholder="Mọi trạng thái"
            size="sm"
            value={[...statuses]}
            onValueChange={(next) => onStatusesChange(next as CallStatusValue[])}
          />
          <MultiSelect
            aria-label="Lọc theo lý do kết thúc"
            className="w-56"
            clearable
            options={END_REASON_OPTIONS}
            placeholder="Mọi lý do kết thúc"
            size="sm"
            value={[...endReasons]}
            onValueChange={(next) => onEndReasonsChange(next as CallEndReasonValue[])}
          />
          <WorkspaceFilter workspaceId={workspaceId} onChange={onWorkspaceChange} />
          <RangeDatePicker
            align="end"
            className="w-64"
            placeholder="Khoảng ngày bắt đầu"
            range={range}
            showQuickSelect
            size="sm"
            onRangeChange={onRangeChange}
          />
          {meetingId && (
            <Badge color="info" variant="tinted">
              Chỉ các phiên của một cuộc họp
            </Badge>
          )}
          {meetingId && (
            <Button size="sm" variant="ghost" onClick={onClearMeeting}>
              Bỏ lọc cuộc họp
            </Button>
          )}
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

export default CallFilters;
