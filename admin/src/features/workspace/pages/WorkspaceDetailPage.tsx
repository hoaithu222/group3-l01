import { memo } from 'react';
import { useMatches, useNavigate, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';
import { EmptyState, PageBody, PageShell, Skeleton, Tabs } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import WorkspaceChannelsTab from '../components/tabs/WorkspaceChannelsTab';
import WorkspaceConversationsTab from '../components/tabs/WorkspaceConversationsTab';
import WorkspaceGatedTab from '../components/tabs/WorkspaceGatedTab';
import WorkspaceIntegrationsTab from '../components/tabs/WorkspaceIntegrationsTab';
import WorkspaceMediaStatsTab from '../components/tabs/WorkspaceMediaStatsTab';
import WorkspaceMeetingsTab from '../components/tabs/WorkspaceMeetingsTab';
import WorkspaceMembersTab from '../components/tabs/WorkspaceMembersTab';
import WorkspaceMentorTab from '../components/tabs/WorkspaceMentorTab';
import WorkspaceProjectsTab from '../components/tabs/WorkspaceProjectsTab';
import WorkspaceRecordingsTab from '../components/tabs/WorkspaceRecordingsTab';
import WorkspaceReportsTab from '../components/tabs/WorkspaceReportsTab';
import WorkspaceResourcesTab from '../components/tabs/WorkspaceResourcesTab';
import WorkspaceWalletTab from '../components/tabs/WorkspaceWalletTab';
import WorkspaceLoadError from '../components/WorkspaceLoadError';
import WorkspaceOverviewTab from '../components/WorkspaceOverviewTab';
import { COMING_SOON, FALLBACK_LIST_PATH } from '../constants/workspace-tabs.constants';
import { useWorkspaceTabs } from '../hooks';
import { useAdminWorkspace } from '../service/workspace.queries';

/**
 * Chi tiết workspace (admin.md p1-01 §2.2): module này dựng khung tab + tab `overview`; tab khác thuộc module riêng (component ở `components/tabs/`, cờ hiện/ẩn
 * ở `useWorkspaceTabs`): `members` p1-02, `channels` p1-03, `conversations` p1-05, `reports` p1-08 (hàng đợi `@/features/moderation`, cần `moderation:view`),
 * `meetings` p2-04 (cờ `meeting` + `workspace:view`), `recordings` p2-06 + `media` p2-07 (số liệu gọi & họp; cờ `meeting` + `meeting:view`), `resources`/
 * `projects` p3-01/p3-02 (cờ `project`), `integrations` p5-03 (cờ `integration` + `integration:view`), `mentor` p6-03, `wallet` p6-04 (cờ cùng tên). Khách/lời
 * mời/yêu cầu tham gia (p3-04) KHÔNG có tab riêng (ở `overview`, `members`, `channels`). Tab chưa có nhánh → "sắp có" (`COMING_SOON`): chỉ thêm nhánh mới.
 *
 * Tên workspace + nút quay lại nằm trên THANH HEADER (`<PageHeader>`); dải 12 tab quá dài cho header nên ở lại thân trang.
 */
const WorkspaceDetailPage = memo(function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const matches = useMatches();
  const qp = useQueryParams({ tabKey: 'tab' });
  const tab = qp.tab || 'overview';

  const { data, isLoading, isError, error, refetch } = useAdminWorkspace(id);
  const {
    tabs,
    capabilitiesPending,
    showIntegrationsTab,
    showMediaTab,
    showMeetingTab,
    showMentorTab,
    showRecordingTab,
    showProjectTabs,
    showWalletTab,
  } = useWorkspaceTabs();

  const modulePath =
    matches
      .map((match) => (match.handle as RouteHandle | undefined)?.modulePath)
      .reverse()
      .find(Boolean) ?? FALLBACK_LIST_PATH;
  const title = data?.data.workspace.name ?? 'Chi tiết workspace';

  return (
    <PageShell>
      <PageHeader
        backHref={modulePath}
        backLabel="Về danh sách workspace"
        title={title}
        titleSize="sm"
        tone="teal"
        onBack={() => navigate(modulePath)}
      />
      <PageBody overflow="scroll">
        <Tabs options={tabs} size="sm" value={tab} onValueChange={qp.setTab} />
        {/* MỘT khung `mt-3` chung cho mọi nhánh (tải · lỗi · rỗng · từng tab) — khe dưới dải tab đồng nhất. */}
        <div className="mt-3">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : isError && !data ? (
            // 404/403 → "không có / không được xem" (không nút); mất mạng, 5xx → lỗi tạm thời có "Thử lại".
            <WorkspaceLoadError
              error={error}
              title="Không tải được workspace"
              onRetry={() => void refetch()}
            />
          ) : !data ? (
            <EmptyState description="Không tìm thấy workspace này." title="Không tải được" />
          ) : tab === 'overview' ? (
            <WorkspaceOverviewTab detail={data.data} />
          ) : tab === 'members' ? (
            <WorkspaceMembersTab workspaceId={data.data.workspace.id} />
          ) : tab === 'channels' ? (
            <WorkspaceChannelsTab workspaceId={data.data.workspace.id} />
          ) : tab === 'conversations' ? (
            <WorkspaceConversationsTab workspaceId={data.data.workspace.id} />
          ) : tab === 'reports' ? (
            <WorkspaceReportsTab workspaceId={data.data.workspace.id} />
          ) : tab === 'meetings' ? (
            <WorkspaceGatedTab
              description="Lịch họp đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem thông tin này."
              enabled={showMeetingTab}
              icon="calendar-bold"
              pending={capabilitiesPending}
              title="Danh sách cuộc họp không khả dụng"
            >
              <WorkspaceMeetingsTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : tab === 'recordings' ? (
            // Cùng chỗ nhưng gate KHÁC tab họp: BE chặn `/admin/recordings*` bằng `meeting:view`.
            <WorkspaceGatedTab
              description="Lịch họp đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem bản ghi hình (cần quyền xem cuộc họp)."
              enabled={showRecordingTab}
              icon="calendar-bold"
              pending={capabilitiesPending}
              title="Danh sách ghi hình không khả dụng"
            >
              <WorkspaceRecordingsTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : tab === 'resources' || tab === 'projects' ? (
            <WorkspaceGatedTab
              description="Phân hệ dự án và tài liệu đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem số liệu này."
              enabled={showProjectTabs}
              icon="folder-bold"
              pending={capabilitiesPending}
              title="Số liệu dự án và tài liệu không khả dụng"
            >
              {tab === 'resources' ? (
                <WorkspaceResourcesTab workspaceId={data.data.workspace.id} />
              ) : (
                <WorkspaceProjectsTab workspaceId={data.data.workspace.id} />
              )}
            </WorkspaceGatedTab>
          ) : tab === 'wallet' ? (
            <WorkspaceGatedTab
              description="Ví nhóm đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem thống kê này."
              enabled={showWalletTab}
              icon="wallet-bold"
              pending={capabilitiesPending}
              title="Thống kê ví không khả dụng"
            >
              <WorkspaceWalletTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : tab === 'media' ? (
            <WorkspaceGatedTab
              description="Phân hệ họp đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem số liệu gọi & họp."
              enabled={showMediaTab}
              icon="phone-bold"
              pending={capabilitiesPending}
              title="Số liệu gọi & họp không khả dụng"
            >
              <WorkspaceMediaStatsTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : tab === 'integrations' ? (
            <WorkspaceGatedTab
              description="Phân hệ tích hợp đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem các kết nối này."
              enabled={showIntegrationsTab}
              icon="link-bold"
              pending={capabilitiesPending}
              title="Danh sách tích hợp không khả dụng"
            >
              <WorkspaceIntegrationsTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : tab === 'mentor' ? (
            <WorkspaceGatedTab
              description="Phân hệ cố vấn đang tắt trên hệ thống hoặc tài khoản của bạn không có quyền xem thông tin này."
              enabled={showMentorTab}
              icon="user-check-bold"
              pending={capabilitiesPending}
              title="Dữ liệu cố vấn không khả dụng"
            >
              <WorkspaceMentorTab workspaceId={data.data.workspace.id} />
            </WorkspaceGatedTab>
          ) : (
            <EmptyState
              description={`Hoàn thiện ở ${COMING_SOON[tab] ?? 'module sau'}.`}
              title="Sắp có"
            />
          )}
        </div>
      </PageBody>
    </PageShell>
  );
});

export default WorkspaceDetailPage;
