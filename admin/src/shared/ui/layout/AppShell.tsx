import { Outlet } from 'react-router-dom';

/**
 * AppShell — root layout container cho toàn bộ app routes.
 *
 * Bản base giữ tối giản: chỉ dựng khung nền + `<Outlet />`.
 *
 * Các lớp bọc thuộc về nghiệp vụ (session guard, provider phòng họp, stream
 * thông báo real-time…) KHÔNG nằm ở base — project kế thừa tự bọc thêm quanh
 * `<Outlet />` tại đây hoặc ở layout con của mình.
 */
function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-base">
      <Outlet />
    </div>
  );
}

export default AppShell;
