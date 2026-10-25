jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: jest.fn() }));

import { NotificationService } from "../services/notification.service";
import { InMemoryNotificationRepository } from "../repositories/notification.repository.inmemory";
import { NotificationNotFoundError } from "../../../core/exceptions";
import { registerNotificationType, clearNotificationTypeRegistry, registerBuiltinNotificationTypes } from "../services/notification-types";

// Phase 0 chưa đăng ký type nào có `inboxFilter: "mentions"` (mention/thread.reply
// là Phase 1) — đăng ký 1 type test riêng để bài test lọc "mentions" có dữ liệu thật.
function registerMentionTestType(): void {
  registerNotificationType({
    type: "test.mention",
    inbox: true,
    inboxFilter: "mentions",
    pushType: "test.mention",
    androidChannel: "mentions",
    priority: 1,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
  });
}

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    InMemoryNotificationRepository.clearStore();
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
    registerMentionTestType();
    service = new NotificationService(new InMemoryNotificationRepository());
  });

  describe("listInbox() filter", () => {
    beforeEach(() => {
      InMemoryNotificationRepository.seed({ type: "test.mention", recipientId: "u1", kind: "MENTION" });
      InMemoryNotificationRepository.seed({ type: "meeting.invited", recipientId: "u1", kind: "DEFAULT" });
    });

    it("filter=all trả cả hai", async () => {
      const result = await service.listInbox("u1", { filter: "all", unreadOnly: false, limit: 10 });
      expect(result.data).toHaveLength(2);
    });

    it("filter=mentions chỉ trả loại có inboxFilter mentions", async () => {
      const result = await service.listInbox("u1", { filter: "mentions", unreadOnly: false, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe("test.mention");
    });

    it("filter=meetings chỉ trả loại meeting.invited", async () => {
      const result = await service.listInbox("u1", { filter: "meetings", unreadOnly: false, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe("meeting.invited");
    });

    it("unreadOnly=true bỏ mục đã đọc", async () => {
      const before = await service.listInbox("u1", { filter: "all", unreadOnly: false, limit: 10 });
      await service.markRead("u1", before.data[0].id);
      const after = await service.listInbox("u1", { filter: "all", unreadOnly: true, limit: 10 });
      expect(after.data).toHaveLength(1);
    });
  });

  describe("markRead() / markAllRead()", () => {
    it("markRead đánh dấu đúng 1 mục, trả readAt", async () => {
      const { recipientId } = InMemoryNotificationRepository.seed({ type: "test.mention", recipientId: "u1", kind: "MENTION" });
      const readAt = await service.markRead("u1", recipientId);
      expect(readAt).toBeInstanceOf(Date);
    });

    it("markRead mục không tồn tại → NotificationNotFoundError", async () => {
      await expect(service.markRead("u1", "khong-ton-tai")).rejects.toBeInstanceOf(NotificationNotFoundError);
    });

    it("markAllRead trả về số lượng đã đánh dấu", async () => {
      InMemoryNotificationRepository.seed({ type: "test.mention", recipientId: "u1", kind: "MENTION" });
      InMemoryNotificationRepository.seed({ type: "meeting.invited", recipientId: "u1", kind: "DEFAULT" });
      const count = await service.markAllRead("u1", { filter: "all", before: new Date() });
      expect(count).toBe(2);
    });
  });

  describe("unreadCount()", () => {
    it("đếm đúng theo bộ lọc", async () => {
      InMemoryNotificationRepository.seed({ type: "test.mention", recipientId: "u1", kind: "MENTION" });
      InMemoryNotificationRepository.seed({ type: "call.missed", recipientId: "u1", kind: "DEFAULT" });
      const result = await service.unreadCount("u1");
      expect(result.total).toBe(2);
      expect(result.byFilter.mentions).toBe(1);
      expect(result.byFilter.calls).toBe(1);
      expect(result.byFilter.meetings).toBe(0);
    });
  });

  describe("preference", () => {
    it("getPreference (scope cụ thể) trả INHERIT khi chưa set", async () => {
      const pref = await service.getPreference("u1", "ACCOUNT");
      expect(Array.isArray(pref)).toBe(false);
      expect((pref as { mode: string }).mode).toBe("INHERIT");
    });

    it("getPreference không truyền scope → trả danh sách (rỗng khi chưa set gì)", async () => {
      const pref = await service.getPreference("u1");
      expect(Array.isArray(pref)).toBe(true);
    });

    it("setPreference rồi getPreference trả giá trị đã lưu", async () => {
      await service.setPreference({ userId: "u1", scope: "ACCOUNT", mode: "MUTED" });
      const pref = await service.getPreference("u1", "ACCOUNT");
      expect((pref as { mode: string }).mode).toBe("MUTED");
    });

    it("scope khác ACCOUNT thiếu scopeId → ValidationError", async () => {
      await expect(service.setPreference({ userId: "u1", scope: "CHANNEL", mode: "MUTED" })).rejects.toThrow();
    });
  });
});
