/**
 * Unit — `ScopeSearchService` (be.md p1-09 §5.4): DU-01/DU-02, SAV-03/04/05/07 ở tầng service
 * (quét cửa sổ thời gian + maxTimeMs → partial, kiểm quyền TRƯỚC và LẠI, loại tombstone/ẩn/reply mồ côi,
 * snippet + highlight, cursor). Tầng truy vấn Mongo thật kiểm ở integration test.
 */
jest.mock("../../messages/public", () => ({ getMessageScope: jest.fn() }));

import { ScopeSearchService } from "../services/scope-search.service";
import { scopeSearchQuerySchema } from "../dtos";
import { ErrorCode } from "../../../core/utils/error.codes";
import { encodeCursor } from "../../../core/utils/cursor";
import { LIMITS } from "../../../core/constants/limits";
import type { DiscoveryScopeType } from "../entities/discovery.interface";
import {
  CHANNEL_ID,
  CONV_ID,
  FakeLookupRepo,
  FakeMessageSearchRepo,
  USER_A,
  USER_B,
  makeFakeScope,
  makeMessage,
  newScopeState,
  toRow,
  type FakeScopeState,
} from "./support/discovery-fakes";

const NOW = new Date("2026-09-19T00:00:00.000Z").getTime();

interface Ctx {
  service: ScopeSearchService;
  repo: FakeMessageSearchRepo;
  channel: FakeScopeState;
  conversation: FakeScopeState;
  counter: jest.Mock;
  clock: { now: number };
}

function setup(): Ctx {
  const repo = new FakeMessageSearchRepo();
  const channel = newScopeState();
  const conversation = newScopeState();
  const scopes = {
    CHANNEL: makeFakeScope("CHANNEL", channel),
    CONVERSATION: makeFakeScope("CONVERSATION", conversation),
  };
  const counter = jest.fn();
  const clock = { now: NOW };
  const service = new ScopeSearchService(
    repo,
    new FakeLookupRepo(),
    (t: DiscoveryScopeType) => scopes[t],
    () => clock.now,
    counter
  );
  return { service, repo, channel, conversation, counter, clock };
}

/** Qua DTO thật để dùng đúng giá trị mặc định (limit 30, includeThreads true...). */
const query = (q: unknown) => scopeSearchQuerySchema.parse(q);

