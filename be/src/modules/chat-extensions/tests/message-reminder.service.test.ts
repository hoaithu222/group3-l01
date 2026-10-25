/**
 * Unit — `MessageReminderService` (p7-04 be.md §5.4, §10): REMIND-01 (tin bị gỡ trước giờ nhắc → nhắc "không còn khả dụng", refs KHÔNG có messageId/nội dung), mất quyền đọc → như gỡ,
 * > 100 nhắc → REMIND_002, REMIND_001 biên 59 s / 365 ngày + 1 s, IANA, chỉ chủ nhắc xoá/xem, job chạy hai lần → một thông báo, người nhận không còn ACTIVE, preview theo quyền lúc xem,
 * cron quét bù, ẩn danh hoá huỷ nhắc.
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { ChatExtHarness, DAY, MINUTE } from "./support/chat-extensions-harness";

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

const dto = (h: ChatExtHarness, over: Partial<{ remindAt: Date; timezone: string }> = {}) => ({ remindAt: h.after(2 * MINUTE), timezone: "Asia/Ho_Chi_Minh", ...over });

describe("đặt nhắc", () => {
  it("cần ĐỌC được tin: tạo PENDING + hàng outbox hẹn giờ (availableAt = remindAt, dedupe theo reminder); không thấy/không tồn tại/đã thu hồi → 404 MSG_012", async () => {
    const alice = h.addUser();
    const bob = h.addUser({ access: null });
    const m = h.sender.seedMessage({ authorId: alice.id, content: "Nhớ nộp báo cáo" });
    const remindAt = h.after(2 * MINUTE);
    const view = await h.reminderService.create(alice, m.id, dto(h, { remindAt }));

    expect(view).toMatchObject({ messageId: m.id, scopeType: "CHANNEL", status: "PENDING", unavailable: false, remindAt, timezone: "Asia/Ho_Chi_Minh" });
    expect(h.outbox.events).toEqual([
      expect.objectContaining({ queue: "notifications", jobName: "message.reminder", dedupeKey: `message.reminder:reminder:${view.id}`, availableAt: remindAt, payload: { reminderId: view.id } }),
    ]);
    expect(await catchApp(() => h.reminderService.create(bob, m.id, dto(h)))).toMatchObject({ statusCode: 404, errorCode: ErrorCode.MSG_012 });
    expect((await catchApp(() => h.reminderService.create(alice, "ee".repeat(12), dto(h)))).errorCode).toBe(ErrorCode.MSG_012);
    h.sender.deleteMessage(m.id);
    expect((await catchApp(() => h.reminderService.create(alice, m.id, dto(h)))).errorCode).toBe(ErrorCode.MSG_012);
  });

  it("REMIND_001: remindAt cách ≥ 1 phút và ≤ 365 ngày (59 s / 365 ngày + 1 s bị từ chối); múi giờ không IANA → 400 VAL_001", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    for (const ms of [-MINUTE, 59_000, 365 * DAY + 1000]) {
      const err = await catchApp(() => h.reminderService.create(alice, m.id, dto(h, { remindAt: h.after(ms) })));
      expect({ status: err.statusCode, code: err.errorCode }).toEqual({ status: 400, code: ErrorCode.REMIND_001 });
    }
    await expect(h.reminderService.create(alice, m.id, dto(h, { remindAt: h.after(MINUTE) }))).resolves.toBeDefined();
    await expect(h.reminderService.create(alice, m.id, dto(h, { remindAt: h.after(365 * DAY) }))).resolves.toBeDefined();
    expect(await catchApp(() => h.reminderService.create(alice, m.id, dto(h, { timezone: "Nowhere/City" })))).toMatchObject({ statusCode: 400, errorCode: ErrorCode.VAL_001 });
  });

  it("REMIND_002: đã có 100 nhắc đang chờ → 409 (người khác không bị ảnh hưởng); xoá một nhắc thì đặt được tiếp", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const created = [];
    for (let i = 0; i < 100; i += 1) created.push(await h.reminderService.create(alice, m.id, dto(h)));
    expect(await catchApp(() => h.reminderService.create(alice, m.id, dto(h)))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.REMIND_002, details: { max: 100 } });
    await expect(h.reminderService.create(bob, m.id, dto(h))).resolves.toBeDefined();
    await h.reminderService.cancel(alice, created[0]?.id as string);
    await expect(h.reminderService.create(alice, m.id, dto(h))).resolves.toBeDefined();
  });

  it("khách (chỉ đọc + đặt nhắc) vẫn đặt nhắc được trong kênh được cấp quyền — không qua cổng quyền tạo", async () => {
    const guest = h.addUser({ access: { allowed: false } });
    const m = h.sender.seedMessage({ authorId: guest.id });
    await expect(h.reminderService.create(guest, m.id, dto(h))).resolves.toBeDefined();
    expect(h.gate.calls).toHaveLength(0);
  });
});

describe("xoá / danh sách", () => {
  it("chỉ chủ nhắc xoá (người khác → 404); xoá → CANCELLED và job sau đó SKIPPED; xoá lại/xoá nhắc đã phát → yên lặng", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const r = await h.reminderService.create(alice, m.id, dto(h));
    expect((await catchApp(() => h.reminderService.cancel(bob, r.id))).statusCode).toBe(404);
    await h.reminderService.cancel(alice, r.id);
    await h.reminderService.cancel(alice, r.id);
    expect((await h.reminderRepo.findById(r.id))?.status).toBe("CANCELLED");
    h.advance(DAY);
    expect(await h.reminderService.fire(r.id)).toBe("SKIPPED");
    expect(h.notifier.reminders).toHaveLength(0);
    expect((await catchApp(() => h.reminderService.cancel(alice, "ee".repeat(12)))).statusCode).toBe(404);
  });

  it("Nhắc lại của tôi: PENDING sắp nhắc trước + phân trang; preview CHỈ khi tin còn đọc được lúc xem (mất quyền/đã gỡ → không preview)", async () => {
    const alice = h.addUser();
    const m1 = h.sender.seedMessage({ authorId: alice.id, content: "Tin số một" });
    const m2 = h.sender.seedMessage({ authorId: alice.id, content: "x".repeat(300) });
    const later = await h.reminderService.create(alice, m1.id, dto(h, { remindAt: h.after(3 * DAY) }));
    const sooner = await h.reminderService.create(alice, m2.id, dto(h, { remindAt: h.after(2 * MINUTE) }));

    const page1 = await h.reminderService.listMine(alice, { status: "PENDING", limit: 1 });
    expect(page1.data.map((r) => r.id)).toEqual([sooner.id]);
    expect(page1.data[0]?.preview?.length).toBe(121);
    const page2 = await h.reminderService.listMine(alice, { status: "PENDING", limit: 1, cursor: page1.nextCursor as string });
    expect(page2.data).toMatchObject([{ id: later.id, preview: "Tin số một" }]);

    h.sender.deleteMessage(m1.id);
    expect((await h.reminderService.listMine(alice, { status: "PENDING", limit: 10 })).data.find((r) => r.id === later.id)).not.toHaveProperty("preview");
    h.sender.revoke(alice.id, "CHANNEL", m2.scopeId);
    expect((await h.reminderService.listMine(alice, { status: "PENDING", limit: 10 })).data.every((r) => !("preview" in r))).toBe(true);
  });
});

describe("đến hạn (job)", () => {
  it("tin còn đọc được → FIRED + thông báo có messageId/phạm vi; chạy hai lần → MỘT thông báo (CAS PENDING→FIRED)", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const r = await h.reminderService.create(alice, m.id, dto(h));
    h.advance(3 * MINUTE);

    expect(await h.reminderService.fire(r.id)).toBe("FIRED");
    expect(await h.reminderService.fire(r.id)).toBe("SKIPPED");
    expect(h.notifier.reminders).toHaveLength(1);
    expect(h.notifier.reminders[0]).toMatchObject({ reminderId: r.id, userId: alice.id, unavailable: false, refs: { reminderId: r.id, messageId: m.id, scopeType: "CHANNEL", scopeId: m.scopeId } });
    expect(await h.reminderRepo.findById(r.id)).toMatchObject({ status: "FIRED", unavailable: false, firedAt: h.clock });
    expect((await h.reminderService.listMine(alice, { status: "FIRED", limit: 10 })).data.map((x) => x.id)).toEqual([r.id]);
  });

  it("REMIND-01: tin bị gỡ trước giờ nhắc → nhắc chung 'không còn khả dụng': unavailable=true, refs KHÔNG có messageId/scope/nội dung", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id, content: "Nội dung nhạy cảm" });
    const r = await h.reminderService.create(alice, m.id, dto(h));
    h.sender.deleteMessage(m.id);
    h.advance(3 * MINUTE);

    expect(await h.reminderService.fire(r.id)).toBe("FIRED");
    const sent = h.notifier.reminders[0];
    expect(sent).toMatchObject({ unavailable: true, refs: { reminderId: r.id, unavailable: true } });
    expect(sent?.refs).not.toHaveProperty("messageId");
    expect(sent?.refs).not.toHaveProperty("scopeId");
    expect(JSON.stringify(sent?.refs)).not.toContain("Nội dung nhạy cảm");
    expect((await h.reminderRepo.findById(r.id))?.unavailable).toBe(true);
  });

  it("mất quyền đọc tin lúc đến hạn → xử lý như gỡ (không lộ tin); người nhận không còn ACTIVE → đánh dấu đã phát nhưng KHÔNG thông báo", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const a = await h.reminderService.create(alice, m.id, dto(h));
    const b = await h.reminderService.create(bob, m.id, dto(h));
    h.sender.revoke(alice.id, "CHANNEL", m.scopeId);
    h.directory.setStatus(bob.id, "LOCKED");
    h.advance(3 * MINUTE);

    expect(await h.reminderService.fire(a.id)).toBe("FIRED");
    expect(h.notifier.reminders).toMatchObject([{ userId: alice.id, unavailable: true }]);
    expect(await h.reminderService.fire(b.id)).toBe("FIRED");
    expect(h.notifier.reminders).toHaveLength(1);
    expect((await h.reminderRepo.findById(b.id))?.status).toBe("FIRED");
  });

  it("cron quét bù: xếp lại job nhắc cho nhắc PENDING lỡ giờ > 2 phút (jobId có hậu tố cửa sổ); nhắc chưa tới giờ không bị đụng", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const missed = await h.reminderService.create(alice, m.id, dto(h, { remindAt: h.after(2 * MINUTE) }));
    const future = await h.reminderService.create(alice, m.id, dto(h, { remindAt: h.after(DAY) }));
    h.advance(5 * MINUTE);
    const result = await h.sweep.run();
    expect(result.remindersRequeued).toBe(1);
    expect(h.enqueuer.jobs).toHaveLength(1);
    expect(h.enqueuer.jobs[0]).toMatchObject({ queue: "notifications", name: "message.reminder", payload: { reminderId: missed.id } });
    expect(h.enqueuer.jobs[0]?.jobId).toMatch(new RegExp(`^message\\.reminder:reminder:${missed.id}:r\\d+$`));
    expect(h.enqueuer.jobs.some((j) => (j.payload as { reminderId: string }).reminderId === future.id)).toBe(false);
  });

  it("ẩn danh hoá tài khoản: huỷ mọi nhắc PENDING của người đó (không ảnh hưởng người khác)", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    await h.reminderService.create(alice, m.id, dto(h));
    await h.reminderService.create(alice, m.id, dto(h));
    const kept = await h.reminderService.create(bob, m.id, dto(h));
    expect(await h.reminderService.cancelAllOfUser(alice.id)).toBe(2);
    expect((await h.reminderRepo.findById(kept.id))?.status).toBe("PENDING");
  });
});
