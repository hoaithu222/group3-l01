import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { PATHS } from '@/shell/config';
import { useUnreadSummary } from '@/shell/notifications';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { WorkspaceListItem } from '../api';
import { WorkspaceListBody } from '../components/WorkspaceListBody';
import { WorkspaceListEmpty } from '../components/WorkspaceListEmpty';
import { WorkspaceListError } from '../components/WorkspaceListError';
import { WorkspaceListSkeleton } from '../components/WorkspaceListSkeleton';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { useWorkspaceSocket } from '../hooks/useWorkspaceSocket';
import { useWorkspaces } from '../queries/workspaces.queries';
import { withWorkspaceUnread } from '../utils/workspace-list-unread';

export interface WorkspaceListScreenProps {
  /**
   * Khe cho dải "lời mời đang chờ bạn" (p3-04 `GET /me/invitations`) — dữ liệu thuộc feature `members`, mà `workspaces` không
   * import chéo (feature-structure.md) ⇒ FILE ROUTE ghép, cùng mẫu `renderTemplateStep` của `CreateWorkspaceScreen`. Không
   * truyền = không vẽ gì. Đứng ĐẦU màn ở mọi trạng thái (kể cả "Chưa có nhóm nào": lời mời chính là đường vào nhóm đầu tiên).
   */
  invitationsBanner?: ReactNode;
}

const openJoin = () => router.push(PATHS.WORKSPACES_JOIN);
const openScan = () => router.push(PATHS.WORKSPACES_SCAN);
const openCreate = () => router.push(PATHS.WORKSPACES_NEW);

function openWorkspace(workspace: WorkspaceListItem): void {
  // p3-04: đang CHỜ DUYỆT thì chưa đọc được nhóm — mở màn chờ, không phải tổng quan nhóm.
  if (workspace.status === 'PENDING') {
    router.push({ pathname: '/workspaces/pending', params: { wsId: workspace.id } });
    return;
  }
  router.push({ pathname: '/workspaces/[wsId]', params: { wsId: workspace.id } });
}

/**
 * "Nhóm" — danh sách workspace của tôi (app.md p1-01 §3), dạng LƯỚI THẺ kiểu Google Classroom (bìa màu + avatar đè mép) với
 * tín hiệu chưa đọc kiểu Slack/Teams; 1 · 2 · 3 cột theo bậc màn (`WorkspaceGrid`). Kích cỡ trần
 * `LIMITS.workspace.perUserMax = 50` nên danh sách chưa cần ảo hoá (FlashList) — cùng lựa chọn với `SessionsScreen`.
 *
 * Bốn trạng thái: đang tải (khung xương CÙNG khuôn) · lỗi khi CHƯA có bản nào (`WorkspaceListError`: mất kết nối ≠ lỗi máy
 * chủ) · "Chưa có nhóm nào" (hai lối vào) · danh sách (`WorkspaceListBody` — lỗi tải lại chỉ báo một dòng, GIỮ danh sách cũ).
 *
 * ⚠️ `constrained={false}` (+ `contentClassName` của AppBar): lưới thẻ cần HẾT bề ngang máy tính bảng — trần 720dp mặc định
 * ép lưới của máy 1280dp vào một cột hẹp giữa hai dải trống. Khối chữ/nút tự chặn lại ở CÙNG trần đó (`tablet:max-w-content`).
 */
export function WorkspaceListScreen({ invitationsBanner }: WorkspaceListScreenProps = {}) {
  const { data, error, isError, isLoading, isStale, refetch } = useWorkspaces('ACTIVE');
  useWorkspaceSocket();
  // Gốc tab "Nhóm" giữ mounted: quay lại từ màn trong nhóm/tab khác mà danh sách đã cũ ⇒ tải lại (vai trò, lời mời vừa nhận…).
  useRefetchOnFocus({ isStale, refetch });
  // Vòng quay CHỈ khi người dùng kéo — tải ngầm (focus, socket) không vẽ vòng đè lên thẻ đầu (xem `usePullRefresh`).
  const pull = usePullRefresh(refetch);
  // Huy hiệu chưa đọc SỐNG (cùng nguồn `useTabBadges` của bottom nav) — `GET /workspaces` chỉ có số lúc tải trang,
  // không có socket nào báo riêng cho tab "Nhóm" (xem JSDoc `withWorkspaceUnread`).
  const { data: unreadSummary } = useUnreadSummary();
  const items = useMemo(
    () => (data ? withWorkspaceUnread(data, unreadSummary) : []),
    [data, unreadSummary],
  );

  return (
    <Screen
      constrained={false}
      header={
        <AppBar
          actions={
            // AppBar chỉ có HAI khe: việc CHÍNH "Tạo nhóm" (cùng icon `add` với "Tạo kênh") là một icon đứng yên khi cuộn; các lối
            // vào còn lại gom vào menu "⋯" (đầu danh sách có thêm hai nút phụ nhìn thấy được — `WorkspaceListHeader`). Điều hướng
            // bằng ĐƯỜNG DẪN: các màn đích nằm ở feature `members`, feature này không import chéo.
            <View className="flex-row items-center gap-2xs">
              <Button
                accessibilityLabel="Tạo nhóm"
                iconLeft="add"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={openCreate}
              />
              <ActionMenu
                accessibilityLabel="Thêm tuỳ chọn cho danh sách nhóm"
                items={[
                  {
                    description: 'Dán link hoặc nhập mã mời',
                    icon: 'link',
                    key: 'join',
                    label: 'Tham gia nhóm',
                    onPress: openJoin,
                  },
                  {
                    description: 'Quét mã QR trên link mời',
                    icon: 'qr',
                    key: 'scan',
                    label: 'Quét mã QR',
                    onPress: openScan,
                  },
                  {
                    // p3-04: lời mời email gửi tới tài khoản này (`GET /me/invitations`) — chấp nhận không cần mở lại thư.
                    description: 'Lời mời gửi tới email của bạn',
                    icon: 'email',
                    key: 'invitations',
                    label: 'Lời mời của tôi',
                    onPress: () => router.push({ pathname: '/workspaces/invitations' }),
                  },
                ]}
              />
            </View>
          }
          contentClassName="tablet:max-w-none"
          title="Nhóm"
        />
      }
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
    >
      <View className="gap-md py-xs">
        {invitationsBanner}

        {isLoading ? (
          // Cùng khuôn màn thật (hàng nút + ô tìm + lưới thẻ cùng tỉ lệ bìa) để danh sách không nhảy lúc dữ liệu về.
          <WorkspaceListSkeleton />
        ) : !data ? (
          <WorkspaceListError error={error} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <WorkspaceListEmpty onCreate={openCreate} onJoin={openJoin} />
        ) : (
          <WorkspaceListBody
            items={items}
            refreshError={isError ? error : null}
            onJoin={openJoin}
            onOpen={openWorkspace}
            onRetry={() => void refetch()}
            onScan={openScan}
          />
        )}
      </View>
    </Screen>
  );
}
