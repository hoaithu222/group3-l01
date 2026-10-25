import { LIMITS } from "../../../core/constants/limits";
import type { ResolvedAccess } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import type { WorkspaceSearchQueryDto } from "../dtos";
import type { SearchContext, SearchPage } from "../entities/search.interface";
import type { ICatalogSearchRepository, MemberRow } from "../repositories/search.repository.interface";
import { PeopleSearcher } from "../services/searchers/people.searcher";
import { ChannelSearcher } from "../services/searchers/channel.searcher";
import { InMemoryReadableScopesRepository } from "../repositories/readable-scopes.repository.inmemory";
import { ReadableScopesService } from "../services/readable-scopes.service";
import { emptyPage, type Searcher } from "../services/searchers/searcher.types";
import { WorkspaceSearchService, type SearcherMap } from "../services/workspace-search.service";

const WS = "w".repeat(24);
const USER: AuthUser = { id: "1".repeat(24), email: "u@e.com", role: "user" };
const access = (role: string): ResolvedAccess => ({ visible: true, role, actions: new Set() });

function query(overrides: Partial<WorkspaceSearchQueryDto> = {}): WorkspaceSearchQueryDto {
  return { q: "bao cao", type: "messages", includeDirect: false, limit: LIMITS.search.pageSize, ...overrides };
}

function spySearchers(): { map: SearcherMap; calls: SearchContext[] } {
  const calls: SearchContext[] = [];
  const make = <T>(): Searcher<T> => ({
    async search(ctx): Promise<SearchPage<T>> {
      calls.push(ctx);
      return emptyPage<T>(30);
    },
  });
  return { map: { messages: make(), files: make(), channels: make(), people: make(), meetings: make() }, calls };
}

describe("WorkspaceSearchService", () => {
  it("SRCH_101: từ khoá ngoài 2–100 grapheme hoặc rỗng sau chuẩn hoá → 400", async () => {
    const { map } = spySearchers();
    const service = new WorkspaceSearchService(map);
    for (const q of ["", "a", "  ", "x".repeat(101)]) {
      await expect(service.search(USER, WS, access("MEMBER"), query({ q }))).rejects.toMatchObject({ errorCode: "SRCH_101", statusCode: 400 });
    }
  });

  it("chuyển đúng searcher theo type, kèm token/regex đã chuẩn hoá và cờ khách", async () => {
    const { map, calls } = spySearchers();
    const service = new WorkspaceSearchService(map);
    await service.search(USER, WS, access("GUEST"), query({ q: "Báo cáo", type: "files" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ userId: USER.id, workspaceId: WS, role: "GUEST", isGuest: true, tokens: ["bao", "cao"] });
    expect(calls[0].regexes).toHaveLength(2);
  });
});

describe("PeopleSearcher", () => {
  const members: MemberRow[] = [
    { userId: "a".repeat(24), role: "MEMBER", displayName: null },
    { userId: "b".repeat(24), role: "ADMIN", displayName: "Đặng Văn Bình" },
    { userId: "c".repeat(24), role: "MEMBER", displayName: null },
  ];
  const names: Record<string, string> = { ["a".repeat(24)]: "Nguyễn Thị An", ["b".repeat(24)]: "Bình", ["c".repeat(24)]: "Trần Cường" };
  /** Chỉ "b" (Bình) có ảnh đại diện. */
  const B_AVATAR = "65f0000000000000000000bb";
  const brief = (id: string) => ({ name: names[id] ?? "Trần Cường", avatarAssetId: id === "b".repeat(24) ? B_AVATAR : null });
  const catalog: ICatalogSearchRepository = {
    userNames: async (ids) => new Map(ids.map((id) => [id, brief(id).name])),
    userBriefs: async (ids) => new Map(ids.map((id) => [id, brief(id)])),
    listActiveMembers: async () => members,
    // tên tài khoản khớp theo regex neo đầu từ trên tên chuẩn hoá (mô phỏng Mongo)
    matchUsersByName: async (ids, regexes) => {
      const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
      return new Map(ids.filter((id) => regexes.every((r) => new RegExp(r).test(norm(names[id])))).map((id) => [id, brief(id)]));
    },
    searchResources: async () => [],
    searchMeetings: async () => [],
    attendeeMeetingIds: async () => [],
  };
  const ctx = (overrides: Partial<SearchContext> = {}): SearchContext => ({
    user: USER,
    userId: USER.id,
    workspaceId: WS,
    role: "MEMBER",
    isGuest: false,
    tokens: ["an"],
    regexes: ["(^|[^a-z0-9])an"],
    ...overrides,
  });

  it("SRCH-05: khách tìm người → 403 SRCH_103", async () => {
    const searcher = new PeopleSearcher(catalog, async () => ({}));
    await expect(searcher.search(ctx({ isGuest: true, role: "GUEST" }), query({ type: "people" }))).rejects.toMatchObject({
      errorCode: "SRCH_103",
      statusCode: 403,
    });
  });

  it("khớp tên tài khoản LẪN tên hiển thị trong nhóm, không dấu, neo đầu từ", async () => {
    const searcher = new PeopleSearcher(catalog, async () => ({ ["a".repeat(24)]: { state: "ONLINE" } }));
    const byAccount = await searcher.search(ctx(), query({ type: "people" }));
    expect(byAccount.data.map((p) => p.displayName)).toEqual(["Nguyễn Thị An"]);
    expect(byAccount.data[0]).toMatchObject({ role: "MEMBER", presence: "ONLINE", avatarUrl: null });

    const byDisplayName = await searcher.search(ctx({ tokens: ["dang"], regexes: ["(^|[^a-z0-9])dang"] }), query({ type: "people" }));
    expect(byDisplayName.data.map((p) => p.userId)).toEqual(["b".repeat(24)]);
    expect(byDisplayName.data[0].displayName).toBe("Đặng Văn Bình");
  });

  it("người có ảnh → avatarUrl là URL ký sẵn (THUMB) — cả khi khớp theo tên tài khoản lẫn chỉ khớp tên hiển thị (nạp bù)", async () => {
    const searcher = new PeopleSearcher(catalog, async () => ({}));
    const avatarPath = `/api/v1/assets/${B_AVATAR}/image?v=THUMB`;
    const byAccount = await searcher.search(ctx({ tokens: ["binh"], regexes: ["(^|[^a-z0-9])binh"] }), query({ type: "people" }));
    expect(byAccount.data.map((p) => p.userId)).toEqual(["b".repeat(24)]);
    expect(byAccount.data[0].avatarUrl).toContain(avatarPath);

    const byDisplayName = await searcher.search(ctx({ tokens: ["dang"], regexes: ["(^|[^a-z0-9])dang"] }), query({ type: "people" }));
    expect(byDisplayName.data[0].avatarUrl).toContain(avatarPath);
  });

  it("presence lỗi không làm hỏng kết quả (trạng thái HIDDEN)", async () => {
    const searcher = new PeopleSearcher(catalog, async () => {
      throw new Error("redis down");
    });
    const page = await searcher.search(ctx(), query({ type: "people" }));
    expect(page.data).toHaveLength(1);
    expect(page.data[0].presence).toBe("HIDDEN");
  });

  it("phân trang theo chỉ số: hasMore + nextCursor", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ userId: `${i}`.repeat(24), role: "MEMBER", displayName: `An ${i}` }));
    const big: ICatalogSearchRepository = { ...catalog, listActiveMembers: async () => many, matchUsersByName: async () => new Map() };
    const searcher = new PeopleSearcher(big, async () => ({}));
    const first = await searcher.search(ctx(), query({ type: "people", limit: 2 }));
    expect(first.data).toHaveLength(2);
    expect(first.meta.hasMore).toBe(true);
    const second = await searcher.search(ctx(), query({ type: "people", limit: 2, cursor: first.meta.nextCursor! }));
    expect(second.data.map((p) => p.displayName)).toEqual(["An 2", "An 3"]);
    const third = await searcher.search(ctx(), query({ type: "people", limit: 2, cursor: second.meta.nextCursor! }));
    expect(third.data).toHaveLength(1);
    expect(third.meta.hasMore).toBe(false);
    expect(third.meta.nextCursor).toBeNull();
  });
});

