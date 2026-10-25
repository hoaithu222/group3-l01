/**
 * `DeliveryPolicy` (be.md §5.4, PUSH-05..08) — fake `PermissionService`/socket
 * (không dựng socket harness thật p0-10 do giới hạn thời gian phiên làm việc
 * này; hành vi socket/permission được fake tất định thay vì mock riêng từng
 * test) + `InMemoryNotificationRepository` (không cần Mongo thật cho logic
 * thuần rẽ nhánh theo trạng thái).
 */
const mockCan = jest.fn().mockResolvedValue(true);
jest.mock("../../../../core/permission", () => {
  const actual = jest.requireActual("../../../../core/permission");
  return { ...actual, permissionService: { ...actual.permissionService, can: (...args: unknown[]) => mockCan(...args) } };
});

const mockEmitToUsers = jest.fn();
jest.mock("../../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: (...args: unknown[]) => mockEmitToUsers(...args) }));

const mockGetIO = jest.fn();
jest.mock("../../../../infrastructure/socket", () => ({ getIO: () => mockGetIO() }));

const mockRedisExists = jest.fn().mockResolvedValue(false);
const mockRedisLpush = jest.fn().mockResolvedValue(1);
jest.mock("../../../../infrastructure/redis", () => ({
  redis: { exists: (...args: unknown[]) => mockRedisExists(...args), lpush: (...args: unknown[]) => mockRedisLpush(...args) },
}));

const mockEnqueue = jest.fn().mockResolvedValue(undefined);
const mockScheduleAt = jest.fn().mockResolvedValue(undefined);
// `toSafeJobId` giữ NGUYÊN hành vi thật (`:` → `_`): BullMQ ném "Custom Id cannot contain :" cho jobId có ':' không đúng 3 đoạn
// (`push.send:<rowId>` chỉ 2 đoạn → trước đây MỌI push của loại `notify()` lỗi ở prod mà mock `enqueue` không bắt được).
jest.mock("../../../../infrastructure/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
  scheduleAt: (...args: unknown[]) => mockScheduleAt(...args),
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
}));

import { DeliveryPolicy } from "../../services/delivery.policy";
import { InMemoryNotificationRepository } from "../../repositories/notification.repository.inmemory";
import { registerNotificationType, clearNotificationTypeRegistry, registerBuiltinNotificationTypes } from "../../services/notification-types";

// `notify()`'s outbox job payload é `{ notificationId, recipientId: <userId> }`
// (xem `services/notify.ts`) — `deliverRecipient()` nhận USER id, KHÔNG phải
// id của bản ghi `NotificationRecipient` (dùng `rowId` bên dưới để assert
// trạng thái/ jobId, vốn dựa trên id bản ghi).
const USER_ID = "u1";

