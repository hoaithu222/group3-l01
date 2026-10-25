/**
 * Unit — `poll-projection.ts` + `PollReaderService` (p7-04 be.md §5.2 "Ẩn danh", §10): POLL-03 khảo sát ẩn danh — KHÔNG có `userId` của ai ở mọi view/payload, `canViewVoters=false`; phần trăm,
 * trạng thái hiệu lực khi quá hạn, `canClose` theo người tạo/moderator, payload phát cả phòng không có `myOptionIds`, bản đọc cho `MessageView.poll` (1 truy vấn/lô).
 */
import type { PollEntity } from "../entities/chat-extensions.types";
import { effectiveState, toPollUpdatedPayload, toPollView } from "../services/poll-projection";
import { PollReaderService } from "../services/poll-reader.service";
import { InMemoryPollRepository } from "../repositories/poll.repository.inmemory";
import { InMemoryPollVoteRepository } from "../repositories/poll-vote.repository.inmemory";
import type { TxHandle } from "../repositories/tx";

const CREATOR = "c0".repeat(12);
const BOB = "b0".repeat(12);
const NOW = new Date("2026-09-27T10:00:00Z");

const poll = (over: Partial<PollEntity> = {}): PollEntity => ({
  id: "d0".repeat(12),
  messageId: "e0".repeat(12),
  scopeType: "CHANNEL",
  scopeId: "f0".repeat(12),
  threadId: null,
  workspaceId: "a0".repeat(12),
  createdBy: CREATOR,
  question: "Chọn món?",
  normalizedQuestion: "chon mon?",
  options: [
    { id: "aaaaaaaa", text: "Phở", voteCount: 3, addedBy: null },
    { id: "bbbbbbbb", text: "Bún", voteCount: 1, addedBy: null },
  ],
  multi: false,
  anonymous: false,
  allowAddOptions: false,
  closesAt: null,
  status: "OPEN",
  closedAt: null,
  closedBy: null,
  closeReason: null,
  voterCount: 4,
  version: 7,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe("toPollView", () => {
  it("phần trăm tính trên số NGƯỜI bầu (làm tròn 1 chữ số); chưa ai bầu → 0; chọn nhiều thì tổng có thể vượt 100", () => {
    const v = toPollView(poll({ voterCount: 3, options: [{ id: "aaaaaaaa", text: "A", voteCount: 2, addedBy: null }, { id: "bbbbbbbb", text: "B", voteCount: 3, addedBy: null }] }), { viewerId: BOB, myOptionIds: [], canModerate: false, now: NOW });
    expect(v.options.map((o) => o.percent)).toEqual([66.7, 100]);
    expect(toPollView(poll({ voterCount: 0, options: [{ id: "aaaaaaaa", text: "A", voteCount: 0, addedBy: null }, { id: "bbbbbbbb", text: "B", voteCount: 0, addedBy: null }] }), { viewerId: BOB, myOptionIds: [], canModerate: false, now: NOW }).options.map((o) => o.percent)).toEqual([0, 0]);
  });

  it("POLL-03: khảo sát ẩn danh — view không chứa userId của ai (kể cả người tạo), canViewVoters=false; myOptionIds chỉ của chính người xem", () => {
    const anon = poll({ anonymous: true });
    const forBob = toPollView(anon, { viewerId: BOB, myOptionIds: ["aaaaaaaa"], canModerate: false, now: NOW });
    const forCreator = toPollView(anon, { viewerId: CREATOR, myOptionIds: [], canModerate: false, now: NOW });
    for (const v of [forBob, forCreator]) {
      expect(v.canViewVoters).toBe(false);
      const json = JSON.stringify(v);
      expect(json).not.toContain(CREATOR);
      expect(json).not.toContain(BOB);
    }
    expect(forBob.myOptionIds).toEqual(["aaaaaaaa"]);
    // Khảo sát công khai: người xem đăng nhập xem được người bầu.
    expect(toPollView(poll(), { viewerId: BOB, myOptionIds: [], canModerate: false, now: NOW }).canViewVoters).toBe(true);
  });

  it("canClose: người tạo hoặc moderator khi còn mở; người thường/đã đóng/không có người xem → false; bản dùng chung (viewerId null) không có myOptionIds", () => {
    const at = (viewerId: string | null, canModerate: boolean, over: Partial<PollEntity> = {}) => toPollView(poll(over), { viewerId, myOptionIds: ["aaaaaaaa"], canModerate, now: NOW });
    expect(at(CREATOR, false).canClose).toBe(true);
    expect(at(BOB, true).canClose).toBe(true);
    expect(at(BOB, false).canClose).toBe(false);
    expect(at(CREATOR, false, { status: "CLOSED", closeReason: "BY_CREATOR" }).canClose).toBe(false);
    const shared = at(null, false);
    expect(shared).toMatchObject({ myOptionIds: [], canClose: false, canViewVoters: false });
  });

  it("trạng thái HIỆU LỰC: quá closesAt mà job chưa đóng → hiển thị CLOSED/EXPIRED; đã đóng thật giữ nguyên lý do", () => {
    expect(effectiveState(poll({ closesAt: new Date(NOW.getTime() - 1) }), NOW)).toEqual({ status: "CLOSED", closeReason: "EXPIRED" });
    expect(effectiveState(poll({ closesAt: new Date(NOW.getTime() + 1000) }), NOW)).toEqual({ status: "OPEN", closeReason: null });
    expect(effectiveState(poll({ status: "CLOSED", closeReason: "BY_MODERATOR", closesAt: new Date(NOW.getTime() - 5000) }), NOW)).toEqual({ status: "CLOSED", closeReason: "BY_MODERATOR" });
  });
});

describe("toPollUpdatedPayload", () => {
  it("chỉ số đếm + trạng thái + version: không userId/myOptionIds/percent/câu hỏi", () => {
    const payload = toPollUpdatedPayload(poll({ anonymous: true }));
    expect(payload).toEqual({
      pollId: "d0".repeat(12),
      messageId: "e0".repeat(12),
      scopeType: "CHANNEL",
      scopeId: "f0".repeat(12),
      status: "OPEN",
      closeReason: null,
      options: [{ id: "aaaaaaaa", voteCount: 3 }, { id: "bbbbbbbb", voteCount: 1 }],
      voterCount: 4,
      version: 7,
    });
    expect(JSON.stringify(payload)).not.toContain(CREATOR);
  });
});

describe("PollReaderService (cổng MessagePollReader)", () => {
  async function seed() {
    const polls = new InMemoryPollRepository(() => NOW);
    const votes = new InMemoryPollVoteRepository(() => NOW);
    const tx = {} as unknown as TxHandle;
    const base = { scopeType: "CHANNEL" as const, scopeId: "f0".repeat(12), threadId: null, workspaceId: null, createdBy: CREATOR, normalizedQuestion: "q", options: [{ id: "aaaaaaaa", text: "A", voteCount: 0, addedBy: null }, { id: "bbbbbbbb", text: "B", voteCount: 0, addedBy: null }], multi: false, anonymous: false, closesAt: null };
    const p1 = await polls.create({ ...base, messageId: "01".repeat(12), question: "Một" }, tx);
    const p2 = await polls.create({ ...base, messageId: "02".repeat(12), question: "Hai", anonymous: true }, tx);
    await votes.upsert(p1.id, BOB, ["bbbbbbbb"], tx);
    await votes.upsert(p2.id, BOB, ["aaaaaaaa"], tx);
    return { reader: new PollReaderService(polls, votes, () => NOW), p1, p2 };
  }

  it("ghép khảo sát theo id TIN cho cả lô: myOptionIds của người xem, tin không có khảo sát vắng mặt; ẩn danh vẫn không lộ người bầu", async () => {
    const { reader, p1, p2 } = await seed();
    const map = await reader.pollsOf({ userId: BOB, canModerate: false }, ["01".repeat(12), "02".repeat(12), "03".repeat(12)]);
    expect([...map.keys()].sort()).toEqual(["01".repeat(12), "02".repeat(12)]);
    expect(map.get("01".repeat(12))).toMatchObject({ id: p1.id, myOptionIds: ["bbbbbbbb"], canViewVoters: true });
    expect(map.get("02".repeat(12))).toMatchObject({ id: p2.id, myOptionIds: ["aaaaaaaa"], canViewVoters: false });
    expect(JSON.stringify([...map.values()])).not.toContain(CREATOR);
  });

  it("payload phát cả phòng (userId null): không myOptionIds/canClose; danh sách rỗng → Map rỗng", async () => {
    const { reader } = await seed();
    const map = await reader.pollsOf({ userId: null, canModerate: false }, ["01".repeat(12)]);
    expect(map.get("01".repeat(12))).toMatchObject({ myOptionIds: [], canClose: false, canViewVoters: false });
    expect((await reader.pollsOf({ userId: BOB, canModerate: false }, [])).size).toBe(0);
  });
});
