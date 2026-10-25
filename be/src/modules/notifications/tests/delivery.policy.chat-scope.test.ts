/**
 * `DeliveryPolicy` cho loại thông báo gắn với luồng CHAT (scope CHANNEL/CONVERSATION — vd `mention.role`, loại mới của
 * module khác) — p1-07: dùng ĐÚNG ma trận cài đặt + khoá "đang xem" Redis của push tin nhắn.
 *   • MUTED (member/`mutedUntil`/workspace/tài khoản) chặn push nhưng vẫn có mục hộp thư + emit (NT-04);
 *   • mention-only chặn loại KHÔNG phải nhắc tên/theo dõi, cho `MENTION_ROLE`/`MENTION` đi qua (phân biệt mute ↔ mention-only);
 *   • DND, đang xem (Redis, worker riêng không có `getIO()`), lựa chọn tường minh kiểu cũ, scope khác giữ resolver p0-06;
 *   • jobId push KHÔNG có ':' (BullMQ ném "Custom Id cannot contain :" cho jobId có ':' không đúng 3 đoạn).
 */
const mockCan = jest.fn().mockResolvedValue(true);
jest.mock("../../../core/permission", () => {
  const actual = jest.requireActual("../../../core/permission");
  return { ...actual, permissionService: { ...actual.permissionService, can: (...args: unknown[]) => mockCan(...args) } };
});
const mockEmitToUsers = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: (...args: unknown[]) => mockEmitToUsers(...args) }));
jest.mock("../../../infrastructure/socket", () => ({
  getIO: () => {
    throw new Error("Worker riêng: không có Socket.IO");
  },
}));
const mockRedisLpush = jest.fn().mockResolvedValue(1);
jest.mock("../../../infrastructure/redis", () => ({
  redis: { exists: jest.fn().mockResolvedValue(false), lpush: (...args: unknown[]) => mockRedisLpush(...args) },
}));
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
const mockScheduleAt = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../infrastructure/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
  scheduleAt: (...args: unknown[]) => mockScheduleAt(...args),
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
}));

import { DeliveryPolicy, type ChatScopePreferencePort } from "../services/delivery.policy";
import { InMemoryNotificationRepository } from "../repositories/notification.repository.inmemory";
import { clearNotificationTypeRegistry, registerBuiltinNotificationTypes, registerNotificationType } from "../services/notification-types";
import type { EffectiveMessagePreference } from "../services/preference-matrix";
import type { NotificationTypeDef } from "../entities/notification.interface";

const U = "u1";
const CH = "ch1";

const def = (over: Partial<NotificationTypeDef> = {}): NotificationTypeDef => ({
  type: "test.chat",
  inbox: true,
  inboxFilter: "mentions",
  pushType: "test.chat",
  androidChannel: "mentions",
  priority: 10,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "channel.read",
  ...over,
});

const pref = (over: Partial<EffectiveMessagePreference> = {}): EffectiveMessagePreference => ({
  mode: "ALL",
  dnd: false,
  lockScreenPreview: "HIDDEN",
  sound: true,
  ...over,
});

