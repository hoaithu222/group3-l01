import { memo } from 'react';

import { Button, Callout, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  useCollabHealth,
  useCollabStats,
  useLargeDocuments,
} from '../service/collab-ops.queries';
import CleanupSnapshotsAction from './CleanupSnapshotsAction';
import CollabHealthPanel from './CollabHealthPanel';
import CollabStatsCards from './CollabStatsCards';
import LargeDocumentsTable from './LargeDocumentsTable';

/**
 * Tab "Soạn thảo cộng tác" của `integration` (admin.md p6-01 §2.1) — sức khoẻ service `collab/`, số liệu tức thời, top tài liệu lớn (CHỈ metadata) và
 * hành động dọn bản lưu tự động (`system-config:update`). Admin KHÔNG có trình soạn thảo và KHÔNG đọc nội dung tài liệu. Sức khoẻ/số liệu tự làm mới
 * 30 giây khi tab trình duyệt hiện. Chỉ hiện khi cờ `collab` bật (`IntegrationPage`); quyền xem `integration:view` do registry chặn.
 *
 * Tải sức khoẻ lỗi (mất mạng, BE 5xx) → Callout + "Thử lại", KHÔNG nhầm với "dịch vụ không phản hồi" (đó là trạng thái BE báo `down`).
 */
const CollabOpsTab = memo(function CollabOpsTab() {
  const health = useCollabHealth();
  const stats = useCollabStats();
  const large = useLargeDocuments();

  const refresh = () => {
    void health.refetch();
    void stats.refetch();
    void large.refetch();
  };

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ hiển thị số liệu vận hành và metadata: quản trị nền tảng không đọc nội dung tài liệu, và không thấy tiêu đề của tài liệu riêng tư."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />

      <Toolbar
        right={
          <>
            <CleanupSnapshotsAction />
            <Button
              loading={health.isFetching || stats.isFetching || large.isFetching}
              size="sm"
              startIcon={<SystemIcon name="arrows-rotate-outline" size={16} />}
              variant="ghost"
              onClick={refresh}
            >
              Làm mới
            </Button>
          </>
        }
      />

      {health.isError && !health.data && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void health.refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được trạng thái dịch vụ soạn thảo cộng tác"
        />
      )}

      <CollabHealthPanel health={health.data} loading={health.isLoading} />
      <CollabStatsCards stats={stats.data} />
      <LargeDocumentsTable isError={large.isError} loading={large.isLoading} rows={large.data} />
    </div>
  );
});

export default CollabOpsTab;
