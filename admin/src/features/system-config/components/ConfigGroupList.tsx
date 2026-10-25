import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import { useSystemConfigList } from '../service/system-config.queries';
import type { ConfigTabId } from '../types/system-config.types';
import { editableFields } from '../utils/config-form';
import ConfigGroupCard from './ConfigGroupCard';

export interface ConfigGroupListProps {
  /** Tab của khoá registry (`SystemConfigItem.tab`) — chỉ hiện các khoá thuộc tab này. */
  tab: ConfigTabId;
  /** Tên tab trong thông báo lỗi ("giới hạn", "thông báo"…). */
  tabLabel: string;
  /** Bật: không có khoá nào ⇒ không hiện gì (thay vì `EmptyState`) — cho tab có nội dung khác. */
  hideWhenEmpty?: boolean;
  /** Khoá registry đã có thẻ riêng ở tab (vd `pm.review`) — bỏ khỏi danh sách để không hiện hai thẻ cho một khoá. */
  excludeKeys?: readonly string[];
}

/**
 * Danh sách `ConfigGroupCard` cho MỌI khoá registry thuộc một tab, sắp theo nhãn.
 * Danh sách khoá + metadata (floor/ceil/mặc định/options) lấy nguyên từ BE nên
 * thêm nhóm ở registry BE là tab tự có thêm thẻ. Khoá không có field sửa được
 * (`fields: []`, hoặc chỉ `json`) bị bỏ qua.
 */
const ConfigGroupList = memo(function ConfigGroupList({
  tab,
  tabLabel,
  hideWhenEmpty = false,
  excludeKeys,
}: ConfigGroupListProps) {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const { data, isLoading, isError, refetch } = useSystemConfigList();

  const items = useMemo(
    () =>
      (data ?? [])
        .filter(
          (i) => i.tab === tab && !excludeKeys?.includes(i.key) && editableFields(i).length > 0,
        )
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [data, tab, excludeKeys],
  );

  const reload = useCallback(
    async (key: string) => (await refetch()).data?.find((i) => i.key === key),
    [refetch],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title={`Không tải được cấu hình ${tabLabel}`}
      />
    );
  }

  if (items.length === 0) {
    return hideWhenEmpty ? null : (
      <EmptyState
        description={`Hệ thống chưa khai báo nhóm ${tabLabel} nào.`}
        title="Chưa có cấu hình"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <ConfigGroupCard key={item.key} canEdit={canEdit} item={item} onReload={reload} />
      ))}
    </div>
  );
});

export default ConfigGroupList;
