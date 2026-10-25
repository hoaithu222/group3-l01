jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: jest.fn() }));

import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { NotificationService } from "../services/notification.service";
import { NotificationPreferenceService, toAccountMode } from "../services/notification-preference.service";
import { InMemoryNotificationRepository } from "../repositories/notification.repository.inmemory";
import { registerBuiltinNotificationTypes, clearNotificationTypeRegistry } from "../services/notification-types";
import { accountPreferenceSchema, workspacePreferenceSchema } from "../dtos/account-preference.dto";
import { preferenceBodySchema, isLegacyPreferenceBody } from "../dtos/preference.dto";
import { p95FromBuckets, fanoutBucketFor, bucketsFor } from "../services/notification-stats";
import { AppError } from "../../../core/exceptions";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";

const emit = emitToUsers as jest.Mock;
const CH = "64b000000000000000000100";

describe("NotificationService — p1-07", () => {
  let service: NotificationService;
  const inboxChanged = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    InMemoryNotificationRepository.clearStore();
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
    emit.mockReset();
    inboxChanged.mockClear();
    service = new NotificationService(new InMemoryNotificationRepository(), { inboxChanged });
  });

  it("filter lọc theo filterBucket của NGƯỜI NHẬN: mention vs following (cùng loại Notification)", async () => {
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", filterBucket: "mentions" });
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "THREAD_REPLY", filterBucket: "following" });

    expect((await service.listInbox("u1", { filter: "mentions", unreadOnly: false, limit: 10 })).data).toHaveLength(1);
    expect((await service.listInbox("u1", { filter: "following", unreadOnly: false, limit: 10 })).data).toHaveLength(1);
    expect((await service.listInbox("u1", { filter: "all", unreadOnly: false, limit: 10 })).data).toHaveLength(2);
  });

  it("mục đã huỷ (inInbox=false) không xuất hiện trong hộp thư và không tính chưa đọc", async () => {
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", inInbox: false });
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    expect((await service.listInbox("u1", { filter: "all", unreadOnly: false, limit: 10 })).data).toHaveLength(1);
    expect((await service.unreadCount("u1")).total).toBe(1);
  });

  it("enrich hook được gọi trên trang kết quả (kiểm quyền lúc đọc)", async () => {
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    const enrich = jest.fn((_u: string, items: unknown[]) => Promise.resolve(items.map((i) => ({ ...(i as object), context: { available: true, muted: false } }))));
    const svc = new NotificationService(new InMemoryNotificationRepository(), { enrich: enrich as never });
    const page = await svc.listInbox("u1", { filter: "all", unreadOnly: false, limit: 10 });
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(page.data[0]?.context).toEqual({ available: true, muted: false });
  });

  it("NT-13: markAllRead với before ở tương lai xa → NOTI_003 (400), không đụng dữ liệu", async () => {
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    await expect(service.markAllRead("u1", { filter: "all", before: new Date(Date.now() + 3_600_000) })).rejects.toMatchObject({
      errorCode: "NOTI_003",
      statusCode: 400,
    });
    expect((await service.unreadCount("u1")).total).toBe(1);
  });

  it("NT-13: đọc-tất-cả chỉ đánh dấu mục tạo TRƯỚC mốc before; tin đến sau vẫn chưa đọc", async () => {
    const t0 = Date.now();
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", createdAt: new Date(t0 - 5_000) });
    InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", createdAt: new Date(t0 + 1_000) });
    const updated = await service.markAllRead("u1", { filter: "all", before: new Date(t0) });
    expect(updated).toBe(1);
    expect((await service.unreadCount("u1")).total).toBe(1);
    expect(inboxChanged).toHaveBeenCalledWith("u1");
  });

  it("markRead gọi hook inboxChanged (xoá cache unread:summary)", async () => {
    const { recipientId } = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    await service.markRead("u1", recipientId);
    expect(inboxChanged).toHaveBeenCalledWith("u1");
  });

  describe("markReadByStream (NT-12)", () => {
    it("tin ≤ seq trong ĐÚNG luồng root thành đã đọc; phát notification:read { ids }", async () => {
      const a = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", scopeType: "CHANNEL", scopeId: CH, streamKey: "root", streamSeq: 4 });
      const b = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", scopeType: "CHANNEL", scopeId: CH, streamKey: "root", streamSeq: 9 });
      const n = await service.markReadByStream("u1", "CHANNEL", CH, "root", 5);

      expect(n).toBe(1);
      expect(InMemoryNotificationRepository.getRecipientRow(a.recipientId)?.readAt).toBeInstanceOf(Date);
      expect(InMemoryNotificationRepository.getRecipientRow(b.recipientId)?.readAt).toBeNull();
      expect(emit).toHaveBeenCalledWith(["u1"], SocketEvent.NOTIFICATION_READ, { ids: [a.recipientId] });
      expect(inboxChanged).toHaveBeenCalledWith("u1");
    });

    it("NT-02: marker THREAD không đánh dấu mục của kênh (streamKey khác) và ngược lại", async () => {
      const rootItem = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION", scopeType: "CHANNEL", scopeId: CH, streamKey: "root", streamSeq: 1 });
      const threadItem = InMemoryNotificationRepository.seed({ type: "thread.reply", recipientId: "u1", kind: "THREAD_REPLY", scopeType: "CHANNEL", scopeId: CH, streamKey: "t1", streamSeq: 1 });

      await service.markReadByStream("u1", "CHANNEL", CH, "t1", 10);
      expect(InMemoryNotificationRepository.getRecipientRow(threadItem.recipientId)?.readAt).toBeInstanceOf(Date);
      expect(InMemoryNotificationRepository.getRecipientRow(rootItem.recipientId)?.readAt).toBeNull();
    });

    it("không có mục nào khớp → 0, không phát gì, không đụng cache", async () => {
      expect(await service.markReadByStream("u1", "CHANNEL", CH, "root", 5)).toBe(0);
      expect(emit).not.toHaveBeenCalled();
      expect(inboxChanged).not.toHaveBeenCalled();
    });

    it("người khác không bị ảnh hưởng", async () => {
      const other = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u2", kind: "MENTION", scopeType: "CHANNEL", scopeId: CH, streamKey: "root", streamSeq: 1 });
      await service.markReadByStream("u1", "CHANNEL", CH, "root", 10);
      expect(InMemoryNotificationRepository.getRecipientRow(other.recipientId)?.readAt).toBeNull();
    });
  });

  it("retention: xoá mục đã đọc quá hạn + Notification mồ côi, giữ mục chưa đọc", async () => {
    const old = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    const unread = InMemoryNotificationRepository.seed({ type: "mention", recipientId: "u1", kind: "MENTION" });
    await service.markRead("u1", old.recipientId);
    const row = InMemoryNotificationRepository.getRecipientRow(old.recipientId)!;
    row.readAt = new Date(Date.now() - 100 * 86_400_000);

    const result = await service.purgeExpired(new Date(Date.now() - 90 * 86_400_000));
    expect(result).toEqual({ recipients: 1, notifications: 1 });
    expect(InMemoryNotificationRepository.getRecipientRow(old.recipientId)).toBeUndefined();
    expect(InMemoryNotificationRepository.getRecipientRow(unread.recipientId)).toBeDefined();
  });
});

