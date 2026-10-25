/**
 * Unit — `MessageView.isSaved` (p1-04 be.md §4 + p1-09 §5): cờ "người xem đã lưu tin này" ghép vào trang tin bằng ĐÚNG 1 truy vấn batch
 * qua cổng `SavedMessageReader` (`shared/ports`, `messages` không import `discovery`); chưa đăng ký cổng / cổng lỗi → KHÔNG có key
 * `isSaved` (client coi là "chưa biết"), không làm hỏng trang tin.
 */
jest.mock("../../../infrastructure/database", () => ({
  prisma: { asset: { findMany: jest.fn() } },
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({ outbox: { add: async () => undefined } }));
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: () => undefined }));
jest.mock("../../assets/public", () => ({ createAssetLinkService: () => ({}) }));

import {
  clearSavedMessageReader,
  registerSavedMessageReader,
  type SavedMessageReader,
} from "../../../shared/ports/saved-message-reader.port";
import { MessageInteractionService } from "../services/message-interaction.service";
import type { SystemMessageService } from "../services/system-message.service";
import type { IReactionRepository } from "../repositories/reaction.repository.interface";
import type { IMessageHideRepository } from "../repositories/message-hide.repository.interface";
import { loadSavedFlags } from "../services/saved-flag.loader";
import { toView } from "../services/message-projection";
import { makeHarness, seedMessage, sendDto, userOf, U1, U2 } from "./support/message-service.harness";

/** Cổng có dữ liệu thật (đếm số lần gọi + id được hỏi) — chỉ trả id `saved` mà `userId` sở hữu. */
function readerOf(saved: Record<string, string[]>) {
  const calls: Array<{ userId: string; ids: string[] }> = [];
  const reader: SavedMessageReader = {
    savedIdsOf: async (userId, ids) => {
      calls.push({ userId, ids: [...ids] });
      return new Set(ids.filter((id) => saved[userId]?.includes(id)));
    },
  };
  return { reader, calls };
}

