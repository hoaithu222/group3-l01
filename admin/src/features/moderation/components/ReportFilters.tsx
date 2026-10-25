import { memo, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Dropdown, RangeDatePicker } from '@/shared/ui';

import {
  REPORT_REASON_OPTIONS,
  REPORT_SORT_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TARGET_TYPE_OPTIONS,
} from '../constants/moderation.constants';
import { ALL_FILTER } from '../hooks/useReportFilters';
import type { ReportFilterState } from '../hooks/useReportFilters';
import { useModerationWorkspaceOptions } from '../service/moderation.queries';

const TARGET_TYPE_OPTIONS = [
  { value: ALL_FILTER, label: 'Mọi loại đích' },
  ...REPORT_TARGET_TYPE_OPTIONS,
];
const REASON_OPTIONS = [{ value: ALL_FILTER, label: 'Mọi lý do' }, ...REPORT_REASON_OPTIONS];
const STATUS_OPTIONS = [...REPORT_STATUS_OPTIONS];
const SORT_OPTIONS = [...REPORT_SORT_OPTIONS];

export interface ReportFiltersProps {
  state: ReportFilterState;
  /** `false` khi workspace đã cố định (tab `reports` của workspace) — bỏ ô lọc workspace. */
  showWorkspace?: boolean;
}

/**
 * Hàng bộ lọc hàng đợi báo cáo: trạng thái · loại đích · lý do · workspace · khoảng ngày · sắp
 * xếp. Mọi giá trị đọc/ghi qua `useReportFilters` (URL). Ô workspace gợi ý từ `GET /admin/workspaces`
 * — chỉ hiện khi người xem có `workspace:view` (nếu không sẽ 403 vô ích).
 */
const ReportFilters = memo(function ReportFilters({
  state,
  showWorkspace = true,
}: ReportFiltersProps) {
  const { values } = state;
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const workspaceFilterOn = showWorkspace && canViewWorkspace;
  const { data: workspaces } = useModerationWorkspaceOptions(workspaceFilterOn);

  const workspaceOptions = useMemo(() => {
    const options = [
      { value: ALL_FILTER, label: 'Mọi workspace' },
      ...(workspaces ?? []).map((w) => ({ value: w.id, label: w.name })),
    ];
    // Workspace đang lọc (từ link/URL) chưa nằm trong danh sách đã tải → vẫn phải có nhãn để ô không trống.
    const selected = values.workspaceId;
    if (selected && !options.some((o) => o.value === selected)) {
      options.push({ value: selected, label: `Workspace …${selected.slice(-6)}` });
    }
    return options;
  }, [workspaces, values.workspaceId]);

  return (
    <>
      <Dropdown
        aria-label="Lọc theo trạng thái báo cáo"
        className="w-40"
        options={STATUS_OPTIONS}
        size="sm"
        value={values.status}
        onValueChange={state.setStatus}
      />
      <Dropdown
        aria-label="Lọc theo loại đích"
        className="w-40"
        options={TARGET_TYPE_OPTIONS}
        size="sm"
        value={values.targetType ?? ALL_FILTER}
        onValueChange={state.setTargetType}
      />
      <Dropdown
        aria-label="Lọc theo lý do báo cáo"
        className="w-52"
        options={REASON_OPTIONS}
        size="sm"
        value={values.reason ?? ALL_FILTER}
        onValueChange={state.setReason}
      />
      {workspaceFilterOn && (
        <Dropdown
          aria-label="Lọc theo workspace"
          className="w-52"
          options={workspaceOptions}
          searchable
          searchPlaceholder="Tìm workspace…"
          size="sm"
          value={values.workspaceId ?? ALL_FILTER}
          onValueChange={state.setWorkspace}
        />
      )}
      <RangeDatePicker
        align="end"
        className="w-64"
        placeholder="Khoảng ngày báo cáo"
        range={values.range}
        showQuickSelect
        size="sm"
        onRangeChange={state.setRange}
      />
      <Dropdown
        aria-label="Sắp xếp báo cáo"
        className="w-48"
        options={SORT_OPTIONS}
        size="sm"
        value={values.sort}
        onValueChange={state.setSort}
      />
      {state.hasActiveFilter && (
        <Button size="sm" variant="ghost" onClick={state.clear}>
          Xoá bộ lọc
        </Button>
      )}
    </>
  );
});

export default ReportFilters;
