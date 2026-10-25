jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
jest.mock("../services/whiteboard-limits", () => ({ getWhiteboardLimits: jest.fn() }));

import * as Y from "yjs";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { getWhiteboardLimits } from "../services/whiteboard-limits";
import { WhiteboardsHarness, buildState, elementOf, readState } from "./support/whiteboards-harness";

const LIMITS_LOW = { nameMax: 120, collaboratorsMax: 50, concurrentEditorsMax: 30, snapshotsAuto: 2, snapshotsManualMax: 2, perWorkspaceMax: 50, elementsMax: 5000, stateMaxBytes: 8 * 1024 * 1024 };

let h: WhiteboardsHarness;
beforeEach(() => {
  h = new WhiteboardsHarness();
  (getWhiteboardLimits as jest.Mock).mockResolvedValue(LIMITS_LOW);
});
afterEach(() => h.dispose());

const setup = async () => {
  const creator = h.addUser("MEMBER");
  const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility: "WORKSPACE" });
  return { creator, board };
};
const ids = (state: Uint8Array | null) => Object.keys(readState(state).elements).sort();

describe("bản lưu thủ công", () => {
  it("ép collab lưu state đang sống (kind whiteboard) trước khi chụp; bản chụp mang đúng state + số phần tử; danh sách mới nhất trước, phân trang, lọc kind", async () => {
    const { creator, board } = await setup();
    await h.collabService.putState(board.id, buildState([elementOf("a"), elementOf("b")]), 0);
    const snap = await h.snapshots.create(creator, board.id, { label: "Bản một" });
    expect(snap).toMatchObject({ kind: "MANUAL", label: "Bản một", elementCount: 2, createdBy: { id: creator.id } });
    expect(h.collab.flushes).toEqual([{ kind: "whiteboard", docId: board.id }]);
    expect(ids(h.snapshotRepo.rows[0]?.yjsState ?? null)).toEqual(["a", "b"]);

    h.advance(1000);
    await h.snapshots.create(creator, board.id, {});
    const page1 = await h.snapshots.list(creator, board.id, { limit: 1 });
    expect(page1.data.map((s) => s.label)).toEqual([null]);
    expect(page1.hasMore).toBe(true);
    const page2 = await h.snapshots.list(creator, board.id, { limit: 1, cursor: page1.nextCursor ?? undefined });
    expect(page2.data.map((s) => s.label)).toEqual(["Bản một"]);
    expect(await h.snapshots.list(creator, board.id, { limit: 10, kind: "AUTO" })).toMatchObject({ data: [], hasMore: false });
    const detail = await h.snapshots.get(creator, board.id, snap.id);
    expect(ids(new Uint8Array(Buffer.from(detail.yjsState, "base64")))).toEqual(["a", "b"]);
  });

  it("WB_006 quá số bản thủ công; viewer không tạo được (403); bảng ARCHIVED → WB_005; bản của bảng khác → 404", async () => {
    const { creator, board } = await setup();
    const viewer = h.addUser("GUEST");
    await h.collaborators.add(creator, board.id, { userIds: [viewer.id], role: "VIEWER" });
    await expect(h.snapshots.create(viewer, board.id, {})).rejects.toMatchObject({ statusCode: 403 });

    await h.snapshots.create(creator, board.id, {});
    const second = await h.snapshots.create(creator, board.id, {});
    await expect(h.snapshots.create(creator, board.id, {})).rejects.toMatchObject({ statusCode: 409, errorCode: "WB_006", details: { max: 2 } });
    const other = await h.service.create(creator, h.workspaceId, { name: "Khác", visibility: "WORKSPACE" });
    await expect(h.snapshots.get(creator, other.id, second.id)).rejects.toMatchObject({ statusCode: 404 });

    await h.service.archive(creator, board.id, {});
    await expect(h.snapshots.create(creator, board.id, {})).rejects.toMatchObject({ statusCode: 403, errorCode: "WB_005" });
  });
});

