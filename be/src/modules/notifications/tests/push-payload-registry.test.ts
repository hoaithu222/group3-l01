/**
 * `buildPushPayload` + registry (p1-07) — module khác thêm loại thông báo MỚI bằng `registerNotificationType({ push })`
 * mà KHÔNG phải sửa bảng lõi (`TYPE_SPECS`/`buildTemplate`): data push để app mở đúng chỗ, collapse/ttl/template do
 * module khai, kênh Android lấy từ chính def, còn tiêu đề gộp "N thông báo mới" vẫn chung.
 */
import { buildPushPayload } from "../services/push-payload.builder";
import { clearNotificationTypeRegistry, registerBuiltinNotificationTypes, registerNotificationType } from "../services/notification-types";
import type { NotificationTypeDef } from "../entities/notification.interface";

const def = (over: Partial<NotificationTypeDef> = {}): NotificationTypeDef => ({
  type: "test.ext",
  inbox: true,
  inboxFilter: "mentions",
  pushType: "test.ext",
  androidChannel: "mentions",
  priority: 10,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: null,
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  type: "test.ext",
  targetUserId: "u1",
  scopeType: "WORKSPACE",
  scopeId: "ws1",
  refs: { taskId: "t1", boardId: "b1", taskTitle: "Đề cương chương 2" },
  lockScreenPreview: false,
  ...over,
});

describe("buildPushPayload — loại do module khác đăng ký", () => {
  beforeEach(() => {
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
  });

  it("loại chưa có trong bảng lõi + không khai push: kênh Android lấy từ def (không rơi về 'default'), data rỗng", () => {
    registerNotificationType(def());
    const p = buildPushPayload(input());
    expect(p.androidChannel).toBe("mentions");
    expect(p.data).toEqual({});
    expect(p.collapseKey).toBe("notif:ws1");
  });

  it("push.dataKeys/collapseKey/ttlSeconds của module được dùng — app mở đúng thẻ, không nuốt push khác nhau cùng scope", () => {
    registerNotificationType(
      def({
        push: {
          dataKeys: ["taskId", "boardId"],
          collapseKey: (r) => `task:${String(r["taskId"])}`,
          ttlSeconds: 7200,
        },
      })
    );
    const p = buildPushPayload(input());
    expect(p.data).toEqual({ taskId: "t1", boardId: "b1" });
    expect(p.collapseKey).toBe("task:t1");
    expect(p.ttlSeconds).toBe(7200);
  });

  it("push.template: lockScreenPreview=false → nội dung trung tính; =true → module được phép hiện tên thẻ", () => {
    registerNotificationType(
      def({
        push: {
          template: ({ refs, lockScreenPreview }) => ({
            title: "Bạn được nhắc trong một thẻ",
            body: lockScreenPreview ? String(refs["taskTitle"]) : undefined,
          }),
        },
      })
    );
    const hidden = buildPushPayload(input({ lockScreenPreview: false }));
    expect(hidden.title).toBe("Bạn được nhắc trong một thẻ");
    expect(hidden.body).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toContain("Đề cương chương 2");

    const shown = buildPushPayload(input({ lockScreenPreview: true }));
    expect(shown.body).toBe("Đề cương chương 2");
  });

  it("gộp burst (batchCount > 1): tiêu đề chung 'N thông báo mới', template của module KHÔNG áp dụng", () => {
    registerNotificationType(def({ push: { template: () => ({ title: "riêng", body: "riêng" }) } }));
    const p = buildPushPayload(input({ batchCount: 3 }));
    expect(p.title).toBe("3 thông báo mới");
    expect(p.data["count"]).toBe("3");
  });

  it("loại foundation Phase 3 (task.*) do module khác đăng ký: data mang boardId/taskId để app mở đúng thẻ; kênh Android lấy từ def", () => {
    const base = { inbox: true, inboxFilter: "all" as const, priority: 5, respectMute: "ALWAYS" as const, bypassDnd: false, batchable: false, readAction: null };
    registerNotificationType({ ...base, type: "task.assigned", pushType: "task.assigned", androidChannel: "default" });
    registerNotificationType({ ...base, type: "task.due-soon", pushType: "task.due-soon", androidChannel: "mentions" });
    registerNotificationType({ ...base, type: "task.comment-mention", pushType: "task.comment-mention", inboxFilter: "mentions", androidChannel: "mentions" });

    const refs = { taskId: "t1", boardId: "b1", workspaceId: "ws1", commentId: "c1", taskTitle: "Đề cương chương 2" };
    const assigned = buildPushPayload({ type: "task.assigned", targetUserId: "u1", scopeType: "WORKSPACE", scopeId: "ws1", workspaceId: "ws1", refs, lockScreenPreview: false });
    expect(assigned).toMatchObject({ type: "task.assigned", targetUserId: "u1", scopeType: "WORKSPACE", scopeId: "ws1", workspaceId: "ws1", androidChannel: "default", collapseKey: "task:t1" });
    expect(assigned.data).toEqual({ boardId: "b1", taskId: "t1" });
    expect(JSON.stringify(assigned)).not.toContain("Đề cương chương 2"); // ẩn tiêu đề thẻ khi lockScreenPreview=false

    const due = buildPushPayload({ type: "task.due-soon", targetUserId: "u1", scopeType: "WORKSPACE", scopeId: "ws1", refs, lockScreenPreview: false });
    expect(due).toMatchObject({ androidChannel: "mentions", ttlSeconds: 24 * 3600, collapseKey: "task-due:t1" });
    expect(due.data).toEqual({ boardId: "b1", taskId: "t1" });

    const cm = buildPushPayload({ type: "task.comment-mention", targetUserId: "u1", scopeType: "WORKSPACE", scopeId: "ws1", refs, lockScreenPreview: false });
    expect(cm.data).toEqual({ boardId: "b1", taskId: "t1", commentId: "c1" });
    expect(cm.collapseKey).toBe("task-comment:c1");
  });

  it("module khai push ở def thì THẮNG bảng foundation (cùng loại task.*)", () => {
    registerNotificationType(def({ type: "task.assigned", pushType: "task.assigned", push: { dataKeys: ["taskId"], collapseKey: () => "riêng" } }));
    const p = buildPushPayload({ type: "task.assigned", targetUserId: "u1", refs: { taskId: "t1", boardId: "b1" }, lockScreenPreview: false });
    expect(p.data).toEqual({ taskId: "t1" });
    expect(p.collapseKey).toBe("riêng");
  });

  it("loại lõi không khai push vẫn như cũ (message.new/mention) — không hồi quy", () => {
    const p = buildPushPayload({
      type: "mention",
      targetUserId: "u1",
      refs: { messageId: "m1", threadId: "th1" },
      lockScreenPreview: false,
    });
    expect(p.androidChannel).toBe("mentions");
    expect(p.data).toEqual({ messageId: "m1", threadId: "th1" });
    expect(p.collapseKey).toBe("mention:m1");
  });

  it("loại chưa đăng ký hoàn toàn → FALLBACK (default), không ném lỗi", () => {
    const p = buildPushPayload(input({ type: "khong.dang.ky" }));
    expect(p.androidChannel).toBe("default");
    expect(p.ttlSeconds).toBe(3600);
  });
});
