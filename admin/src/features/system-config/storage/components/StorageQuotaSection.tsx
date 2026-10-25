import { memo, useCallback, type ReactNode } from 'react';

import { useAuthStore } from '@/app/store';
import { Skeleton } from '@/shared/ui';

import ConfigGroupList from '../../components/ConfigGroupList';
import { useSystemConfigList } from '../../service/system-config.queries';
import { RESOURCE_CONFIG_KEY } from '../constants/quota-overrides.constants';
import QuotaOverridesCard from './QuotaOverridesCard';

/**
 * Nhóm "Kho tài liệu" của tab Lưu trữ (p3-01 admin.md §2.2):
 *  - hạn mức mặc định / nhóm + số ngày giữ thùng rác — thẻ nhóm sinh từ registry (`limits.resource`, tab `storage`);
 *  - hạn mức riêng theo nhóm (`resource.quotaOverrides`, field `json`) — trình sửa riêng.
 * Lưu qua hộp thoại lý do + `expectedVersion` + audit như mọi tab. Không có nhóm nào khai trong registry
 * (BE cũ) thì không hiện gì. Công tắc "chuyển Office → PDF" và "đuôi tệp mã nguồn" (admin.md §2.2, P1) CHƯA có
 * trong registry BE nên chưa có ô nhập.
 */
const StorageQuotaSection = memo(function StorageQuotaSection() {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const { data, isLoading, isError, refetch } = useSystemConfigList();
  const resource = data?.find((i) => i.key === RESOURCE_CONFIG_KEY);

  const reload = useCallback(
    async (key: string) => (await refetch()).data?.find((i) => i.key === key),
    [refetch],
  );

  // Lỗi tải danh sách đã có thông báo (kèm "Thử lại") ở `ConfigGroupList` — không lặp lại ở đây.
  let overridesCard: ReactNode = null;
  if (isLoading) overridesCard = <Skeleton className="h-32 w-full" />;
  else if (!isError && resource) {
    overridesCard = <QuotaOverridesCard canEdit={canEdit} item={resource} onReload={reload} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ConfigGroupList hideWhenEmpty tab="storage" tabLabel="lưu trữ" />
      {overridesCard}
    </div>
  );
});

export default StorageQuotaSection;
