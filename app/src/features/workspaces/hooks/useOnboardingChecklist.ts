import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { WorkspaceDetail } from '../api';
import { onboardingKey, useOnboardingStore, type OnboardingStepId } from '../store/onboarding.store';
import { buildOnboardingSteps, isNewWorkspace, type OnboardingStepView } from '../utils/onboarding.utils';

export interface UseOnboardingChecklistResult {
  /** `false` cho tới khi trạng thái đã nạp xong — ⛔ không hiện checklist "để rồi ẩn". */
  visible: boolean;
  steps: OnboardingStepView[];
  doneCount: number;
  dismiss: () => void;
  openStep: (id: OnboardingStepId) => void;
}

/**
 * Checklist nhóm mới (app.md p1-01 §3): chỉ OWNER/ADMIN của nhóm còn hoạt động,
 * tạo trong vòng `NEW_WORKSPACE_DAYS`, chưa bấm "Để sau" và chưa làm hết ba việc.
 */
export function useOnboardingChecklist(
  workspace: WorkspaceDetail | undefined,
  memberCount: number,
): UseOnboardingChecklistResult {
  const userId = useAuthStore((state) => state.user?.id);
  const key = userId && workspace ? onboardingKey(userId, workspace.id) : undefined;
  const record = useOnboardingStore((state) => (key ? state.records[key] : undefined));

  useEffect(() => {
    if (key) void useOnboardingStore.getState().hydrate(key);
  }, [key]);

  const steps = buildOnboardingSteps(record?.done ?? [], memberCount);
  const doneCount = steps.filter((step) => step.done).length;
  const eligible =
    workspace !== undefined &&
    (workspace.myRole === 'OWNER' || workspace.myRole === 'ADMIN') &&
    workspace.status === 'ACTIVE' &&
    isNewWorkspace(workspace.createdAt);

  function openStep(id: OnboardingStepId): void {
    if (!workspace) return;
    const wsId = workspace.id;
    if (id === 'invite') {
      router.push({ pathname: '/workspaces/[wsId]/invite', params: { wsId } });
      return;
    }
    // `channel`/`message` không suy được từ dữ liệu → ghi nhận lúc người dùng đi tới đó.
    if (key) useOnboardingStore.getState().markDone(key, id);
    if (id === 'message' && workspace.defaultChannelId) {
      router.push({
        pathname: '/workspaces/[wsId]/channels/[chId]',
        params: { wsId, chId: workspace.defaultChannelId },
      });
      return;
    }
    router.push({ pathname: '/workspaces/[wsId]/channels', params: { wsId } });
  }

  return {
    visible: eligible && record !== undefined && !record.dismissed && doneCount < steps.length,
    steps,
    doneCount,
    dismiss: () => {
      if (key) useOnboardingStore.getState().dismiss(key);
    },
    openStep,
  };
}