describe("MessageView.isSaved", () => {
  afterEach(() => clearSavedMessageReader());

  it("list(): MỘT truy vấn cho cả trang; tin đã lưu → true, còn lại (kể cả tin mình không lưu của người khác) → false", async () => {
    const { service, repo, scopeId } = makeHarness();
    const a = seedMessage(repo, { seq: 1, content: "A" });
    const b = seedMessage(repo, { seq: 2, content: "B" });
    const c = seedMessage(repo, { seq: 3, content: "C" });
    // U2 lưu `a` nhưng U1 chỉ lưu `b` — mỗi người xem cờ RIÊNG của mình.
    const { reader, calls } = readerOf({ [U1]: [b.id], [U2]: [a.id] });
    registerSavedMessageReader(reader);

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    const flags = Object.fromEntries(res.data.map((m) => [m.id, m.isSaved]));
    expect(flags).toEqual({ [a.id]: false, [b.id]: true, [c.id]: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ userId: U1, ids: expect.arrayContaining([a.id, b.id, c.id]) });

    const asU2 = await service.list(userOf(U2), "CHANNEL", scopeId, { limit: 30 });
    expect(asU2.data.find((m) => m.id === a.id)?.isSaved).toBe(true);
    expect(asU2.data.find((m) => m.id === b.id)?.isSaved).toBe(false);
  });

  it("get(): tin đã lưu → isSaved true", async () => {
    const { service, repo } = makeHarness();
    const a = seedMessage(repo, { seq: 1 });
    registerSavedMessageReader(readerOf({ [U1]: [a.id] }).reader);
    await expect(service.get(userOf(U1), a.id)).resolves.toMatchObject({ id: a.id, isSaved: true });
  });

  it("listPinned(): cờ isSaved ghép cho tin ghim (1 truy vấn batch)", async () => {
    const { repo, scopeId } = makeHarness();
    const p1 = seedMessage(repo, { seq: 1, pinnedAt: new Date(2026, 8, 19, 9, 0), pinnedBy: U1 });
    const p2 = seedMessage(repo, { seq: 2, pinnedAt: new Date(2026, 8, 19, 9, 5), pinnedBy: U1 });
    const { reader, calls } = readerOf({ [U1]: [p1.id] });
    registerSavedMessageReader(reader);

    const interaction = new MessageInteractionService(
      repo,
      { findMineByMessageIds: async () => new Set<string>() } as unknown as IReactionRepository,
      {} as IMessageHideRepository,
      {} as SystemMessageService
    );
    const pins = await interaction.listPinned(userOf(U1), "CHANNEL", scopeId);
    expect(Object.fromEntries(pins.map((p) => [p.id, p.isSaved]))).toEqual({ [p1.id]: true, [p2.id]: false });
    expect(calls).toHaveLength(1);
  });

  it("chỉ hỏi tin USER còn nguyên: tin hệ thống/đã thu hồi không vào truy vấn và luôn isSaved=false (dù id có trong tập)", async () => {
    const { repo } = makeHarness();
    const live = seedMessage(repo, { seq: 1 });
    const system = seedMessage(repo, { seq: 2, kind: "SYSTEM", authorId: null, systemType: "MEMBER_JOINED", content: null });
    const gone = seedMessage(repo, { seq: 3, deletedAt: new Date(2026, 8, 19), deletedBy: U1 });
    const { reader, calls } = readerOf({ [U1]: [live.id, system.id, gone.id] });
    registerSavedMessageReader(reader);

    const ids = await loadSavedFlags(U1, [live, system, gone]);
    expect(calls).toEqual([{ userId: U1, ids: [live.id] }]);
    expect(ids).toBeDefined();

    // `savedMessageIds` cố tình chứa cả id tin đã thu hồi (bản lưu cũ còn) → toView vẫn ép false.
    const ctx = {
      viewerId: U1,
      myReactionKeys: new Set<string>(),
      capabilities: { canWrite: true, canPin: true, canReact: true, canModerate: false },
      savedMessageIds: new Set([live.id, gone.id]),
    };
    expect(toView(live, ctx).isSaved).toBe(true);
    expect(toView(gone, ctx).isSaved).toBe(false);
    expect(toView(system, ctx).isSaved).toBe(false);
  });

  it("trang toàn tin hệ thống/thu hồi: không gọi cổng nhưng vẫn isSaved=false (cờ có mặt vì cổng đã đăng ký)", async () => {
    const { repo } = makeHarness();
    const system = seedMessage(repo, { seq: 1, kind: "SYSTEM", authorId: null, systemType: "MEMBER_JOINED", content: null });
    const { reader, calls } = readerOf({});
    registerSavedMessageReader(reader);

    const ids = await loadSavedFlags(U1, [system]);
    expect(calls).toHaveLength(0);
    expect(ids?.size).toBe(0);
  });

  it("chưa đăng ký cổng (worker/test không nạp discovery): KHÔNG có key isSaved, trang vẫn đọc bình thường", async () => {
    const { service, repo, scopeId } = makeHarness();
    seedMessage(repo, { seq: 1 });

    expect(await loadSavedFlags(U1, [seedMessage(repo, { seq: 2 })])).toBeUndefined();
    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    expect(res.data).toHaveLength(2);
    for (const m of res.data) expect(m).not.toHaveProperty("isSaved");
  });

  it("cổng lỗi: nuốt lỗi (chỉ log), không isSaved, trang vẫn trả về", async () => {
    const { service, repo, scopeId } = makeHarness();
    seedMessage(repo, { seq: 1 });
    registerSavedMessageReader({
      savedIdsOf: async () => {
        throw new Error("mongo down");
      },
    });

    const res = await service.list(userOf(U1), "CHANNEL", scopeId, { limit: 30 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).not.toHaveProperty("isSaved");
  });

  it("tin VỪA tạo qua send(): isSaved=false ngay, KHÔNG tốn truy vấn cổng", async () => {
    const { service, scopeId } = makeHarness();
    const { reader, calls } = readerOf({});
    registerSavedMessageReader(reader);

    const { view } = await service.send(userOf(U1), "CHANNEL", scopeId, sendDto({ content: "Mới" }));
    expect(view.isSaved).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
