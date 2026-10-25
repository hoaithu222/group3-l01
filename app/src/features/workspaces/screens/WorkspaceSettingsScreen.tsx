import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { PATHS } from '@/shell/config';
import { useCapabilities } from '@/shell/capabilities';
import { useResyncForm } from '@/shared/form/useResyncForm';
import { useZodForm } from '@/shared/form/useZodForm';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { WorkspaceDetail } from '../api';
import { ArchivedBanner } from '../components/ArchivedBanner';
import { WorkspaceAdminLinksCard } from '../components/WorkspaceAdminLinksCard';
import { WorkspaceDangerZoneCard } from '../components/WorkspaceDangerZoneCard';
import { WorkspaceDetailsCard } from '../components/WorkspaceDetailsCard';
import { WorkspaceImagesCard } from '../components/WorkspaceImagesCard';
import { WorkspaceLoadError } from '../components/WorkspaceLoadError';
import { WorkspacePersonalCard } from '../components/WorkspacePersonalCard';
import { WorkspaceSettingsSheets } from '../components/WorkspaceSettingsSheets';
import { NOTIFY_OPTIONS } from '../constants/workspace.constants';
import { useTransferCandidates } from '../hooks/useTransferCandidates';
import { useWorkspacePersonalPrefs } from '../hooks/useWorkspacePersonalPrefs';
import {
  useArchiveWorkspace,
  useLeaveWorkspace,
  useRestoreWorkspace,
  useTransferOwner,
  useWorkspace,
  useUpdateWorkspace,
} from '../queries/workspaces.queries';
import { readWorkspaceLimits, updateWorkspaceSchema, type UpdateWorkspaceFormValues } from '../schemas/workspace.schemas';

