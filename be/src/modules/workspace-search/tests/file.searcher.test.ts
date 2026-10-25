import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { MongoFilter } from "../../../core/utils/search-query";
import type { WorkspaceSearchQueryDto } from "../dtos";
import type { SearchContext } from "../entities/search.interface";
import { InMemoryReadableScopesRepository } from "../repositories/readable-scopes.repository.inmemory";
import type {
  ICatalogSearchRepository,
  IMessageSearchRepository,
  ResourceRow,
  SearchMessageRow,
} from "../repositories/search.repository.interface";
import { ReadableScopesService } from "../services/readable-scopes.service";
import { FileSearcher } from "../services/searchers/file.searcher";

const WS = "w".repeat(24);
const CHANNEL = "c".repeat(24);
const USER: AuthUser = { id: "1".repeat(24), email: "u@e.com", role: "user" };
const T0 = new Date("2026-09-20T00:00:00.000Z").getTime();
const at = (n: number): Date => new Date(T0 + n * 60_000);
const hex = (n: number): string => n.toString(16).padStart(24, "0");

const ctx: SearchContext = {
  user: USER,
  userId: USER.id,
  workspaceId: WS,
  role: "MEMBER",
  isGuest: false,
  tokens: ["bao", "cao"],
  regexes: ["(^|[^a-z0-9])bao", "(^|[^a-z0-9])cao"],
};

const query = (overrides: Partial<WorkspaceSearchQueryDto> = {}): WorkspaceSearchQueryDto => ({
  q: "bao cao",
  type: "files",
  includeDirect: false,
  limit: 2,
  ...overrides,
});

/** Đọc cửa sổ `createdAt` + điều kiện cursor từ filter Extended JSON mà `withWindow` dựng — đủ để giả lập Mongo. */
function windowOf(filter: MongoFilter): { gte: number; lt: number; cursor?: { at: number; id: string } } {
  const created = filter.createdAt as { $gte: { $date: string }; $lt: { $date: string } };
  const and = (filter.$and as MongoFilter[] | undefined) ?? [];
  const cursorClause = and.find((c) => Array.isArray((c as { $or?: unknown[] }).$or)) as { $or: { createdAt: { $lt: { $date: string } }; _id?: unknown }[] } | undefined;
  const cursorDate = cursorClause?.$or[0].createdAt.$lt.$date;
  const cursorId = cursorClause ? ((cursorClause.$or[1] as { _id: { $lt: { $oid: string } } })._id.$lt.$oid) : undefined;
  return {
    gte: Date.parse(created.$gte.$date),
    lt: Date.parse(created.$lt.$date),
    ...(cursorDate && cursorId ? { cursor: { at: Date.parse(cursorDate), id: cursorId } } : {}),
  };
}

function fakeMessages(rows: SearchMessageRow[]): IMessageSearchRepository {
  return {
    async search(filter, limit) {
      const w = windowOf(filter);
      const found = rows
        .filter((r) => r.createdAt.getTime() >= w.gte && r.createdAt.getTime() < w.lt)
        .filter((r) => !w.cursor || r.createdAt.getTime() < w.cursor.at || (r.createdAt.getTime() === w.cursor.at && r.id < w.cursor.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
      return { rows: found.slice(0, limit), timedOut: false };
    },
    async findHiddenMessageIds() {
      return new Set();
    },
    async findExistingMessageIds() {
      return new Set();
    },
  };
}

function fakeCatalog(resources: ResourceRow[]): ICatalogSearchRepository {
  return {
    userNames: async () => new Map(),
    userBriefs: async () => new Map(),
    listActiveMembers: async () => [],
    matchUsersByName: async () => new Map(),
    searchMeetings: async () => [],
    attendeeMeetingIds: async () => [],
    async searchResources(input) {
      const before = input.before;
      return resources
        .filter((r) => !before || r.createdAt.getTime() < before.at.getTime() || (r.createdAt.getTime() === before.at.getTime() && r.id < before.id))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, input.limit);
    },
  };
}

const messageRow = (n: number, names: string[], threadId: string | null = null): SearchMessageRow => ({
  id: hex(n),
  scopeType: "CHANNEL",
  scopeId: CHANNEL,
  threadId,
  seq: n,
  authorId: USER.id,
  content: null,
  mentions: [],
  attachments: names.map((name, i) => ({ assetId: hex(1000 + n * 10 + i), kind: "FILE", name, mime: "application/pdf", size: 1 })),
  createdAt: at(n),
  deletedAt: null,
});

const resourceRow = (n: number, name: string): ResourceRow => ({ id: hex(5000 + n), assetId: hex(6000 + n), name, mime: "application/pdf", size: 1, type: "PDF", createdAt: at(n) });

function searcher(messages: SearchMessageRow[], resources: ResourceRow[]) {
  const repo = new InMemoryReadableScopesRepository();
  repo.channels.push({
    workspaceId: WS,
    id: CHANNEL,
    name: "Kênh",
    normalizedName: "kenh",
    type: "TEXT",
    visibility: "PUBLIC",
    status: "ACTIVE",
    memberCount: 1,
    lastActivityAt: null,
  });
  // Đồng hồ cố định sau mọi dòng để cửa sổ thời gian phủ hết dữ liệu; lookback mặc định 12 tháng.
  const clock = () => at(10_000).getTime();
  return new FileSearcher(new ReadableScopesService(repo), fakeMessages(messages), fakeCatalog(resources), async () => true, clock);
}

/** Đi hết mọi trang; trả danh sách `assetId` theo thứ tự nhận được. */
async function drain(s: FileSearcher, limit: number): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await s.search(ctx, query({ limit, cursor }));
    out.push(...page.data.map((f) => f.assetId));
    if (!page.meta.hasMore) return out;
    cursor = page.meta.nextCursor ?? undefined;
    if (!cursor) return out;
  }
  throw new Error("phân trang không kết thúc");
}

