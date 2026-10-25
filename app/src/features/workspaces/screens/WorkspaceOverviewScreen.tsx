import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useUnreadSummary } from '@/shell/notifications';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { WorkspaceListItem } from '../api';
import { ArchivedBanner } from '../components/ArchivedBanner';
import { GuestAccessBanner } from '../components/GuestAccessBanner';
import { OnboardingChecklist } from '../components/OnboardingChecklist';
import { WorkspaceHeaderActions } from '../components/WorkspaceHeaderActions';
import { WorkspaceHubCard } from '../components/WorkspaceHubCard';
import { WorkspaceLoadError } from '../components/WorkspaceLoadError';
import { WorkspaceOverviewHero } from '../components/WorkspaceOverviewHero';
import { WorkspaceOverviewSkeleton } from '../components/WorkspaceOverviewSkeleton';
import { useOnboardingChecklist } from '../hooks/useOnboardingChecklist';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { useWorkspaceHubEntries } from '../hooks/useWorkspaceHubEntries';
import { workspaceKeys } from '../queries/workspaces.keys';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { isWorkspaceGone } from '../utils/workspace-errors';

/** Tên nhóm đã có trong cache danh sách (đang hoạt động / đã lưu trữ) — `undefined` khi chưa từng tải danh sách. */
function cachedWorkspaceName(queryClient: QueryClient, wsId: string): string | undefined {
  for (const status of ['ACTIVE', 'ARCHIVED'] as const) {
    const list = queryClient.getQueryData<WorkspaceListItem[]>(workspaceKeys.list(status));
    const name = list?.find((item) => item.id === wsId)?.name;
    if (name) return name;
  }
  return undefined;
}

/**
 * Tổng quan nhóm (app.md p1-01 §3), hai khu vực cách nhau 24dp:
 *  1. Danh tính — cảnh báo (đã lưu trữ/khách), ảnh bìa + avatar + tên + vai trò · số thành viên + mô tả + "Mời thành viên"
 *     (OWNER/ADMIN, `WorkspaceOverviewHero`), checklist nhóm mới.
 *  2. Lối vào — khung "Lối vào nhanh": lưới ô cho nơi mở hằng ngày + danh sách gọn cho công cụ còn lại (`WorkspaceHubCard`),
 *     rồi các mục phân hệ khác do route ghép (`extraSections`).
 *
 * ⚠️ Lỗi tải: CHỈ thay cả màn bằng khối lỗi khi CHƯA có dữ liệu, hoặc lỗi nói nhóm đã mất (403/404, `isWorkspaceGone`). Đã có
 * dữ liệu mà lượt tải lại hỏng vì mạng/5xx (kéo-để-làm-mới khi mất sóng, tải lại lúc quay về màn) thì GIỮ nội dung đang có —
 * `client.ts` đã toast lỗi; trước đây `isError` của lượt tải lại thay cả màn bằng "Mất kết nối" dù cache còn nguyên
 * (app.md §3 cột Offline: "Cache phiên").
 *
 * "Cần phản hồi"/"Nhóm chat gần đây" vẫn phụ thuộc contributor của p1-05/p1-07 — chưa module nào đăng ký nên BE trả `null`.
 * ⛔ Màn KHÔNG vẽ khối giữ chỗ cho chúng (từng có thẻ "sẽ hiện ở đây khi p1-05 hoàn thành" trống rỗng vĩnh viễn): thêm lại khi
 * có dữ liệu thật (be.md §5.7 — không vẽ ô rỗng).
 */
export interface WorkspaceOverviewScreenProps {
  /**
   * Mục của phân hệ KHÁC (Tài liệu, Việc…) do FILE ROUTE truyền vào — feature
   * `workspaces` không import chéo `resources`/`boards` (feature-structure.md), nên
   * tầng route là nơi ghép. Mỗi mục tự ẩn theo cờ phân hệ và vai trò (GUEST).
   */
  extraSections?: ReactNode;
  /**
   * Banner của phân hệ KHÁC chỉ dành cho KHÁCH (GUEST) — vẽ NGAY dưới `GuestAccessBanner`, và CHỈ khi người xem là khách, nên component
   * truyền vào không tốn request nào với thành viên thường (vd `MentorGuestBanner` của p6-03: cố vấn là khách của nhóm). Cùng lý do
   * `extraSections`: `workspaces` không import chéo feature, tầng route ghép.
   */
  guestBanners?: ReactNode;
}