describe("ScopeSearchService.search()", () => {
  it("DU-01: từ khoá không dấu ≡ có dấu (cùng terms), snippet giữ dấu gốc + highlight", async () => {
    const { service, repo } = setup();
    const msg = makeMessage({ content: "Đồ án cuối kỳ", seq: 4 });
    repo.add(msg);

    repo.searchScript = [{ rows: [toRow(msg)], timedOut: false }];
    const a = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }));
    repo.searchScript = [{ rows: [toRow(msg)], timedOut: false }];
    const b = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "Đồ Án" }));

    // mỗi lần tìm quét nhiều cửa sổ; bộ $and (các từ) giống nhau ở MỌI lần gọi và mọi cửa sổ
    const allAnd = new Set(repo.searchCalls.map((c) => JSON.stringify(c.filter.$and)));
    expect(allAnd.size).toBe(1);
    expect(a.data).toEqual(b.data);
    expect(a.data[0]).toMatchObject({
      messageId: msg.id,
      seq: 4,
      snippet: "Đồ án cuối kỳ",
      highlights: [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
      ],
      author: { id: USER_B.id, name: "Bình", avatarUrl: null },
      attachmentsSummary: null,
      inThread: false,
      threadId: null,
      parentMessageId: null,
    });
    expect(a.meta).toEqual({ nextCursor: null, hasMore: false, limit: 30, partial: false });
  });

  it("từ khoá không hợp lệ → SRCH_001/SRCH_002 TRƯỚC mọi truy vấn", async () => {
    const { service, repo } = setup();
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "a" }))).rejects.toMatchObject({ errorCode: ErrorCode.SRCH_001 });
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({}))).rejects.toMatchObject({ errorCode: ErrorCode.SRCH_001 });
    const many = Array.from({ length: LIMITS.search.maxTerms + 1 }, (_, i) => `tu${i}`).join(" ");
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: many }))).rejects.toMatchObject({ errorCode: ErrorCode.SRCH_002 });
    expect(repo.searchCalls).toHaveLength(0);
  });

  it("không đọc được phạm vi → 404 và KHÔNG truy vấn nội dung; phạm vi chưa đăng ký → 404", async () => {
    const { service, repo, channel } = setup();
    channel.readable.clear();
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }))).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.searchCalls).toHaveLength(0);

    const none = new ScopeSearchService(repo, new FakeLookupRepo(), () => undefined, () => NOW, jest.fn());
    await expect(none.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("phạm vi không hỗ trợ tìm kiếm → 400 SRCH_003", async () => {
    const { service, channel } = setup();
    channel.searchable = false;
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }))).rejects.toMatchObject({
      statusCode: 400,
      errorCode: ErrorCode.SRCH_003,
    });
  });

  it("DU-02: quyền bị thu hồi TRONG lúc truy vấn → kiểm lại trước khi trả → 404, không trả nội dung", async () => {
    const { service, repo, channel } = setup();
    const msg = makeMessage();
    repo.add(msg);
    repo.searchScript = [{ rows: [toRow(msg)], timedOut: false }];
    // canRead #1 (trước truy vấn) còn quyền; #2 (kiểm lại) đã mất
    channel.onCanRead = (call) => {
      if (call === 1) channel.readable.delete(USER_A.id);
    };
    channel.readable.add(USER_A.id);
    // lần gọi #1 phải trả visible=true: đổi quyền SAU khi lần 1 đã đọc xong
    await expect(service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }))).rejects.toMatchObject({ statusCode: 404 });
    expect(channel.canReadCalls).toBe(2);
  });

  it("DU-02: trang sau khi bị thu hồi → 404 ngay từ lần kiểm đầu", async () => {
    const { service, repo, channel } = setup();
    const msgs = [makeMessage({ seq: 1 }), makeMessage({ seq: 2 }), makeMessage({ seq: 3 })];
    repo.add(...msgs);
    repo.searchScript = [{ rows: msgs.map(toRow), timedOut: false }];
    const page1 = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", limit: 2 }));
    expect(page1.meta.hasMore).toBe(true);

    channel.readable.delete(USER_A.id);
    await expect(
      service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", limit: 2, cursor: page1.meta.nextCursor }))
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.searchCalls).toHaveLength(1); // trang 2 không chạm truy vấn
  });

  it("SAV-03: hội thoại — mốc hiddenBeforeSeq đi vào truy vấn (seq > mốc) và tin MessageHide bị loại", async () => {
    const { service, repo, conversation } = setup();
    conversation.hiddenBeforeSeq.set(USER_A.id, 10);
    const visible = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 12 });
    const hidden = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 13 });
    const stale = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 8 }); // lọt (giả lập) dù đã ≤ mốc
    repo.add(visible, hidden, stale);
    repo.hidden.set(USER_A.id, new Set([hidden.id]));
    repo.searchScript = [{ rows: [visible, hidden, stale].map(toRow), timedOut: false }];

    const out = await service.search(USER_A, "CONVERSATION", CONV_ID, query({ q: "do an" }));

    expect(repo.searchCalls[0].filter.seq).toEqual({ $gt: 10 });
    expect(out.data.map((h) => h.messageId)).toEqual([visible.id]); // hidden (MessageHide) + stale (≤ mốc) bị loại
  });

  it("tin thu hồi/rỗng KHÔNG bao giờ lộ qua snippet", async () => {
    const { service, repo } = setup();
    const ok = makeMessage();
    const tomb = makeMessage({ content: "nội dung lẽ ra đã xoá", deletedAt: new Date() });
    const empty = makeMessage({ content: null });
    repo.add(ok, tomb, empty);
    repo.searchScript = [{ rows: [ok, tomb, empty].map(toRow), timedOut: false }];
    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }));
    expect(out.data.map((h) => h.messageId)).toEqual([ok.id]);
    expect(JSON.stringify(out)).not.toContain("lẽ ra đã xoá");
  });

  it("SAV-05: reply trong thread có nhãn thread + parentMessageId; reply mất tin gốc bị loại", async () => {
    const { service, repo } = setup();
    const root = makeMessage({ content: "Tin gốc", seq: 1 });
    const reply = makeMessage({ threadId: root.id, threadKey: root.id, seq: 1, content: "Đồ án đã xong" });
    const orphan = makeMessage({ threadId: "eeeeeeeeeeeeeeeeeeeeeee9", threadKey: "eeeeeeeeeeeeeeeeeeeeeee9", seq: 1 });
    repo.add(root, reply, orphan);
    repo.searchScript = [{ rows: [reply, orphan].map(toRow), timedOut: false }];

    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }));

    expect(out.data).toHaveLength(1);
    expect(out.data[0]).toMatchObject({ messageId: reply.id, inThread: true, threadId: root.id, parentMessageId: root.id });
  });

  it("includeThreads=false (chuỗi 'false' từ query) → lọc threadId null; mặc định gồm reply", async () => {
    const { service, repo } = setup();
    await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", includeThreads: "false" }));
    expect(repo.searchCalls[0].filter.threadId).toBeNull();
    repo.searchCalls.length = 0;
    await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }));
    expect(repo.searchCalls[0].filter.threadId).toBeUndefined();
  });

  it("bộ lọc người gửi/tệp/ngày đi vào truy vấn; hasFile='false' KHÔNG bật lọc", async () => {
    const { service, repo } = setup();
    await service.search(
      USER_A,
      "CHANNEL",
      CHANNEL_ID,
      query({ q: "do an", authorId: USER_B.id, hasFile: "true", fileKind: "IMAGE", from: "2026-09-01T00:00:00Z", to: "2026-09-10T00:00:00Z" })
    );
    const f = repo.searchCalls[0].filter;
    expect(f.authorId).toEqual({ $oid: USER_B.id });
    expect(f["attachments.0"]).toEqual({ $exists: true });
    expect(f["attachments.kind"]).toBe("IMAGE");
    // upper của cửa sổ đầu = to + 1ms
    expect((f.createdAt as { $lt: { $date: string } }).$lt.$date).toBe("2026-09-10T00:00:00.001Z");

    await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", hasFile: "false" }));
    expect(repo.searchCalls[repo.searchCalls.length - 1].filter["attachments.0"]).toBeUndefined();
  });

  it("phân trang: limit+1 dòng → hasMore, nextCursor = (createdAt,id) của hit CUỐI trang; cửa sổ đầu mang cursor tie-break", async () => {
    const { service, repo } = setup();
    const msgs = [1, 2, 3].map((seq) => makeMessage({ seq, createdAt: new Date(Date.UTC(2026, 8, 10 - seq)) }));
    repo.add(...msgs);
    repo.searchScript = [{ rows: msgs.map(toRow), timedOut: false }];

    const p1 = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", limit: 2 }));
    expect(p1.data).toHaveLength(2);
    expect(p1.meta).toMatchObject({ hasMore: true, limit: 2, partial: false });
    expect(p1.meta.nextCursor).toBe(encodeCursor(msgs[1].createdAt, msgs[1].id));
    expect(repo.searchCalls[0].limit).toBe(3);

    repo.searchScript = [{ rows: [toRow(msgs[2])], timedOut: false }, { rows: [], timedOut: false }, { rows: [], timedOut: false }, { rows: [], timedOut: false }, { rows: [], timedOut: false }];
    const p2 = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an", limit: 2, cursor: p1.meta.nextCursor }));
    expect(p2.data.map((h) => h.messageId)).toEqual([msgs[2].id]);
    expect(p2.meta).toMatchObject({ hasMore: false, nextCursor: null });
    const secondCall = repo.searchCalls[1];
    const and = secondCall.filter.$and as unknown[];
    expect(JSON.stringify(and[and.length - 1])).toContain("$or"); // tie-break chỉ ở cửa sổ đầu
    const laterWindow = repo.searchCalls[2];
    expect(JSON.stringify(laterWindow.filter.$and)).not.toContain("$or");
  });

  it("SAV-07: cửa sổ mới có kết quả rồi hết giờ ở cửa sổ cũ → trả kết quả đã có + partial=true (không lỗi)", async () => {
    const { service, repo, counter } = setup();
    const recent = makeMessage({ createdAt: new Date(NOW - 86_400_000) });
    repo.add(recent);
    repo.searchScript = [
      { rows: [toRow(recent)], timedOut: false }, // cửa sổ 7 ngày: có 1 hit, chưa đủ limit
      { rows: [], timedOut: true }, // cửa sổ kế: Mongo hết maxTimeMS
    ];
    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "tu hiem" }));
    expect(out.data.map((h) => h.messageId)).toEqual([recent.id]);
    expect(out.meta).toMatchObject({ partial: true, hasMore: false, nextCursor: null });
    expect(repo.searchCalls).toHaveLength(2);
    expect(counter).toHaveBeenCalledWith("CHANNEL", true);
  });

  it("hết ngân sách thời gian giữa các cửa sổ → dừng, partial=true; maxTimeMs truyền xuống là phần còn lại", async () => {
    const { service, repo, clock } = setup();
    const originalSearch = repo.search.bind(repo);
    repo.search = async (filter, limit, maxTimeMs) => {
      const result = await originalSearch(filter, limit, maxTimeMs);
      clock.now += 1500; // mỗi truy vấn "tốn" 1.5s
      return result;
    };
    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "tu hiem" }));

    expect(out.meta.partial).toBe(true);
    expect(out.data).toEqual([]);
    expect(repo.searchCalls).toHaveLength(2); // lần 3 không chạy: đã quá LIMITS.search.maxTimeMs
    expect(repo.searchCalls[0].maxTimeMs).toBe(LIMITS.search.maxTimeMs);
    expect(repo.searchCalls[1].maxTimeMs).toBe(LIMITS.search.maxTimeMs - 1500);
  });

  it("quét hết mọi cửa sổ không có kết quả → rỗng, partial=false; đếm metric", async () => {
    const { service, repo, counter } = setup();
    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "khong co" }));
    expect(out).toEqual({ data: [], meta: { nextCursor: null, hasMore: false, limit: 30, partial: false } });
    expect(repo.searchCalls.length).toBeGreaterThan(1);
    expect(counter).toHaveBeenCalledWith("CHANNEL", false);
  });

  it("từ khoá ReDoS `.*(a+)+$` chỉ đi vào truy vấn dưới dạng regex đã escape (SAV-04)", async () => {
    const { service, repo } = setup();
    await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: ".*(a+)+$" }));
    const and = repo.searchCalls[0].filter.$and as { normalizedContent: { $regex: string } }[];
    expect(and).toEqual([{ normalizedContent: { $regex: "\\.\\*\\(a\\+\\)\\+\\$" } }]);
  });

  it("hit có tệp: attachmentsSummary {count, kinds} không trùng loại", async () => {
    const { service, repo } = setup();
    const msg = makeMessage({
      attachments: [
        { kind: "IMAGE", name: "a.png" },
        { kind: "IMAGE", name: "b.png" },
        { kind: "FILE", name: "c.pdf" },
      ],
    });
    repo.add(msg);
    repo.searchScript = [{ rows: [toRow(msg)], timedOut: false }];
    const out = await service.search(USER_A, "CHANNEL", CHANNEL_ID, query({ q: "do an" }));
    expect(out.data[0].attachmentsSummary).toEqual({ count: 3, kinds: ["IMAGE", "FILE"] });
  });
});

