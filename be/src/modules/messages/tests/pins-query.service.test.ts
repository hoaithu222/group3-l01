/**
 * Unit — `PinsQueryService` (p1-09 be.md §5.3, DU-04): phân trang cursor `(pinnedAt, id)`, `meta.total/max`,
 * lọc tin bị ẩn (D-23 `hiddenBeforeSeq` + `MessageHide`), `pinnedByUser`, và giữ hợp đồng p1-04
 * (không query → đủ mọi tin ghim trong 1 trang, thứ tự `pinnedAt desc`).
 */
import { PinsQueryService } from "../services/pins-query.service";
import type { MessageInteractionService } from "../services/message-interaction.service";
import type { IPinSupportRepository } from "../repositories/pin-support.repository.interface";
import type { MessageScope } from "../scope/message-scope.interface";
import type { MessageScopeTypeValue, MessageView } from "../entities/message.interface";
import { encodeCursor } from "../../../core/utils/cursor";

const SCOPE_ID = "cccccccccccccccccccccc01";
const ME = { id: "aaaaaaaaaaaaaaaaaaaaaaa1", email: "a@e.com", role: "user" };
const PINNER = "aaaaaaaaaaaaaaaaaaaaaaa2";

let counter = 0;
function pinnedView(overrides: Partial<MessageView> & { pinnedAtMs: number }): MessageView {
  counter += 1;
  const { pinnedAtMs, ...rest } = overrides;
  return {
    id: counter.toString(16).padStart(24, "0"),
    scopeType: "CHANNEL",
    scopeId: SCOPE_ID,
    threadId: null,
    seq: counter,
    kind: "USER",
    systemType: null,
    systemPayload: null,
    authorId: PINNER,
    clientMessageId: null,
    content: "tin đã ghim",
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactions: [],
    pinnedAt: new Date(pinnedAtMs),
    pinnedBy: PINNER,
    editedAt: null,
    version: 1,
    createdAt: new Date(2026, 8, 1),
    deleted: false,
    deletedAt: null,
    myPermissions: {
      canEdit: false,
      canRecall: false,
      canPin: true,
      canReact: true,
      canReply: true,
      canForward: true,
      canReport: true,
      canModerate: false,
    },
    ...rest,
  };
}

interface Setup {
  service: PinsQueryService;
  listPinned: jest.Mock;
  hidden: Set<string>;
  floor: { value: number };
}

function setup(views: MessageView[], pinMax = 20): Setup {
  const listPinned = jest.fn().mockResolvedValue(views);
  const hidden = new Set<string>();
  const floor = { value: 0 };
  const support: IPinSupportRepository = {
    findUserNames: async (ids) => new Map(ids.includes(PINNER) ? [[PINNER, "Bình"]] : []),
    findHiddenMessageIds: async (_userId, ids) => new Set(ids.filter((id) => hidden.has(id))),
  };
  const scope = {
    scopeType: "CHANNEL",
    viewerContext: async () => ({ hiddenBeforeSeq: floor.value, capabilities: { canWrite: true, canReact: true, canPin: true, canModerate: false } }),
    pinMax: () => pinMax,
  } as unknown as MessageScope;
  const service = new PinsQueryService(
    { listPinned } as unknown as Pick<MessageInteractionService, "listPinned">,
    support,
    (_t: MessageScopeTypeValue) => scope
  );
  return { service, listPinned, hidden, floor };
}

