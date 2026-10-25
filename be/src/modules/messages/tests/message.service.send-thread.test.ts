/**
 * Unit — `MessageService.send()` (be.md p1-04 §10 + p1-06 §10): gửi hợp lệ +
 * replay idempotent, mention qua `IMentionValidator` (payload outbox cho
 * p1-07), thread qua `IThreadHook` (assertThreadable TRƯỚC transaction,
 * onReplyCreated TRONG cùng transaction, seq luồng riêng, tin trả lời không
 * đẩy "tin mới nhất" của kênh — MSG-30/31, TH-02), asset/voice (MSG-05/10 p1-04).
 * Dùng `InMemoryMessageRepository` + fake scope; `withTransaction`/outbox mock.
 */
const mockEvents: string[] = [];
const mockOutbox: Array<{ type: string; aggregateId: string; payload: Record<string, unknown> }> = [];
const TX_TOKEN = { tx: true };
const mockAssetFindMany = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: { asset: { findMany: (...args: unknown[]) => mockAssetFindMany(...args) } },
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    mockEvents.push("tx:start");
    const result = await fn(TX_TOKEN);
    mockEvents.push("tx:commit");
    return result;
  },
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: {
    add: async (_tx: unknown, event: { type: string; aggregateId: string; payload: Record<string, unknown> }) => {
      mockEvents.push(`outbox:${event.type}`);
      mockOutbox.push(event);
    },
  },
}));
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
} from "../../../core/permission";
import { ThreadHookAdapter } from "../../threads/services/thread-hook.adapter";
import { ThreadService } from "../../threads/services/thread.service";
import { InMemoryThreadRepository } from "../../threads/repositories/thread.repository.inmemory";
import { InMemoryThreadSubscriptionRepository } from "../../threads/repositories/thread-subscription.repository.inmemory";
import { makeHarness, seedMessage, sendDto, userOf, CH, CONV, U1, U2, U3 } from "./support/message-service.harness";

async function catchAppError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

/** Hook thật của p1-06 trên repo in-memory (không mock nghiệp vụ thread) + ghi thứ tự gọi. */
function realThreadHook(): { hook: IThreadHook; threadRepo: InMemoryThreadRepository; subRepo: InMemoryThreadSubscriptionRepository } {
  const threadRepo = new InMemoryThreadRepository();
  const subRepo = new InMemoryThreadSubscriptionRepository();
  const adapter = new ThreadHookAdapter(new ThreadService(threadRepo, subRepo));
  const hook: IThreadHook = {
    summaries: (ids) => adapter.summaries(ids),
    assertThreadable: async (input) => {
      mockEvents.push("hook:assertThreadable");
      return adapter.assertThreadable(input);
    },
    onReplyCreated: async (tx, reply, root) => {
      mockEvents.push("hook:onReplyCreated");
      expect(tx).toBe(TX_TOKEN); // PHẢI chạy TRONG cùng transaction gửi tin
      return adapter.onReplyCreated(tx, reply, root);
    },
    emitThreadUpdated: (id) => adapter.emitThreadUpdated(id),
  };
  return { hook, threadRepo, subRepo };
}