describe("NotificationPreferenceService (ACCOUNT / WORKSPACE)", () => {
  let svc: NotificationPreferenceService;

  beforeEach(() => {
    InMemoryNotificationRepository.clearStore();
    svc = new NotificationPreferenceService(new InMemoryNotificationRepository());
  });

  it("GET tài khoản chưa cấu hình → điền mặc định (1-1/nhóm ALL, kênh MENTIONS_AND_THREADS, HIDDEN, sound) + cờ isDefault", async () => {
    const v = await svc.getAccount("u1");
    expect(v).toMatchObject({
      directMode: "ALL", groupMode: "ALL", channelMode: "MENTIONS_AND_THREADS", lockScreenPreview: "HIDDEN", sound: true, dndUntil: null,
    });
    expect(Object.values(v.isDefault).every(Boolean)).toBe(true);
  });

  it("PUT rồi GET: giá trị người dùng chọn thắng mặc định; trường còn lại vẫn mặc định", async () => {
    const v = await svc.putAccount("u1", { directMode: "MUTED", lockScreenPreview: "FULL", sound: false });
    expect(v).toMatchObject({ directMode: "MUTED", groupMode: "ALL", lockScreenPreview: "FULL", sound: false });
    expect(v.isDefault).toMatchObject({ directMode: false, groupMode: true, lockScreenPreview: false, sound: false });
  });

  it("PUT lockScreenPreview đồng bộ boolean cũ (chỉ FULL ≙ true) cho pipeline p0-06", async () => {
    const repo = new InMemoryNotificationRepository();
    const s = new NotificationPreferenceService(repo);
    await s.putAccount("u1", { lockScreenPreview: "SENDER" });
    expect((await repo.getPreference("u1", "ACCOUNT", "account"))?.lockScreenPreview).toBe(false);
    await s.putAccount("u1", { lockScreenPreview: "FULL" });
    expect((await repo.getPreference("u1", "ACCOUNT", "account"))?.lockScreenPreview).toBe(true);
  });

  it("DND: đặt thời điểm tương lai → hiện trong view; null → xoá; quá khứ → NOTI_004", async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    expect((await svc.putAccount("u1", { dndUntil: until })).dndUntil).toBe(until);
    expect((await svc.putAccount("u1", { dndUntil: null })).dndUntil).toBeNull();
    const err = await svc.putAccount("u1", { dndUntil: new Date(Date.now() - 1000).toISOString() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ errorCode: "NOTI_004", statusCode: 400 });
  });

  it("WORKSPACE: mặc định INHERIT; PUT giá trị rồi INHERIT lại → null; effective kế thừa tài khoản", async () => {
    await svc.putAccount("u1", { groupMode: "MENTIONS_AND_THREADS" });
    const inherit = await svc.getWorkspace("u1", "ws1");
    expect(inherit).toMatchObject({ groupMode: "INHERIT", channelMode: "INHERIT", effective: { groupMode: "MENTIONS_AND_THREADS", channelMode: "MENTIONS_AND_THREADS" } });

    const set = await svc.putWorkspace("u1", "ws1", { groupMode: "MUTED", channelMode: "ALL" });
    expect(set).toMatchObject({ groupMode: "MUTED", channelMode: "ALL", effective: { groupMode: "MUTED", channelMode: "ALL" } });

    const back = await svc.putWorkspace("u1", "ws1", { groupMode: "INHERIT" });
    expect(back).toMatchObject({ groupMode: "INHERIT", channelMode: "ALL" }); // trường không gửi giữ nguyên
  });

  it("toAccountMode gộp tên chế độ", () => {
    expect(toAccountMode("MENTIONS")).toBe("MENTIONS_AND_THREADS");
    expect(toAccountMode("ALL_MESSAGES")).toBe("ALL");
    expect(toAccountMode("MUTED")).toBe("MUTED");
  });
});

