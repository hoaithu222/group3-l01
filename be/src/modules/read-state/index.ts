/**
 * Barrel side-effect của module `read-state` (p1-07) — mirror `modules/threads/index.ts`.
 * `router.ts` gọi `registerReadStateModule()` NGAY SAU khi import `read-state.routes.ts`
 * (đăng ký `IReadStateReader` cho `ThreadService` đọc `myLastReadSeq`/`unreadReplies`;
 * và `UnreadSummaryPort` cho `workspaces` — danh sách Nhóm + huy hiệu chưa đọc).
 */
import { registerReadStateReader } from "../../core/permission";
import { registerUnreadSummaryPort, type UnreadSummary as WorkspaceUnreadSummary } from "../workspaces/services/unread-summary.port";
import { registerNotifyModeChangedPort } from "../workspaces/services/notify-mode-changed.port";
import { readStateRepo, unreadService } from "./read-state.routes";
import { notifyUnreadSummaryChanged } from "./services/unread-cache";

export function registerReadStateModule(): void {
  registerReadStateReader({
    getThreadReadSeqs: (userId, threadIds) => readStateRepo.getThreadReadSeqs(userId, threadIds),
  });

  /**
   * Trước khi đăng ký, `workspaces` luôn nhận `unreadAvailable: false` (xem docstring của cổng) —
   * danh sách Nhóm không có huy hiệu chưa đọc dù `read-state` đã tính đủ. Tái dùng
   * `unreadService.summary()` (đã cache theo user, cùng dữ liệu badge tab Tin nhắn) thay vì
   * truy vấn riêng: "chưa đọc" của một nhóm = số KÊNH có tin chưa đọc trong nhóm đó.
   */
  registerUnreadSummaryPort(async (userId, workspaceIds) => {
    const summary = await unreadService.summary(userId);
    const wanted = new Set(workspaceIds);
    const result = new Map<string, WorkspaceUnreadSummary>();
    for (const ws of summary.workspaces) {
      if (wanted.has(ws.workspaceId)) {
        result.set(ws.workspaceId, { unreadCount: ws.unreadChannels, mentionCount: ws.mentions });
      }
    }
    return result;
  });

  // `workspaces.updateMe` (mute/bỏ mute cả nhóm) gọi ngược vào đây qua cổng đảo chiều — cùng lý do và cùng
  // "reason" (`MUTE`) với lúc mute một kênh (`ChannelService.me`).
  registerNotifyModeChangedPort((userId) => notifyUnreadSummaryChanged(userId, "MUTE"));
}
