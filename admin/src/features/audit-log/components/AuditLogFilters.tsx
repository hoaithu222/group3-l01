import { memo, useEffect } from 'react';

import { useImeSafeSearchInput } from '@/shared/hooks';
import { Badge, Button, Dropdown, Input, MultiSelect, RangeDatePicker } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { AUDIT_ACTION_OPTIONS, AUDIT_TARGET_TYPE_OPTIONS } from '@/shared/constants/audit-actions';

import type { AuditLogFilterState } from '../hooks';

const ALL_TARGET_TYPES = 'all';
const TARGET_TYPE_FILTER_OPTIONS = [
  { value: ALL_TARGET_TYPES, label: 'Mọi đối tượng' },
  ...AUDIT_TARGET_TYPE_OPTIONS,
];
const ACTION_OPTIONS = [...AUDIT_ACTION_OPTIONS];

export interface AuditLogFiltersProps {
  state: AuditLogFilterState;
  /** Tên người thực hiện đang lọc (suy từ dòng đã tải) — hiện cạnh ô ID cho dễ nhận. */
  actorName?: string;
}

/**
 * Hàng bộ lọc của trang nhật ký. Mọi giá trị đọc/ghi qua `useAuditLogFilters` (URL);
 * ô nhập ID dùng `useImeSafeSearchInput` (uncontrolled) như mọi ô nhập tự do khác.
 *
 * `?focus=actor` (từ hành động ⌘K "Tìm nhật ký theo người thực hiện") → focus ô người
 * thực hiện một lần rồi bỏ khỏi URL.
 */
const AuditLogFilters = memo(function AuditLogFilters({ state, actorName }: AuditLogFiltersProps) {
  const { values, invalid, setText, setActions, setTargetType, setRange } = state;

  const actor = useImeSafeSearchInput(values.actorId, (v) => setText('actorId', v));
  const target = useImeSafeSearchInput(values.targetId, (v) => setText('targetId', v));
  const workspace = useImeSafeSearchInput(values.workspaceId, (v) => setText('workspaceId', v));

  const { focusActor, consumeFocus } = state;
  const actorInputRef = actor.inputProps.ref;
  useEffect(() => {
    if (!focusActor) return;
    actorInputRef.current?.focus();
    consumeFocus();
  }, [focusActor, consumeFocus, actorInputRef]);

  return (
    <>
      <Input
        {...actor.inputProps}
        clearable
        invalid={invalid.actorId}
        placeholder="ID người thực hiện"
        size="sm"
        startIcon={<SystemIcon name="user-outline" size={16} />}
        title={invalid.actorId ? 'ID phải gồm 24 ký tự hex' : undefined}
        wrapperClassName="w-56"
      />
      {actorName && values.actorId && !invalid.actorId && (
        <Badge color="primary" variant="tinted">
          {actorName}
        </Badge>
      )}
      <MultiSelect
        aria-label="Lọc theo hành động"
        className="w-56"
        clearable
        maxDisplay={1}
        options={ACTION_OPTIONS}
        placeholder="Mọi hành động"
        searchable
        searchPlaceholder="Tìm hành động…"
        size="sm"
        value={values.actions}
        onValueChange={setActions}
      />
      <Dropdown
        aria-label="Lọc theo loại đối tượng"
        className="w-44"
        options={TARGET_TYPE_FILTER_OPTIONS}
        size="sm"
        value={values.targetType || ALL_TARGET_TYPES}
        onValueChange={setTargetType}
      />
      <Input
        {...target.inputProps}
        clearable
        placeholder="ID đối tượng"
        size="sm"
        wrapperClassName="w-44"
      />
      <Input
        {...workspace.inputProps}
        clearable
        invalid={invalid.workspaceId}
        placeholder="ID workspace"
        size="sm"
        title={invalid.workspaceId ? 'ID phải gồm 24 ký tự hex' : undefined}
        wrapperClassName="w-44"
      />
      <RangeDatePicker
        align="end"
        className="w-64"
        placeholder="Khoảng ngày"
        range={values.range}
        showQuickSelect
        size="sm"
        onRangeChange={setRange}
      />
      {state.hasActiveFilter && (
        <Button size="sm" variant="ghost" onClick={state.clear}>
          Xoá bộ lọc
        </Button>
      )}
    </>
  );
});

export default AuditLogFilters;