describe("ChannelSearcher", () => {
  it("SRCH-01/02: chỉ kênh đọc được, kênh đã tham gia xếp trước, khách không thấy memberCount", async () => {
    const repo = new InMemoryReadableScopesRepository();
    const mk = (id: string, name: string, visibility: "PUBLIC" | "PRIVATE") => ({
      workspaceId: WS,
      id,
      name,
      normalizedName: name.toLowerCase(),
      type: "TEXT",
      visibility,
      status: "ACTIVE" as const,
      memberCount: 5,
      lastActivityAt: null,
    });
    repo.channels.push(mk("a".repeat(24), "Báo cáo tuần", "PUBLIC"), mk("b".repeat(24), "Báo cáo nội bộ", "PRIVATE"), mk("c".repeat(24), "Báo cáo quý", "PUBLIC"));
    repo.channelMemberships.push({ workspaceId: WS, channelId: "c".repeat(24), userId: USER.id });
    const searcher = new ChannelSearcher(new ReadableScopesService(repo));

    const ctx: SearchContext = { user: USER, userId: USER.id, workspaceId: WS, role: "MEMBER", isGuest: false, tokens: ["bao", "cao"], regexes: [] };
    const page = await searcher.search(ctx, query({ type: "channels" }));
    expect(page.data.map((c) => c.name)).toEqual(["Báo cáo quý", "Báo cáo tuần"]);
    expect(page.data[0]).toMatchObject({ joined: true, memberCount: 5 });
    expect(page.data[1].joined).toBe(false);

    repo.grants.push({ workspaceId: WS, channelId: "a".repeat(24), userId: USER.id, source: "DIRECT" });
    const asGuest = await searcher.search({ ...ctx, role: "GUEST", isGuest: true }, query({ type: "channels" }));
    expect(asGuest.data.map((c) => c.name)).toEqual(["Báo cáo tuần"]);
    expect(asGuest.data[0]).not.toHaveProperty("memberCount");
  });
});
