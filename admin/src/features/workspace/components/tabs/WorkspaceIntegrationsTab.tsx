import type { AxiosError } from 'axios';
import { memo, useMemo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { useWorkspaceIntegrations } from '@/features/integration';
import type { AdminWorkspaceConnection } from '@/features/integration';
import { BoxPanel, Callout, EmptyState, Table } from '@/shared/ui';

import { INTEGRATION_FEATURE_OFF_CODE } from '../../constants/workspace-integrations.constants';
import { buildWorkspaceIntegrationColumns } from '../workspace-integration-table.columns';
import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceIntegrationsTabProps {
  workspaceId: string;
}

const rowKey = (c: AdminWorkspaceConnection) => c.id;

/**
 * Tab "Tích hợp" của `WorkspaceDetailPage` (p5-03 admin.md §2.4) — CHỈ ĐỌC các kết nối của nhóm (GitHub/GitLab/Figma/Google Calendar): nhà cung cấp,
 * tài khoản ngoài, trạng thái + lý do, kênh nhận (kênh riêng tư chỉ hiện "kênh riêng tư"), người kết nối, sự kiện cuối. KHÔNG có token/khoá/cấu hình
 * và không có nút sửa thay chủ nhóm — vận hành muốn xử lý thì liên hệ chủ nhóm (`/integration` có bảng kết nối lỗi + nhật ký).
 *
 * Cần cờ `integration` bật VÀ `integration:view` (BE chặn bằng quyền này, không phải `workspace:view`) — `WorkspaceDetailPage` ẩn tab khi thiếu.
 * Lỗi tải có trạng thái riêng, không vẽ bảng rỗng: 403/404 giải thích (không "Thử lại"), lỗi tạm thời có "Thử lại"; cờ tắt giữa chừng (404 `CFG_005`)
 * → "Tích hợp đang tắt".
 */
const WorkspaceIntegrationsTab = memo(function WorkspaceIntegrationsTab({
  workspaceId,
}: WorkspaceIntegrationsTabProps) {
  const { data, isLoading, error, refetch } = useWorkspaceIntegrations(workspaceId);
  const rows = data?.data;
  const columns = useMemo(() => buildWorkspaceIntegrationColumns(), []);

  let body;
  if (!rows && !isLoading) {
    const featureOff = error
      ? extractErrorCode(error as AxiosError) === INTEGRATION_FEATURE_OFF_CODE
      : false;
    body = featureOff ? (
      <EmptyState
        description="Phân hệ tích hợp đang tắt trên hệ thống nên chưa có dữ liệu."
        icon="link-bold"
        title="Tích hợp đang tắt"
      />
    ) : (
      <WorkspaceLoadError
        error={error}
        title="Không tải được danh sách tích hợp"
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = (
      <BoxPanel
        border="hairline"
        description={rows ? `${rows.length} kết nối` : undefined}
        title="Kết nối tích hợp của nhóm"
      >
        <Table
          columns={columns}
          data={rows ?? []}
          emptyMessage="Nhóm chưa kết nối tích hợp nào"
          loading={isLoading}
          pagination={false}
          rowKey={rowKey}
        />
      </BoxPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ xem. Trang quản trị không hiển thị token hay khoá kết nối, và không thấy tên kênh riêng tư."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {body}
    </div>
  );
});

export default WorkspaceIntegrationsTab;