describe("khôi phục", () => {
  it("thay elements + order bằng bản chụp trong MỘT delta, tạo PRE_RESTORE, tăng version, báo collab áp delta (kind whiteboard), ghi outbox + audit", async () => {
    const { creator, board } = await setup();
    await h.collabService.putState(board.id, buildState([elementOf("a"), elementOf("b")]), 0);
    const snap = await h.snapshots.create(creator, board.id, { label: "Gốc" });
    await h.collabService.putState(board.id, buildState([elementOf("a"), elementOf("b"), elementOf("c"), elementOf("d")]), 1);
    const before = await h.service.get(creator, board.id);
    expect(before.elementCount).toBe(4);

    h.outbox.events.length = 0;
    h.collab.flushes.length = 0;
    const res = await h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: before.version });
    expect(res).toMatchObject({ restoredVersion: 3, version: before.version + 1 });
    expect(res.preRestoreSnapshotId).toBeTruthy();

    const after = h.boards.rows.get(board.id);
    expect(ids(after?.yjsState ?? null)).toEqual(["a", "b"]);
    expect(readState(after?.yjsState ?? null).order).toEqual(["a", "b"]);
    expect(after).toMatchObject({ elementCount: 2, yjsVersion: 3, lastEditedBy: creator.id });
    // PRE_RESTORE giữ nguyên trạng thái trước khi khôi phục
    const pre = h.snapshotRepo.rows.find((s) => s.kind === "PRE_RESTORE");
    expect(ids(pre?.yjsState ?? null)).toEqual(["a", "b", "c", "d"]);
    expect(pre).toMatchObject({ elementCount: 4, label: "Trước khi khôi phục" });

    // Lệnh gửi collab: flush TRƯỚC + apply SAU, đều kèm kind whiteboard; delta áp lên bản sao cũ ra đúng nội dung snapshot.
    expect(h.collab.flushes).toEqual([{ kind: "whiteboard", docId: board.id }]);
    expect(h.collab.applies).toHaveLength(1);
    expect(h.collab.applies[0]).toMatchObject({ kind: "whiteboard", docId: board.id });
    // Bản sao client có CÙNG lịch sử CRDT với BE (đã đồng bộ tới state trước khi khôi phục = PRE_RESTORE) rồi mới áp delta.
    const replica = new Y.Doc();
    Y.applyUpdate(replica, pre?.yjsState ?? new Uint8Array());
    Y.applyUpdate(replica, h.collab.applies[0]?.update ?? new Uint8Array());
    expect(Object.keys(replica.getMap("elements").toJSON()).sort()).toEqual(["a", "b"]);
    expect(replica.getArray("order").toArray()).toEqual(["a", "b"]);

    expect(h.outbox.events.map((e) => e.jobName)).toEqual(["whiteboard.events"]);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "whiteboard.snapshot.restore", metadata: { snapshotId: snap.id, preRestoreSnapshotId: res.preRestoreSnapshotId } }));
  });

  it("expectedVersion lệch → 409 RES_003 và KHÔNG ghi gì; viewer → 403; bảng ARCHIVED → WB_005; snapshot lạ → 404; collab lỗi vẫn khôi phục được", async () => {
    const { creator, board } = await setup();
    const viewer = h.addUser("GUEST");
    await h.collaborators.add(creator, board.id, { userIds: [viewer.id], role: "VIEWER" });
    await h.collabService.putState(board.id, buildState([elementOf("a")]), 0);
    const snap = await h.snapshots.create(creator, board.id, {});
    const v = (await h.service.get(creator, board.id)).version;

    await expect(h.snapshots.restore(viewer, board.id, snap.id, { expectedVersion: v })).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: v + 5 })).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: v } });
    await expect(h.snapshots.restore(creator, board.id, newObjectId(), { expectedVersion: v })).rejects.toMatchObject({ statusCode: 404 });
    expect(h.snapshotRepo.rows.filter((s) => s.kind === "PRE_RESTORE")).toHaveLength(0);

    h.collab.failing = true;
    await expect(h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: v })).resolves.toMatchObject({ version: v + 1 });

    await h.service.archive(creator, board.id, {});
    await expect(h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: v + 2 })).rejects.toMatchObject({ statusCode: 403, errorCode: "WB_005" });
  });

  it("bản chụp vượt trần phần tử hiện hành → 413 WB_007 (không ghi); chỉ giữ preRestoreKeep bản PRE_RESTORE gần nhất", async () => {
    const { creator, board } = await setup();
    await h.collabService.putState(board.id, buildState([elementOf("a"), elementOf("b"), elementOf("c")]), 0);
    const snap = await h.snapshots.create(creator, board.id, {});
    (getWhiteboardLimits as jest.Mock).mockResolvedValue({ ...LIMITS_LOW, elementsMax: 2 });
    const v = (await h.service.get(creator, board.id)).version;
    await expect(h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: v })).rejects.toMatchObject({ statusCode: 413, errorCode: "WB_007", details: { maxElements: 2, elementCount: 3 } });

    (getWhiteboardLimits as jest.Mock).mockResolvedValue(LIMITS_LOW);
    let version = v;
    for (let i = 0; i < LIMITS.whiteboard.preRestoreKeep + 2; i += 1) {
      h.advance(1000);
      version = (await h.snapshots.restore(creator, board.id, snap.id, { expectedVersion: version })).version;
    }
    expect(h.snapshotRepo.rows.filter((s) => s.kind === "PRE_RESTORE")).toHaveLength(LIMITS.whiteboard.preRestoreKeep);
  });
});

describe("cron chụp AUTO (runner của bảng trắng cho collab.snapshot-hourly)", () => {
  it("chụp bảng có thay đổi, bỏ bảng chưa vẽ/không đổi, chạy lặp không tạo bản trùng, giữ snapshotsAuto bản mới nhất", async () => {
    const { board } = await setup();
    const idle = await h.service.create(h.addUser("MEMBER"), h.workspaceId, { name: "Chưa vẽ", visibility: "WORKSPACE" });
    await h.collabService.putState(board.id, buildState([elementOf("a")]), 0);

    expect(await h.cron.runHourly()).toEqual({ scanned: 1, created: 1, pruned: 0 });
    expect(h.snapshotRepo.rows.filter((s) => s.whiteboardId === idle.id)).toHaveLength(0);
    expect(await h.cron.runHourly()).toEqual({ scanned: 1, created: 0, pruned: 0 });

    for (let i = 0; i < 3; i += 1) {
      h.advance(60_000);
      await h.collabService.putState(board.id, buildState([elementOf("a"), elementOf(`n${i}`)]), 1 + i);
      h.advance(60_000);
      await h.cron.runHourly();
    }
    const autos = h.snapshotRepo.rows.filter((s) => s.kind === "AUTO" && s.whiteboardId === board.id);
    expect(autos).toHaveLength(LIMITS_LOW.snapshotsAuto);
    expect(autos[0]?.createdBy).toBeNull();
  });

  it("bảng ngoài cửa sổ 2 giờ hoặc đã lưu trữ không bị quét", async () => {
    const { creator, board } = await setup();
    await h.collabService.putState(board.id, buildState([elementOf("a")]), 0);
    h.advance(3 * 3_600_000);
    expect((await h.cron.runHourly()).scanned).toBe(0);
    h.advance(-3 * 3_600_000);
    await h.service.archive(creator, board.id, {});
    expect((await h.cron.runHourly()).scanned).toBe(0);
  });
});