describe("PinsQueryService.list()", () => {
  it("giữ hợp đồng p1-04: không cursor/limit → đủ tin ghim, pinnedAt desc, kèm meta total/max và pinnedByUser", async () => {
    const a = pinnedView({ pinnedAtMs: 1000 });
    const b = pinnedView({ pinnedAtMs: 3000 });
    const c = pinnedView({ pinnedAtMs: 2000 });
    const { service, listPinned } = setup([a, b, c]);

    const page = await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 });

    expect(listPinned).toHaveBeenCalledWith(ME, "CHANNEL", SCOPE_ID);
    expect(page.data.map((m) => m.id)).toEqual([b.id, c.id, a.id]);
    expect(page.meta).toEqual({ nextCursor: null, hasMore: false, limit: 30, total: 3, max: 20 });
    expect(page.data[0].pinnedByUser).toEqual({ id: PINNER, name: "Bình" });
    // MessageView nguyên vẹn (client cũ vẫn đọc được các field cũ)
    expect(page.data[0]).toMatchObject({ id: b.id, content: "tin đã ghim", pinnedBy: PINNER });
  });

  it("DU-04: 20 tin ghim kênh / 10 hội thoại → danh sách đủ, meta.max theo adapter", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => pinnedView({ pinnedAtMs: 1000 + i }));
    expect((await setup(twenty, 20).service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 })).meta).toMatchObject({ total: 20, max: 20, hasMore: false });
    const ten = Array.from({ length: 10 }, (_, i) => pinnedView({ pinnedAtMs: 1000 + i, scopeType: "CONVERSATION" }));
    const page = await setup(ten, 10).service.list(ME, "CONVERSATION", SCOPE_ID, { limit: 30 });
    expect(page.data).toHaveLength(10);
    expect(page.meta).toMatchObject({ total: 10, max: 10 });
  });

  it("cursor: nối tiếp không trùng/sót; trang cuối nextCursor=null; total không đổi giữa các trang", async () => {
    const views = Array.from({ length: 5 }, (_, i) => pinnedView({ pinnedAtMs: 1000 * (i + 1) }));
    const newestFirst = [...views].reverse();
    const { service } = setup(views);

    const p1 = await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 2 });
    expect(p1.data.map((m) => m.id)).toEqual(newestFirst.slice(0, 2).map((m) => m.id));
    expect(p1.meta).toMatchObject({ hasMore: true, total: 5, limit: 2 });
    expect(p1.meta.nextCursor).toBe(encodeCursor(newestFirst[1].pinnedAt as Date, newestFirst[1].id));

    const p2 = await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 2, cursor: p1.meta.nextCursor as string });
    expect(p2.data.map((m) => m.id)).toEqual(newestFirst.slice(2, 4).map((m) => m.id));
    expect(p2.meta.total).toBe(5);

    const p3 = await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 2, cursor: p2.meta.nextCursor as string });
    expect(p3.data.map((m) => m.id)).toEqual([newestFirst[4].id]);
    expect(p3.meta).toMatchObject({ nextCursor: null, hasMore: false });
  });

  it("pinnedAt trùng nhau → phân xử theo id giảm dần, cursor vẫn không sót/trùng", async () => {
    const views = Array.from({ length: 4 }, () => pinnedView({ pinnedAtMs: 5000 }));
    const { service } = setup(views);
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 4; i += 1) {
      const page = await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 1, cursor });
      ids.push(...page.data.map((m) => m.id));
      cursor = page.meta.nextCursor ?? undefined;
    }
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(cursor).toBeUndefined();
  });

  it("hội thoại: loại tin ≤ hiddenBeforeSeq và tin MessageHide của người xem; total đã lọc", async () => {
    const early = pinnedView({ pinnedAtMs: 1000, scopeType: "CONVERSATION", seq: 3 });
    const hiddenOne = pinnedView({ pinnedAtMs: 2000, scopeType: "CONVERSATION", seq: 20 });
    const keep = pinnedView({ pinnedAtMs: 3000, scopeType: "CONVERSATION", seq: 21 });
    const { service, hidden, floor } = setup([early, hiddenOne, keep], 10);
    floor.value = 5;
    hidden.add(hiddenOne.id);

    const page = await service.list(ME, "CONVERSATION", SCOPE_ID, { limit: 30 });

    expect(page.data.map((m) => m.id)).toEqual([keep.id]);
    expect(page.meta).toMatchObject({ total: 1, max: 10 });
  });

  it("mốc hiddenBeforeSeq KHÔNG áp cho reply thread (dãy seq riêng theo thread)", async () => {
    const reply = pinnedView({ pinnedAtMs: 1000, seq: 1, threadId: "eeeeeeeeeeeeeeeeeeeeeee1" });
    const { service, floor } = setup([reply]);
    floor.value = 50;
    expect((await service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 })).data).toHaveLength(1);
  });

  it("quyền đọc do listPinned kiểm (404 lan ra, không truy vấn phụ); phạm vi chưa đăng ký → 404", async () => {
    const { service, listPinned } = setup([]);
    listPinned.mockRejectedValueOnce(Object.assign(new Error("nf"), { statusCode: 404 }));
    await expect(service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 })).rejects.toMatchObject({ statusCode: 404 });

    const none = new PinsQueryService({ listPinned: jest.fn() } as unknown as Pick<MessageInteractionService, "listPinned">, {} as IPinSupportRepository, () => undefined);
    await expect(none.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("cursor hỏng → 400", async () => {
    const { service } = setup([pinnedView({ pinnedAtMs: 1000 })]);
    await expect(service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30, cursor: "@@@" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("người ghim không tra được tên → pinnedByUser.name = null; tin không có pinnedBy → null", async () => {
    const unknown = pinnedView({ pinnedAtMs: 2000, pinnedBy: "aaaaaaaaaaaaaaaaaaaaaaa9" });
    const none = pinnedView({ pinnedAtMs: 1000, pinnedBy: null });
    const page = await setup([unknown, none]).service.list(ME, "CHANNEL", SCOPE_ID, { limit: 30 });
    expect(page.data[0].pinnedByUser).toEqual({ id: "aaaaaaaaaaaaaaaaaaaaaaa9", name: null });
    expect(page.data[1].pinnedByUser).toBeNull();
  });
});
