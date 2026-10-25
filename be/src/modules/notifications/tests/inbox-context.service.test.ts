import { InboxContextService } from "../services/inbox-context.service";
import type {
  IInboxContextRepository,
  InboxContextMessage,
  InboxScopeInfo,
} from "../repositories/inbox-context.repository.interface";
import type { NotificationInboxItem } from "../entities/notification.interface";

const oid = (n: number): string => `64b${String(n).padStart(21, "0")}`;
const [ME, ACTOR, CH, CONV, M1, M2, M3] = [oid(1), oid(2), oid(100), oid(200), oid(301), oid(302), oid(303)];

function item(over: Partial<NotificationInboxItem>): NotificationInboxItem {
  return {
    id: oid(900), type: "mention", kind: "MENTION", scopeType: "CHANNEL", scopeId: CH, workspaceId: oid(500), actorId: ACTOR,
    refs: { messageId: M1 }, createdAt: new Date(), readAt: null, muted: false, unavailable: false, threadId: null, messageId: M1, ...over,
  };
}

function msg(id: string, over: Partial<InboxContextMessage> = {}): InboxContextMessage {
  return {
    id, seq: 10, scopeType: "CHANNEL", scopeId: CH, threadId: null, content: "Chào @{u:" + ME + "} xem giúp nhé",
    mentions: [{ type: "USER", targetId: ME, label: "Tôi" }], attachments: [], deletedAt: null, ...over,
  };
}

function makeService(opts: {
  readable?: (scopeKey: string) => boolean;
  messages?: InboxContextMessage[];
  scopes?: Record<string, InboxScopeInfo>;
  actorAvatarAssetId?: string | null;
}) {
  const repo: IInboxContextRepository = {
    findMessages: (ids) => Promise.resolve(new Map((opts.messages ?? []).filter((m) => ids.includes(m.id)).map((m) => [m.id, m]))),
    loadScopeInfo: () => Promise.resolve(new Map(Object.entries(opts.scopes ?? { [`CHANNEL:${CH}`]: { name: "frontend", hiddenBeforeSeq: 0 } }))),
    loadActors: () => Promise.resolve(new Map([[ACTOR, { name: "Minh", avatarAssetId: opts.actorAvatarAssetId ?? null }]])),
  };
  const canRead = jest.fn((_u: string, t: string, id: string) => Promise.resolve(opts.readable ? opts.readable(`${t}:${id}`) : true));
  return { svc: new InboxContextService({ repo, canRead }), canRead };
}

describe("InboxContextService.enrich (be.md §5.8 — kiểm quyền lúc đọc)", () => {
  it("còn quyền: available=true, tên kênh, excerpt thay marker bằng @tên, actor có tên", async () => {
    const { svc } = makeService({ messages: [msg(M1)] });
    const [out] = await svc.enrich(ME, [item({})]);

    expect(out?.context).toEqual({ available: true, scopeName: "frontend", excerpt: "Chào @Tôi xem giúp nhé", muted: false });
    expect(out?.actor).toEqual({ userId: ACTOR, name: "Minh", avatarUrl: null });
    expect(out?.messageId).toBe(M1);
  });

  it("người thực hiện có ảnh → actor.avatarUrl là URL ảnh ký sẵn (THUMB) từ avatarAssetId, dùng thẳng không cần Bearer", async () => {
    const asset = oid(700);
    const { svc } = makeService({ messages: [msg(M1)], actorAvatarAssetId: asset });
    const [out] = await svc.enrich(ME, [item({})]);

    expect(out?.actor?.avatarUrl).toContain(`/api/v1/assets/${asset}/image?v=THUMB`);
    expect(out?.actor?.avatarUrl).not.toContain("/users/");
  });

  it("NT-05: mất quyền đọc → available=false và KHÔNG lộ ngữ cảnh (scopeId/actor/refs/excerpt)", async () => {
    const { svc } = makeService({ readable: () => false, messages: [msg(M1)] });
    const [out] = await svc.enrich(ME, [item({})]);

    expect(out?.context).toEqual({ available: false, muted: false });
    expect(out).toMatchObject({ unavailable: true, scopeId: null, actorId: null, refs: null, messageId: null, actor: null });
    expect(JSON.stringify(out)).not.toContain("Chào");
    expect(JSON.stringify(out)).not.toContain("frontend");
  });

  it("tin đã thu hồi hoặc không còn → available=false, không trả excerpt cũ", async () => {
    const { svc } = makeService({ messages: [msg(M1, { deletedAt: new Date() })] });
    const [recalled] = await svc.enrich(ME, [item({})]);
    expect(recalled?.context).toEqual({ available: false, muted: false });

    const { svc: svc2 } = makeService({ messages: [] });
    const [gone] = await svc2.enrich(ME, [item({})]);
    expect(gone?.context?.available).toBe(false);
  });

  it("hội thoại 'xoá phía tôi' (seq ≤ hiddenBeforeSeq) → available=false", async () => {
    const { svc } = makeService({
      messages: [msg(M2, { scopeType: "CONVERSATION", scopeId: CONV, seq: 5 })],
      scopes: { [`CONVERSATION:${CONV}`]: { name: "Đồ án", hiddenBeforeSeq: 5 } },
    });
    const [out] = await svc.enrich(ME, [item({ scopeType: "CONVERSATION", scopeId: CONV, messageId: M2, refs: { messageId: M2 } })]);
    expect(out?.context?.available).toBe(false);
  });

  it("mục đã ghi REVOKED (unavailable từ repo) → ẩn, không gọi canRead", async () => {
    const { svc, canRead } = makeService({ messages: [msg(M1)] });
    const [out] = await svc.enrich(ME, [item({ unavailable: true })]);
    expect(out?.context?.available).toBe(false);
    expect(canRead).not.toHaveBeenCalled();
  });

  it("loại phi tin nhắn (không messageId) → available=true, không excerpt; giữ nhãn muted", async () => {
    const { svc } = makeService({});
    const [out] = await svc.enrich(ME, [item({ type: "call.missed", scopeType: "NONE", scopeId: null, messageId: null, refs: {}, muted: true })]);
    expect(out?.context).toEqual({ available: true, muted: true });
  });

  it("kiểm quyền theo TỪNG luồng một lần (gom theo scope), luồng nào mất quyền chỉ ẩn mục của luồng đó", async () => {
    const { svc, canRead } = makeService({
      readable: (k) => k === `CHANNEL:${CH}`,
      messages: [msg(M1), msg(M3, { id: M3 })],
    });
    const out = await svc.enrich(ME, [
      item({ id: oid(901), messageId: M1 }),
      item({ id: oid(902), messageId: M3, refs: { messageId: M3 } }),
      item({ id: oid(903), scopeType: "CONVERSATION", scopeId: CONV, messageId: M2, refs: { messageId: M2 } }),
    ]);

    expect(out.map((o) => o.context?.available)).toEqual([true, true, false]);
    expect(canRead).toHaveBeenCalledTimes(2); // CH (một lần cho 2 mục) + CONV
  });

  it("danh sách rỗng → trả nguyên, không truy vấn", async () => {
    const { svc, canRead } = makeService({});
    expect(await svc.enrich(ME, [])).toEqual([]);
    expect(canRead).not.toHaveBeenCalled();
  });
});
