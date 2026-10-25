/**
 * KHOÁ HỢP ĐỒNG DÂY BE → collab cho bảng trắng: collab mặc định `kind = "document"` ở `/internal/kick|flush|apply`, nên MỌI lời gọi của bảng trắng PHẢI mang `kind: "whiteboard"`
 * (thiếu → collab trả `closed: 0`/không áp delta — lỗi im lặng). Test dùng `HttpCollabClient` THẬT với `fetch` giả để soi đúng JSON gửi đi, không dùng `FakeCollab`.
 */
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
jest.mock("../../../infrastructure/queue", () => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
  toSafeJobId: (s: string) => s,
  outbox: { add: jest.fn() },
}));

import { clearRevokeListeners, revokeScope } from "../../../core/permission";
import { enqueue } from "../../../infrastructure/queue";
import { HttpCollabClient, setCollabClientForTests } from "../../../shared/collab";
import { WhiteboardAccessRevokedService, registerWhiteboardRevokeListener } from "../services/whiteboard-revoke.service";
import { WhiteboardSnapshotsService } from "../services/whiteboard-snapshots.service";
import { WhiteboardsHarness, buildState, elementOf } from "./support/whiteboards-harness";

const BOARD = "66f1a2b3c4d5e6f708192a3c";
const U1 = "66f1a2b3c4d5e6f708192a01";
const U2 = "66f1a2b3c4d5e6f708192a02";

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function wire(status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown> });
    const data = url.includes("/internal/kick") ? { closed: 1 } : url.includes("/internal/flush") ? { open: true, flushed: true, yjsVersion: 1 } : { open: true, applied: true, connections: 1 };
    return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const client = new HttpCollabClient({ baseUrl: () => "http://collab:4000", secret: () => "s".repeat(40), fetchImpl });
  return { client, calls };
}

afterEach(() => {
  setCollabClientForTests(null);
  clearRevokeListeners();
});

describe("kick (job whiteboard.access-revoked)", () => {
  it("theo từng người: mỗi lời gọi mang kind=whiteboard + docId + userId, kèm ?doc=<id> để nginx băm sticky", async () => {
    const { client, calls } = wire();
    const res = await new WhiteboardAccessRevokedService(client).process({ whiteboardId: BOARD, userIds: [U1, U2], reason: "revoked" });
    expect(res).toEqual({ kicked: 2 });
    expect(calls.map((c) => c.url)).toEqual([`http://collab:4000/internal/kick?doc=${BOARD}`, `http://collab:4000/internal/kick?doc=${BOARD}`]);
    expect(calls.map((c) => c.body)).toEqual([
      { kind: "whiteboard", docId: BOARD, userId: U1, reason: "revoked" },
      { kind: "whiteboard", docId: BOARD, userId: U2, reason: "revoked" },
    ]);
  });

  it("lưu trữ (không có userIds) → MỘT lệnh đóng mọi kết nối của bảng, vẫn kind=whiteboard", async () => {
    const { client, calls } = wire();
    await new WhiteboardAccessRevokedService(client).process({ whiteboardId: BOARD, reason: "archived" });
    expect(calls.map((c) => c.body)).toEqual([{ kind: "whiteboard", docId: BOARD, reason: "archived" }]);
  });

  it("collab chưa cấu hình → bỏ qua không gọi mạng; collab lỗi → ném để BullMQ thử lại", async () => {
    const off = new HttpCollabClient({ baseUrl: () => undefined, secret: () => undefined });
    await expect(new WhiteboardAccessRevokedService(off).process({ whiteboardId: BOARD, reason: "archived" })).resolves.toEqual({ kicked: 0 });
    const { client } = wire(500);
    await expect(new WhiteboardAccessRevokedService(client).process({ whiteboardId: BOARD, userIds: [U1], reason: "revoked" })).rejects.toThrow("collab /internal/kick");
  });
});

describe("listener thu hồi quyền whiteboards.collab-kick", () => {
  let h: WhiteboardsHarness;
  beforeEach(() => {
    h = new WhiteboardsHarness();
    (enqueue as jest.Mock).mockClear();
  });
  afterEach(() => h.dispose());

  it("thu hồi ở scope WHITEBOARD → xếp job whiteboard.access-revoked {whiteboardId, userIds, reason: revoked}", async () => {
    setCollabClientForTests(wire().client);
    registerWhiteboardRevokeListener();
    await revokeScope({ scope: { type: "WHITEBOARD", id: BOARD }, userIds: [U1], reason: "GRANT_REVOKED", cascade: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("notifications", "whiteboard.access-revoked", { whiteboardId: BOARD, userIds: [U1], reason: "revoked" }, expect.objectContaining({ jobId: expect.stringContaining(`whiteboard.access-revoked:WHITEBOARD:${BOARD}:`) }));
  });

  it("bỏ qua scope khác (WORKSPACE do documents.collab-kick kick theo workspace cho mọi loại; DOCUMENT), danh sách người rỗng, và khi collab tắt", async () => {
    setCollabClientForTests(wire().client);
    registerWhiteboardRevokeListener();
    await revokeScope({ scope: { type: "WORKSPACE", id: BOARD }, userIds: [U1], reason: "REMOVED", cascade: false });
    await revokeScope({ scope: { type: "DOCUMENT", id: BOARD }, userIds: [U1], reason: "GRANT_REVOKED", cascade: false });
    await revokeScope({ scope: { type: "WHITEBOARD", id: BOARD }, userIds: [], reason: "GRANT_REVOKED", cascade: false });
    setCollabClientForTests(new HttpCollabClient({ baseUrl: () => undefined, secret: () => undefined }));
    await revokeScope({ scope: { type: "WHITEBOARD", id: BOARD }, userIds: [U1], reason: "GRANT_REVOKED", cascade: false });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("flush / apply khi chụp và khôi phục bản lưu", () => {
  it("flush gửi {kind: whiteboard, docId}; apply gửi {kind: whiteboard, docId, updateBase64, reason: restore} — không lời gọi nào thiếu kind", async () => {
    const h = new WhiteboardsHarness();
    try {
      const { client, calls } = wire();
      const snapshots = new WhiteboardSnapshotsService({
        whiteboards: h.boards,
        snapshots: h.snapshotRepo,
        directory: h.directory,
        tx: h.tx,
        outbox: h.outbox,
        audit: h.audit,
        collab: client,
        now: () => h.clock,
      });
      const creator = h.addUser("MEMBER");
      const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility: "WORKSPACE" });
      await h.collabService.putState(board.id, buildState([elementOf("a")]), 0);

      const snap = await snapshots.create(creator, board.id, {});
      await snapshots.restore(creator, board.id, snap.id, { expectedVersion: (await h.service.get(creator, board.id)).version });

      const paths = calls.map((c) => new URL(c.url).pathname);
      expect(paths).toEqual(["/internal/flush", "/internal/flush", "/internal/apply"]);
      for (const c of calls) expect(c.body).toMatchObject({ kind: "whiteboard", docId: board.id });
      expect(calls[2]?.body).toMatchObject({ reason: "restore", updateBase64: expect.any(String) });
      expect(calls.every((c) => c.url.endsWith(`?doc=${board.id}`))).toBe(true);
    } finally {
      h.dispose();
    }
  });
});
