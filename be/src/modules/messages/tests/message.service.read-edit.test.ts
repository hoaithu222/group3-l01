/**
 * Unit — `MessageService.list()/get()/edit()/recall()` + `listPinned()` (be.md
 * p1-04 §10, p1-06 §4/§10): MSG-11 gap-fill `afterSeq`, ghép tóm tắt thread vào
 * tin gốc (BATCH — 1 lần gọi `IThreadHook.summaries` cho cả trang, không N+1;
 * tombstone giữ `replyCount` — MSG-35; lỗi hook không làm hỏng trang), diff
 * mention khi sửa tin cho p1-07 (MSG-33), cửa sổ sửa/phiên bản/tác giả.
 */
const mockOutbox: Array<{ type: string; aggregateId: string; payload: Record<string, unknown> }> = [];
jest.mock("../../../infrastructure/database", () => ({
  prisma: { asset: { findMany: jest.fn() } },
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: {
    add: async (_tx: unknown, event: { type: string; aggregateId: string; payload: Record<string, unknown> }) => {
      mockOutbox.push(event);
    },
  },
}));
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: () => undefined }));
jest.mock("../../assets/public", () => ({ createAssetLinkService: () => ({}) }));

import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import {
  registerThreadHook,
  resetThreadHook,
  registerMentionValidator,
  resetMentionValidator,
  type IThreadHook,
  type ThreadSummaryRef,
} from "../../../core/permission";
import { MessageInteractionService } from "../services/message-interaction.service";
import type { SystemMessageService } from "../services/system-message.service";
import type { IReactionRepository } from "../repositories/reaction.repository.interface";
import type { IMessageHideRepository } from "../repositories/message-hide.repository.interface";
import { makeHarness, seedMessage, userOf, CONV, U1, U2, U3, U4 } from "./support/message-service.harness";

async function catchAppError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

function summary(over: Partial<ThreadSummaryRef> = {}): ThreadSummaryRef {
  return { threadId: "5d".repeat(12), replyCount: 4, lastReplyAt: new Date(2026, 8, 19, 12, 0), lastReplierIds: [U2, U3], lastReplySeq: 4, ...over };
}

/** Hook chỉ có `summaries` thật (đếm số lần gọi) — các hàm khác không được chạm trong đường đọc. */
function summariesHook(data: Map<string, ThreadSummaryRef>) {
  const calls: string[][] = [];
  const hook: IThreadHook = {
    summaries: async (ids) => {
      calls.push([...ids]);
      return new Map([...data].filter(([id]) => ids.includes(id)));
    },
    assertThreadable: async () => undefined,
    onReplyCreated: async () => {
      throw new Error("không được gọi trong đường đọc");
    },
    emitThreadUpdated: async () => undefined,
  };
  return { hook, calls };
}

describe("MessageService.list() — gap-fill (MSG-11)", () => {
  it("mất mạng, có 45 tin mới: phân trang afterSeq lấy ĐỦ 45, tăng dần, không trùng, không lỗ", async () => {
    const { service, repo, scopeId } = makeHarness();
    for (let seq = 1; seq <= 55; seq += 1) seedMessage(repo, { seq, content: `Tin ${seq}` });

    const seen: number[] = [];
    let afterSeq = 10; // máy khách đã có tới seq 10
    for (let page = 0; page < 10; page += 1) {
      const res = await service.list(userOf(U1), "CHANNEL", scopeId, { afterSeq, limit: LIMITS.pagination.default });
      seen.push(...res.data.map((m) => m.seq));
      if (!res.cursor.hasMoreAfter) break;
      afterSeq = res.cursor.nextAfterSeq as number;
    }
    expect(seen).toHaveLength(45);
    expect(seen).toEqual(Array.from({ length: 45 }, (_, i) => 11 + i));
    expect(new Set(seen).size).toBe(45);
  });

  it("trang cuối (không còn tin mới): hasMoreAfter=false; không tham số → tin mới nhất, tăng dần, hasMoreBefore đúng", async () => {
    const { service, repo, scopeId } = makeHarness();
    for (let seq = 1; seq <= 5; seq += 1) seedMessage(repo, { seq });

    const tail = await service.list(userOf(U1), "CHANNEL", scopeId, { afterSeq: 5, limit: 30 });
    expect(tail.data).toEqual([]);
    expect(tail.cursor.hasMoreAfter).toBe(false);

    const latest = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 3 });
    expect(latest.data.map((m) => m.seq)).toEqual([3, 4, 5]);
    expect(latest.cursor).toMatchObject({ hasMoreBefore: true, nextBeforeSeq: 3, nextAfterSeq: 5 });
  });
});

