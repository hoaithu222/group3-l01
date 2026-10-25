import { memo, useMemo, useState } from 'react';

import { useWorkspaceOptionSearch } from '@/features/workspace';
import type { WorkspaceOption } from '@/features/workspace';
import { useDebounce, useDisclosure, useImeSafeSearchInput } from '@/shared/hooks';
import { Button, Input, Popover, Spinner, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

export interface WorkspacePickerProps {
  /** Workspace đang chọn — `null` = chưa chọn (hoặc "tất cả" khi có `allLabel`). */
  value: WorkspaceOption | null;
  /** `null` chỉ xảy ra khi có `allLabel` (bấm dòng "bỏ chọn"). */
  onChange: (next: WorkspaceOption | null) => void;
  /**
   * Có ⇒ thêm dòng đầu "bỏ chọn" mang nhãn này (vd "Toàn hệ thống") và dùng nó làm nhãn của nút khi chưa chọn nhóm
   * nào — dùng cho BỘ LỌC. Bỏ trống ⇒ phải chọn một nhóm (vd bảng xếp hạng cần một nhóm cụ thể).
   */
  allLabel?: string;
  /** Nhãn của nút khi chưa chọn và không có `allLabel`. Mặc định "Chọn workspace". */
  placeholder?: string;
}

/**
 * Ô chọn workspace dùng chung (bảng xếp hạng gamification, bộ lọc lưu trữ của cấu hình hệ thống): nút mở hộp gợi ý có
 * ô tìm IME-safe (uncontrolled + debounce) gọi `GET /admin/workspaces?q=` phía SERVER, kèm "Tải thêm" theo trang — danh
 * bạ có thể rất lớn nên KHÔNG tải một trang đầu rồi lọc tại chỗ. Gợi ý chỉ được tải khi hộp đang mở.
 *
 * Trước đây là hai bản gần y hệt (`WorkspacePicker` của gamification, `StorageWorkspaceFilter` của cấu hình) — bản sau
 * chỉ có 8 nhóm đầu và không có "Tải thêm". Nay một component, một truy vấn (`useWorkspaceOptionSearch`).
 * Cần quyền `workspace:view` — nơi dùng tự ẩn/giải thích khi thiếu, component này không kiểm quyền.
 */
const WorkspacePicker = memo(function WorkspacePicker({
  value,
  onChange,
  allLabel,
  placeholder = 'Chọn workspace',
}: WorkspacePickerProps) {
  const { close, isOpen, open } = useDisclosure();
  const [query, setQuery] = useState('');
  const { inputProps } = useImeSafeSearchInput(query, setQuery);
  const debounced = useDebounce(query.trim(), 300);
  const { data, isFetching, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useWorkspaceOptionSearch(debounced, isOpen);
  const options = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const pick = (next: WorkspaceOption | null) => {
    onChange(next);
    close();
  };

  return (
    <Popover
      align="start"
      content={
        <div className="flex w-72 flex-col gap-2 p-2">
          <Input
            {...inputProps}
            aria-label="Tìm workspace theo tên"
            placeholder="Tìm workspace theo tên…"
            size="sm"
          />
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {allLabel && (
              <Button className="justify-start" size="sm" variant="ghost" onClick={() => pick(null)}>
                {allLabel}
              </Button>
            )}
            {options.map((o) => (
              <Button
                key={o.id}
                className="justify-start"
                size="sm"
                variant="ghost"
                onClick={() => pick(o)}
              >
                <span className="truncate">{o.name}</span>
              </Button>
            ))}
            {hasNextPage && (
              <Button
                className="justify-start"
                disabled={isFetchingNextPage}
                size="sm"
                variant="stroke"
                onClick={() => void fetchNextPage()}
              >
                Tải thêm
              </Button>
            )}
            {isFetching && <Spinner size="sm" />}
            {!isFetching && isError && (
              <Text className="px-2 py-1" size="tiny" skin="muted">
                Không tải được danh sách workspace (cần quyền xem workspace).
              </Text>
            )}
            {!isFetching && !isError && options.length === 0 && (
              <Text className="px-2 py-1" size="tiny" skin="muted">
                Không có workspace nào khớp.
              </Text>
            )}
          </div>
        </div>
      }
      open={isOpen}
      onOpenChange={(next) => (next ? open() : close())}
    >
      <Button
        endIcon={<SystemIcon name="angle-down-outline" size={14} />}
        size="sm"
        startIcon={<SystemIcon name="building-outline" size={16} />}
        variant="stroke"
      >
        {value ? value.name : (allLabel ?? placeholder)}
      </Button>
    </Popover>
  );
});

export default WorkspacePicker;
