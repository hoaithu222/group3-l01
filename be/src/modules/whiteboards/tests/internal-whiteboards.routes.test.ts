/**
 * Test HTTP thật (supertest) cho `/api/internal/whiteboards/:id/(access|state)` — hợp đồng với `collab/README.md` §4.1: bí mật dùng chung, phong bì `{ success, data }`,
 * state là `application/octet-stream` + `X-Yjs-Version`, body quá trần → 413 `WB_007` (KHÔNG rơi về 500 của errorHandler). Service chạy trên repository in-memory của harness.
 */
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));
jest.mock("../../../core/config", () => {
  const actual = jest.requireActual<typeof import("../../../core/config")>("../../../core/config");
  return { ...actual, env: { ...actual.env, COLLAB_SHARED_SECRET: "internal-whiteboards-test-secret-0123456789-abcdef" } };
});
// Router dựng controller ngay lúc import bằng container; test gán `collabService` thật (in-memory) sau khi harness dựng xong.
const mockContainer: { collabService?: unknown } = {};
jest.mock("../whiteboards.container", () => ({ getWhiteboardsContainer: () => mockContainer }));

import express from "express";
import request from "supertest";
import { errorHandler } from "../../../core/middlewares";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import internalRoutes from "../internal-whiteboards.routes";
import { WhiteboardsHarness, buildState, elementOf, readState } from "./support/whiteboards-harness";

const SECRET = "internal-whiteboards-test-secret-0123456789-abcdef";

let h: WhiteboardsHarness;
const app = express();
app.use("/api/internal/whiteboards", internalRoutes);
app.use(errorHandler);

beforeEach(() => {
  h = new WhiteboardsHarness();
  mockContainer.collabService = h.collabService;
});
afterEach(() => h.dispose());

const setup = async () => {
  const creator = h.addUser("MEMBER");
  const board = await h.service.create(creator, h.workspaceId, { name: "Bảng", visibility: "WORKSPACE" });
  return { creator, board };
};
const octet = (body: Uint8Array | Buffer) => Buffer.from(body);
const elements = (n: number) => Array.from({ length: n }, (_v, i) => elementOf(`e${i}`));

describe("bí mật nội bộ + validation", () => {
  it("thiếu/sai X-Collab-Secret → 401 AUTH_002 (kiểm TRƯỚC khi đọc body); id không phải ObjectId → 400", async () => {
    const { board } = await setup();
    await request(app).get(`/api/internal/whiteboards/${board.id}/state`).expect(401).expect((r) => expect(r.body.error.code).toBe("AUTH_002"));
    await request(app).get(`/api/internal/whiteboards/${board.id}/state`).set("X-Collab-Secret", "sai").expect(401);
    await request(app).put(`/api/internal/whiteboards/${board.id}/state`).set("Content-Type", "application/octet-stream").send(octet(new Uint8Array(10))).expect(401);
    await request(app).get("/api/internal/whiteboards/khong-phai-objectid/state").set("X-Collab-Secret", SECRET).expect(400);
  });
});

describe("GET access", () => {
  it("200 { allowed, mode, user, workspaceId, limits.maxConnections } trong phong bì chuẩn; người lạ → allowed=false; thiếu userId → 400; bảng không có → 404", async () => {
    const { creator, board } = await setup();
    const stranger = h.addUser("GUEST");
    const ok = await request(app).get(`/api/internal/whiteboards/${board.id}/access`).query({ userId: creator.id, sv: 1 }).set("X-Collab-Secret", SECRET).expect(200);
    expect(ok.body).toMatchObject({
      success: true,
      data: { allowed: true, mode: "edit", workspaceId: h.workspaceId, user: { id: creator.id }, limits: { maxConnections: LIMITS.whiteboard.concurrentEditorsMax } },
    });
    const denied = await request(app).get(`/api/internal/whiteboards/${board.id}/access`).query({ userId: stranger.id, sv: 1 }).set("X-Collab-Secret", SECRET).expect(200);
    expect(denied.body.data).toEqual({ allowed: false, reason: "FORBIDDEN" });
    await request(app).get(`/api/internal/whiteboards/${board.id}/access`).set("X-Collab-Secret", SECRET).expect(400);
    await request(app).get(`/api/internal/whiteboards/${newObjectId()}/access`).query({ userId: creator.id, sv: 1 }).set("X-Collab-Secret", SECRET).expect(404);
  });
});