describe("MessageService — replay sau thu hồi quyền (PR-04, README p1-03 §8)", () => {
  it("mất quyền đọc scope (grant bị thu hồi) → gap-fill afterSeq, around, get, gửi đều 404 — KHÔNG giao nội dung mới", async () => {
    const { service, repo, scope, scopeId } = makeHarness();
    const msg = seedMessage(repo, { seq: 1, content: "Nội dung riêng tư" });
    seedMessage(repo, { seq: 2, content: "Tin mới sau khi thu hồi" });

    // Còn quyền: replay bình thường.
    await expect(service.list(userOf(U2), "CHANNEL", scopeId, { afterSeq: 0, limit: 30 })).resolves.toMatchObject({ data: [{ seq: 1 }, { seq: 2 }] });

    // `resolver` CHANNEL trả `visible=false` ngay sau `revokeScope()` (bump version) — cache cũ không còn hiệu lực.
    scope.setAccess({ visible: false });
    await expect(service.list(userOf(U2), "CHANNEL", scopeId, { afterSeq: 0, limit: 30 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.list(userOf(U2), "CHANNEL", scopeId, { around: msg.id, limit: 30 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get(userOf(U2), msg.id)).rejects.toMatchObject({ statusCode: 404 });
    const sendDto = { clientMessageId: "00000000-0000-4000-8000-000000000004", content: "x", attachments: [], mentions: [] };
    await expect(service.send(userOf(U2), "CHANNEL", scopeId, sendDto)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MessageService — ghép tóm tắt thread vào tin gốc (p1-06 be.md §4)", () => {
  afterEach(() => resetThreadHook());

  async function seedChannel() {
    const h = makeHarness();
    const rootA = seedMessage(h.repo, { seq: 1, content: "Có thread" });
    const rootB = seedMessage(h.repo, { seq: 2, content: "Chưa có thread" });
    const system = seedMessage(h.repo, { seq: 3, kind: "SYSTEM", authorId: null, content: null, systemType: "MEMBER_JOINED" });
    const rootDeleted = seedMessage(h.repo, { seq: 4, content: "Đã thu hồi", deletedAt: new Date(), deletedBy: U1, deleteMode: "AUTHOR_RECALL" });
    const reply = seedMessage(h.repo, { threadId: rootA.id, threadKey: rootA.id, seq: 1, authorId: U2, content: "Trả lời" });
    return { ...h, rootA, rootB, system, rootDeleted, reply };
  }

  it("list(): ĐÚNG 1 lần gọi summaries cho cả trang, chỉ với tin gốc USER của kênh; ghép đủ trường, tin chưa có thread KHÔNG có key", async () => {
    const { service, scopeId, rootA, rootB, rootDeleted } = await seedChannel();
    const { hook, calls } = summariesHook(
      new Map([
        [rootA.id, summary()],
        [rootDeleted.id, summary({ replyCount: 4, lastReplySeq: 4 })],
      ])
    );
    registerThreadHook(hook);

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });

    expect(calls).toEqual([[rootA.id, rootB.id, rootDeleted.id]]); // SYSTEM bị loại, reply không nằm trong luồng root
    const byId = new Map(res.data.map((m) => [m.id, m]));
    expect(byId.get(rootA.id)).toMatchObject({
      replyCount: 4,
      lastReplyAt: new Date(2026, 8, 19, 12, 0),
      lastReplierIds: [U2, U3],
      lastReplySeq: 4,
    });
    expect(byId.get(rootB.id)).not.toHaveProperty("replyCount");
    expect(byId.get(rootB.id)).not.toHaveProperty("lastReplierIds");
  });

  it("MSG-35: tin gốc ĐÃ THU HỒI vẫn giữ replyCount/lastReplier (nội dung thì rỗng), mở thread vẫn được", async () => {
    const { service, scopeId, rootDeleted } = await seedChannel();
    registerThreadHook(summariesHook(new Map([[rootDeleted.id, summary({ replyCount: 4 })]])).hook);

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    const tomb = res.data.find((m) => m.id === rootDeleted.id);
    expect(tomb).toMatchObject({ deleted: true, content: null, mentions: [], replyCount: 4, lastReplierIds: [U2, U3] });

    const got = await service.get(userOf(U1), rootDeleted.id);
    expect(got).toMatchObject({ deleted: true, replyCount: 4 });
  });

  it("list luồng thread (threadId=root) → toàn reply, KHÔNG gọi summaries (không thread lồng)", async () => {
    const { service, scopeId, rootA } = await seedChannel();
    const { hook, calls } = summariesHook(new Map([[rootA.id, summary()]]));
    registerThreadHook(hook);

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { threadId: rootA.id, limit: 30 });
    expect(res.data.map((m) => m.content)).toEqual(["Trả lời"]);
    expect(res.data[0]).not.toHaveProperty("replyCount");
    expect(calls).toEqual([]);
  });

  it("get(): tin gốc → có tóm tắt; reply → không; 1 lần gọi mỗi get, đúng id", async () => {
    const { service, rootA, reply } = await seedChannel();
    const { hook, calls } = summariesHook(new Map([[rootA.id, summary({ replyCount: 1 })]]));
    registerThreadHook(hook);

    await expect(service.get(userOf(U1), rootA.id)).resolves.toMatchObject({ replyCount: 1, lastReplySeq: 4 });
    expect(calls).toEqual([[rootA.id]]);

    const replyView = await service.get(userOf(U1), reply.id);
    expect(replyView).not.toHaveProperty("replyCount");
    expect(calls).toHaveLength(1);
  });

  it("scope CONVERSATION (không có thread) → không gọi summaries", async () => {
    const { service, repo, scopeId } = makeHarness("CONVERSATION");
    seedMessage(repo, { scopeType: "CONVERSATION", scopeId: CONV, seq: 1 });
    const { hook, calls } = summariesHook(new Map());
    registerThreadHook(hook);

    const res = await service.list(userOf(U1), "CONVERSATION", scopeId, { limit: 30 });
    expect(res.data).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it("hook CHƯA đăng ký → list/get bình thường, không có trường thread", async () => {
    const { service, scopeId, rootA } = await seedChannel();
    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data.every((m) => !("replyCount" in m))).toBe(true);
    await expect(service.get(userOf(U1), rootA.id)).resolves.not.toHaveProperty("replyCount");
  });

  it("summaries() ném lỗi (DB chập chờn) → trang tin VẪN trả về, chỉ thiếu tóm tắt (không 500)", async () => {
    const { service, scopeId, rootA } = await seedChannel();
    const failing: IThreadHook = {
      summaries: async () => {
        throw new Error("mongo down");
      },
      assertThreadable: async () => undefined,
      onReplyCreated: async () => {
        throw new Error("không dùng");
      },
      emitThreadUpdated: async () => undefined,
    };
    registerThreadHook(failing);

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    expect(res.data.find((m) => m.id === rootA.id)).not.toHaveProperty("replyCount");
    await expect(service.get(userOf(U1), rootA.id)).resolves.toMatchObject({ id: rootA.id });
  });

  it("listPinned(): tin gốc được ghim cũng có tóm tắt thread (1 truy vấn batch)", async () => {
    const { repo, rootA, rootB, scopeId } = await seedChannel();
    const pinnedA = { ...rootA, pinnedAt: new Date(2026, 8, 19, 9, 0), pinnedBy: U1 };
    const pinnedB = { ...rootB, pinnedAt: new Date(2026, 8, 19, 9, 5), pinnedBy: U1 };
    repo.seed(pinnedA);
    repo.seed(pinnedB);
    const { hook, calls } = summariesHook(new Map([[rootA.id, summary()]]));
    registerThreadHook(hook);

    const interaction = new MessageInteractionService(
      repo,
      { findMineByMessageIds: async () => new Set<string>() } as unknown as IReactionRepository,
      {} as IMessageHideRepository,
      {} as SystemMessageService
    );
    const pins = await interaction.listPinned(userOf(U1), "CHANNEL", scopeId);
    expect(pins.map((p) => p.id)).toEqual([rootB.id, rootA.id]); // pinnedAt desc
    expect(pins[1]).toMatchObject({ replyCount: 4 });
    expect(pins[0]).not.toHaveProperty("replyCount");
    expect(calls).toHaveLength(1);
  });
});

describe("MessageService.edit()", () => {
  beforeEach(() => {
    mockOutbox.length = 0;
  });
  afterEach(() => {
    resetMentionValidator();
    resetThreadHook();
  });

  const contentWith = (...ids: string[]) => ids.map((id) => `@{u:${id}}`).join(" ");
  function validatorReturning(users: Array<[string, string]>, all = false) {
    registerMentionValidator({
      validate: async () => ({
        mentions: [
          ...users.map(([targetId, label]) => ({ type: "USER" as const, targetId, label })),
          ...(all ? [{ type: "ALL" as const, targetId: null, label: null }] : []),
        ],
        mentionUserIds: users.map(([id]) => id),
        mentionAll: all,
        textForSearch: users.map(([, l]) => `@${l}`).join(" "),
      }),
    });
  }

  it("MSG-33: sửa tin THÊM B, BỎ C → outbox message.updated mang mentionDiff {added:[B], removed:[C]} (p1-07 chỉ báo B, huỷ mục chưa đọc của C)", async () => {
    const { service, repo } = makeHarness();
    const original = seedMessage(repo, {
      content: `Chào ${contentWith(U4, U3)}`,
      mentions: [
        { type: "USER", targetId: U4, label: "A" },
        { type: "USER", targetId: U3, label: "C" },
      ],
    });
    validatorReturning([[U4, "A"], [U2, "B"]]);

    const view = await service.edit(userOf(U1), original.id, {
      content: `Chào ${contentWith(U4, U2)}`,
      mentions: [{ type: "USER", targetId: U4 }, { type: "USER", targetId: U2 }],
      expectedVersion: 1,
    });

    expect(view.version).toBe(2);
    expect(view.mentions.map((m) => m.targetId)).toEqual([U4, U2]);
    const payload = mockOutbox[0].payload;
    expect(mockOutbox[0].type).toBe("message.updated");
    expect(payload).toMatchObject({
      event: "updated",
      reason: "EDIT",
      addedMentionIds: [U2],
      removedMentionIds: [U3],
      mentionDiff: { addedUserIds: [U2], removedUserIds: [U3], allAdded: false, allRemoved: false },
    });
  });

  it("A giữ nguyên (không nằm trong added/removed) → không báo lại người đã được tag từ trước", async () => {
    const { service, repo } = makeHarness();
    const original = seedMessage(repo, { content: contentWith(U4), mentions: [{ type: "USER", targetId: U4, label: "A" }] });
    validatorReturning([[U4, "A"]]);
    await service.edit(userOf(U1), original.id, { content: `${contentWith(U4)} sửa lỗi chính tả`, mentions: [{ type: "USER", targetId: U4 }], expectedVersion: 1 });
    expect(mockOutbox[0].payload.mentionDiff).toEqual({ addedUserIds: [], removedUserIds: [], allAdded: false, allRemoved: false });
  });

  it("@all coi như 1 khoá riêng: thêm @all → allAdded, gỡ @all → allRemoved (không lẫn vào USER)", async () => {
    const { service, repo } = makeHarness("CONVERSATION");
    const plain = seedMessage(repo, { scopeType: "CONVERSATION", scopeId: CONV, content: "Chú ý" });
    validatorReturning([], true);
    await service.edit(userOf(U1), plain.id, { content: "Chú ý @{all}", mentions: [{ type: "ALL" }], expectedVersion: 1 });
    expect(mockOutbox[0].payload.mentionDiff).toEqual({ addedUserIds: [], removedUserIds: [], allAdded: true, allRemoved: false });

    mockOutbox.length = 0;
    validatorReturning([], false);
    await service.edit(userOf(U1), plain.id, { content: "Chú ý", mentions: [], expectedVersion: 2 });
    expect(mockOutbox[0].payload.mentionDiff).toEqual({ addedUserIds: [], removedUserIds: [], allAdded: false, allRemoved: true });
  });

  it("sửa tin gốc đã có thread → view trả về vẫn kèm tóm tắt thread", async () => {
    const { service, repo } = makeHarness();
    const original = seedMessage(repo, { content: "Bản đầu" });
    registerThreadHook(summariesHook(new Map([[original.id, summary({ replyCount: 2 })]])).hook);
    const view = await service.edit(userOf(U1), original.id, { content: "Bản sửa", mentions: [], expectedVersion: 1 });
    expect(view).toMatchObject({ content: "Bản sửa", replyCount: 2 });
  });

  it("không phải tác giả / tin SYSTEM → 403 MSG_009; đã thu hồi → 409 MSG_006; quá cửa sổ sửa → 409 MSG_003", async () => {
    const { service, repo } = makeHarness();
    const own = seedMessage(repo, { authorId: U1 });
    expect((await catchAppError(() => service.edit(userOf(U2), own.id, { content: "x", mentions: [], expectedVersion: 1 }))).errorCode).toBe(ErrorCode.MSG_009);

    const system = seedMessage(repo, { kind: "SYSTEM", authorId: null });
    expect((await catchAppError(() => service.edit(userOf(U1), system.id, { content: "x", mentions: [], expectedVersion: 1 }))).errorCode).toBe(ErrorCode.MSG_009);

    const deleted = seedMessage(repo, { authorId: U1, deletedAt: new Date() });
    expect((await catchAppError(() => service.edit(userOf(U1), deleted.id, { content: "x", mentions: [], expectedVersion: 1 }))).errorCode).toBe(ErrorCode.MSG_006);

    const old = seedMessage(repo, { authorId: U1, createdAt: new Date(Date.now() - (LIMITS.message.editWindowSeconds + 60) * 1000) });
    const late = await catchAppError(() => service.edit(userOf(U1), old.id, { content: "x", mentions: [], expectedVersion: 1 }));
    expect(late.errorCode).toBe(ErrorCode.MSG_003);
    expect(late.statusCode).toBe(409);
  });

  it("version cũ → 409 (VersionConflict RES_003) mang version hiện tại; không ghi outbox", async () => {
    const { service, repo } = makeHarness();
    const message = seedMessage(repo, { version: 3 });
    const err = await catchAppError(() => service.edit(userOf(U1), message.id, { content: "x", mentions: [], expectedVersion: 1 }));
    expect(err.errorCode).toBe(ErrorCode.RES_003);
    expect(err.statusCode).toBe(409);
    expect(mockOutbox).toHaveLength(0);
  });
});

describe("MessageService.recall() — MSG-35", () => {
  afterEach(() => resetThreadHook());

  it("thu hồi tin gốc có 4 reply → tombstone (rỗng nội dung) nhưng thread giữ nguyên replyCount=4 khi get()", async () => {
    const { service, repo } = makeHarness();
    const root = seedMessage(repo, { content: "Tin gốc có thread", mentions: [{ type: "USER", targetId: U2, label: "B" }] });
    registerThreadHook(summariesHook(new Map([[root.id, summary({ replyCount: 4 })]])).hook);

    const before = await service.get(userOf(U1), root.id);
    expect(before).toMatchObject({ deleted: false, content: "Tin gốc có thread", replyCount: 4 });

    await service.recall(userOf(U1), root.id, undefined);
    const after = await service.get(userOf(U1), root.id);
    expect(after).toMatchObject({ deleted: true, content: null, mentions: [], replyCount: 4, lastReplierIds: [U2, U3] });
    expect(after.myPermissions).toMatchObject({ canEdit: false, canRecall: false });
  });
});