describe("DeliveryPolicy — loại gắn luồng chat (ma trận p1-07)", () => {
  const repo = new InMemoryNotificationRepository();
  const hasActiveDevice = jest.fn();
  const resolveOne = jest.fn();
  const loadScopeMeta = jest.fn();
  const isViewing = jest.fn();
  let policy: DeliveryPolicy;

  const seedChannelRow = (over: { kind?: string; scopeType?: "CHANNEL" | "CONVERSATION" | "WORKSPACE"; type?: string } = {}) =>
    InMemoryNotificationRepository.seed({
      type: over.type ?? "test.chat",
      recipientId: U,
      kind: over.kind ?? "DEFAULT",
      scopeType: over.scopeType ?? "CHANNEL",
      scopeId: CH,
      workspaceId: "ws1",
    });

  beforeEach(() => {
    InMemoryNotificationRepository.clearStore();
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
    registerNotificationType(def());
    mockCan.mockReset().mockResolvedValue(true);
    mockEmitToUsers.mockReset();
    mockEnqueue.mockReset().mockResolvedValue(undefined);
    mockScheduleAt.mockReset().mockResolvedValue(undefined);
    mockRedisLpush.mockReset().mockResolvedValue(1);
    hasActiveDevice.mockReset().mockResolvedValue(true);
    resolveOne.mockReset().mockResolvedValue(pref());
    loadScopeMeta.mockReset().mockResolvedValue({ workspaceId: "ws1" });
    isViewing.mockReset().mockResolvedValue(false);
    const chatPrefs: ChatScopePreferencePort = {
      loadScopeMeta: (...a) => loadScopeMeta(...a),
      resolveOne: (...a) => resolveOne(...a),
    };
    policy = new DeliveryPolicy(repo, { hasActiveDevice }, { chatPrefs, isViewing: (...a) => isViewing(...a) });
  });

  it("chế độ ALL: gửi push; jobId KHÔNG chứa ':'; emit inbox; PENDING", async () => {
    const { notificationId, recipientId: rowId } = seedChannelRow();
    await policy.deliverRecipient(notificationId, U);

    expect(resolveOne).toHaveBeenCalledWith({ scopeType: "CHANNEL", scopeId: CH, workspaceId: "ws1", conversationKind: undefined }, U);
    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    // `id` = id mục hộp thư (dùng được cho `POST /notifications/:id/read`), không phải id Notification gốc.
    expect(mockEmitToUsers).toHaveBeenCalledWith([U], "notification:created", expect.objectContaining({ id: rowId, notificationId }));
    expect(mockEnqueue).toHaveBeenCalledWith("push", "push.send", { recipientRowIds: [rowId] }, { jobId: `push.send_${rowId}` });
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBe("PENDING");
  });

  it("NT-04: kênh MUTED (ChannelMembership.notifyMode) → SKIPPED MUTED, nhưng mục hộp thư + socket vẫn có", async () => {
    resolveOne.mockResolvedValue(pref({ mode: "MUTED" }));
    const { notificationId, recipientId: rowId } = seedChannelRow({ kind: "MENTION_ROLE" });
    await policy.deliverRecipient(notificationId, U);

    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MUTED" });
    expect(row?.inInbox).toBe(true);
  });

  it("mention-only ≠ mute: nhắc tên theo vai trò (MENTION_ROLE) vẫn push, loại KHÔNG phải nhắc tên bị chặn với lý do MODE", async () => {
    resolveOne.mockResolvedValue(pref({ mode: "MENTIONS" }));

    const mention = seedChannelRow({ kind: "MENTION_ROLE" });
    await policy.deliverRecipient(mention.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(mention.recipientId)?.pushStatus).toBe("PENDING");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    mockEnqueue.mockClear();
    const other = seedChannelRow({ kind: "DEFAULT" });
    await policy.deliverRecipient(other.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(other.recipientId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MODE" });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("DND (tài khoản) → SKIPPED DND dù kênh ở chế độ ALL; loại bypassDnd vẫn qua", async () => {
    resolveOne.mockResolvedValue(pref({ dnd: true }));
    const a = seedChannelRow();
    await policy.deliverRecipient(a.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(a.recipientId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "DND" });

    registerNotificationType(def({ type: "test.chat-urgent", pushType: "test.chat-urgent", bypassDnd: true }));
    const b = seedChannelRow({ type: "test.chat-urgent" });
    await policy.deliverRecipient(b.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(b.recipientId)?.pushStatus).toBe("PENDING");
  });

  it("NT-09: đang xem đúng luồng — đọc khoá Redis `CHANNEL:<id>` (worker riêng không có getIO) → SKIPPED VIEWING", async () => {
    isViewing.mockResolvedValue(true);
    const { notificationId, recipientId: rowId } = seedChannelRow();
    await policy.deliverRecipient(notificationId, U);

    expect(isViewing).toHaveBeenCalledWith(U, `CHANNEL:${CH}`);
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "VIEWING" });
    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
  });

  it("hội thoại: truyền conversationKind vào ma trận; khoá viewing `CONVERSATION:<id>`", async () => {
    registerNotificationType(def({ type: "test.conv", pushType: "test.conv", readAction: "conversation.read" }));
    loadScopeMeta.mockResolvedValue({ workspaceId: null, conversationKind: "DIRECT" });
    const { notificationId } = seedChannelRow({ type: "test.conv", scopeType: "CONVERSATION" });
    await policy.deliverRecipient(notificationId, U);

    expect(resolveOne).toHaveBeenCalledWith({ scopeType: "CONVERSATION", scopeId: CH, workspaceId: null, conversationKind: "DIRECT" }, U);
    expect(isViewing).toHaveBeenCalledWith(U, `CONVERSATION:${CH}`);
  });

  it("lựa chọn TƯỜNG MINH kiểu cũ (NotificationPreference scope CHANNEL) vẫn thắng ma trận", async () => {
    await repo.upsertPreference({ userId: U, scope: "CHANNEL", scopeKey: CH, mode: "MUTED" });
    const { notificationId, recipientId: rowId } = seedChannelRow();
    await policy.deliverRecipient(notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MUTED" });
  });

  it("scope KHÔNG phải chat (WORKSPACE): giữ resolver p0-06, không chạm ma trận chat", async () => {
    registerNotificationType(def({ type: "test.ws", pushType: "test.ws", readAction: null }));
    const { notificationId, recipientId: rowId } = seedChannelRow({ type: "test.ws", scopeType: "WORKSPACE", kind: "MENTION_ROLE" });
    await policy.deliverRecipient(notificationId, U);
    expect(resolveOne).not.toHaveBeenCalled();
    expect(loadScopeMeta).not.toHaveBeenCalled();
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBe("PENDING");
  });

  it("kênh/hội thoại không còn (scope meta null) → rơi về resolver p0-06, không ném lỗi", async () => {
    loadScopeMeta.mockResolvedValue(null);
    const { notificationId, recipientId: rowId } = seedChannelRow();
    await expect(policy.deliverRecipient(notificationId, U)).resolves.toBeUndefined();
    expect(resolveOne).not.toHaveBeenCalled();
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBeDefined();
  });

  it("chế độ chỉ-nhắc-tên KHÔNG lọc loại ở scope WORKSPACE (giao việc/nhắc hạn/bình luận thẻ) dù mặc định là MENTIONS; MUTED/DND vẫn chặn", async () => {
    // Mô phỏng đăng ký của p3-03 (`inboxFilter: "all"`, scope WORKSPACE, kind DEFAULT) — trước đây mặc định MENTIONS bỏ push (skipReason MODE).
    const base = { inbox: true, inboxFilter: "all" as const, androidChannel: "default" as const, priority: 5, respectMute: "ALWAYS" as const, bypassDnd: false, batchable: false, readAction: null };
    for (const type of ["test.task-assigned", "test.task-due-soon", "test.task-comment"]) {
      registerNotificationType({ ...base, type, pushType: type });
    }

    for (const type of ["test.task-assigned", "test.task-due-soon", "test.task-comment"]) {
      const { notificationId, recipientId: rowId } = seedChannelRow({ type, scopeType: "WORKSPACE" }); // kind DEFAULT, chưa có cài đặt nào → mặc định MENTIONS
      await policy.deliverRecipient(notificationId, U);
      expect(InMemoryNotificationRepository.getRecipientRow(rowId)).toMatchObject({ pushStatus: "PENDING" });
    }
    expect(resolveOne).not.toHaveBeenCalled(); // scope WORKSPACE không đi qua ma trận chat

    // Tắt tiếng nhóm làm việc (cài đặt cấp workspace kiểu cũ) → chặn; DND → chặn
    await repo.upsertPreference({ userId: U, scope: "WORKSPACE", scopeKey: "ws1", mode: "MUTED" });
    const muted = seedChannelRow({ type: "test.task-assigned", scopeType: "WORKSPACE" });
    await policy.deliverRecipient(muted.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(muted.recipientId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MUTED" });

    await repo.upsertPreference({ userId: U, scope: "WORKSPACE", scopeKey: "ws1", mode: "ALL" });
    await repo.upsertPreference({ userId: U, scope: "ACCOUNT", scopeKey: "account", mode: "ALL", dndUntil: new Date(Date.now() + 3_600_000) });
    const dnd = seedChannelRow({ type: "test.task-due-soon", scopeType: "WORKSPACE" });
    await policy.deliverRecipient(dnd.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(dnd.recipientId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "DND" });
  });

  it("loại gắn luồng chat khai personal:true → không bị mention-only lọc (đích danh người nhận); không khai → bị lọc MODE", async () => {
    resolveOne.mockResolvedValue(pref({ mode: "MENTIONS" }));
    registerNotificationType(def({ type: "test.chat-personal", pushType: "test.chat-personal", personal: true }));
    const personal = seedChannelRow({ type: "test.chat-personal" });
    await policy.deliverRecipient(personal.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(personal.recipientId)?.pushStatus).toBe("PENDING");

    const plain = seedChannelRow({ type: "test.chat" }); // cùng scope/chế độ nhưng không personal
    await policy.deliverRecipient(plain.notificationId, U);
    expect(InMemoryNotificationRepository.getRecipientRow(plain.recipientId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "MODE" });
  });

  it("mất quyền đọc trước khi giao → SKIPPED REVOKED, không emit, không push (NT-05)", async () => {
    mockCan.mockResolvedValue(false);
    const { notificationId, recipientId: rowId } = seedChannelRow();
    await policy.deliverRecipient(notificationId, U);
    expect(mockEmitToUsers).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)).toMatchObject({ pushStatus: "SKIPPED", skipReason: "REVOKED" });
  });

  it("loại batchable: jobId hẹn giờ gộp KHÔNG chứa ':'", async () => {
    registerNotificationType(def({ type: "test.chat-batch", pushType: "test.chat-batch", batchable: true }));
    const { notificationId } = seedChannelRow({ type: "test.chat-batch" });
    await policy.deliverRecipient(notificationId, U);

    expect(mockScheduleAt).toHaveBeenCalledTimes(1);
    const jobId = mockScheduleAt.mock.calls[0]?.[2] as string;
    expect(jobId).toMatch(/^push\.send_u1_CHANNEL_ch1_\d+$/);
    expect(jobId).not.toContain(":");
  });
});