describe("MessageService.send()", () => {
  beforeEach(() => {
    mockEvents.length = 0;
    mockOutbox.length = 0;
  });
  afterEach(() => {
    resetThreadHook();
    resetMentionValidator();
  });

  describe("gửi tin cơ bản", () => {
    it("tin USER hợp lệ → seq=1 luồng root, gọi onMessageCommitted, outbox message.created trong cùng transaction", async () => {
      const { service, scope, scopeId, repo } = makeHarness();
      const { view, replayed } = await service.send(userOf(U1), "CHANNEL", scopeId, sendDto({ content: "Xin chào cả nhà" }));

      expect(replayed).toBe(false);
      expect(view).toMatchObject({ seq: 1, kind: "USER", authorId: U1, threadId: null, content: "Xin chào cả nhà" });
      expect(view.clientMessageId).not.toBeNull(); // chính tác giả thấy clientMessageId
      expect(view).not.toHaveProperty("replyCount");
      expect(scope.committed).toEqual([{ scopeId: CH, messageId: view.id, threadKey: "root", seq: 1 }]);
      expect(mockEvents).toEqual(["tx:start", "outbox:message.created", "outbox:message.fanout", "tx:commit"]);
      expect(mockOutbox[0]).toMatchObject({
        aggregateId: view.id,
        payload: {
          event: "created",
          messageId: view.id,
          scopeType: "CHANNEL",
          scopeId: CH,
          threadId: null,
          authorId: U1,
          mentionUserIds: [],
          mentionAll: false,
          kind: "USER",
        },
      });
      expect(mockOutbox[0].payload).not.toHaveProperty("isFirstReply");
      // p1-07 — consumer THỨ HAI của message.created: dòng outbox riêng cho job fanout.message (cùng transaction).
      expect(mockOutbox[1]).toMatchObject({
        aggregateId: view.id,
        queue: "notifications",
        jobName: "fanout.message",
        dedupeKey: `fanout.message:message:${view.id}`,
        payload: { messageId: view.id, mentionUserIds: [], mentionAll: false },
      });
      expect(repo.all()).toHaveLength(1);
    });

    it("MSG-03 (tầng service): tin luôn là kind=USER, không có systemType — người dùng không giả được tin hệ thống", async () => {
      const { service, scopeId, repo } = makeHarness();
      await service.send(userOf(U1), "CHANNEL", scopeId, sendDto());
      expect(repo.all()[0]).toMatchObject({ kind: "USER", systemType: null, systemPayload: null });
    });

    it("replay cùng clientMessageId → replayed=true, KHÔNG tạo tin/outbox mới; khác scope → VAL_001", async () => {
      const { service, scopeId, repo } = makeHarness();
      const dto = sendDto();
      const first = await service.send(userOf(U1), "CHANNEL", scopeId, dto);
      mockOutbox.length = 0;

      const replay = await service.send(userOf(U1), "CHANNEL", scopeId, dto);
      expect(replay.replayed).toBe(true);
      expect(replay.view.id).toBe(first.view.id);
      expect(repo.all()).toHaveLength(1);
      expect(mockOutbox).toHaveLength(0);

      await expect(service.send(userOf(U1), "CHANNEL", "d1".repeat(12), dto)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rỗng (không content, không tệp) → 400 MSG_007; quá 4000 grapheme → MSG_001 (emoji ZWJ đếm 1)", async () => {
      const { service, scopeId } = makeHarness();
      const empty = await catchAppError(() => service.send(userOf(U1), "CHANNEL", scopeId, sendDto({ content: "   " })));
      expect(empty.errorCode).toBe(ErrorCode.MSG_007);

      const tooLong = await catchAppError(() =>
        service.send(userOf(U1), "CHANNEL", scopeId, sendDto({ content: "a".repeat(LIMITS.message.maxChars + 1) }))
      );
      expect(tooLong.errorCode).toBe(ErrorCode.MSG_001);

      const zwj = "👨‍👩‍👧‍👦".repeat(LIMITS.message.maxChars); // 4000 grapheme = OK dù rất nhiều code point
      await expect(service.send(userOf(U1), "CHANNEL", scopeId, sendDto({ content: zwj }))).resolves.toMatchObject({ replayed: false });
    });

    it("không đọc được scope → 404; đọc được nhưng không ghi được → 403 MSG_004", async () => {
      const { service, scope, scopeId } = makeHarness();
      scope.setAccess({ visible: true, allowed: false });
      const denied = await catchAppError(() => service.send(userOf(U1), "CHANNEL", scopeId, sendDto()));
      expect(denied.errorCode).toBe(ErrorCode.MSG_004);
      expect(denied.statusCode).toBe(403);

      scope.setAccess({ visible: false });
      await expect(service.send(userOf(U1), "CHANNEL", scopeId, sendDto())).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("tệp đính kèm / voice (MSG-10, TX-04)", () => {
    const ASSET_ID = "e1".repeat(12);
    const asset = (over: Record<string, unknown> = {}) => ({
      id: ASSET_ID,
      ownerId: U1,
      status: "READY",
      kind: "VOICE",
      originalName: "voice.m4a",
      mime: "audio/mp4",
      size: 1000,
      declaredSize: 1000,
      width: null,
      height: null,
      durationMs: 5_000,
      waveform: { points: [1, 2, 3] },
      thumbnailAssetId: null,
      ...over,
    });
    const withAsset = () => sendDto({ content: undefined, attachments: [{ assetId: ASSET_ID }] });

    it("MSG-10: voice note 5 phút 1 giây (301 s) → 400 MSG_011; đúng 300 s → chấp nhận", async () => {
      const { service, scopeId } = makeHarness();
      mockAssetFindMany.mockResolvedValue([asset({ durationMs: LIMITS.message.voiceNoteMaxSeconds * 1000 + 1000 })]);
      const err = await catchAppError(() => service.send(userOf(U1), "CHANNEL", scopeId, withAsset()));
      expect(err.errorCode).toBe(ErrorCode.MSG_011);
      expect(err.statusCode).toBe(400);

      mockAssetFindMany.mockResolvedValue([asset({ durationMs: LIMITS.message.voiceNoteMaxSeconds * 1000 })]);
      const ok = await service.send(userOf(U1), "CHANNEL", scopeId, withAsset());
      expect(ok.view.attachments).toHaveLength(1);
      expect(ok.view.attachments[0]).toMatchObject({ assetId: ASSET_ID, kind: "VOICE", waveform: [1, 2, 3] });
    });

    it("tệp chưa READY / của người khác / không tồn tại → 400 MSG_005", async () => {
      const { service, scopeId } = makeHarness();
      for (const rows of [[asset({ status: "PROCESSING" })], [asset({ ownerId: U2 })], []]) {
        mockAssetFindMany.mockResolvedValue(rows);
        const err = await catchAppError(() => service.send(userOf(U1), "CHANNEL", scopeId, withAsset()));
        expect(err.errorCode).toBe(ErrorCode.MSG_005);
      }
    });
  });

  describe("mention qua IMentionValidator (p1-06)", () => {
    it("validator đã đăng ký: lưu mentions + normalizedContent theo textForSearch; outbox mang mentionUserIds/mentionAll", async () => {
      const { service, scopeId, repo } = makeHarness();
      const validate = jest.fn().mockResolvedValue({
        mentions: [{ type: "USER", targetId: U2, label: "Minh" }],
        mentionUserIds: [U2],
        mentionAll: false,
        textForSearch: "Chào @Minh",
      });
      registerMentionValidator({ validate });

      const dto = sendDto({ content: `Chào @{u:${U2}}`, mentions: [{ type: "USER", targetId: U2 }] });
      const { view } = await service.send(userOf(U1), "CHANNEL", scopeId, dto);

      expect(validate).toHaveBeenCalledWith({
        scopeType: "CHANNEL",
        scopeId: CH,
        mentions: [{ type: "USER", targetId: U2 }],
        content: `Chào @{u:${U2}}`,
        actorId: U1,
      });
      expect(view.mentions).toEqual([{ type: "USER", targetId: U2, label: "Minh" }]);
      expect(repo.all()[0].normalizedContent).toBe("chao @minh"); // tìm được theo tên lúc gửi, không phải marker
      expect(mockOutbox[0].payload).toMatchObject({ mentionUserIds: [U2], mentionAll: false });
    });

    it("validator ném MSG_008 → propagate, KHÔNG mở transaction / không tạo tin / không có outbox", async () => {
      const { service, scopeId, repo } = makeHarness();
      registerMentionValidator({
        validate: async () => {
          throw new AppError("Nhắc tên không hợp lệ", 400, ErrorCode.MSG_008, { reason: "MISMATCH" });
        },
      });
      const err = await catchAppError(() => service.send(userOf(U1), "CHANNEL", scopeId, sendDto()));
      expect(err.errorCode).toBe(ErrorCode.MSG_008);
      expect(mockEvents).toEqual([]);
      expect(repo.all()).toHaveLength(0);
    });

    it("mentionAll=true đi vào payload outbox (p1-07 fan-out @all)", async () => {
      const { service, scopeId } = makeHarness("CONVERSATION");
      registerMentionValidator({
        validate: async () => ({ mentions: [{ type: "ALL", targetId: null, label: null }], mentionUserIds: [], mentionAll: true, textForSearch: "@tất cả" }),
      });
      await service.send(userOf(U1), "CONVERSATION", scopeId, sendDto({ content: "@{all}", mentions: [{ type: "ALL" }] }));
      expect(mockOutbox[0].payload).toMatchObject({ scopeType: "CONVERSATION", scopeId: CONV, mentionAll: true, mentionUserIds: [] });
    });
  });

  describe("thread qua IThreadHook (p1-06)", () => {
    it("reply đầu: assertThreadable TRƯỚC transaction, onReplyCreated TRONG transaction, seq luồng thread bắt đầu từ 1, tạo Thread + AUTO_ON", async () => {
      const { service, scope, scopeId, repo } = makeHarness();
      const { hook, threadRepo, subRepo } = realThreadHook();
      registerThreadHook(hook);
      const root = seedMessage(repo, { seq: 7 }); // kênh đã có 7 tin

      const { view } = await service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ content: "Trả lời", threadRootId: root.id }));

      expect(mockEvents).toEqual(["hook:assertThreadable", "tx:start", "hook:onReplyCreated", "outbox:message.created", "outbox:message.fanout", "tx:commit"]);
      expect(view).toMatchObject({ threadId: root.id, seq: 1 }); // seq riêng của thread, không nối tiếp 7
      expect(repo.all().find((m) => m.id === view.id)).toMatchObject({ threadKey: root.id, threadId: root.id });

      const thread = await threadRepo.findByParentMessageId(root.id);
      expect(thread).toMatchObject({ replyCount: 1, lastReplySeq: 1, lastReplierIds: [U2], channelId: CH, parentAuthorId: U1 });
      expect(await subRepo.findByThreadAndUser(thread?.id as string, U2)).toMatchObject({ state: "AUTO_ON" });
      expect(mockOutbox[0].payload).toMatchObject({ threadId: root.id, isFirstReply: true, parentAuthorId: U1 });
      // Reply KHÔNG đẩy "tin mới nhất" của kênh (chỉ luồng root gọi onMessageCommitted).
      expect(scope.committed).toEqual([]);
    });

    it("reply thứ 2 (người khác): cùng Thread, replyCount=2, payload KHÔNG có isFirstReply", async () => {
      const { service, scopeId, repo } = makeHarness();
      const { hook, threadRepo } = realThreadHook();
      registerThreadHook(hook);
      const root = seedMessage(repo);

      await service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ threadRootId: root.id }));
      mockOutbox.length = 0;
      const second = await service.send(userOf(U3), "CHANNEL", scopeId, sendDto({ threadRootId: root.id }));

      expect(second.view.seq).toBe(2);
      expect((await threadRepo.findByParentMessageId(root.id))?.replyCount).toBe(2);
      expect(mockOutbox[0].payload).toMatchObject({ threadId: root.id });
      expect(mockOutbox[0].payload).not.toHaveProperty("isFirstReply");
    });

    it("TH-02: KHÔNG gửi threadRootId (chỉ mở thread rồi đóng) → không có Thread nào", async () => {
      const { service, scopeId, repo } = makeHarness();
      const { hook, threadRepo } = realThreadHook();
      registerThreadHook(hook);
      const root = seedMessage(repo);
      await service.send(userOf(U2), "CHANNEL", scopeId, sendDto());
      expect(await threadRepo.findByParentMessageId(root.id)).toBeNull();
      expect(mockEvents).not.toContain("hook:assertThreadable");
    });

    it("MSG-31: threadRootId trỏ tới 1 reply → 400 MSG_019, không mở transaction", async () => {
      const { service, scopeId, repo } = makeHarness();
      registerThreadHook(realThreadHook().hook);
      const root = seedMessage(repo);
      const reply = seedMessage(repo, { threadId: root.id, threadKey: root.id, seq: 1 });

      const err = await catchAppError(() => service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ threadRootId: reply.id })));
      expect(err.errorCode).toBe(ErrorCode.MSG_019);
      expect(err.statusCode).toBe(400);
      expect(mockEvents).toEqual(["hook:assertThreadable"]);
    });

    it("MSG-30: threadRootId trong HỘI THOẠI → 400 MSG_018", async () => {
      const { service, scopeId, repo } = makeHarness("CONVERSATION");
      registerThreadHook(realThreadHook().hook);
      const root = seedMessage(repo, { scopeType: "CONVERSATION", scopeId: CONV });

      const err = await catchAppError(() => service.send(userOf(U2), "CONVERSATION", scopeId, sendDto({ threadRootId: root.id })));
      expect(err.errorCode).toBe(ErrorCode.MSG_018);
      expect(err.statusCode).toBe(400);
      expect(repo.all()).toHaveLength(1);
    });

    it("root không tồn tại / thuộc kênh khác → 409 MSG_006", async () => {
      const { service, scopeId, repo } = makeHarness();
      registerThreadHook(realThreadHook().hook);
      const foreign = seedMessage(repo, { scopeId: "d1".repeat(12) });

      for (const threadRootId of ["f1".repeat(12), foreign.id]) {
        const err = await catchAppError(() => service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ threadRootId })));
        expect(err.errorCode).toBe(ErrorCode.MSG_006);
      }
    });

    it("root ĐÃ THU HỒI nhưng đã có thread → vẫn reply được (MSG-35); chưa có thread → MSG_006", async () => {
      const { service, scopeId, repo } = makeHarness();
      const { hook, threadRepo } = realThreadHook();
      registerThreadHook(hook);
      const root = seedMessage(repo);
      await service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ threadRootId: root.id }));
      await service.recall(userOf(U1), root.id, undefined);

      await expect(service.send(userOf(U3), "CHANNEL", scopeId, sendDto({ threadRootId: root.id }))).resolves.toMatchObject({ replayed: false });
      expect((await threadRepo.findByParentMessageId(root.id))?.replyCount).toBe(2);

      const lone = seedMessage(repo, { deletedAt: new Date() });
      const err = await catchAppError(() => service.send(userOf(U3), "CHANNEL", scopeId, sendDto({ threadRootId: lone.id })));
      expect(err.errorCode).toBe(ErrorCode.MSG_006);
    });

    it("hook CHƯA đăng ký + threadRootId → giữ hành vi p1-04 cũ: lưu threadId/threadKey, không side-effect thread", async () => {
      const { service, scopeId, repo } = makeHarness();
      const root = seedMessage(repo);
      const { view } = await service.send(userOf(U2), "CHANNEL", scopeId, sendDto({ threadRootId: root.id }));
      expect(view.threadId).toBe(root.id);
      expect(mockOutbox[0].payload).not.toHaveProperty("isFirstReply");
    });
  });
});
