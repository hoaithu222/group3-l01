export { WorkspaceListScreen } from './screens/WorkspaceListScreen';
export { CreateWorkspaceScreen } from './screens/CreateWorkspaceScreen';
export { WorkspaceOverviewScreen } from './screens/WorkspaceOverviewScreen';
export { WorkspaceSettingsScreen } from './screens/WorkspaceSettingsScreen';

// p3-04 — khách (GUEST), duyệt tham gia, quyền truy cập nhóm. Hub (`WorkspaceOverviewScreen`) tích hợp:
//   · `useIsGuest(wsId)` / `useGuestAccess(wsId)` để ẩn Thành viên · Việc · Tài liệu · Học · Tạo kênh · Mời;
//   · `<GuestAccessBanner wsId />` (tự chứa, tự ẩn khi không phải khách).
export { JoinPendingScreen } from './screens/JoinPendingScreen';
export { WorkspaceAccessSettingsScreen } from './screens/WorkspaceAccessSettingsScreen';
export { GuestAccessBanner } from './components/GuestAccessBanner';
export { useGuestAccess, useIsGuest, type GuestAccess } from './hooks/useIsGuest';