describe("DeliveryPolicy.deliverRecipient (fake permission + socket)", () => {
  const repo = new InMemoryNotificationRepository();
  let hasActiveDevice = jest.fn().mockResolvedValue(true);
  let policy: DeliveryPolicy;

  beforeEach(() => {
    InMemoryNotificationRepository.clearStore();
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
    mockCan.mockReset().mockResolvedValue(true);
    mockEmitToUsers.mockClear();
    mockGetIO.mockReset().mockImplementation(() => {
      throw new Error("Socket.IO chưa init");
    });
    mockRedisExists.mockReset().mockResolvedValue(false);
    mockRedisLpush.mockClear();
    mockEnqueue.mockClear();
    mockScheduleAt.mockClear();
    hasActiveDevice = jest.fn().mockResolvedValue(true);
    policy = new DeliveryPolicy(repo, { hasActiveDevice });
  });

  it("call.missed (inbox, không batch) → enqueue push.send, PENDING", async () => {
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.missed",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "push",
      "push.send",
      { recipientRowIds: [rowId] },
      expect.objectContaining({ jobId: `push.send_${rowId}` })
    );
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBe("PENDING");
  });

  it("PUSH-08: quyền bị thu hồi trước deliver (readAction) → SKIPPED REVOKED, không emit socket", async () => {
    registerNotificationType({
      type: "test.scoped",
      inbox: true,
      inboxFilter: "calls",
      pushType: "test.scoped",
      androidChannel: "default",
      priority: 0,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: false,
      readAction: "channel.read",
    });
    mockCan.mockResolvedValue(false);
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "test.scoped",
      recipientId: USER_ID,
      kind: "DEFAULT",
      scopeType: "CHANNEL",
      scopeId: "ch1",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEmitToUsers).not.toHaveBeenCalled();
    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row?.pushStatus).toBe("SKIPPED");
    expect(row?.skipReason).toBe("REVOKED");
  });

  it("preference MUTED (respectMute ALWAYS) → SKIPPED MUTED, inbox vẫn emit (loại có inbox)", async () => {
    await repo.upsertPreference({ userId: USER_ID, scope: "ACCOUNT", scopeKey: "account", mode: "MUTED" });
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.missed",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row?.pushStatus).toBe("SKIPPED");
    expect(row?.skipReason).toBe("MUTED");
  });

  it("call.incoming respectMute NEVER → MUTED không chặn push, bypassDnd → DND không chặn", async () => {
    await repo.upsertPreference({
      userId: USER_ID,
      scope: "ACCOUNT",
      scopeKey: "account",
      mode: "MUTED",
      dndUntil: new Date(Date.now() + 3_600_000),
    });
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.incoming",
      recipientId: USER_ID,
      kind: "DEFAULT",
      refs: { callId: "c1" },
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEnqueue).toHaveBeenCalledWith(
      "push",
      "push.voip",
      expect.anything(),
      expect.objectContaining({ jobId: `push.voip_c1_${USER_ID}` })
    );
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBe("PENDING");
  });

  it("DND (dndUntil còn hạn, loại không bypass) → SKIPPED DND", async () => {
    await repo.upsertPreference({
      userId: USER_ID,
      scope: "ACCOUNT",
      scopeKey: "account",
      mode: "ALL",
      dndUntil: new Date(Date.now() + 3_600_000),
    });
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.missed",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row?.pushStatus).toBe("SKIPPED");
    expect(row?.skipReason).toBe("DND");
  });

  it("PUSH-06: đang xem đúng scope (socket trong room + presence active) → SKIPPED VIEWING", async () => {
    registerNotificationType({
      type: "test.viewing",
      inbox: true,
      inboxFilter: "calls",
      pushType: "test.viewing",
      androidChannel: "default",
      priority: 0,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: false,
      readAction: null,
    });
    mockGetIO.mockReturnValue({
      in: () => ({ fetchSockets: async () => [{ data: { user: { id: USER_ID } } }] }),
    });
    mockRedisExists.mockResolvedValue(true);
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "test.viewing",
      recipientId: USER_ID,
      kind: "DEFAULT",
      scopeType: "CONVERSATION",
      scopeId: "conv1",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row?.pushStatus).toBe("SKIPPED");
    expect(row?.skipReason).toBe("VIEWING");
    expect(mockEmitToUsers).toHaveBeenCalledTimes(1); // vẫn có inbox/socket
  });

  it("không có thiết bị hoạt động → SKIPPED NO_DEVICE", async () => {
    hasActiveDevice.mockResolvedValue(false);
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.missed",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    const row = InMemoryNotificationRepository.getRecipientRow(rowId);
    expect(row?.pushStatus).toBe("SKIPPED");
    expect(row?.skipReason).toBe("NO_DEVICE");
  });

  it("đã SENT trước đó (idempotent) → không xử lý lại", async () => {
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "call.missed",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });
    InMemoryNotificationRepository.getRecipientRow(rowId)!.pushStatus = "SENT";

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEmitToUsers).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("PUSH-05: loại batchable → LPUSH + scheduleAt (không enqueue push.send trực tiếp)", async () => {
    registerNotificationType({
      type: "test.batch",
      inbox: true,
      inboxFilter: "calls",
      pushType: "test.batch",
      androidChannel: "default",
      priority: 0,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: true,
      readAction: null,
    });
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "test.batch",
      recipientId: USER_ID,
      kind: "DEFAULT",
      workspaceId: "ws1",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockRedisLpush).toHaveBeenCalledWith(expect.stringContaining(`push:batch:${USER_ID}`), rowId);
    expect(mockScheduleAt).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalledWith("push", "push.send", expect.anything(), expect.anything());
  });

  it("loại không có pushType (chỉ inbox+socket) → không enqueue gì, không set PENDING", async () => {
    registerNotificationType({
      type: "test.no-push",
      inbox: true,
      inboxFilter: "calls",
      pushType: null,
      androidChannel: "default",
      priority: 0,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: false,
      readAction: null,
    });
    const { notificationId, recipientId: rowId } = InMemoryNotificationRepository.seed({
      type: "test.no-push",
      recipientId: USER_ID,
      kind: "DEFAULT",
    });

    await policy.deliverRecipient(notificationId, USER_ID);

    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(InMemoryNotificationRepository.getRecipientRow(rowId)?.pushStatus).toBe("NONE");
  });
});
