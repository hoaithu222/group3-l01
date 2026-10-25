/**
 * Unit — `MessageModerationService` (p1-08 `MessageModerationPort` trên engine `messages`): kiểm quyền qua registry `MessageScope`
 * (không import channels/conversations), gỡ tin = `tombstone(MODERATION, authorOnly=false)` + audit `message.moderator-remove`,
 * idempotent, không gỡ tin hệ thống, ngữ cảnh ±N theo `seq` (tin đã gỡ → content null). Repo/scope/audit giả.
 */
import { clearMessageScopeRegistry, registerMessageScope } from "../scope/message-scope.registry";
import { MessageModerationService } from "../services/message-moderation.service";
import type { Message } from "../entities/message.interface";
import type { MessageScope } from "../scope/message-scope.interface";
import type { IMessageRepository } from "../repositories/message.repository.interface";

const oid = (c: string): string => c.repeat(24);
const VIEWER = { id: oid("1"), email: "v@test.local", role: "user" };
const CHANNEL = oid("c");

function makeMessage(over: Partial<Message> = {}): Message {
  return {
    id: oid("e"),
    scopeType: "CHANNEL",
    scopeId: CHANNEL,
    workspaceId: oid("a"),
    threadId: null,
    threadKey: "root",
    seq: 10,
    authorId: oid("2"),
    kind: "USER",
    systemType: null,
    systemPayload: null,
    clientMessageId: null,
    dedupeKey: "u:x",
    content: "nội dung gốc",
    normalizedContent: "noi dung goc",
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactionsSummary: [],
    sourceRefs: [],
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    version: 1,
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    deleteMode: null,
    createdAt: new Date("2026-09-19T00:00:00Z"),
    updatedAt: new Date("2026-09-19T00:00:00Z"),
    ...over,
  };
}

function fakeScope(over: { visible?: boolean; canModerate?: boolean } = {}): MessageScope {
  const { visible = true, canModerate = false } = over;
  return {
    scopeType: "CHANNEL",
    canRead: jest.fn().mockResolvedValue({ visible, workspaceId: oid("a") }),
    viewerContext: jest.fn().mockResolvedValue({
      hiddenBeforeSeq: 0,
      capabilities: { canWrite: false, canReact: false, canPin: false, canModerate },
    }),
  } as unknown as MessageScope;
}

function makeService(rows: Message[]) {
  const repo = {
    findById: jest.fn((id: string) => Promise.resolve(rows.find((r) => r.id === id) ?? null)),
    findByIds: jest.fn((ids: string[]) => Promise.resolve(rows.filter((r) => ids.includes(r.id)))),
    listBySeq: jest.fn(({ seqBelow, seqAbove, limit, order }: { seqBelow?: number; seqAbove?: number; limit: number; order: "asc" | "desc" }) => {
      const list = rows
        .filter((r) => (seqBelow === undefined || r.seq < seqBelow) && (seqAbove === undefined || r.seq > seqAbove))
        .sort((a, b) => (order === "asc" ? a.seq - b.seq : b.seq - a.seq));
      return Promise.resolve(list.slice(0, limit));
    }),
  } as unknown as jest.Mocked<IMessageRepository>;
  const messageService = { tombstone: jest.fn() };
  const audit = { record: jest.fn() };
  return { repo, messageService, audit, service: new MessageModerationService(repo, messageService, audit) };
}

afterEach(() => clearMessageScopeRegistry());

describe("MessageModerationService — kiểm quyền qua MessageScope", () => {
  it("findReadable: null khi tin không tồn tại / không đọc được; có → ref KHÔNG chứa nội dung ngoài excerpt", async () => {
    const { service } = makeService([makeMessage()]);
    registerMessageScope("CHANNEL", fakeScope({ visible: false }));
    await expect(service.findReadable(VIEWER, oid("e"))).resolves.toBeNull();
    await expect(service.findReadable(VIEWER, oid("f"))).resolves.toBeNull();

    registerMessageScope("CHANNEL", fakeScope({ visible: true }));
    const ref = await service.findReadable(VIEWER, oid("e"));
    expect(ref).toMatchObject({ id: oid("e"), scopeType: "CHANNEL", scopeId: CHANNEL, authorId: oid("2"), kind: "USER", deleted: false, excerpt: "nội dung gốc" });
  });

  it("chưa có adapter cho scope → không đọc/không kiểm duyệt được (fail-closed)", async () => {
    const { service } = makeService([makeMessage()]);
    expect(await service.canReadScope(VIEWER, "CONVERSATION", oid("d"))).toBe(false);
    expect(await service.canModerateScope(VIEWER, "CONVERSATION", oid("d"))).toBe(false);
  });

  it("canModerateScope theo capabilities.canModerate của adapter", async () => {
    const { service } = makeService([]);
    registerMessageScope("CHANNEL", fakeScope({ canModerate: true }));
    expect(await service.canModerateScope(VIEWER, "CHANNEL", CHANNEL)).toBe(true);
    registerMessageScope("CHANNEL", fakeScope({ canModerate: false }));
    expect(await service.canModerateScope(VIEWER, "CHANNEL", CHANNEL)).toBe(false);
  });

  it("findByIds: tin đã gỡ → excerpt rỗng (không lộ nội dung), deleted=true", async () => {
    const { service } = makeService([makeMessage({ deletedAt: new Date(), content: null })]);
    const [ref] = await service.findByIds([oid("e")]);
    expect(ref).toMatchObject({ deleted: true, excerpt: "" });
    expect(await service.findByIds([])).toEqual([]);
  });
});