export function WorkspaceSettingsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { data: workspace, isLoading, error, isError, refetch } = useWorkspace(wsId);

  if (isLoading) {
    return (
      <Screen header={<AppBar title="Cài đặt nhóm" onBack={router.back} />}>
        <Skeleton className="mt-xs h-40 rounded-md" />
      </Screen>
    );
  }

  if (isError || !workspace) {
    return (
      <Screen header={<AppBar title="Cài đặt nhóm" onBack={router.back} />}>
        <WorkspaceLoadError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  // `key`: mở thẳng workspace KHÁC phải nạp lại state cục bộ — buộc React dựng
  // lại component thay vì tái dùng state cũ của workspace trước.
  return <WorkspaceSettingsContent key={workspace.id} workspace={workspace} wsId={wsId} />;
}

interface WorkspaceSettingsContentProps {
  wsId: string;
  workspace: WorkspaceDetail;
}

/**
 * Nội dung MÀN đã có dữ liệu — state cục bộ khởi tạo TRỰC TIẾP từ `workspace`
 * (props luôn có giá trị ở đây), tránh `useEffect`+`setState` (cảnh báo
 * `react-hooks/set-state-in-effect`). Các thẻ/sheet tách sang component riêng
 * trong `../components/` để giữ file dưới trần 200 dòng.
 */
function WorkspaceSettingsContent({ wsId, workspace }: WorkspaceSettingsContentProps) {
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readWorkspaceLimits(capabilities?.limits), [capabilities?.limits]);
  const schema = useMemo(() => updateWorkspaceSchema(limits), [limits]);

  const updateWorkspace = useUpdateWorkspace(wsId);
  const archiveWorkspace = useArchiveWorkspace(wsId);
  const restoreWorkspace = useRestoreWorkspace(wsId);
  const transferOwner = useTransferOwner(wsId);
  const leaveWorkspace = useLeaveWorkspace(wsId);

  const serverValues = { name: workspace.name, description: workspace.description ?? '' };
  const form = useZodForm<UpdateWorkspaceFormValues, UpdateWorkspaceFormValues>(schema, {
    defaultValues: serverValues,
  });
  // Tên/mô tả đổi ở máy khác (socket) hoặc tải lại nền ⇒ ô nhập theo bản mới khi chưa sửa gì (`useResyncForm`).
  useResyncForm(form, serverValues, workspace.version);

  const { changeFavorite, changeNotifyMode, isFavorite, notifyMode } = useWorkspacePersonalPrefs(wsId, workspace);
  const [notifySheetOpen, setNotifySheetOpen] = useState(false);
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false);
  const [transferSheetOpen, setTransferSheetOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  // Chỉ tải danh sách thành viên khi sheet chuyển quyền MỞ (thao tác hiếm, không đáng một request mỗi lần vào màn).
  const transferCandidates = useTransferCandidates(wsId, transferSheetOpen);

  const saveDetails = form.handleSubmit((values) => {
    updateWorkspace.mutate(
      { name: values.name, description: values.description || null, expectedVersion: workspace.version },
      {
        onSuccess: () => {
          hapticSuccess(); // lưu xong — rung báo thành công đi cùng toast (xem `shared/utils/haptics`)
          showToast('success', 'Đã lưu thay đổi.');
        },
        onError: (mutationError) => {
          const message = toErrorMessage(mutationError);
          showToast('error', message.includes('thay đổi') ? `${message} — dữ liệu đã được giữ nguyên` : message);
        },
      },
    );
  });

  return (
    <Screen header={<AppBar title="Cài đặt nhóm" onBack={router.back} />}>
      <View className="gap-xl py-xs">
        {/* Trạng thái của cả nhóm đứng ĐẦU màn (trước đây nằm cuối, sau cả cụm nút nguy hiểm — người dùng không thấy lý do vì sao nhiều thứ bị khoá). */}
        {workspace.status === 'ARCHIVED' ? <ArchivedBanner reason={workspace.archivedReason} /> : null}

        {/* Thứ tự: Thông tin nhóm · Ảnh · Cá nhân · Quản trị · Vùng nguy hiểm — việc hay sửa nhất lên đầu, phá huỷ luôn cuối. */}
        {workspace.myPermissions.canEdit ? (
          <>
            <WorkspaceDetailsCard
              control={form.control}
              descriptionMax={limits.descriptionMax}
              dirty={form.formState.isDirty}
              disabled={workspace.status === 'ARCHIVED'}
              loading={updateWorkspace.isPending}
              nameMax={limits.nameMax}
              onSave={saveDetails}
            />
            <WorkspaceImagesCard disabled={workspace.status === 'ARCHIVED'} workspace={workspace} wsId={wsId} />
          </>
        ) : null}

        <WorkspacePersonalCard
          isFavorite={isFavorite}
          notifyLabel={NOTIFY_OPTIONS.find((option) => option.value === notifyMode)?.label}
          onFavoriteChange={changeFavorite}
          onNotifyPress={() => setNotifySheetOpen(true)}
        />

        <WorkspaceAdminLinksCard workspace={workspace} />

        <WorkspaceDangerZoneCard
          restoreLoading={restoreWorkspace.isPending}
          workspace={workspace}
          onArchive={() => setArchiveSheetOpen(true)}
          onLeave={() => setLeaveDialogOpen(true)}
          onRestore={() => restoreWorkspace.mutate(workspace.version)}
          onTransfer={() => setTransferSheetOpen(true)}
        />
      </View>

      <WorkspaceSettingsSheets
        archiveLoading={archiveWorkspace.isPending}
        archiveSheetOpen={archiveSheetOpen}
        leaveDialogOpen={leaveDialogOpen}
        leaveLoading={leaveWorkspace.isPending}
        notifyMode={notifyMode}
        notifyOptions={NOTIFY_OPTIONS}
        notifySheetOpen={notifySheetOpen}
        transferCandidates={transferCandidates}
        transferLoading={transferOwner.isPending}
        transferSheetOpen={transferSheetOpen}
        onArchiveClose={() => setArchiveSheetOpen(false)}
        onArchiveConfirm={() =>
          archiveWorkspace.mutate({ expectedVersion: workspace.version }, { onSuccess: () => setArchiveSheetOpen(false) })
        }
        onLeaveClose={() => setLeaveDialogOpen(false)}
        onLeaveConfirm={() =>
          leaveWorkspace.mutate(undefined, {
            onSuccess: () => {
              setLeaveDialogOpen(false);
              router.replace(PATHS.WORKSPACES);
            },
          })
        }
        onNotifyChange={changeNotifyMode}
        onNotifyClose={() => setNotifySheetOpen(false)}
        onTransferClose={() => setTransferSheetOpen(false)}
        onTransferConfirm={({ toUserId, confirmName }) =>
          transferOwner.mutate(
            { toUserId, confirmName, expectedVersion: workspace.version },
            {
              onSuccess: () => {
                setTransferSheetOpen(false);
                hapticSuccess();
                showToast('success', 'Đã chuyển quyền sở hữu.');
              },
            },
          )
        }
      />
    </Screen>
  );
}
