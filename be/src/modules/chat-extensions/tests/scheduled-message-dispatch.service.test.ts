/**
 * Unit — `ScheduledMessageDispatchService` (p7-04 be.md §5.3, §10): SCHED-01 (kênh archived/mất grant/bị chặn → FAILED + thông báo tác giả, KHÔNG gọi send), SCHED-02 (job chạy 2 lần → MỘT Message),
 * version cũ → no-op, lỗi hạ tầng → về PENDING rồi ném (BullMQ thử lại), hết lượt → FAILED UNKNOWN, lỗi nghiệp vụ phân loại đúng (ATTACHMENT_INVALID/NO_PERMISSION/UNKNOWN + failCode),
 * tác giả không còn ACTIVE (scrub nội dung), cờ phụ tắt, bản ghi kẹt SENDING được nhận lại (worker chết giữa chừng), cron quét bù.
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { CH, ChatExtHarness, DAY, MINUTE } from "./support/chat-extensions-harness";

let h: ChatExtHarness;
beforeEach(() => {
  h = new ChatExtHarness();
});

async function schedule(over: Partial<{ content: string; attachmentAssetIds: string[]; sendAt: Date }> = {}) {
  const alice = h.addUser();
  const view = await h.scheduledService.create(alice, "CHANNEL", CH, { content: "Nhắc 9h", mentions: [], attachmentAssetIds: [], sendAt: h.after(2 * MINUTE), timezone: "Asia/Ho_Chi_Minh", ...over });
  h.advance(3 * MINUTE);
  return { alice, id: view.id };
}

describe("phát thành công", () => {
  it("claim → gửi qua cổng với clientMessageId `sched:<id>` → SENT (messageId, sentAt), gỡ AssetLink, phát scheduled-message:updated; không thông báo lỗi", async () => {
    const { alice, id } = await schedule({ content: "Nhắc 9h" });
    const out = await h.dispatch.dispatch({ id, version: 1 });

    expect(out.kind).toBe("SENT");
    expect(h.sender.sent).toHaveLength(1);
    expect(h.sender.sent[0]).toMatchObject({ authorId: alice.id, scopeType: "CHANNEL", scopeId: CH, clientMessageId: `sched:${id}`, content: "Nhắc 9h" });
    const row = await h.scheduled.findById(id);
    expect(row).toMatchObject({ status: "SENT", attempts: 1, version: 2 });
    expect(row?.messageId).toBe(h.sender.messages.keys().next().value);
    expect(row?.sentAt).toEqual(h.clock);
    expect(h.assets.detached.at(-1)).toEqual({ scheduledMessageId: id });
    expect(h.notifier.failed).toHaveLength(0);
    expect(h.emitter.users.at(-1)).toMatchObject({ userIds: [alice.id], event: SocketEvent.SCHEDULED_MESSAGE_UPDATED, payload: { id, status: "SENT" } });
  });

  it("SCHED-02: job chạy hai lần (cùng version) → chỉ MỘT Message; lần hai SKIPPED", async () => {
    const { id } = await schedule();
    const [a, b] = await Promise.all([h.dispatch.dispatch({ id, version: 1 }), h.dispatch.dispatch({ id, version: 1 })]);
    expect([a.kind, b.kind].sort()).toEqual(["SENT", "SKIPPED"]);
    expect(await h.dispatch.dispatch({ id, version: 1 })).toEqual({ kind: "SKIPPED", reason: "STALE" });
    expect(h.sender.messages.size).toBe(1);
  });

  it("version cũ (đã sửa) hoặc bản ghi không tồn tại → SKIPPED, không gửi", async () => {
    const { alice, id } = await schedule();
    await h.scheduledService.update(alice, id, { content: "Bản sửa", expectedVersion: 1 });
    expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("SKIPPED");
    expect((await h.dispatch.dispatch({ id: "ff".repeat(12), version: 1 })).kind).toBe("SKIPPED");
    expect(h.sender.sent).toHaveLength(0);
    expect((await h.dispatch.dispatch({ id, version: 2 })).kind).toBe("SENT");
    expect(h.sender.sent[0]?.content).toBe("Bản sửa");
  });
});

describe("SCHED-01: không phát được → FAILED + thông báo, KHÔNG gọi send", () => {
  it("mất quyền ghi/đọc phạm vi (kênh archived, mất grant, bị chặn DM đều là allowed=false) → FAILED NO_PERMISSION; tác giả nhận thông báo (không kèm nội dung), tệp được gỡ", async () => {
    const { alice, id } = await schedule({ attachmentAssetIds: ["aa".repeat(12)], content: "Bí mật" });
    h.sender.grant(alice.id, "CHANNEL", CH, { allowed: false });
    const out = await h.dispatch.dispatch({ id, version: 1 });

    expect(out.kind).toBe("FAILED");
    expect(h.sender.sent).toHaveLength(0);
    expect(await h.scheduled.findById(id)).toMatchObject({ status: "FAILED", failReason: "NO_PERMISSION", failCode: null });
    expect(h.notifier.failed).toEqual([{ scheduledMessageId: id, authorId: alice.id, reason: "NO_PERMISSION" }]);
    expect(JSON.stringify(h.notifier.failed)).not.toContain("Bí mật");
    expect(h.assets.detached.at(-1)).toEqual({ scheduledMessageId: id });
    expect(h.emitter.users.at(-1)?.payload).toMatchObject({ id, status: "FAILED", failReason: "NO_PERMISSION" });

    h.sender.revoke(alice.id, "CHANNEL", CH);
    const { id: id2 } = await (async () => {
      const bob = h.addUser();
      const v = await h.scheduledService.create(bob, "CHANNEL", CH, { content: "x", mentions: [], attachmentAssetIds: [], sendAt: h.after(2 * MINUTE), timezone: "UTC" });
      h.sender.revoke(bob.id, "CHANNEL", CH);
      return { id: v.id };
    })();
    expect((await h.dispatch.dispatch({ id: id2, version: 1 })).kind).toBe("FAILED");
  });

  it("tác giả không còn ACTIVE (khoá/xoá/ẩn danh) → FAILED AUTHOR_INACTIVE, xoá luôn nội dung/tệp/mention, KHÔNG thông báo", async () => {
    const { alice, id } = await schedule({ content: "Riêng tư", attachmentAssetIds: ["bb".repeat(12)] });
    h.directory.setStatus(alice.id, "ANONYMIZED");
    const out = await h.dispatch.dispatch({ id, version: 1 });
    expect(out.kind).toBe("FAILED");
    expect(await h.scheduled.findById(id)).toMatchObject({ status: "FAILED", failReason: "AUTHOR_INACTIVE", content: null, mentions: [], attachmentAssetIds: [] });
    expect(h.notifier.failed).toHaveLength(0);
    expect(h.sender.sent).toHaveLength(0);
  });

  it("cờ phụ scheduledMessages đã tắt sau khi hẹn → FAILED SUB_FEATURE_OFF (job đang chờ vẫn chạy nhưng không phát)", async () => {
    const { id } = await schedule();
    h.scheduledMessagesEnabled = false;
    expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("FAILED");
    expect(await h.scheduled.findById(id)).toMatchObject({ status: "FAILED", failReason: "SUB_FEATURE_OFF" });
    expect(h.sender.sent).toHaveLength(0);
    expect(h.notifier.failed).toHaveLength(1);
  });
});

describe("lỗi khi gửi", () => {
  const appError = (code: keyof typeof ErrorCode, status: number) => new AppError(ErrorMessages[ErrorCode[code]], status as 400, ErrorCode[code]);

  it("lỗi nghiệp vụ của engine phân loại: MSG_005 → ATTACHMENT_INVALID; 403/404 → NO_PERMISSION; còn lại (MSG_008…) → UNKNOWN; luôn kèm failCode; không thử lại", async () => {
    for (const [err, reason, code] of [
      [appError("MSG_005", 400), "ATTACHMENT_INVALID", "MSG_005"],
      [appError("MSG_004", 403), "NO_PERMISSION", "MSG_004"],
      [appError("PERM_404", 404), "NO_PERMISSION", "PERM_404"],
      [appError("MSG_008", 400), "UNKNOWN", "MSG_008"],
    ] as const) {
      const { id } = await schedule();
      h.sender.sendErrors.push(err);
      expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("FAILED");
      expect(await h.scheduled.findById(id)).toMatchObject({ status: "FAILED", failReason: reason, failCode: code });
    }
    expect(h.notifier.failed).toHaveLength(4);
  });

  it("lỗi hạ tầng → trả về PENDING và NÉM lại (BullMQ thử lại); lần thử sau cùng version vẫn phát được; hết số lần thử → FAILED UNKNOWN", async () => {
    const { id } = await schedule();
    h.sender.sendErrors.push(new Error("Mongo tạm mất kết nối"));
    await expect(h.dispatch.dispatch({ id, version: 1 })).rejects.toThrow("Mongo tạm mất kết nối");
    expect(await h.scheduled.findById(id)).toMatchObject({ status: "PENDING", attempts: 1, version: 1 });
    expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("SENT");

    const { id: id2 } = await schedule();
    h.sender.sendErrors.push(new Error("lỗi 1"), new Error("lỗi 2"), new Error("lỗi 3"));
    await expect(h.dispatch.dispatch({ id: id2, version: 1 })).rejects.toThrow("lỗi 1");
    await expect(h.dispatch.dispatch({ id: id2, version: 1 })).rejects.toThrow("lỗi 2");
    // Lần thứ 3 = hết lượt: kết luận thất bại thay vì ném.
    expect((await h.dispatch.dispatch({ id: id2, version: 1 })).kind).toBe("FAILED");
    expect(await h.scheduled.findById(id2)).toMatchObject({ status: "FAILED", failReason: "UNKNOWN", attempts: 3 });
  });

  it("worker chết giữa SENDING: bản ghi kẹt quá 2 phút được nhận lại và phát tiếp; chưa quá hạn thì KHÔNG (tránh phát chồng)", async () => {
    const { id } = await schedule();
    await h.scheduled.claimForSend(id, 1, new Date(h.clock.getTime() - 120_000)); // mô phỏng worker đã claim rồi chết
    expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("SKIPPED");
    h.advance(3 * MINUTE);
    expect((await h.dispatch.dispatch({ id, version: 1 })).kind).toBe("SENT");
    expect((await h.scheduled.findById(id))?.attempts).toBe(2);
  });

  it("engine đã tạo tin ở lần trước (crash trước khi đánh dấu SENT) → gửi lại trả tin cũ (replayed) và chỉ đánh dấu SENT — không tạo tin thứ hai", async () => {
    const { alice, id } = await schedule();
    const first = await h.sender.send({ authorId: alice.id, scopeType: "CHANNEL", scopeId: CH, clientMessageId: `sched:${id}`, content: "Nhắc 9h" });
    await h.scheduled.claimForSend(id, 1, h.clock);
    h.advance(3 * MINUTE);
    const out = await h.dispatch.dispatch({ id, version: 1 });
    expect(out.kind).toBe("SENT");
    expect(h.sender.messages.size).toBe(1);
    expect((await h.scheduled.findById(id))?.messageId).toBe(first.view.id);
  });
});

describe("cron quét bù", () => {
  it("xếp lại job phát cho tin PENDING lỡ giờ > 2 phút hoặc SENDING kẹt, CÙNG version, jobId có hậu tố cửa sổ 5 phút; tin chưa tới giờ/đã gửi không bị đụng; chạy lặp trong cùng cửa sổ cho cùng jobId", async () => {
    const { id: missed } = await schedule({ sendAt: h.after(2 * MINUTE) });
    h.advance(5 * MINUTE);
    const alice = h.addUser();
    const future = await h.scheduledService.create(alice, "CHANNEL", CH, { content: "sau", mentions: [], attachmentAssetIds: [], sendAt: h.after(DAY), timezone: "UTC" });
    const sentId = (await schedule()).id;
    await h.dispatch.dispatch({ id: sentId, version: 1 });

    const first = await h.sweep.run();
    expect(first.scheduledRequeued).toBe(1);
    expect(h.enqueuer.jobs).toHaveLength(1);
    expect(h.enqueuer.jobs[0]).toMatchObject({ queue: "notifications", name: "scheduled-message.send", payload: { scheduledMessageId: missed, version: 1 } });
    expect(h.enqueuer.jobs[0]?.jobId).toMatch(new RegExp(`^scheduled-message\\.send:scheduled:${missed}:v1:r\\d+$`));
    expect(h.enqueuer.jobs.some((j) => (j.payload as { scheduledMessageId: string }).scheduledMessageId === future.id)).toBe(false);

    await h.sweep.run();
    expect(h.enqueuer.jobs[1]?.jobId).toBe(h.enqueuer.jobs[0]?.jobId);
  });
});
