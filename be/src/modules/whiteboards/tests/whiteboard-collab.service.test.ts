jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import jwt from "jsonwebtoken";
import * as Y from "yjs";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { COLLAB_SECRET, WhiteboardsHarness, buildState, elementOf, readState } from "./support/whiteboards-harness";

let h: WhiteboardsHarness;
beforeEach(() => {
  h = new WhiteboardsHarness();
});
afterEach(() => h.dispose());

const setup = async (visibility: "WORKSPACE" | "PRIVATE" = "WORKSPACE") => {
  const creator = h.addUser("MEMBER");
  const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility });
  return { creator, board };
};

const elements = (n: number, prefix = "e") => Array.from({ length: n }, (_v, i) => elementOf(`${prefix}${i}`, { x: i }));

describe("collab-token", () => {
  it("MEMBER → mode edit; khách VIEWER → view; ARCHIVED → view; token kind=whiteboard, documentName wb:<id>, ký bằng bí mật collab, có sv hiện tại của user", async () => {
    const { creator, board } = await setup();
    const guest = h.addUser("GUEST");
    await h.collaborators.add(creator, board.id, { userIds: [guest.id], role: "VIEWER" });
    h.directory.usersById.set(creator.id, { ...(h.directory.usersById.get(creator.id) ?? { id: creator.id, name: "x", status: "ACTIVE" }), sessionVersion: 9 });

    const edit = await h.collabService.issueToken(creator, board.id);
    expect(edit).toMatchObject({
      mode: "edit",
      url: "wss://collab.test/collab",
      documentName: `wb:${board.id}`,
      limits: { stateMaxBytes: LIMITS.whiteboard.stateMaxBytes, elementsMax: LIMITS.whiteboard.elementsMax },
    });
    expect(edit.user.color).toMatch(/^#[0-9A-F]{6}$/);
    const payload = jwt.verify(edit.token, COLLAB_SECRET, { algorithms: ["HS256"], audience: "collab", issuer: "superapp-be", clockTolerance: 1e9 }) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: creator.id, kind: "whiteboard", docId: board.id, mode: "edit", sv: 9 });

    expect((await h.collabService.issueToken(guest, board.id)).mode).toBe("view");
    await h.service.archive(creator, board.id, {});
    expect((await h.collabService.issueToken(creator, board.id)).mode).toBe("view");
  });

  it("PRIVATE với OWNER nhóm không phải cộng tác viên → 404 (không cấp token); người ngoài nhóm → 404", async () => {
    const { board } = await setup("PRIVATE");
    await expect(h.collabService.issueToken(h.addUser("OWNER"), board.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.collabService.issueToken(h.addUser(null), board.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("internal access (collab hỏi BE)", () => {
  it("allowed + mode + user + workspaceId + trần kết nối; không được vào → allowed=false; sv lệch/khoá tài khoản → SESSION_REVOKED; không có bảng → 404", async () => {
    const { creator, board } = await setup();
    const outsider = h.addUser("GUEST");

    expect(await h.collabService.access(board.id, creator.id, 1)).toMatchObject({
      allowed: true,
      mode: "edit",
      workspaceId: h.workspaceId,
      user: { id: creator.id },
      limits: { maxConnections: LIMITS.whiteboard.concurrentEditorsMax },
    });
    expect(await h.collabService.access(board.id, outsider.id, 1)).toEqual({ allowed: false, reason: "FORBIDDEN" });
    expect(await h.collabService.access(board.id, creator.id, 2)).toEqual({ allowed: false, reason: "SESSION_REVOKED" });
    h.directory.usersById.set(creator.id, { id: creator.id, name: "x", status: "LOCKED", sessionVersion: 1 });
    expect(await h.collabService.access(board.id, creator.id, 1)).toEqual({ allowed: false, reason: "SESSION_REVOKED" });
    await expect(h.collabService.access(newObjectId(), creator.id, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("bảng PRIVATE: cộng tác viên VIEWER → view; OWNER nhóm lạ → FORBIDDEN; ARCHIVED → view cho mọi người (CW-07: viewer không có quyền sửa)", async () => {
    const { creator, board } = await setup("PRIVATE");
    const viewer = h.addUser("MEMBER");
    const owner = h.addUser("OWNER");
    await h.collaborators.add(creator, board.id, { userIds: [viewer.id], role: "VIEWER" });
    expect(await h.collabService.access(board.id, viewer.id, 1)).toMatchObject({ allowed: true, mode: "view" });
    expect(await h.collabService.access(board.id, owner.id, 1)).toEqual({ allowed: false, reason: "FORBIDDEN" });
    await h.service.archive(creator, board.id, {});
    expect(await h.collabService.access(board.id, creator.id, 1)).toMatchObject({ allowed: true, mode: "view" });
  });
});

describe("internal state (collab lưu/tải)", () => {
  it("state rỗng ban đầu; PUT ghi state + version tăng + số phần tử BE tự đếm + người sửa cuối (không có outbox — chưa có consumer)", async () => {
    const { creator, board } = await setup();
    expect(await h.collabService.getState(board.id)).toEqual({ state: new Uint8Array(), yjsVersion: 0 });

    const state = buildState(elements(3));
    h.outbox.events.length = 0;
    const res = await h.collabService.putState(board.id, state, 0, creator.id);
    expect(res).toEqual({ yjsVersion: 1, merged: false, elementCount: 3 });
    expect(Object.keys(readState((await h.collabService.getState(board.id)).state).elements).sort()).toEqual(["e0", "e1", "e2"]);
    expect(h.boards.rows.get(board.id)).toMatchObject({ yjsVersion: 1, elementCount: 3, lastEditedBy: creator.id });
    expect(h.outbox.events).toHaveLength(0);
    expect((await h.service.get(creator, board.id)).elementCount).toBe(3);
  });

  it("WB-02: đúng 5000 phần tử lưu được; 5001 → 413 WB_007 (details.elementCount) và state cũ được giữ nguyên", async () => {
    const { board } = await setup();
    const max = LIMITS.whiteboard.elementsMax;
    await h.collabService.putState(board.id, buildState(elements(max)), 0);
    expect(h.boards.rows.get(board.id)?.elementCount).toBe(max);

    await expect(h.collabService.putState(board.id, buildState(elements(max + 1)), 1)).rejects.toMatchObject({
      statusCode: 413,
      errorCode: "WB_007",
      details: { maxElements: max, elementCount: max + 1 },
    });
    expect(h.boards.rows.get(board.id)).toMatchObject({ yjsVersion: 1, elementCount: max });
  });

  it("quá dung lượng → 413 WB_007 (details.maxBytes) trước khi giải mã", async () => {
    const { board } = await setup();
    await expect(h.collabService.putState(board.id, new Uint8Array(LIMITS.whiteboard.stateMaxBytes + 1), 0)).rejects.toMatchObject({
      statusCode: 413,
      errorCode: "WB_007",
      details: { maxBytes: LIMITS.whiteboard.stateMaxBytes },
    });
  });

  it("phần tử sai schema vẫn được lưu (chỉ cảnh báo) — không khoá bảng vì collab thử lại vô hạn khi 4xx lạ", async () => {
    const { board } = await setup();
    const bad = buildState([elementOf("ok"), elementOf("dangling", { type: "kiểu-mới-của-bản-app-mới" }), elementOf("odd", { type: "freehand", points: [1, 2, 3] })]);
    const res = await h.collabService.putState(board.id, bad, 0);
    expect(res).toMatchObject({ yjsVersion: 1, elementCount: 3 });
  });

  it("base version cũ hơn hiện tại (ai đó ghi xen: khôi phục/instance khác) → BE HỢP NHẤT, không ghi đè; version = max(hiện tại, base) + 1", async () => {
    const { board } = await setup();
    await h.collabService.putState(board.id, buildState([elementOf("a")]), 0); // v1
    // "BE khôi phục" ghi state mới độc lập (thêm phần tử b) → v2
    const restored = new Y.Doc();
    Y.applyUpdate(restored, (await h.collabService.getState(board.id)).state);
    const b = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(elementOf("b"))) b.set(k, v);
    restored.getMap("elements").set("b", b);
    await h.collabService.putState(board.id, Y.encodeStateAsUpdate(restored), 1); // v2

    // Collab (base 1, chưa biết phần tử b) lưu state của nó có thêm phần tử c → phải hợp nhất
    const client = new Y.Doc();
    Y.applyUpdate(client, buildState([elementOf("a")]));
    const c = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(elementOf("c"))) c.set(k, v);
    client.getMap("elements").set("c", c);
    const res = await h.collabService.putState(board.id, Y.encodeStateAsUpdate(client), 1);
    expect(res).toMatchObject({ yjsVersion: 3, merged: true });
    expect(Object.keys(readState((await h.collabService.getState(board.id)).state).elements).sort()).toEqual(["a", "b", "c"]);
  });

  it("đua ghi (CAS thất bại một lần) → đọc lại và ghi lại, không mất lần lưu; đua liên tục → 409 RES_003", async () => {
    const { board } = await setup();
    const real = h.boards.writeState.bind(h.boards);
    let calls = 0;
    jest.spyOn(h.boards, "writeState").mockImplementation(async (...args) => {
      calls += 1;
      return calls === 1 ? null : real(...args);
    });
    expect((await h.collabService.putState(board.id, buildState(elements(1)), 0)).yjsVersion).toBe(1);
    expect(calls).toBe(2);

    jest.spyOn(h.boards, "writeState").mockResolvedValue(null);
    await expect(h.collabService.putState(board.id, buildState(elements(1)), 1)).rejects.toMatchObject({ statusCode: 409, errorCode: "RES_003" });
  });

  it("từ chối: đã lưu trữ → 409 WB_008 (collab dựa vào 409 để đóng kết nối); không có bảng → 404; state không phải Yjs → 400; X-Last-Editor rác bị bỏ qua", async () => {
    const { creator, board } = await setup();
    await h.collabService.putState(board.id, buildState(elements(1)), 0, "không-phải-objectid");
    expect(h.boards.rows.get(board.id)?.lastEditedBy).toBeNull();
    await expect(h.collabService.putState(board.id, Uint8Array.from([255, 255, 255, 255, 1, 2, 3]), 1)).rejects.toMatchObject({ statusCode: 400 });
    await h.service.archive(creator, board.id, {});
    await expect(h.collabService.putState(board.id, buildState(elements(1)), 1)).rejects.toMatchObject({ statusCode: 409, errorCode: "WB_008" });
    await expect(h.collabService.putState(newObjectId(), buildState(elements(1)), 0)).rejects.toMatchObject({ statusCode: 404 });
  });
});
