import { memo, useMemo, useState } from 'react';

import { useDebounce, useDisclosure, useImeSafeSearchInput } from '@/shared/hooks';
import { Button, Input, Popover, Spinner, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { useOwnerOptionSearch } from '../service/workspace.queries';
import type { OwnerOption } from '../types/workspace.types';

export const ALL_OWNERS_LABEL = 'Mọi chủ sở hữu';

export interface WorkspaceOwnerFilterProps {
  /** `ownerId` đang lọc (đến từ URL); rỗng = không lọc. */
  ownerId: string;
  /**
   * Tên chủ sở hữu đang lọc để hiện trên nút — URL chỉ mang id nên tên suy từ hàng đã tải; chưa có (đang tải, hoặc
   * không hàng nào khớp) thì nút hiện phần cuối id.
   */
  ownerName?: string;
  /** `null` = bỏ lọc. */
  onChange: (next: OwnerOption | null) => void;
}

/**
 * Ô lọc CHỦ SỞ HỮU của danh bạ workspace (admin.md p1-01 §2.1 — "select người dùng có tìm"): nút mở hộp gợi ý có ô tìm
 * IME-safe (uncontrolled + debounce) gọi `GET /users?q=` phía SERVER, kèm "Tải thêm" — danh sách người dùng có thể rất
 * lớn nên KHÔNG tải một trang đầu rồi lọc tại chỗ. Cùng khuôn `WorkspacePicker`; gợi ý chỉ tải khi hộp đang mở.
 * Cần quyền `user:view` — nơi dùng tự ẩn ô này khi thiếu (link `?ownerId=` vẫn lọc được, chỉ không có hộp chọn).
 */
const WorkspaceOwnerFilter = memo(function WorkspaceOwnerFilter({
  ownerId,
  ownerName,
  onChange,
}: WorkspaceOwnerFilterProps) {
  const { close, isOpen, open } = useDisclosure();
  const [query, setQuery] = useState('');
  const { inputProps } = useImeSafeSearchInput(query, setQuery);
  const debounced = useDebounce(query.trim(), 300);
  const { data, isFetching, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useOwnerOptionSearch(debounced, isOpen);
  const options = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const pick = (next: OwnerOption | null) => {
    onChange(next);
    close();
  };

  const label = ownerId ? (ownerName ?? `Chủ sở hữu …${ownerId.slice(-6)}`) : ALL_OWNERS_LABEL;

  return (
    <Popover
      align="start"
      content={
        <div className="flex w-80 flex-col gap-2 p-2">
          <Input
            {...inputProps}
            aria-label="Tìm chủ sở hữu theo tên hoặc email"
            placeholder="Tìm theo tên hoặc email…"
            size="sm"
          />
          <div className="flex max-h-64 flex-col overflow-y-auto">
            <Button className="justify-start" size="sm" variant="ghost" onClick={() => pick(null)}>
              {ALL_OWNERS_LABEL}
            </Button>
            {options.map((o) => (
              <Button
                key={o.id}
                className="h-auto justify-start py-1"
                size="sm"
                variant="ghost"
                onClick={() => pick(o)}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="max-w-full truncate">{o.name}</span>
                  <Text className="max-w-full truncate" size="tiny" skin="muted">
                    {o.email}
                  </Text>
                </span>
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
                Không tải được danh sách người dùng (cần quyền xem người dùng).
              </Text>
            )}
            {!isFetching && !isError && options.length === 0 && (
              <Text className="px-2 py-1" size="tiny" skin="muted">
                Không có người dùng nào khớp.
              </Text>
            )}
          </div>
        </div>
      }
      open={isOpen}
      onOpenChange={(next) => (next ? open() : close())}
    >
      <Button
        aria-label={`Lọc theo chủ sở hữu: ${label}`}
        endIcon={<SystemIcon name="angle-down-outline" size={14} />}
        size="sm"
        startIcon={<SystemIcon name="user-outline" size={16} />}
        variant="stroke"
      >
        {label}
      </Button>
    </Popover>
  );
});

export default WorkspaceOwnerFilter;
