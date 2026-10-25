/**
 * Cổng báo "vừa đổi `notifyMode` của CẢ NHÓM" (`PATCH /workspaces/:id/me`) cho `read-state` (p1-07) xoá
 * cache tóm tắt chưa đọc — mute cả nhóm đổi tập kênh INHERIT được tính vào `unreadChannels`.
 *
 * Đảo chiều so với `UnreadSummaryPort` ở file cạnh: `read-state` đã import NGƯỢC vào `workspaces` qua
 * cổng đó (để tính "nhóm nào có kênh chưa đọc"), nên `workspaces` KHÔNG được import thẳng `read-state`
 * (vòng). Cổng này để `workspaces` GỌI VÀO `read-state` mà không cần biết `read-state` tồn tại — chưa
 * đăng ký (route `read-state` chưa khởi tạo) thì gọi im lặng, không throw.
 */
export type NotifyModeChangedPort = (userId: string) => Promise<void>;

let port: NotifyModeChangedPort | null = null;

export function registerNotifyModeChangedPort(resolver: NotifyModeChangedPort): void {
  port = resolver;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearNotifyModeChangedPort(): void {
  port = null;
}

export async function notifyWorkspaceNotifyModeChanged(userId: string): Promise<void> {
  if (port) await port(userId);
}