describe("DTO cài đặt thông báo", () => {
  it("account schema strict: khoá lạ (vd scope của dạng cũ) bị từ chối để rơi xuống nhánh legacy", () => {
    expect(accountPreferenceSchema.safeParse({ directMode: "ALL" }).success).toBe(true);
    expect(accountPreferenceSchema.safeParse({ scope: "CHANNEL", scopeId: CH, mode: "MUTED" }).success).toBe(false);
    expect(accountPreferenceSchema.safeParse({ directMode: "MENTIONS" }).success).toBe(false);
    expect(accountPreferenceSchema.safeParse({ lockScreenPreview: "FULL", sound: true, dndUntil: null }).success).toBe(true);
  });

  it("workspace schema cho phép INHERIT; account thì không", () => {
    expect(workspacePreferenceSchema.safeParse({ groupMode: "INHERIT", channelMode: "MUTED" }).success).toBe(true);
    expect(accountPreferenceSchema.safeParse({ groupMode: "INHERIT" }).success).toBe(false);
  });

  it("union body: dạng mới (không scope) và dạng cũ (có scope) đều hợp lệ và phân biệt được", () => {
    const fresh = preferenceBodySchema.parse({ directMode: "MUTED" });
    expect(isLegacyPreferenceBody(fresh)).toBe(false);
    const legacy = preferenceBodySchema.parse({ scope: "ACCOUNT", mode: "MUTED" });
    expect(isLegacyPreferenceBody(legacy)).toBe(true);
    expect(preferenceBodySchema.safeParse({ scope: "CHANNEL", mode: "MUTED" }).success).toBe(false); // thiếu scopeId
  });
});

describe("notification-stats", () => {
  it("fanoutBucketFor: cận trên bucket theo ms", () => {
    expect(fanoutBucketFor(0.05)).toBe("le100");
    expect(fanoutBucketFor(0.6)).toBe("le1000");
    expect(fanoutBucketFor(2.9)).toBe("le3000");
    expect(fanoutBucketFor(12)).toBe("inf");
  });

  it("p95FromBuckets: null khi chưa có dữ liệu; đúng cận trên bucket chứa phân vị 95", () => {
    expect(p95FromBuckets([{ bound: 100, count: 0 }])).toBeNull();
    expect(
      p95FromBuckets([
        { bound: 100, count: 90 },
        { bound: 1000, count: 6 },
        { bound: 3000, count: 4 },
      ])
    ).toBe(1000);
    expect(p95FromBuckets([{ bound: 100, count: 50 }, { bound: 3000, count: 50 }])).toBe(3000);
  });

  it("bucketsFor: 24 bucket giờ cho 24h, 7 bucket ngày cho 7d", () => {
    const now = new Date("2026-09-19T10:30:00.000Z");
    const h = bucketsFor("24h", now);
    expect(h).toHaveLength(24);
    expect(h[0]).toBe("h2026091910");
    expect(bucketsFor("7d", now)).toHaveLength(7);
    expect(bucketsFor("7d", now)[6]).toBe("d20260913");
  });
});
