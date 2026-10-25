/**
 * Unit — `ScheduledMessageService` (p7-04 be.md §5.3, §10): SCHED_001 biên 59 s / 30 ngày + 1 s, IANA hợp lệ, > 50 tin chờ → SCHED_002, sửa `sendAt` → hàng outbox MỚI khoá theo version
 * (SCHED-03), sửa khi đã gửi → SCHED_003, version lệch → RES_003, huỷ, tác giả khác → 404, gửi ngay, cổng quyền GUEST, phạm vi mất quyền, danh sách của tôi.
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { CH, ChatExtHarness, DAY, MINUTE } from "./support/chat-extensions-harness";

let h: ChatExtHarness;
beforeEach(() => {
  h = new ChatExtHarness();
});

async function catchApp(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

const dto = (h: ChatExtHarness, over: Partial<{ content: string; sendAt: Date; timezone: string; attachmentAssetIds: string[]; threadId: string; replyToId: string }> = {}) => ({
  content: "Nhắc họp 9h",
  mentions: [],
  attachmentAssetIds: [],
  sendAt: h.after(2 * MINUTE),
  timezone: "Asia/Ho_Chi_Minh",
  ...over,
});

describe("tạo tin hẹn giờ", () => {
  it("lưu PENDING (chưa phải Message), ghi hàng outbox hẹn giờ khoá theo version 1, phát scheduled-message:updated tới tác giả, không gửi tin", async () => {
    const alice = h.addUser();
    const sendAt = h.after(2 * MINUTE);
    h.directory.setScopeLabel("CHANNEL", CH, "kênh-chung");
    const view = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt }));

    expect(view).toMatchObject({ status: "PENDING", content: "Nhắc họp 9h", sendAt, timezone: "Asia/Ho_Chi_Minh", version: 1, messageId: null, scopeLabel: "kênh-chung", scopeType: "CHANNEL", scopeId: CH });
    expect(h.sender.sent).toHaveLength(0);
    expect(h.outbox.events).toHaveLength(1);
    expect(h.outbox.events[0]).toMatchObject({
      queue: "notifications",
      jobName: "scheduled-message.send",
      dedupeKey: `scheduled-message.send:scheduled:${view.id}:v1`,
      availableAt: sendAt,
      payload: { scheduledMessageId: view.id, version: 1 },
    });
    expect(h.gate.calls[0]?.key).toBe("SCHEDULED_MESSAGE_CREATE");
    expect(h.emitter.users).toEqual([{ userIds: [alice.id], event: SocketEvent.SCHEDULED_MESSAGE_UPDATED, payload: { id: view.id, status: "PENDING", sendAt, messageId: null, failReason: null, version: 1 } }]);
  });

  it("SCHED_001: sendAt phải cách ≥ 1 phút và ≤ 30 ngày (biên 59 s và 30 ngày + 1 s bị từ chối; 60 s và đúng 30 ngày hợp lệ)", async () => {
    const alice = h.addUser();
    for (const ms of [-MINUTE, 0, 59_000, 30 * DAY + 1000]) {
      const err = await catchApp(() => h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(ms) })));
      expect({ status: err.statusCode, code: err.errorCode }).toEqual({ status: 400, code: ErrorCode.SCHED_001 });
    }
    await expect(h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(MINUTE) }))).resolves.toBeDefined();
    await expect(h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(30 * DAY) }))).resolves.toBeDefined();
  });

  it("múi giờ không phải IANA → 400 VAL_001; nội dung rỗng → MSG_007 (từ validateDraft); lỗi nội dung báo NGAY lúc hẹn", async () => {
    const alice = h.addUser();
    expect(await catchApp(() => h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { timezone: "Mars/Olympus" })))).toMatchObject({ statusCode: 400, errorCode: ErrorCode.VAL_001 });
    expect(await catchApp(() => h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { content: "   " })))).toMatchObject({ statusCode: 400, errorCode: ErrorCode.MSG_007 });
  });

  it("SCHED_002: đã có 50 tin đang chờ → 409 (người khác không bị ảnh hưởng); huỷ một tin thì hẹn được tiếp", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const created = [];
    for (let i = 0; i < 50; i += 1) created.push(await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { content: `tin ${i}` })));
    expect(await catchApp(() => h.scheduledService.create(alice, "CHANNEL", CH, dto(h)))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.SCHED_002, details: { max: 50 } });
    await expect(h.scheduledService.create(bob, "CHANNEL", CH, dto(h))).resolves.toBeDefined();
    await h.scheduledService.cancel(alice, created[0]?.id as string);
    await expect(h.scheduledService.create(alice, "CHANNEL", CH, dto(h))).resolves.toBeDefined();
  });

  it("quyền: không thấy phạm vi → 404; thấy nhưng không ghi được → 403 MSG_004; cổng SCHEDULED_MESSAGE_CREATE từ chối (vd GUEST) → 403; thread chỉ ở kênh", async () => {
    const outsider = h.addUser({ access: null });
    expect((await catchApp(() => h.scheduledService.create(outsider, "CHANNEL", CH, dto(h)))).statusCode).toBe(404);
    const reader = h.addUser({ access: { allowed: false } });
    expect(await catchApp(() => h.scheduledService.create(reader, "CHANNEL", CH, dto(h)))).toMatchObject({ statusCode: 403, errorCode: ErrorCode.MSG_004 });
    const guest = h.addUser();
    h.gate.deny(guest.id, "SCHEDULED_MESSAGE_CREATE");
    expect((await catchApp(() => h.scheduledService.create(guest, "CHANNEL", CH, dto(h)))).statusCode).toBe(403);
    const dm = h.addUser({ scopeType: "CONVERSATION" });
    expect((await catchApp(() => h.scheduledService.create(dm, "CONVERSATION", "c2".repeat(12), dto(h, { threadId: "aa".repeat(12) })))).statusCode).toBe(400);
  });

  it("có tệp: giữ bằng AssetLink SCHEDULED_MESSAGE (attach) và trả thông tin tệp; huỷ → gỡ liên kết", async () => {
    const alice = h.addUser();
    const asset = "aa".repeat(12);
    h.directory.addAsset(asset, { name: "de-cuong.pdf", mime: "application/pdf", size: 2048 });
    const view = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { attachmentAssetIds: [asset], content: "" }));
    expect(h.assets.attached).toEqual([{ assetIds: [asset], scheduledMessageId: view.id }]);
    expect(view.attachments).toEqual([{ assetId: asset, name: "de-cuong.pdf", mime: "application/pdf", size: 2048 }]);
    await h.scheduledService.cancel(alice, view.id);
    expect(h.assets.detached).toEqual([{ scheduledMessageId: view.id }]);
  });
});

describe("sửa / huỷ", () => {
  it("SCHED-03: đổi sendAt → version+1, hàng outbox MỚI (:v2, availableAt mới); job cũ (:v1) không khớp CAS lúc phát", async () => {
    const alice = h.addUser();
    const v1 = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h));
    const newTime = h.after(3 * DAY);
    const v2 = await h.scheduledService.update(alice, v1.id, { sendAt: newTime, expectedVersion: 1 });
    expect(v2).toMatchObject({ version: 2, sendAt: newTime, status: "PENDING" });
    expect(h.outbox.events.map((e) => e.dedupeKey)).toEqual([`scheduled-message.send:scheduled:${v1.id}:v1`, `scheduled-message.send:scheduled:${v1.id}:v2`]);
    expect(h.outbox.events[1]?.availableAt).toEqual(newTime);

    // Job cũ (version 1) tới hạn: không phát; job mới (version 2) phát đúng bản đã sửa.
    h.advance(3 * DAY + MINUTE);
    expect((await h.dispatch.dispatch({ id: v1.id, version: 1 })).kind).toBe("SKIPPED");
    expect(h.sender.sent).toHaveLength(0);
    expect((await h.dispatch.dispatch({ id: v1.id, version: 2 })).kind).toBe("SENT");
    expect(h.sender.sent).toHaveLength(1);
  });

  it("đổi nội dung/tệp: validateDraft chạy lại; tệp thêm → attach, tệp bớt → detach; version lệch → 409 RES_003 (details.currentVersion)", async () => {
    const alice = h.addUser();
    const [a, b] = ["aa".repeat(12), "bb".repeat(12)];
    const v1 = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { attachmentAssetIds: [a] }));
    const v2 = await h.scheduledService.update(alice, v1.id, { content: "Nội dung mới", attachmentAssetIds: [b], expectedVersion: 1 });
    expect(v2).toMatchObject({ content: "Nội dung mới", version: 2 });
    expect(v2.attachments.map((x) => x.assetId)).toEqual([b]);
    expect(h.assets.attached.at(-1)).toEqual({ assetIds: [b], scheduledMessageId: v1.id });
    expect(h.assets.detached.at(-1)).toEqual({ scheduledMessageId: v1.id, assetIds: [a] });

    expect(await catchApp(() => h.scheduledService.update(alice, v1.id, { content: "x", expectedVersion: 1 }))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.RES_003, details: { currentVersion: 2 } });
    h.sender.draftError = new AppError("nội dung sai", 400, ErrorCode.MSG_001);
    expect((await catchApp(() => h.scheduledService.update(alice, v1.id, { content: "y", expectedVersion: 2 }))).errorCode).toBe(ErrorCode.MSG_001);
  });

  it("chỉ tác giả sửa/huỷ/gửi ngay (người khác → 404); không còn PENDING → 409 SCHED_003; sendAt mới cũng phải hợp lệ (SCHED_001)", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const v = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h));
    for (const fn of [() => h.scheduledService.update(bob, v.id, { content: "x", expectedVersion: 1 }), () => h.scheduledService.cancel(bob, v.id), () => h.scheduledService.sendNow(bob, v.id)]) {
      expect((await catchApp(fn)).statusCode).toBe(404);
    }
    expect((await catchApp(() => h.scheduledService.update(alice, v.id, { sendAt: h.after(10_000), expectedVersion: 1 }))).errorCode).toBe(ErrorCode.SCHED_001);

    h.advance(3 * MINUTE);
    await h.dispatch.dispatch({ id: v.id, version: 1 });
    const sent = await h.scheduled.findById(v.id);
    expect(sent?.status).toBe("SENT");
    for (const fn of [() => h.scheduledService.update(alice, v.id, { content: "x", expectedVersion: sent?.version ?? 0 }), () => h.scheduledService.cancel(alice, v.id), () => h.scheduledService.sendNow(alice, v.id)]) {
      expect(await catchApp(fn)).toMatchObject({ statusCode: 409, errorCode: ErrorCode.SCHED_003 });
    }
  });

  it("huỷ → CANCELLED, phát sự kiện; huỷ lại → yên lặng (idempotent); job hẹn giờ sau đó không phát", async () => {
    const alice = h.addUser();
    const v = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h));
    await h.scheduledService.cancel(alice, v.id);
    await h.scheduledService.cancel(alice, v.id);
    expect((await h.scheduled.findById(v.id))?.status).toBe("CANCELLED");
    expect(h.emitter.users.at(-1)?.payload).toMatchObject({ id: v.id, status: "CANCELLED" });
    h.advance(DAY);
    expect((await h.dispatch.dispatch({ id: v.id, version: 1 })).kind).toBe("SKIPPED");
    expect(h.sender.sent).toHaveLength(0);
  });
});

describe("gửi ngay + danh sách của tôi", () => {
  it("send-now: phát đúng luồng job → { scheduledMessage SENT, message }; job hẹn cũ sau đó không phát lần hai; mất quyền → 403 SCHED_004 và bản ghi giữ PENDING", async () => {
    const alice = h.addUser();
    const v = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(DAY) }));
    const r = await h.scheduledService.sendNow(alice, v.id);
    expect(r.scheduledMessage).toMatchObject({ status: "SENT", messageId: r.message.id });
    expect(r.message).toMatchObject({ content: "Nhắc họp 9h", authorId: alice.id });
    h.advance(2 * DAY);
    expect((await h.dispatch.dispatch({ id: v.id, version: 1 })).kind).toBe("SKIPPED");
    expect(h.sender.sent).toHaveLength(1);

    const w = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h));
    h.sender.grant(alice.id, "CHANNEL", CH, { allowed: false });
    expect(await catchApp(() => h.scheduledService.sendNow(alice, w.id))).toMatchObject({ statusCode: 403, errorCode: ErrorCode.SCHED_004 });
    expect((await h.scheduled.findById(w.id))?.status).toBe("PENDING");
  });

  it("GET /me: lọc theo trạng thái, PENDING sắp phát trước, phân trang cursor; scopeLabel null khi mất quyền đọc phạm vi", async () => {
    const alice = h.addUser();
    h.directory.setScopeLabel("CHANNEL", CH, "kênh-chung");
    const later = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(3 * DAY), content: "muộn" }));
    const sooner = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(2 * MINUTE), content: "sớm" }));
    const mid = await h.scheduledService.create(alice, "CHANNEL", CH, dto(h, { sendAt: h.after(DAY), content: "giữa" }));
    await h.scheduledService.cancel(alice, mid.id);

    const page1 = await h.scheduledService.listMine(alice, { status: "PENDING", limit: 1 });
    expect(page1.data.map((x) => x.id)).toEqual([sooner.id]);
    expect(page1.hasMore).toBe(true);
    const page2 = await h.scheduledService.listMine(alice, { status: "PENDING", limit: 1, cursor: page1.nextCursor as string });
    expect(page2.data.map((x) => x.id)).toEqual([later.id]);
    expect(page2.hasMore).toBe(false);
    expect((await h.scheduledService.listMine(alice, { status: "CANCELLED", limit: 10 })).data.map((x) => x.id)).toEqual([mid.id]);
    expect(page1.data[0]?.scopeLabel).toBe("kênh-chung");

    h.sender.revoke(alice.id, "CHANNEL", CH);
    expect((await h.scheduledService.listMine(alice, { status: "PENDING", limit: 10 })).data.every((x) => x.scopeLabel === null)).toBe(true);
    expect((await catchApp(() => h.scheduledService.listMine(alice, { status: "PENDING", limit: 10, cursor: "@@@" }))).statusCode).toBe(400);
  });
});
