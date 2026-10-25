import { memo, useCallback, useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { NodeApi } from 'react-arborist';
import Checkbox from '@/shared/ui/inputs/Checkbox';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { TreeNodeData } from '@/shared/ui/data-display/Tree';
import { cn } from '@/shared/utils/style/cn';
import DropdownTreeSelectValue from './DropdownTreeSelectValue';
import DropdownTreeSelectPanel from './DropdownTreeSelectPanel';
import {
  dropdownTreeSelectStyles,
  type DropdownTreeSelectSize,
} from './dropdown-tree-select.theme';
import {
  buildTreeIndex,
  getCheckState,
  getSelectedLabels,
  toggleSelection,
} from './dropdown-tree-select.utils';

/**
 * DropdownTreeSelect — kit2 dropdown whose panel is a hierarchical `Tree`
 * (glass popover + search + expand/collapse).
 *
 * Modes: `single` (row highlight + trailing tick → replace value + close) ·
 * `multi` (checkbox per node + chips; `cascade` makes a parent (un)check all
 * descendants, tri-state).
 * Controlled (`value`+`onChange`) or uncontrolled (`defaultValue`); values are
 * always arrays of node ids (single ⇒ length ≤ 1).
 */
export type { DropdownTreeSelectSize };
export type DropdownTreeSelectMode = 'single' | 'multi';

export interface DropdownTreeSelectProps {
  data: TreeNodeData[];
  /** Selection mode. Default `single`. */
  mode?: DropdownTreeSelectMode;
  /** Controlled selected ids. */
  value?: string[];
  /** Uncontrolled initial selected ids. */
  defaultValue?: string[];
  onChange?: (ids: string[]) => void;
  placeholder?: string;
  /** Search box that filters the tree. Default true. */
  searchable?: boolean;
  /** Độ trễ debounce (ms) cho ô tìm kiếm — tree chỉ lọc sau khi ngừng gõ. Default 300. */
  searchDebounceMs?: number;
  /** Clear-all button when there's a selection. Default true. */
  clearable?: boolean;
  /** Multi-only: parent toggles all descendants (tri-state). Default false. */
  cascade?: boolean;
  /** Multi-only: số chip tối đa hiện inline, dư ra gộp "+N". Bỏ trống = hiện hết. */
  maxDisplay?: number;
  size?: DropdownTreeSelectSize;
  invalid?: boolean;
  disabled?: boolean;
  /** Tree area height (px). Default 260. */
  treeHeight?: number;
  /** Mở toàn bộ node ngay khi mở popover. Default false. */
  openByDefault?: boolean;
  /**
   * Nội dung căn PHẢI mỗi row (số mục, badge, count…). Không đụng tới phần thân
   * row — tick (single) / checkbox (multi) do component tự dựng, giữ nguyên.
   */
  renderTrailing?: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  /**
   * Cho phép MỞ/ĐÓNG node `disabled` (vẫn chặn chọn). Dùng cho cây có node cha
   * "chỉ làm đường dẫn" — xem `Tree.expandDisabled`. Default false.
   */
  expandDisabled?: boolean;
  /** Chỉ mở sẵn node gốc ĐẦU TIÊN khi mở popover. Default false. */
  openFirstByDefault?: boolean;
  className?: string;
  contentClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

const DropdownTreeSelect = memo(
  ({
    data,
    mode = 'single',
    value,
    defaultValue,
    onChange,
    placeholder = 'Chọn',
    searchable = true,
    searchDebounceMs = 300,
    clearable = true,
    cascade = false,
    maxDisplay,
    size,
    invalid = false,
    disabled,
    treeHeight = 260,
    openByDefault = false,
    openFirstByDefault = false,
    renderTrailing,
    expandDisabled = false,
    className,
    contentClassName,
    side = 'bottom',
    align = 'start',
  }: DropdownTreeSelectProps) => {
    const slots = dropdownTreeSelectStyles({ size, invalid });
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [internal, setInternal] = useState<string[]>(defaultValue ?? []);

    const isControlled = value !== undefined;
    const selectedIds = isControlled ? value : internal;
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const index = useMemo(() => buildTreeIndex(data), [data]);
    const labels = useMemo(() => getSelectedLabels(data, selectedSet), [data, selectedSet]);
    const multi = mode === 'multi';

    // Mở sẵn node gốc đầu tiên (nếu bật) — chỉ áp dụng khi KHÔNG mở toàn bộ.
    const defaultOpenIds = useMemo(
      () => (openFirstByDefault && !openByDefault && data[0] ? [data[0].id] : undefined),
      [openFirstByDefault, openByDefault, data],
    );

    const commit = useCallback(
      (ids: string[]) => {
        if (!isControlled) setInternal(ids);
        onChange?.(ids);
      },
      [isControlled, onChange, setInternal],
    );

    const toggle = useCallback(
      (id: string, checked: boolean) => {
        commit(Array.from(toggleSelection(index, selectedSet, id, checked, cascade)));
      },
      [index, selectedSet, cascade, commit],
    );

    // Single: pick any node → replace value + close. Fires on every click (incl.
    // re-clicking current) — arborist onSelect no-ops on unchanged selection.
    const selectSingle = useCallback(
      (node: NodeApi<TreeNodeData>) => {
        if (node.data.disabled) return;
        commit([node.id]);
        setOpen(false);
      },
      [commit, setOpen],
    );

    const clearAll = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        commit([]);
      },
      [commit],
    );

    // Row body. single → clickable name; multi → checkbox + name (chevron still
    // owns expand via stopPropagation).
    const renderNode = useCallback(
      (node: NodeApi<TreeNodeData>) => {
        if (!multi) {
          // Single: no radio — row highlight (Tree rowSelected) + trailing tick
          // trên node đang chọn, đồng bộ với Dropdown variant="tick". Click name
          // (hoặc cả row span) → chọn + đóng popover.
          const isSelected = selectedSet.has(node.id);
          return (
            <span
              className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                selectSingle(node);
              }}
            >
              {/* Icon riêng của node (vd folder/file) — chỉ render khi data có
                  gắn `icon`, không có thì layout giữ nguyên như trước (opt-in). */}
              {node.data.icon && (
                <SystemIcon
                  className={cn('shrink-0', isSelected ? 'text-primary-5' : 'text-fg-3')}
                  name={node.data.icon}
                  size={14}
                />
              )}
              <span className="flex-1 truncate">{node.data.name}</span>
              {isSelected && (
                <SystemIcon className="shrink-0 text-primary-5" name="check-outline" size={12} />
              )}
            </span>
          );
        }
        // Multi: bấm cả label (không chỉ checkbox) đều toggle. Checkbox tự
        // stopPropagation (click + pointerdown) để tránh double-toggle với label.
        const state = getCheckState(index, selectedSet, node.id, cascade);
        const disabledNode = !!node.data.disabled;
        return (
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <Checkbox
              checked={state === 'indeterminate' ? 'indeterminate' : state === 'checked'}
              disabled={disabledNode}
              size="sm"
              onCheckedChange={(c) => toggle(node.id, c === true)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            {node.data.icon && (
              <SystemIcon
                className={cn(
                  'shrink-0',
                  disabledNode
                    ? 'text-fg-5'
                    : state !== 'unchecked'
                      ? 'text-primary-5'
                      : 'text-fg-3',
                )}
                name={node.data.icon}
                size={14}
              />
            )}
            <span
              className={disabledNode ? 'flex-1 truncate' : 'flex-1 truncate cursor-pointer'}
              onClick={
                disabledNode
                  ? undefined
                  : (e) => {
                      e.stopPropagation();
                      toggle(node.id, state !== 'checked');
                    }
              }
            >
              {node.data.name}
            </span>
          </span>
        );
      },
      [multi, index, selectedSet, cascade, toggle, selectSingle],
    );

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          className={slots.trigger({ class: className })}
          disabled={disabled}
        >
          <DropdownTreeSelectValue
            clearable={clearable}
            labels={labels}
            maxDisplay={maxDisplay}
            multi={multi}
            placeholder={placeholder}
            onClear={clearAll}
            onRemove={(id) => toggle(id, false)}
          />
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align={align}
            className={slots.content({ class: contentClassName })}
            side={side}
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownTreeSelectPanel
              data={data}
              defaultOpenIds={defaultOpenIds}
              expandDisabled={expandDisabled}
              headerClassName={slots.header()}
              iconBtnClassName={slots.iconBtn()}
              multi={multi}
              openByDefault={openByDefault}
              renderNode={renderNode}
              renderTrailing={renderTrailing}
              search={search}
              searchable={searchable}
              searchDebounceMs={searchDebounceMs}
              searchInputClassName={slots.searchInput()}
              selectedIds={selectedIds}
              treeHeight={treeHeight}
              onSearch={setSearch}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  },
);

DropdownTreeSelect.displayName = 'DropdownTreeSelect';

export default DropdownTreeSelect;