describe("scopeSearchQuerySchema", () => {
  it("boolean từ query string: 'false' KHÔNG bị coi là true", () => {
    expect(query({ q: "ab", includeThreads: "false" }).includeThreads).toBe(false);
    expect(query({ q: "ab", includeThreads: "true" }).includeThreads).toBe(true);
    expect(query({ q: "ab", hasFile: "false" }).hasFile).toBe(false);
    expect(query({ q: "ab", hasFile: "1" }).hasFile).toBe(true);
    expect(query({ q: "ab" }).includeThreads).toBe(true);
    expect(query({ q: "ab" }).hasFile).toBeUndefined();
  });

  it("mặc định limit = LIMITS.search.pageSize, trần LIMITS.pagination.max", () => {
    expect(query({ q: "ab" }).limit).toBe(LIMITS.search.pageSize);
    expect(scopeSearchQuerySchema.safeParse({ q: "ab", limit: "101" }).success).toBe(false);
  });

  it("from > to → không hợp lệ; authorId phải là ObjectId; fileKind ngoài danh sách bị từ chối", () => {
    expect(scopeSearchQuerySchema.safeParse({ q: "ab", from: "2026-09-10T00:00:00Z", to: "2026-09-01T00:00:00Z" }).success).toBe(false);
    expect(scopeSearchQuerySchema.safeParse({ q: "ab", authorId: "khong-phai-objectid" }).success).toBe(false);
    expect(scopeSearchQuerySchema.safeParse({ q: "ab", fileKind: "GIF" }).success).toBe(false);
    expect(scopeSearchQuerySchema.safeParse({ q: "ab", from: "hôm qua" }).success).toBe(false);
  });
});
