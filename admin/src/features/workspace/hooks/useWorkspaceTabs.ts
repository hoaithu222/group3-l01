import { useMemo } from 'react';

import { useCapabilities, useFeature } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';

import { INTEGRATION_FEATURE_FLAG } from '../constants/workspace-integrations.constants';
import { MENTOR_FEATURE_FLAG } from '../constants/workspace-mentor.constants';
import {
  INTEGRATIONS_TAB,
  MEDIA_TAB,
  MEETING_TAB,
  MENTOR_TAB,
  PROJECT_TABS,
  RECORDING_TAB,
  TABS,
  WALLET_TAB,
} from '../constants/workspace-tabs.constants';

/**
 * Danh sách tab của `WorkspaceDetailPage` và cờ hiện từng nhóm tab. Mọi tab phụ thuộc cờ tính năng dùng CÙNG quy ước: `undefined` (BE chưa trả
 * cờ / chưa tải) coi như chưa bật — tab chỉ hiện khi BE xác nhận `true` VÀ có quyền xem tương ứng (thiếu quyền thì ẩn hẳn, deep link không gọi API).
 *
 *  - `wallet` (p6-04), `meeting` (p2-04 — chỉ tab "Cuộc họp"), `project` (p3-01/p3-02), `mentor` (p6-03): cờ + `workspace:view`.
 *  - `integration` (p5-03): cờ + `integration:view` (BE chặn route bằng quyền này, không phải `workspace:view`).
 *  - `media` (p2-07) và `recordings` (p2-06): cờ `meeting` + `meeting:view` (BE chặn `media-stats` và `/admin/recordings*` bằng quyền này, không phải
 *    `workspace:view` — tab hiện mà thiếu `meeting:view` thì mọi request ra 403).
 *
 * `capabilitiesPending` chỉ để deep link không chớp "không khả dụng" trong lúc cờ đang tải (cùng query với `useFeature`, không thêm request).
 */
export function useWorkspaceTabs() {
  const { isPending: capabilitiesPending } = useCapabilities();
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const canViewIntegration = useAuthStore((s) => s.hasPermission('integration', 'view'));
  const canViewMeeting = useAuthStore((s) => s.hasPermission('meeting', 'view'));
  const walletEnabled = useFeature('wallet');
  const projectEnabled = useFeature('project');
  const meetingEnabled = useFeature('meeting');
  const integrationEnabled = useFeature(INTEGRATION_FEATURE_FLAG);
  const mentorEnabled = useFeature(MENTOR_FEATURE_FLAG);

  const showWalletTab = walletEnabled === true && canViewWorkspace;
  const showProjectTabs = projectEnabled === true && canViewWorkspace;
  const showMeetingTab = meetingEnabled === true && canViewWorkspace;
  const showMediaTab = meetingEnabled === true && canViewMeeting;
  const showRecordingTab = meetingEnabled === true && canViewMeeting;
  const showIntegrationsTab = integrationEnabled === true && canViewIntegration;
  const showMentorTab = mentorEnabled === true && canViewWorkspace;

  const tabs = useMemo(
    () => [
      ...TABS,
      ...(showMeetingTab ? [MEETING_TAB] : []),
      ...(showRecordingTab ? [RECORDING_TAB] : []),
      ...(showMediaTab ? [MEDIA_TAB] : []),
      ...(showProjectTabs ? PROJECT_TABS : []),
      ...(showIntegrationsTab ? [INTEGRATIONS_TAB] : []),
      ...(showMentorTab ? [MENTOR_TAB] : []),
      ...(showWalletTab ? [WALLET_TAB] : []),
    ],
    [
      showMeetingTab,
      showRecordingTab,
      showMediaTab,
      showProjectTabs,
      showIntegrationsTab,
      showMentorTab,
      showWalletTab,
    ],
  );

  return {
    tabs,
    capabilitiesPending,
    showMeetingTab,
    showRecordingTab,
    showMediaTab,
    showProjectTabs,
    showIntegrationsTab,
    showMentorTab,
    showWalletTab,
  };
}
