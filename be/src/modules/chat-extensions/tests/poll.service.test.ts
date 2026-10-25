/**
 * Unit — `PollService` (p7-04 be.md §5.2, §10): POLL-01 (một đáp án nhưng gửi 2 → POLL_003), lựa chọn trùng/ngoài khoảng → POLL_001, hạn chốt POLL_002, đổi phiếu cập nhật đếm, bỏ phiếu,
 * POLL-02 (hai request cùng người → MỘT phiếu, đếm đúng), POLL-04 (bầu sau hạn → POLL_004; job đóng), POLL-05 (mất quyền → 404), đóng bởi người khác (AUTH_005)/moderator, tin bị thu hồi
 * đóng khảo sát, danh sách người bầu (ẩn danh → POLL_006). Repository in-memory + cổng gửi tin giả — service chạy mã thật.
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { CH, ChatExtHarness, DAY, MINUTE, pollDto } from "./support/chat-extensions-harness";

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

const optionIdOf = (poll: { options: Array<{ id: string; text: string }> }, text: string): string => (poll.options.find((o) => o.text === text) as { id: string }).id;

describe("tạo khảo sát", () => {
  it("tạo tin POLL qua cổng + Poll cùng transaction: content = câu hỏi, lựa chọn có id 8 ký tự, đếm 0, người tạo canClose", async () => {
    const alice = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ question: "  Đi ăn ở đâu?  ", options: ["Phở", " Bún ", "Cơm"] }));

    expect(r.replayed).toBe(false);
    expect(r.message).toMatchObject({ kind: "POLL", content: "Đi ăn ở đâu?", authorId: alice.id });
    expect(r.poll).toMatchObject({ question: "Đi ăn ở đâu?", multi: false, anonymous: false, status: "OPEN", voterCount: 0, myOptionIds: [], canClose: true, canViewVoters: true });
    expect(r.poll.options.map((o) => [o.text, o.voteCount, o.percent])).toEqual([["Phở", 0, 0], ["Bún", 0, 0], ["Cơm", 0, 0]]);
    expect(new Set(r.poll.options.map((o) => o.id)).size).toBe(3);
    expect(r.poll.options.every((o) => /^[0-9a-f]{8}$/.test(o.id))).toBe(true);
    expect(h.sender.sent[0]).toMatchObject({ kind: "POLL", content: "Đi ăn ở đâu?" });
    expect(h.gate.calls).toEqual([{ key: "POLL_CREATE", scope: { scopeType: "CHANNEL", scopeId: CH, workspaceId: expect.any(String) } }]);
  });

  it("có hạn chốt → ghi hàng outbox hẹn giờ `poll.close` (availableAt = closesAt, dedupe theo poll); không hạn → không ghi", async () => {
    const alice = h.addUser();
    const noDeadline = await h.pollService.create(alice, "CHANNEL", CH, pollDto());
    expect(h.outbox.events).toHaveLength(0);

    const closesAt = h.after(2 * DAY);
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt }));
    expect(h.outbox.events).toHaveLength(1);
    expect(h.outbox.events[0]).toMatchObject({ queue: "notifications", jobName: "poll.close", dedupeKey: `poll.close:poll:${r.poll.id}`, availableAt: closesAt, payload: { pollId: r.poll.id } });
    expect(noDeadline.poll.id).not.toBe(r.poll.id);
  });

  it("POLL-01/khoảng lựa chọn: < 2, > 10, trùng sau chuẩn hoá (không phân biệt hoa/thường, dấu), rỗng, quá dài → POLL_001; câu hỏi quá dài → POLL_001", async () => {
    const alice = h.addUser();
    const bad = async (options: string[], question = "Hỏi gì?"): Promise<AppError> => catchApp(() => h.pollService.create(alice, "CHANNEL", CH, pollDto({ options, question })));
    for (const options of [["Một"], Array.from({ length: 11 }, (_, i) => `Lựa chọn ${i}`), ["Phở", "PHỞ"], ["Phở", "pho"], ["Phở", "   "], ["Phở", "x".repeat(101)]]) {
      const err = await bad(options);
      expect({ status: err.statusCode, code: err.errorCode }).toEqual({ status: 400, code: ErrorCode.POLL_001 });
    }
    expect((await bad(["A", "B"], "q".repeat(301))).errorCode).toBe(ErrorCode.POLL_001);
    // Biên hợp lệ: đúng 2 và đúng 10, câu hỏi/lựa chọn dài đúng trần.
    await expect(h.pollService.create(alice, "CHANNEL", CH, pollDto({ options: ["A", "B"] }))).resolves.toBeDefined();
    await expect(h.pollService.create(alice, "CHANNEL", CH, pollDto({ options: Array.from({ length: 10 }, (_, i) => `L${i}`), question: "q".repeat(300) }))).resolves.toBeDefined();
    await expect(h.pollService.create(alice, "CHANNEL", CH, pollDto({ options: ["a".repeat(100), "b"] }))).resolves.toBeDefined();
    expect(h.sender.sent).toHaveLength(3);
  });

  it("POLL_002: hạn chốt phải cách ≥ 1 phút và ≤ 30 ngày (biên 59 s / 30 ngày + 1 s bị từ chối)", async () => {
    const alice = h.addUser();
    const at = (ms: number) => catchApp(() => h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt: h.after(ms) })));
    for (const ms of [-MINUTE, 59_000, 30 * DAY + 1000]) expect((await at(ms)).errorCode).toBe(ErrorCode.POLL_002);
    await expect(h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt: h.after(MINUTE) }))).resolves.toBeDefined();
    await expect(h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt: h.after(30 * DAY) }))).resolves.toBeDefined();
  });

  it("thứ tự kiểm quyền: không thấy kênh → 404; thấy nhưng không được ghi → 403 MSG_004; cổng quyền POLL_CREATE từ chối → 403 và KHÔNG gửi tin", async () => {
    const outsider = h.addUser({ access: null });
    expect((await catchApp(() => h.pollService.create(outsider, "CHANNEL", CH, pollDto()))).statusCode).toBe(404);
    const reader = h.addUser({ access: { allowed: false } });
    expect(await catchApp(() => h.pollService.create(reader, "CHANNEL", CH, pollDto()))).toMatchObject({ statusCode: 403, errorCode: ErrorCode.MSG_004 });
    const guest = h.addUser();
    h.gate.deny(guest.id, "POLL_CREATE");
    expect((await catchApp(() => h.pollService.create(guest, "CHANNEL", CH, pollDto()))).statusCode).toBe(403);
    expect(h.sender.sent).toHaveLength(0);
  });

  it("gửi lại cùng clientMessageId → replayed, KHÔNG tạo Poll thứ hai; thread chỉ ở kênh", async () => {
    const alice = h.addUser();
    const dto = pollDto();
    const first = await h.pollService.create(alice, "CHANNEL", CH, dto);
    const second = await h.pollService.create(alice, "CHANNEL", CH, dto);
    expect(second.replayed).toBe(true);
    expect(second.poll.id).toBe(first.poll.id);
    expect((await h.polls.findByMessageIds([first.message.id])).length).toBe(1);

    const dm = h.addUser({ scopeType: "CONVERSATION" });
    expect((await catchApp(() => h.pollService.create(dm, "CONVERSATION", "c2".repeat(12), pollDto({ threadId: "aa".repeat(12) })))).statusCode).toBe(400);
  });
});

describe("bầu / đổi / bỏ phiếu", () => {
  async function setup(over: Parameters<typeof pollDto>[0] = {}) {
    const alice = h.addUser();
    const bob = h.addUser();
    const created = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ options: ["Phở", "Bún", "Cơm"], ...over }));
    return { alice, bob, pollId: created.poll.id, poll: created.poll };
  }

  it("bầu lần đầu → +1 người/+1 phiếu, myOptionIds của người bầu; đổi lựa chọn → đếm dịch chuyển, voterCount giữ; bỏ phiếu → −1", async () => {
    const { bob, pollId, poll } = await setup();
    const pho = optionIdOf(poll, "Phở");
    const bun = optionIdOf(poll, "Bún");

    let v = await h.pollService.vote(bob, pollId, [pho]);
    expect(v).toMatchObject({ voterCount: 1, myOptionIds: [pho] });
    expect(v.options.find((o) => o.id === pho)).toMatchObject({ voteCount: 1, percent: 100 });

    v = await h.pollService.vote(bob, pollId, [bun]);
    expect(v.voterCount).toBe(1);
    expect(v.options.map((o) => o.voteCount)).toEqual([0, 1, 0]);
    expect(v.myOptionIds).toEqual([bun]);

    v = await h.pollService.unvote(bob, pollId);
    expect(v).toMatchObject({ voterCount: 0, myOptionIds: [] });
    expect(v.options.every((o) => o.voteCount === 0)).toBe(true);
    // Bỏ phiếu khi chưa bầu = không đổi gì.
    expect((await h.pollService.unvote(bob, pollId)).voterCount).toBe(0);
  });

  it("bầu lại đúng lựa chọn cũ = không đổi (không tăng version, không phát sự kiện); nhiều người cộng dồn, percent tính trên số người", async () => {
    const { alice, bob, pollId, poll } = await setup({ multi: true });
    const [pho, bun] = [optionIdOf(poll, "Phở"), optionIdOf(poll, "Bún")];
    await h.pollService.vote(bob, pollId, [pho, bun]);
    const versionAfter = (await h.polls.findById(pollId))?.version;
    const emitted = h.emitter.rooms.length;
    await h.pollService.vote(bob, pollId, [bun, pho]);
    expect((await h.polls.findById(pollId))?.version).toBe(versionAfter);
    expect(h.emitter.rooms).toHaveLength(emitted);

    const v = await h.pollService.vote(alice, pollId, [pho]);
    expect(v.voterCount).toBe(2);
    expect(v.options.find((o) => o.id === pho)).toMatchObject({ voteCount: 2, percent: 100 });
    expect(v.options.find((o) => o.id === bun)).toMatchObject({ voteCount: 1, percent: 50 });
  });

  it("POLL-01: khảo sát một đáp án nhưng gửi 2 lựa chọn → 400 POLL_003; lựa chọn lạ → 404 POLL_005; không ghi gì khi lỗi", async () => {
    const { bob, pollId, poll } = await setup({ multi: false });
    const err = await catchApp(() => h.pollService.vote(bob, pollId, [optionIdOf(poll, "Phở"), optionIdOf(poll, "Bún")]));
    expect({ status: err.statusCode, code: err.errorCode }).toEqual({ status: 400, code: ErrorCode.POLL_003 });
    expect(await catchApp(() => h.pollService.vote(bob, pollId, ["deadbeef"]))).toMatchObject({ statusCode: 404, errorCode: ErrorCode.POLL_005 });
    expect((await h.polls.findById(pollId))?.voterCount).toBe(0);
    expect(await h.votes.find(pollId, bob.id)).toBeNull();
  });

  it("POLL-02: hai request bầu song song CÙNG một người → đúng MỘT phiếu, đếm đúng (CAS version + thử lại)", async () => {
    const { bob, pollId, poll } = await setup();
    const pho = optionIdOf(poll, "Phở");
    const [a, b] = await Promise.all([h.pollService.vote(bob, pollId, [pho]), h.pollService.vote(bob, pollId, [pho])]);
    expect(a.myOptionIds).toEqual([pho]);
    expect(b.myOptionIds).toEqual([pho]);
    const stored = await h.polls.findById(pollId);
    expect(stored?.voterCount).toBe(1);
    expect(stored?.options.find((o) => o.id === pho)?.voteCount).toBe(1);
    expect((await h.votes.tally(pollId)).voters).toBe(1);
  });

  it("nhiều người bầu song song (≤ số lần thử) → đều thành công, đếm khớp với nguồn sự thật (PollVote)", async () => {
    const { pollId, poll } = await setup({ multi: true });
    const voters = Array.from({ length: 5 }, () => h.addUser());
    const [pho, bun] = [optionIdOf(poll, "Phở"), optionIdOf(poll, "Bún")];
    await Promise.all(voters.map((u, i) => h.pollService.vote(u, pollId, i % 2 === 0 ? [pho] : [pho, bun])));
    const stored = await h.polls.findById(pollId);
    const tally = await h.votes.tally(pollId);
    expect(stored?.voterCount).toBe(5);
    expect(tally.voters).toBe(5);
    for (const o of stored?.options ?? []) expect(o.voteCount).toBe(tally.counts.get(o.id) ?? 0);
  });

  it("tranh chấp vượt số lần thử → người thua nhận 503 SYS_503 (retryable) SẠCH: đếm vẫn khớp đúng số phiếu đã ghi (không hỏng số liệu)", async () => {
    const { pollId, poll } = await setup({ multi: true });
    const voters = Array.from({ length: 12 }, () => h.addUser());
    const pho = optionIdOf(poll, "Phở");
    const results = await Promise.allSettled(voters.map((u) => h.pollService.vote(u, pollId, [pho])));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed.length).toBeGreaterThan(0);
    for (const f of failed) expect(f.reason).toMatchObject({ statusCode: 503, errorCode: ErrorCode.SYS_503, details: { retryable: true } });
    const stored = await h.polls.findById(pollId);
    const tally = await h.votes.tally(pollId);
    expect(stored?.voterCount).toBe(results.length - failed.length);
    expect(tally.voters).toBe(stored?.voterCount);
    expect(stored?.options.find((o) => o.id === pho)?.voteCount).toBe(tally.counts.get(pho) ?? 0);
  });

  it("POLL-04: bầu sau `closesAt` → 409 POLL_004 (dù job đóng chưa chạy); khảo sát đã đóng cũng vậy", async () => {
    const { bob, pollId, poll } = await setup({ closesAt: undefined });
    const closing = await h.pollService.create(h.addUser(), "CHANNEL", CH, pollDto({ closesAt: h.after(2 * MINUTE) }));
    h.advance(3 * MINUTE);
    expect(await catchApp(() => h.pollService.vote(bob, closing.poll.id, [closing.poll.options[0]?.id as string]))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.POLL_004 });
    // Xem: hiển thị đã đóng (EXPIRED) ngay khi quá hạn.
    expect(await h.pollService.get(bob, closing.poll.id)).toMatchObject({ status: "CLOSED", closeReason: "EXPIRED", canClose: false });
    // Job đóng: CAS OPEN → CLOSED, phát poll:updated; chạy lại → SKIPPED.
    expect(await h.pollService.closeExpired(closing.poll.id)).toBe("CLOSED");
    expect(await h.pollService.closeExpired(closing.poll.id)).toBe("SKIPPED");
    expect((await h.polls.findById(closing.poll.id))?.closeReason).toBe("EXPIRED");
    expect(h.emitter.rooms.some((e) => e.event === String(SocketEvent.POLL_UPDATED) && e.payload["pollId"] === closing.poll.id && e.payload["status"] === "CLOSED")).toBe(true);
    // Khảo sát khác vẫn bầu được.
    await expect(h.pollService.vote(bob, pollId, [optionIdOf(poll, "Phở")])).resolves.toBeDefined();
  });

  it("job đóng KHÔNG đóng khi chưa tới hạn (hàng cũ của khảo sát đổi hạn/đã đóng sớm là no-op)", async () => {
    const alice = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt: h.after(DAY) }));
    expect(await h.pollService.closeExpired(r.poll.id)).toBe("SKIPPED");
    expect((await h.polls.findById(r.poll.id))?.status).toBe("OPEN");
    await h.pollService.close(alice, r.poll.id);
    h.advance(2 * DAY);
    expect(await h.pollService.closeExpired(r.poll.id)).toBe("SKIPPED");
  });

  it("POLL-05: mất quyền kênh rồi bầu/xem/đóng/xem người bầu → 404 POLL_005; tin bị thu hồi cũng vậy", async () => {
    const { alice, bob, pollId, poll } = await setup();
    h.sender.revoke(bob.id, "CHANNEL", CH);
    for (const fn of [() => h.pollService.vote(bob, pollId, [optionIdOf(poll, "Phở")]), () => h.pollService.unvote(bob, pollId), () => h.pollService.get(bob, pollId), () => h.pollService.close(bob, pollId)]) {
      expect(await catchApp(fn)).toMatchObject({ statusCode: 404, errorCode: ErrorCode.POLL_005 });
    }
    expect((await catchApp(() => h.pollService.get(alice, "ee".repeat(12)))).errorCode).toBe(ErrorCode.POLL_005);
    h.sender.deleteMessage((await h.polls.findById(pollId))?.messageId as string);
    expect((await catchApp(() => h.pollService.get(alice, pollId))).errorCode).toBe(ErrorCode.POLL_005);
  });
});

describe("đóng khảo sát", () => {
  it("người tạo đóng → BY_CREATOR; đã đóng → trả nguyên trạng (không đổi version); người thường → 403 AUTH_005; moderator → BY_MODERATOR", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const mod = h.addUser({ access: { canModerate: true } });
    const a = await h.pollService.create(alice, "CHANNEL", CH, pollDto());
    const b = await h.pollService.create(alice, "CHANNEL", CH, pollDto());

    expect(await catchApp(() => h.pollService.close(bob, a.poll.id))).toMatchObject({ statusCode: 403, errorCode: ErrorCode.AUTH_005 });
    const closed = await h.pollService.close(alice, a.poll.id);
    expect(closed).toMatchObject({ status: "CLOSED", closeReason: "BY_CREATOR", canClose: false });
    const version = (await h.polls.findById(a.poll.id))?.version;
    expect((await h.pollService.close(alice, a.poll.id)).status).toBe("CLOSED");
    expect((await h.polls.findById(a.poll.id))?.version).toBe(version);

    expect((await h.pollService.close(mod, b.poll.id)).closeReason).toBe("BY_MODERATOR");
    expect((await h.polls.findById(b.poll.id))?.closedBy).toBe(mod.id);
    // Đóng phát NGAY (không qua nhịp), không có userId trong payload.
    h.throttle.allow = false;
    const c = await h.pollService.create(alice, "CHANNEL", CH, pollDto());
    await h.pollService.close(alice, c.poll.id);
    expect(h.emitter.rooms.filter((e) => e.payload["pollId"] === c.poll.id)).toHaveLength(1);
    expect(h.throttle.trailing).not.toContain(c.poll.id);
  });

  it("tin khảo sát bị thu hồi → đóng MESSAGE_RECALLED (idempotent); tin không có khảo sát → SKIPPED", async () => {
    const alice = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto());
    h.sender.deleteMessage(r.message.id);
    expect(await h.pollService.closeForRecalledMessage(r.message.id)).toBe("CLOSED");
    expect(await h.pollService.closeForRecalledMessage(r.message.id)).toBe("SKIPPED");
    expect((await h.polls.findById(r.poll.id))?.closeReason).toBe("MESSAGE_RECALLED");
    expect(await h.pollService.closeForRecalledMessage("dd".repeat(12))).toBe("SKIPPED");
  });

  it("cron quét bù: đóng khảo sát quá hạn > 1 phút mà job hẹn giờ bị lỡ", async () => {
    const alice = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ closesAt: h.after(2 * MINUTE) }));
    h.advance(3 * MINUTE + 30_000);
    expect(await h.pollService.sweepExpired()).toBe(1);
    expect((await h.polls.findById(r.poll.id))?.status).toBe("CLOSED");
    expect(await h.pollService.sweepExpired()).toBe(0);
  });
});

describe("người bầu", () => {
  it("khảo sát công khai: danh sách người bầu theo lựa chọn (mới cập nhật trước, phân trang cursor); tài khoản đã ẩn danh hoá hiện 'Tài khoản đã xoá'", async () => {
    const alice = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ options: ["Phở", "Bún"] }));
    const pho = optionIdOf(r.poll, "Phở");
    const people = [h.addUser(), h.addUser(), h.addUser()];
    for (const p of people) await h.pollService.vote(p, r.poll.id, [pho]);
    await h.pollService.vote(alice, r.poll.id, [optionIdOf(r.poll, "Bún")]);
    h.directory.setStatus(people[0].id, "ANONYMIZED");

    const page1 = await h.pollService.voters(alice, r.poll.id, { optionId: pho, limit: 2 });
    expect(page1.data.map((v) => v.id)).toEqual([people[2].id, people[1].id]);
    expect(page1.hasMore).toBe(true);
    const page2 = await h.pollService.voters(alice, r.poll.id, { optionId: pho, limit: 2, cursor: page1.nextCursor as string });
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0]).toMatchObject({ id: people[0].id, name: "Tài khoản đã xoá", avatar: null });
    expect(page2.hasMore).toBe(false);
    expect((await catchApp(() => h.pollService.voters(alice, r.poll.id, { optionId: "nope", limit: 10 }))).errorCode).toBe(ErrorCode.POLL_005);
    expect((await catchApp(() => h.pollService.voters(alice, r.poll.id, { optionId: pho, limit: 10, cursor: "@@@" }))).statusCode).toBe(400);
  });

  it("POLL-03: khảo sát ẩn danh → 403 POLL_006 với MỌI người (kể cả người tạo); view/payload không chứa userId của ai", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto({ anonymous: true }));
    const view = await h.pollService.vote(bob, r.poll.id, [r.poll.options[0]?.id as string]);
    for (const user of [alice, bob]) expect(await catchApp(() => h.pollService.voters(user, r.poll.id, { optionId: r.poll.options[0]?.id as string, limit: 10 }))).toMatchObject({ statusCode: 403, errorCode: ErrorCode.POLL_006 });
    expect(view.canViewVoters).toBe(false);
    const everything = JSON.stringify([view, h.emitter.rooms, h.emitter.users]);
    expect(everything).not.toContain(alice.id);
    expect(everything).not.toContain(bob.id);
  });
});

describe("phát realtime poll:updated", () => {
  it("có vé → phát ngay tới phòng kênh, payload chỉ số đếm (không userId/myOptionIds); hết vé → xếp job cuối cửa sổ, không phát", async () => {
    const alice = h.addUser();
    const bob = h.addUser();
    const r = await h.pollService.create(alice, "CHANNEL", CH, pollDto());
    const opt = r.poll.options[0]?.id as string;

    await h.pollService.vote(bob, r.poll.id, [opt]);
    const event = h.emitter.rooms.at(-1);
    expect(event).toMatchObject({ room: `ch:${CH}`, event: SocketEvent.POLL_UPDATED });
    expect(event?.payload).toEqual({
      pollId: r.poll.id,
      messageId: r.message.id,
      scopeType: "CHANNEL",
      scopeId: CH,
      status: "OPEN",
      closeReason: null,
      options: [{ id: opt, voteCount: 1 }, { id: r.poll.options[1]?.id, voteCount: 0 }],
      voterCount: 1,
      version: 2,
    });

    h.throttle.allow = false;
    const emitted = h.emitter.rooms.length;
    await h.pollService.unvote(bob, r.poll.id);
    expect(h.emitter.rooms).toHaveLength(emitted);
    expect(h.throttle.trailing).toEqual([r.poll.id]);
    // Job cuối cửa sổ đọc số liệu MỚI NHẤT rồi phát.
    expect(await h.publisher.emitLatest(r.poll.id)).toBe(true);
    expect(h.emitter.rooms.at(-1)?.payload).toMatchObject({ voterCount: 0, version: 3 });
    expect(await h.publisher.emitLatest("ff".repeat(12))).toBe(false);
  });
});