export function WorkspaceOverviewScreen({ extraSections, guestBanners }: WorkspaceOverviewScreenProps = {}) {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const queryClient = useQueryClient();
  const { data, error, isLoading, isStale, refetch } = useWorkspaceOverview(wsId);
  // Gốc stack của nhóm: tổng quan gom số liệu của nhiều phân hệ (thành viên, bảng, tài liệu…) — quay lại là tải lại nếu đã cũ.
  useRefetchOnFocus({ isStale, refetch });
  // ⚠️ Vòng quay CHỈ cho lượt NGƯỜI DÙNG kéo, ⛔ không `refreshing={isRefetching}`: lượt tải nền (quay lại màn sau 10 s,
  // socket `workspace:updated`/`member:updated` invalidate `overview`) từng tự bật vòng quay ở đầu màn dù không ai kéo.
  const pull = usePullRefresh(refetch);
  // Gọi TRƯỚC các `return` sớm bên dưới (Rules of Hooks) — `data` lúc đầu còn `undefined`.
  const onboarding = useOnboardingChecklist(data?.workspace, data?.memberCount ?? 0);
  // Cùng nguồn với huy hiệu tab "Nhóm" (`useTabBadges`) — dòng "Kênh" ở tổng quan biết trước có tin mới mà không phải mở kênh ra xem.
  const { data: unreadSummary } = useUnreadSummary();
  const channelsUnread = unreadSummary?.workspaces.find((ws) => ws.workspaceId === wsId)?.unreadChannels;
  const hubEntries = useWorkspaceHubEntries({
    channelsUnread,
    memberCount: data?.memberCount ?? 0,
    role: data?.workspace.myRole ?? 'MEMBER',
    wsId,
  });

  // ✅ Tên nhóm cho `AppBar` NGAY từ lúc mở: vào từ danh sách nhóm thì tên đã nằm trong cache danh sách (cùng feature) — chỉ
  // ĐỌC cache, không gọi mạng. ⛔ Không có bước "Nhóm" → tên: tiêu đề đổi chữ dưới mắt người dùng lúc dữ liệu về là giật.
  // Mở thẳng bằng link/thông báo (cache trống) thì mới rơi về "Nhóm".
  const title = data?.workspace.name ?? cachedWorkspaceName(queryClient, wsId) ?? 'Nhóm';

  if (isLoading) {
    return (
      <Screen header={<AppBar title={title} onBack={router.back} />}>
        {/* Khung xương CÙNG HÌNH với nội dung thật (bìa đúng tỉ lệ, avatar đè mép bìa, khung lối vào). */}
        <View className="py-xs">
          <WorkspaceOverviewSkeleton />
        </View>
      </Screen>
    );
  }

  if (!data || isWorkspaceGone(error)) {
    return (
      <Screen header={<AppBar title={title} onBack={router.back} />}>
        <WorkspaceLoadError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const { workspace } = data;
  const isArchived = workspace.status === 'ARCHIVED';
  const isGuest = workspace.myRole === 'GUEST';
  // "Mời thành viên" ở đầu trang: màn đích (quản lý link mời) chỉ dành cho OWNER/ADMIN — BE trả 403 cho vai thấp hơn; nhóm đã
  // lưu trữ thì không mời được (ArchivedBanner đã nói). Chỉ để HIỂN THỊ, hàng rào thật là BE.
  const canInvite =
    (workspace.myRole === 'OWNER' || workspace.myRole === 'ADMIN') &&
    workspace.myPermissions.canInvite &&
    !isArchived;

  return (
    <Screen
      header={
        <AppBar
          actions={<WorkspaceHeaderActions wsId={wsId} />}
          title={title}
          onBack={router.back}
        />
      }
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
    >
      {/* 24dp giữa hai KHU VỰC (danh tính ↔ lối vào); 16dp giữa các khối trong cùng khu vực. */}
      <View className="gap-xl py-xs">
        <View className="gap-md">
          {isArchived ? <ArchivedBanner reason={workspace.archivedReason} /> : null}

          <GuestAccessBanner wsId={wsId} />

          {isGuest ? guestBanners : null}

          {/* Khối cố định của màn hiện dần lần lượt (`Reveal`, tự tắt khi bật "Giảm chuyển động"); cảnh báo phía trên thì
              hiện ngay — thông tin cần đọc trước, không chờ hiệu ứng. */}
          <Reveal>
            <WorkspaceOverviewHero
              memberCount={isGuest ? undefined : data.memberCount}
              workspace={workspace}
              wsId={wsId}
              onInvite={
                canInvite
                  ? () => router.push({ pathname: '/workspaces/[wsId]/invite', params: { wsId } })
                  : undefined
              }
            />
          </Reveal>

          {onboarding.visible ? (
            <Reveal index={1}>
              <OnboardingChecklist steps={onboarding.steps} onDismiss={onboarding.dismiss} onStepPress={onboarding.openStep} />
            </Reveal>
          ) : null}
        </View>

        <View className="gap-md">
          <Reveal index={2}>
            <WorkspaceHubCard entries={hubEntries} />
          </Reveal>
          {/* ⚠️ `gap-md` trên CHÍNH `Reveal`: route truyền một fragment nhiều thẻ (Tài liệu · Việc · Học · Kiểm duyệt) — bọc
              vào một khối là các thẻ thành con của khối đó, mất khe 16 của cột cha nếu khối không tự có `gap`. */}
          {extraSections ? (
            <Reveal className="gap-md" index={3}>
              {extraSections}
            </Reveal>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