describe("FileSearcher — tệp đính kèm tin + tài liệu kho", () => {
  it("chỉ trả tệp có tên khớp (không dấu, neo đầu từ); tin không có tệp khớp bị bỏ qua nhưng vẫn được tính vào cursor", async () => {
    const s = searcher(
      [messageRow(5, ["Báo cáo tuần.pdf", "Ảnh minh hoạ.png"]), messageRow(4, ["Sơ đồ.pdf"]), messageRow(3, ["nhàbáo cáo.pdf"])],
      [resourceRow(2, "Báo cáo tổng kết.pdf")]
    );
    const page = await s.search(ctx, query({ limit: 10 }));
    expect(page.data.map((f) => f.name)).toEqual(["Báo cáo tuần.pdf", "Báo cáo tổng kết.pdf"]);
    expect(page.data[0].source).toMatchObject({ kind: "MESSAGE", messageId: hex(5) });
    expect(page.data[1].source).toMatchObject({ kind: "RESOURCE", resourceId: hex(5002) });
  });

  it("tệp trong reply của luồng mang source.threadId (id tin gốc); tệp ở dòng chính → null; tệp kho tài liệu không có threadId", async () => {
    const s = searcher(
      [messageRow(5, ["Báo cáo trong luồng.pdf"], hex(2)), messageRow(4, ["Báo cáo dòng chính.pdf"])],
      [resourceRow(1, "Báo cáo kho.pdf")]
    );
    const { data } = await s.search(ctx, query({ limit: 10 }));
    expect(data.map((f) => f.name)).toEqual(["Báo cáo trong luồng.pdf", "Báo cáo dòng chính.pdf", "Báo cáo kho.pdf"]);
    expect(data[0].source).toMatchObject({ kind: "MESSAGE", messageId: hex(5), threadId: hex(2) });
    expect(data[1].source).toMatchObject({ kind: "MESSAGE", messageId: hex(4), threadId: null });
    expect(data[2].source).not.toHaveProperty("threadId");
  });

  it("hai nguồn bị giới hạn độc lập: phân trang không bỏ sót/lặp dòng nào (cắt danh sách gộp ở mốc của nguồn đầy)", async () => {
    // Tin: 9 dòng dày ở thời điểm mới; tài liệu: 3 dòng thưa xen giữa/ở cũ hơn.
    const messages = [30, 29, 28, 27, 26, 25, 24, 23, 22].map((n) => messageRow(n, [`Báo cáo tin ${n}.pdf`]));
    const resources = [26, 21, 20].map((n) => resourceRow(n, `Báo cáo kho ${n}.pdf`));
    const s = searcher(messages, resources);

    const seen = await drain(s, 2);
    const expected = [
      ...messages.map((m) => ({ n: m.seq, asset: m.attachments[0].assetId })),
      ...resources.map((r) => ({ n: Number(r.createdAt.getTime() - T0) / 60_000, asset: r.assetId })),
    ]
      .sort((a, b) => b.n - a.n)
      .map((x) => x.asset);
    expect(seen).toHaveLength(expected.length);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual(expected.sort());
  });

  it("trang trả đủ limit tệp và báo hasMore/nextCursor khi còn", async () => {
    const s = searcher([5, 4, 3, 2, 1].map((n) => messageRow(n, [`Báo cáo ${n}.pdf`])), []);
    const first = await s.search(ctx, query({ limit: 2 }));
    expect(first.data).toHaveLength(2);
    expect(first.meta.hasMore).toBe(true);
    expect(first.meta.nextCursor).toEqual(expect.any(String));
    const all = await drain(s, 2);
    expect(all).toHaveLength(5);
  });

  it("cổng kho tài liệu đóng → không tìm Resource; scopeType/scopeId → chỉ tệp trong tin", async () => {
    const repo = new InMemoryReadableScopesRepository();
    repo.channels.push({ workspaceId: WS, id: CHANNEL, name: "Kênh", normalizedName: "kenh", type: "TEXT", visibility: "PUBLIC", status: "ACTIVE", memberCount: 1, lastActivityAt: null });
    const clock = () => at(10_000).getTime();
    const closed = new FileSearcher(new ReadableScopesService(repo), fakeMessages([messageRow(2, ["Báo cáo A.pdf"])]), fakeCatalog([resourceRow(1, "Báo cáo kho.pdf")]), async () => false, clock);
    expect((await closed.search(ctx, query({ limit: 10 }))).data.map((f) => f.name)).toEqual(["Báo cáo A.pdf"]);

    const open = searcher([messageRow(2, ["Báo cáo A.pdf"])], [resourceRow(1, "Báo cáo kho.pdf")]);
    const scoped = await open.search(ctx, query({ limit: 10, scopeType: "CHANNEL", scopeId: CHANNEL }));
    expect(scoped.data.map((f) => f.name)).toEqual(["Báo cáo A.pdf"]);
    expect(LIMITS.search.workspaceMaxTimeMs).toBeGreaterThan(0);
  });
});