describe("MessageModerationService.removeByModerator", () => {
  it("gỡ tin: tombstone(MODERATION, authorOnly=false) + audit message.moderator-remove kèm source/reportId", async () => {
    const deletedAt = new Date("2026-09-19T05:00:00Z");
    const { service, messageService, audit } = makeService([makeMessage()]);
    messageService.tombstone.mockResolvedValue(deletedAt);

    const res = await service.removeByModerator({ messageId: oid("e"), actorId: oid("9"), actorRole: "manager", reason: "Vi phạm nội quy", source: "REPORT", reportId: oid("r") });

    expect(messageService.tombstone).toHaveBeenCalledWith(oid("e"), oid("9"), "MODERATION", "Vi phạm nội quy", false);
    expect(res).toEqual({ messageId: oid("e"), deletedAt, alreadyDeleted: false });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: oid("9"),
        actorRole: "manager",
        action: "message.moderator-remove",
        targetType: "Message",
        targetId: oid("e"),
        reason: "Vi phạm nội quy",
        metadata: expect.objectContaining({ source: "REPORT", scopeType: "CHANNEL", scopeId: CHANNEL, authorId: oid("2"), reportId: oid("r") }),
      })
    );
  });

  it("idempotent: tin đã gỡ → alreadyDeleted, KHÔNG tombstone/audit lại", async () => {
    const already = new Date("2026-09-18T00:00:00Z");
    const { service, messageService, audit } = makeService([makeMessage({ deletedAt: already })]);
    await expect(service.removeByModerator({ messageId: oid("e"), actorId: oid("9"), reason: "Vi phạm nội quy", source: "PLATFORM" })).resolves.toEqual({
      messageId: oid("e"),
      deletedAt: already,
      alreadyDeleted: true,
    });
    expect(messageService.tombstone).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("tin hệ thống → MOD_003 (400); tin không tồn tại → 404", async () => {
    const { service, messageService } = makeService([makeMessage({ kind: "SYSTEM", authorId: null })]);
    await expect(service.removeByModerator({ messageId: oid("e"), actorId: oid("9"), reason: "Vi phạm nội quy", source: "PLATFORM" })).rejects.toMatchObject({ statusCode: 400, errorCode: "MOD_003" });
    await expect(service.removeByModerator({ messageId: oid("f"), actorId: oid("9"), reason: "Vi phạm nội quy", source: "PLATFORM" })).rejects.toMatchObject({ statusCode: 404 });
    expect(messageService.tombstone).not.toHaveBeenCalled();
  });
});

describe("MessageModerationService.contextAround", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((seq) => makeMessage({ id: oid(String(seq)), seq, content: `tin ${seq}` }));

  it("trả ±N tin theo seq (thứ tự tăng dần), đánh dấu đúng tin bị báo cáo", async () => {
    const { service } = makeService(rows);
    const ctx = await service.contextAround(oid("5"), 3);
    expect(ctx.map((m) => m.seq)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(ctx.filter((m) => m.isTarget).map((m) => m.id)).toEqual([oid("5")]);
    expect(ctx[3].content).toBe("tin 5");
  });

  it("đầu/cuối luồng: ít hơn N tin mỗi phía; tin đã gỡ → content null + attachments rỗng; tin không tồn tại → []", async () => {
    const withDeleted = rows.map((r) => (r.seq === 2 ? { ...r, deletedAt: new Date(), content: null } : r));
    const { service } = makeService(withDeleted);
    const ctx = await service.contextAround(oid("1"), 3);
    expect(ctx.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(ctx[1]).toMatchObject({ deleted: true, content: null, attachments: [] });
    expect(await service.contextAround(oid("f"), 3)).toEqual([]);
  });

  it("chỉ tóm tắt tệp đính kèm (kind/name/mime) — không lộ assetId", async () => {
    const withFile = makeMessage({
      attachments: [{ assetId: oid("a"), kind: "FILE", name: "a.pdf", mime: "application/pdf", size: 1, width: null, height: null, durationMs: null, waveform: [], thumbnailAssetId: null }],
    });
    const { service } = makeService([withFile]);
    const [m] = await service.contextAround(withFile.id, 3);
    expect(m.attachments).toEqual([{ kind: "FILE", name: "a.pdf", mime: "application/pdf" }]);
  });
});
