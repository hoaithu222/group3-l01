import { memo, useRef } from 'react';
import type { NodeApi } from 'react-arborist';
import Input from '@/shared/ui/inputs/Input';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Tree, { type TreeNodeData, type TreeHandle } from '@/shared/ui/data-display/Tree';
import { useDebounce, useImeSafeSearchInput } from '@/shared/hooks';

/**
 * DropdownTreeSelectPanel — popover panel body: search + expand/collapse
 * toolbar and the `Tree`. Owns its own `Tree` ref for the toolbar buttons.
 */
interface DropdownTreeSelectPanelProps {
  data: TreeNodeData[];
  treeHeight: number;
  searchable: boolean;
  search: string;
  onSearch: (value: string) => void;
  multi: boolean;
  selectedIds?: string[];
  renderNode: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  /** Nội dung căn phải mỗi row (số mục, badge…) — chuyển thẳng xuống `Tree`. */
  renderTrailing?: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  /** Cho phép mở/đóng node `disabled` (vẫn chặn chọn) — xem `Tree.expandDisabled`. */
  expandDisabled?: boolean;
  headerClassName: string;
  searchInputClassName: string;
  iconBtnClassName: string;
  /** Mở toàn bộ node khi mount (giống Tree.openByDefault). Default false. */
  openByDefault?: boolean;
  /** Mở sẵn các node theo id khi mount (vd chỉ node gốc đầu tiên). */
  defaultOpenIds?: string[];
  /** Độ trễ debounce (ms) cho ô tìm kiếm. Default 300. */
  searchDebounceMs?: number;
}

const DropdownTreeSelectPanel = memo(
  ({
    data,
    treeHeight,
    searchable,
    search,
    onSearch,
    multi,
    selectedIds,
    renderNode,
    renderTrailing,
    expandDisabled,
    headerClassName,
    searchInputClassName,
    iconBtnClassName,
    openByDefault = false,
    defaultOpenIds,
    searchDebounceMs = 300,
  }: DropdownTreeSelectPanelProps) => {
    const treeRef = useRef<TreeHandle>(null);

    // Ô tìm kiếm uncontrolled — prop `debounce` của <Input> biến nó thành
    // controlled nội bộ, cắt ngang composition IME (mất dấu tiếng Việt).
    // Xem `docs/rules/ime-safe-input.md`.
    const { inputProps } = useImeSafeSearchInput(search, onSearch);
    // Giữ nguyên hành vi cũ: tree chỉ lọc sau khi ngừng gõ.
    const treeSearch = useDebounce(search, searchDebounceMs);

    return (
      <>
        <div className={headerClassName}>
          {searchable && (
            <Input
              {...inputProps}
              border="none"
              className={searchInputClassName}
              placeholder="Tìm kiếm..."
              size="sm"
              startIcon={
                <SystemIcon
                  className="text-fg-on-popup-muted"
                  name="magnifying-glass-outline"
                  size={14}
                />
              }
              wrapperClassName="h-auto flex-1 px-0"
            />
          )}
          <button
            aria-label="Mở rộng tất cả"
            className={iconBtnClassName}
            type="button"
            onClick={() => treeRef.current?.expandAll()}
          >
            <SystemIcon name="angle-down-outline" size={12} />
          </button>
          <button
            aria-label="Thu gọn tất cả"
            className={iconBtnClassName}
            type="button"
            onClick={() => treeRef.current?.collapseAll()}
          >
            <SystemIcon name="angle-up-outline" size={12} />
          </button>
        </div>

        <div className="px-2 py-1">
          <Tree
            ref={treeRef}
            data={data}
            defaultOpenIds={defaultOpenIds}
            emptyMessage="Không có dữ liệu"
            expandAll={openByDefault}
            expandDisabled={expandDisabled}
            height={treeHeight}
            openByDefault={openByDefault}
            renderNode={renderNode}
            renderTrailing={renderTrailing}
            searchTerm={treeSearch || undefined}
            selectedIds={multi ? undefined : selectedIds}
            selectionMode="single"
          />
        </div>
      </>
    );
  },
);

DropdownTreeSelectPanel.displayName = 'DropdownTreeSelectPanel';

export default DropdownTreeSelectPanel;
