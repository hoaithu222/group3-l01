import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { useRetryCountdown } from '@/shared/utils/errors';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { PortfolioProject } from '../../api/portfolio.types';
import { usePortfolioProjectForm } from '../../hooks/usePortfolioProjectForm';
import { useRefreshProject } from '../../queries/portfolio-project.mutations';
import { isGone, portfolioErrorMessage } from '../../utils/portfolio-errors';
import { leaveGoneProject } from '../../utils/portfolio-navigation';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { PortfolioConflictAlert } from './PortfolioConflictAlert';
import { PortfolioFormFooter } from './PortfolioFormFooter';
import { ProjectFormFields } from './ProjectFormFields';
import { SnapshotStatsGrid } from './SnapshotStatsGrid';

export interface PortfolioProjectEditorProps {
  project: PortfolioProject;
  reload: () => Promise<PortfolioProject | undefined>;
}

/**
 * Màn "Sửa dự án" (app.md p6-07 §3): số liệu hệ thống (chỉ đọc) + nút "Làm mới số liệu" (10 lượt/giờ, quá thì ĐẾM NGƯỢC theo `Retry-After`, không toast) + form nội dung + xoá.
 * Dựng cả `Screen` ở đây vì nút Lưu ở `footer` cần `submit` của hook form. Offline ⇒ chặn lưu/làm mới/xoá (đổi mà không tới server sẽ lệch thiết bị).
 */
export function PortfolioProjectEditor({ project, reload }: PortfolioProjectEditorProps) {
  const f = usePortfolioProjectForm({
    onSaved: () => {
      hapticSuccess();
      showToast('success', 'Đã lưu dự án');
      router.back();
    },
    onGone: leaveGoneProject,
    project,
    reload,
  });
  const refresh = useRefreshProject();
  const wait = useRetryCountdown();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const offline = useConnectionState() === 'offline';

  const refreshStats = () =>
    refresh.mutate(project.id, {
      // 429 `PORT_007`: đếm ngược trên chính nút; 404: dự án đã bị xoá ở nơi khác; lỗi khác mới toast.
      onError: (error) => {
        if (wait.startFromError(error)) return;
        if (isGone(error)) leaveGoneProject();
        else showToast('error', portfolioErrorMessage(error));
      },
      onSuccess: () => showToast('success', 'Đã làm mới số liệu'),
    });

  return (
    <Screen
      footer={
        <PortfolioFormFooter
          disabled={offline}
          label="Lưu dự án"
          loading={f.pending}
          notice={
            offline ? <Alert description="Cần kết nối mạng để lưu dự án." tone="warning" /> : null
          }
          onPress={() => void f.submit()}
        />
      }
      header={<AppBar subtitle="Chỉnh sửa dự án" title={project.title} onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-lg py-xs">
        {f.conflict ? (
          <PortfolioConflictAlert subject="Dự án" onReload={() => void f.reloadLatest()} />
        ) : null}
        {f.submitError ? <Alert description={f.submitError} tone="error" /> : null}

        <SnapshotStatsGrid
          offline={offline}
          project={project}
          refreshing={refresh.isPending}
          waitSeconds={wait.remaining}
          onRefresh={refreshStats}
        />

        <ProjectFormFields
          control={f.form.control}
          disabled={f.pending}
          limits={f.limits}
          project={project}
          setValue={f.form.setValue}
        />

        <Button
          disabled={offline || f.pending}
          iconLeft="delete"
          label="Xoá khỏi hồ sơ"
          variant="danger-secondary"
          onPress={() => setConfirmingDelete(true)}
        />
      </View>

      <DeleteProjectDialog
        projectId={project.id}
        title={project.title}
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={router.back}
      />
    </Screen>
  );
}