describe("GET/PUT state", () => {
  it("GET rỗng → 200 octet-stream + X-Yjs-Version 0; PUT ghi state (đọc header X-Yjs-Version, X-Last-Editor) rồi GET trả lại đúng byte", async () => {
    const { creator, board } = await setup();
    const empty = await request(app).get(`/api/internal/whiteboards/${board.id}/state`).set("X-Collab-Secret", SECRET).expect(200);
    expect(empty.headers["content-type"]).toContain("application/octet-stream");
    expect(empty.headers["x-yjs-version"]).toBe("0");
    expect(empty.headers["cache-control"]).toBe("no-store");

    const state = buildState(elements(3));
    const put = await request(app)
      .put(`/api/internal/whiteboards/${board.id}/state`)
      .set("X-Collab-Secret", SECRET)
      .set("Content-Type", "application/octet-stream")
      .set("X-Yjs-Version", "0")
      .set("X-Last-Editor", creator.id)
      .send(octet(state))
      .expect(200);
    expect(put.body).toMatchObject({ success: true, data: { yjsVersion: 1, merged: false, elementCount: 3 } });
    expect(h.boards.rows.get(board.id)).toMatchObject({ yjsVersion: 1, elementCount: 3, lastEditedBy: creator.id });

    const back = await request(app).get(`/api/internal/whiteboards/${board.id}/state`).set("X-Collab-Secret", SECRET).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(back.headers["x-yjs-version"]).toBe("1");
    expect(Object.keys(readState(new Uint8Array(back.body as Buffer)).elements).sort()).toEqual(["e0", "e1", "e2"]);
  });

  it("WB-02 qua HTTP: 5001 phần tử → 413 WB_007 (collab hiểu là TOO_LARGE, không thử lại); body > trần đọc (9 MiB) → 413 WB_007 chứ KHÔNG 500", async () => {
    const { board } = await setup();
    const over = await request(app)
      .put(`/api/internal/whiteboards/${board.id}/state`)
      .set("X-Collab-Secret", SECRET)
      .set("Content-Type", "application/octet-stream")
      .send(octet(buildState(elements(LIMITS.whiteboard.elementsMax + 1))))
      .expect(413);
    expect(over.body.error).toMatchObject({ code: "WB_007", details: { maxElements: LIMITS.whiteboard.elementsMax, elementCount: LIMITS.whiteboard.elementsMax + 1 } });

    const huge = await request(app)
      .put(`/api/internal/whiteboards/${board.id}/state`)
      .set("X-Collab-Secret", SECRET)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.alloc(LIMITS.whiteboard.stateMaxBytes + 1024 * 1024 + 16))
      .expect(413);
    expect(huge.body.error).toMatchObject({ code: "WB_007", details: { maxBytes: LIMITS.whiteboard.stateMaxBytes } });
    expect(h.boards.rows.get(board.id)?.yjsVersion).toBe(0);
  });

  it("bảng đã lưu trữ → 409 WB_008; không có bảng → 404; body không phải octet-stream → 400", async () => {
    const { creator, board } = await setup();
    await request(app).put(`/api/internal/whiteboards/${board.id}/state`).set("X-Collab-Secret", SECRET).set("Content-Type", "application/json").send({ a: 1 }).expect(400);
    await request(app).put(`/api/internal/whiteboards/${newObjectId()}/state`).set("X-Collab-Secret", SECRET).set("Content-Type", "application/octet-stream").send(octet(buildState(elements(1)))).expect(404);
    await h.service.archive(creator, board.id, {});
    const archived = await request(app)
      .put(`/api/internal/whiteboards/${board.id}/state`)
      .set("X-Collab-Secret", SECRET)
      .set("Content-Type", "application/octet-stream")
      .send(octet(buildState(elements(1))))
      .expect(409);
    expect(archived.body.error.code).toBe("WB_008");
  });
});
