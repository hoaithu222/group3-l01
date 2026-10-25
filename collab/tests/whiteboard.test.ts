import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  connect,
  internal,
  oid,
  sleep,
  startHarness,
  synced,
  waitFor,
  type ConnectOptions,
  type Harness,
  type TestClient,
} from "./helpers/harness";

/**
 * p6-02 — bảng trắng phía collab: CW-07 (viewer), CW-08 (tần suất awareness), WB-01 (hai người sửa cùng một hình),
 * cộng phần định tuyến theo loại `wb:` (đường BE, khoá awareness, trần state, kick/flush/apply theo `kind`).
 * Cấu trúc Yjs của bảng theo `docs/plans/.../p6-02-whiteboard/be.md` §2.1: `elements: Y.Map<id, Y.Map>` + `order: Y.Array<id>`.
 */
const MiB = 1024 * 1024;
const WB = oid(0x101);
const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);
const VIEWER = oid(0xc3);

let h: Harness;
const start = async (env: Record<string, string> = {}): Promise<void> => {
  h = await startHarness({ COLLAB_KINDS: "document,whiteboard", ...env });
  h.be.addDoc(WB, { bePath: "whiteboards", users: { [ALICE]: "edit", [BOB]: "edit", [VIEWER]: "view" } });
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
};
const restart = async (env: Record<string, string>): Promise<void> => {
  await h.stop();
  await start(env);
};
beforeEach(() => start());
afterEach(async () => {
  await h.stop();
});

/** Client bảng trắng: token `kind=whiteboard`, tên document `wb:<id>`. */
const wb = (userId: string, o: Partial<ConnectOptions> = {}): TestClient =>
  connect(h, { docId: WB, userId, kind: "whiteboard", name: `wb:${o.docId ?? WB}`, ...o });

const elementsOf = (d: Y.Doc): Y.Map<Y.Map<unknown>> => d.getMap<Y.Map<unknown>>("elements");
const orderOf = (d: Y.Doc): Y.Array<string> => d.getArray<string>("order");

/** Thêm một phần tử đúng cấu trúc §2.1 (một transaction: ghi `elements` + chèn `order`). */
function addElement(d: Y.Doc, id: string, fields: Record<string, unknown>): void {
  d.transact(() => {
    const el = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(fields)) el.set(k, v);
    elementsOf(d).set(id, el);
    orderOf(d).push([id]);
  });
}

const elementJson = (d: Y.Doc, id: string): Record<string, unknown> | undefined => elementsOf(d).get(id)?.toJSON();
const closedWith = (c: TestClient, reason: string): boolean => c.closes.some((e) => e.reason === reason);

/** Đọc một số đo Prometheus từ `/metrics` của chính server test (không có METRICS_TOKEN). Chưa xuất hiện → 0. */
async function metric(name: string, labels: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${h.port}/metrics`);
  const text = await res.text();
  const escaped = labels.replace(/[{}"]/g, "\\$&");
  const m = new RegExp(`^${name}\\{${escaped}\\} ([0-9.e+-]+)$`, "m").exec(text);
  return m?.[1] ? Number(m[1]) : 0;
}

/** Số lần `observer` nhận (qua server) một state awareness mới của `sender`. */
function countAwarenessFrom(observer: TestClient, sender: TestClient): () => number {
  const id = sender.doc.clientID;
  let n = 0;
  observer.provider.awareness?.on("update", (change: { added: number[]; updated: number[] }) => {
    if (change.added.includes(id) || change.updated.includes(id)) n += 1;
  });
  return () => n;
}

/** Chờ tới khi `read()` không đổi trong `quietMs` (tin cuối đã tới nơi). */
async function settled(read: () => number, quietMs = 350): Promise<number> {
  let last = read();
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await sleep(25);
    const now = read();
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
  return last;
}

/**
 * Client TUÂN THỦ hợp đồng awareness của bảng trắng: KHÔNG phản hồi lại state của người khác lên server.
 * `HocuspocusProvider` 3.4.4 mặc định gửi lại mọi thay đổi awareness (kể cả state vừa NHẬN của người khác, origin = provider),
 * nên trong phòng N người mỗi kết nối bị đổ ~(N−1)×tần suất tin phản hồi và chạm `MAX_MESSAGES_PER_SECOND`. Chỉ gửi thay đổi cục bộ.
 */
function stopAwarenessEcho(c: TestClient): void {
  const { provider } = c;
  const awareness = provider.awareness;
  if (!awareness) throw new Error("provider chưa có awareness");
  awareness.off("update", provider.boundAwarenessUpdateHandler);
  awareness.on("update", (change: unknown, origin: unknown) => {
    if (origin !== provider) provider.awarenessUpdateHandler(change, origin);
  });
}

describe("định tuyến theo loại tài nguyên (wb:)", () => {
  it("wb:<id> đồng bộ hai người, gọi đúng đường BE /whiteboards (access + state) và lưu state bảng về BE", async () => {
    const a = wb(ALICE);
    const b = wb(BOB);
    await waitFor(() => synced(a) && synced(b));
    expect(a.authenticated).toEqual(["read-write"]);

    addElement(a.doc, "e1", { type: "rect", x: 10, y: 20, w: 100, h: 60, fillColor: "blue" });
    await waitFor(() => elementsOf(b.doc).has("e1"), { label: "Bob nhận hình của Alice" });
    await waitFor(() => elementsOf(h.be.ydocOf(WB)).has("e1"), { label: "BE nhận state bảng trắng" });

    expect(h.be.calls.length).toBeGreaterThan(0);
    expect(h.be.calls.every((c) => c.path === "whiteboards")).toBe(true);
    expect(new Set(h.be.calls.map((c) => c.op))).toEqual(new Set(["access", "get-state", "put-state"]));
    expect(await metric("collab_connections", 'kind="whiteboard"')).toBe(2);
  });

  it("token kind=document không dùng được cho wb:<id> và ngược lại → unauthorized (4401)", async () => {
    const docTokenForBoard = connect(h, { docId: WB, userId: ALICE, name: `wb:${WB}`, kind: "document" });
    await waitFor(() => docTokenForBoard.authFailed.includes("unauthorized"), { label: "token document → bảng" });
    await waitFor(() => docTokenForBoard.closes.some((e) => e.code === 4401));
    docTokenForBoard.destroy();

    const boardTokenForDoc = connect(h, { docId: DOC, userId: ALICE, name: `doc:${DOC}`, kind: "whiteboard" });
    await waitFor(() => boardTokenForDoc.authFailed.includes("unauthorized"), { label: "token whiteboard → tài liệu" });
    boardTokenForDoc.destroy();
  });

  it("loại whiteboard chưa bật trong COLLAB_KINDS → not-found (4404) dù BE có bảng đó", async () => {
    await restart({ COLLAB_KINDS: "document" });
    const c = wb(ALICE);
    await waitFor(() => c.authFailed.includes("not-found"), { label: "loại chưa bật" });
    c.destroy();
  });

  it("khoá awareness theo loại: bảng trắng nhận pointer/selection/viewport nhưng từ chối `cursor` của tài liệu (và ngược lại)", async () => {
    const a = wb(ALICE);
    const b = wb(BOB);
    await waitFor(() => synced(a) && synced(b));
    a.provider.setAwarenessField("pointer", { x: 1, y: 2 });
    a.provider.setAwarenessField("selection", ["e1", "e2"]);
    a.provider.setAwarenessField("viewport", { x: 0, y: 0, zoom: 1.5 });
    await waitFor(() => {
      const s = b.provider.awareness?.getStates().get(a.doc.clientID);
      return s?.["pointer"] !== undefined && s["selection"] !== undefined && s["viewport"] !== undefined;
    }, { label: "Bob thấy pointer/selection/viewport của Alice" });
    expect(a.closes).toHaveLength(0);

    const cursorOnBoard = wb(BOB, { awarenessUser: null });
    await waitFor(() => synced(cursorOnBoard));
    cursorOnBoard.provider.setAwarenessField("cursor", { anchor: 1, head: 2 });
    await waitFor(() => closedWith(cursorOnBoard, "awareness-invalid"), { label: "`cursor` không hợp lệ trên bảng trắng" });

    const pointerOnDoc = connect(h, { docId: DOC, userId: BOB, awarenessUser: null });
    await waitFor(() => synced(pointerOnDoc));
    pointerOnDoc.provider.setAwarenessField("pointer", { x: 1, y: 2 });
    await waitFor(() => closedWith(pointerOnDoc, "awareness-invalid"), { label: "`pointer` không hợp lệ trên tài liệu" });
  });

  it("kick/flush/apply theo kind=whiteboard: lưu trữ bảng đóng đúng người trong bảng (không đụng tài liệu); thiếu kind = document", async () => {
    await restart({ STORE_DEBOUNCE_MS: "10000", STORE_MAX_DEBOUNCE_MS: "20000" }); // debounce dài để thấy flush có tác dụng
    const a = wb(ALICE);
    const b = wb(BOB);
    const d = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a) && synced(b) && synced(d));

    // BE PHẢI truyền kind cho bảng trắng: thiếu kind → coi là `document` → không có `doc:<WB>` nào đang mở.
    expect(await internal(h, "/internal/kick", { docId: WB, reason: "archived" })).toMatchObject({ status: 200, json: { data: { closed: 0 } } });
    expect(a.provider.isAuthenticated && b.provider.isAuthenticated).toBe(true);

    // flush + apply (khôi phục snapshot) cũng theo kind.
    addElement(a.doc, "e1", { type: "ellipse", x: 0, y: 0 });
    await waitFor(() => elementsOf(b.doc).has("e1"));
    expect(elementsOf(h.be.ydocOf(WB)).has("e1")).toBe(false); // chưa tới hạn debounce
    expect(await internal(h, "/internal/flush", { kind: "whiteboard", docId: WB })).toMatchObject({ json: { data: { open: true, flushed: true } } });
    expect(elementsOf(h.be.ydocOf(WB)).has("e1")).toBe(true);

    const restored = new Y.Doc();
    Y.applyUpdate(restored, h.be.docs.get(WB)!.state);
    const before = Y.encodeStateVector(restored);
    addElement(restored, "e-khoi-phuc", { type: "sticky", x: 5, y: 5, text: "từ snapshot" });
    const delta = Y.encodeStateAsUpdate(restored, before);
    const applied = await internal(h, "/internal/apply", { kind: "whiteboard", docId: WB, updateBase64: Buffer.from(delta).toString("base64"), reason: "restore" });
    expect(applied).toMatchObject({ status: 200, json: { data: { open: true, applied: true, connections: 2 } } });
    await waitFor(() => elementsOf(a.doc).has("e-khoi-phuc") && elementsOf(b.doc).has("e-khoi-phuc"), { label: "cả hai thấy phần tử khôi phục" });
    await waitFor(() => a.notices.some((n) => n.code === "RESTORED"));

    // Lưu trữ bảng → kick kind=whiteboard: chỉ hai người trong bảng bị đóng (archived), tài liệu cùng phiên không bị đụng, nối lại ở chế độ chỉ xem.
    h.be.docs.get(WB)!.status = "ARCHIVED";
    const kicked = await internal(h, "/internal/kick", { kind: "whiteboard", docId: WB, reason: "archived" });
    expect(kicked).toMatchObject({ status: 200, json: { data: { closed: 2 } } });
    await waitFor(() => closedWith(a, "archived") && closedWith(b, "archived"), { label: "bảng bị lưu trữ → đóng" });
    await waitFor(() => a.authenticated.at(-1) === "readonly" && synced(a), { timeoutMs: 8000, label: "nối lại chỉ đọc" });
    expect(d.closes).toHaveLength(0);
    expect(d.provider.isAuthenticated).toBe(true);
  });
});

describe("CW-07 — viewer bảng trắng không gửi được update", () => {
  it("update của viewer bị từ chối (không tới người khác, không vào BE); viewer vẫn nhận hình + con trỏ của người sửa và hiện diện của mình", async () => {
    const editor = wb(ALICE);
    const viewer = wb(VIEWER, { mode: "view" });
    await waitFor(() => synced(editor) && synced(viewer));
    expect(viewer.authenticated).toEqual(["readonly"]);

    addElement(editor.doc, "e1", { type: "rect", x: 1, y: 2 });
    await waitFor(() => elementsOf(viewer.doc).has("e1"), { label: "viewer nhận hình" });
    editor.provider.setAwarenessField("pointer", { x: 7, y: 8 });
    await waitFor(() => viewer.provider.awareness?.getStates().get(editor.doc.clientID)?.["pointer"] !== undefined, { label: "viewer thấy con trỏ người sửa" });
    viewer.provider.setAwarenessField("pointer", { x: 9, y: 9 });
    await waitFor(() => editor.provider.awareness?.getStates().get(viewer.doc.clientID)?.["pointer"] !== undefined, { label: "người sửa thấy con trỏ viewer (hiện diện)" });

    // Viewer cố thêm hình, sửa hình có sẵn và xoá hình.
    addElement(viewer.doc, "hack", { type: "rect", x: 666, y: 666 });
    viewer.doc.transact(() => elementsOf(viewer.doc).get("e1")?.set("x", 999));
    await sleep(400);
    expect(elementsOf(editor.doc).has("hack")).toBe(false);
    expect(elementJson(editor.doc, "e1")).toMatchObject({ x: 1, y: 2 });
    await waitFor(() => elementsOf(h.be.ydocOf(WB)).has("e1"), { label: "BE lưu hình của người sửa" });
    expect(elementsOf(h.be.ydocOf(WB)).has("hack")).toBe(false);
    expect(elementJson(h.be.ydocOf(WB), "e1")).toMatchObject({ x: 1, y: 2 });
    expect(viewer.closes).toHaveLength(0); // bị từ chối update chứ không bị đá khỏi bảng
  });

  it("viewer mở bảng với thay đổi ngoại tuyến (SyncStep2) cũng không được áp", async () => {
    const offline = new Y.Doc();
    addElement(offline, "lén", { type: "rect", x: 1, y: 1 });
    const viewer = wb(VIEWER, { mode: "view", doc: offline });
    const editor = wb(ALICE);
    await waitFor(() => synced(editor) && synced(viewer));
    await sleep(400);
    expect(elementsOf(editor.doc).size).toBe(0);
    expect(elementsOf(h.be.ydocOf(WB)).size).toBe(0);
  });

  it("token nói edit nhưng BE cho view (vai trò VIEWER) → readonly; bảng đã lưu trữ → mọi người readonly", async () => {
    const viewerWithEditToken = wb(VIEWER, { mode: "edit" });
    await waitFor(() => synced(viewerWithEditToken));
    expect(viewerWithEditToken.authenticated).toEqual(["readonly"]);
    addElement(viewerWithEditToken.doc, "hack", { type: "rect" });
    await sleep(300);
    expect(elementsOf(h.be.ydocOf(WB)).has("hack")).toBe(false);

    h.be.docs.get(WB)!.status = "ARCHIVED";
    const editorOnArchived = wb(ALICE);
    await waitFor(() => synced(editorOnArchived));
    expect(editorOnArchived.authenticated).toEqual(["readonly"]);
  });
});

describe("WB-01 — hai người sửa cùng một hình", () => {
  const rect = { type: "rect", x: 10, y: 20, w: 100, h: 60, rotation: 0, fillColor: "blue", strokeColor: "ink", strokeWidth: 2 };

  /** Bob mất mạng để hai thay đổi THẬT SỰ đồng thời (không bên nào thấy thay đổi của bên kia trước khi sửa). */
  async function twoConcurrentEditors(): Promise<{ a: TestClient; b: TestClient }> {
    const a = wb(ALICE);
    const b = wb(BOB);
    await waitFor(() => synced(a) && synced(b));
    addElement(a.doc, "e1", rect);
    await waitFor(() => elementsOf(b.doc).has("e1"), { label: "Bob có hình e1" });
    b.goOffline();
    await waitFor(() => !b.provider.isAuthenticated, { label: "Bob ngắt kết nối" });
    return { a, b };
  }

  it("một người đổi màu, một người di chuyển: CẢ HAI thay đổi được giữ ở mọi client và ở BE (field khác nhau trong Y.Map)", async () => {
    const { a, b } = await twoConcurrentEditors();
    elementsOf(a.doc).get("e1")?.set("fillColor", "yellow"); // Alice đổi màu
    b.doc.transact(() => {
      const e = elementsOf(b.doc).get("e1");
      e?.set("x", 300); // Bob kéo hình tới chỗ mới
      e?.set("y", 400);
    });
    expect(elementJson(b.doc, "e1")).toMatchObject({ fillColor: "blue", x: 300 }); // chưa thấy thay đổi của Alice
    expect(elementJson(a.doc, "e1")).toMatchObject({ fillColor: "yellow", x: 10 }); // chưa thấy thay đổi của Bob

    b.goOnline();
    const expected = { ...rect, fillColor: "yellow", x: 300, y: 400 };
    await waitFor(() => synced(b) && JSON.stringify(elementJson(a.doc, "e1")) === JSON.stringify(elementJson(b.doc, "e1")), { timeoutMs: 10_000, label: "hội tụ sau khi nối lại" });
    expect(elementJson(a.doc, "e1")).toEqual(expected);
    expect(elementJson(b.doc, "e1")).toEqual(expected);
    await waitFor(() => JSON.stringify(elementJson(h.be.ydocOf(WB), "e1")) === JSON.stringify(expected), { label: "BE lưu bản hợp nhất" });
    expect(elementsOf(a.doc).size).toBe(1); // không nhân đôi phần tử
    expect(orderOf(a.doc).toArray()).toEqual(["e1"]);
  });

  it("cùng đổi MỘT trường: hội tụ về một giá trị duy nhất (một trong hai), các trường khác không hỏng", async () => {
    const { a, b } = await twoConcurrentEditors();
    elementsOf(a.doc).get("e1")?.set("strokeColor", "red");
    elementsOf(b.doc).get("e1")?.set("strokeColor", "green");
    b.goOnline();
    await waitFor(() => synced(b) && elementJson(a.doc, "e1")?.["strokeColor"] === elementJson(b.doc, "e1")?.["strokeColor"], { timeoutMs: 10_000, label: "hội tụ" });
    expect(["red", "green"]).toContain(elementJson(a.doc, "e1")?.["strokeColor"]);
    expect(elementJson(a.doc, "e1")).toMatchObject({ x: 10, y: 20, fillColor: "blue" });
    expect(elementJson(a.doc, "e1")).toEqual(elementJson(b.doc, "e1"));
  });

  it("hai người thêm hình đồng thời: cả hai hình còn, thứ tự z giống nhau ở mọi bên", async () => {
    const { a, b } = await twoConcurrentEditors();
    addElement(a.doc, "eA", { type: "ellipse", x: 1, y: 1 });
    addElement(b.doc, "eB", { type: "line", x: 2, y: 2 });
    b.goOnline();
    await waitFor(() => synced(b) && orderOf(a.doc).length === 3 && orderOf(b.doc).length === 3, { timeoutMs: 10_000, label: "cả hai hình có mặt" });
    expect(new Set(orderOf(a.doc).toArray())).toEqual(new Set(["e1", "eA", "eB"]));
    expect(orderOf(a.doc).toArray()).toEqual(orderOf(b.doc).toArray());
    expect([...elementsOf(a.doc).keys()].sort()).toEqual(["e1", "eA", "eB"].sort());
  });
});

describe("trần dung lượng state theo loại (bảng trắng 9 MiB, tài liệu 5 MiB)", () => {
  /** State Yjs ≈ `bytes` byte (một chuỗi dài không nén được trong một phần tử). */
  function bigBoardState(bytes: number): Uint8Array {
    const d = new Y.Doc();
    addElement(d, "big", { type: "text", text: "x".repeat(bytes) });
    return Y.encodeStateAsUpdate(d);
  }

  it("state 7 MiB: bảng trắng vẫn lưu được về BE; cùng dung lượng ở tài liệu thì báo TOO_LARGE và không PUT", async () => {
    h.be.maxStateBytes = 10 * MiB; // trần của BE giả cao hơn cả hai — chỉ trần của collab quyết định
    const state = bigBoardState(7 * MiB);
    const BIG_WB = oid(0x201);
    const BIG_DOC = oid(0x202);
    h.be.addDoc(BIG_WB, { bePath: "whiteboards", state, version: 1, users: { [ALICE]: "edit" } });
    h.be.addDoc(BIG_DOC, { state, version: 1, users: { [ALICE]: "edit" } });

    const board = wb(ALICE, { docId: BIG_WB });
    await waitFor(() => synced(board) && elementsOf(board.doc).has("big"), { timeoutMs: 15_000, label: "nạp bảng 7 MiB" });
    addElement(board.doc, "nho", { type: "rect", x: 1, y: 1 });
    await waitFor(() => h.be.putsOf(BIG_WB).some((p) => (p.bytes ?? 0) > 7 * MiB), { timeoutMs: 15_000, label: "PUT state > 7 MiB" });
    expect(board.notices.some((n) => n.code === "TOO_LARGE")).toBe(false);
    expect(elementsOf(h.be.ydocOf(BIG_WB)).has("nho")).toBe(true);

    const doc = connect(h, { docId: BIG_DOC, userId: ALICE });
    await waitFor(() => synced(doc), { timeoutMs: 15_000, label: "nạp tài liệu 7 MiB" });
    doc.text.insert(0, "chạm nhẹ");
    await waitFor(() => doc.notices.some((n) => n.code === "TOO_LARGE"), { timeoutMs: 15_000, label: "tài liệu vượt trần 5 MiB" });
    expect(h.be.putsOf(BIG_DOC)).toHaveLength(0);
  });

  it("state vượt 9 MiB: báo TOO_LARGE, không PUT (BE giả có trần cao hơn để chứng minh collab tự chặn)", async () => {
    h.be.maxStateBytes = 12 * MiB;
    const BIG_WB = oid(0x203);
    h.be.addDoc(BIG_WB, { bePath: "whiteboards", state: bigBoardState(9 * MiB + 512 * 1024), version: 1, users: { [ALICE]: "edit" } });
    const board = wb(ALICE, { docId: BIG_WB });
    await waitFor(() => synced(board) && elementsOf(board.doc).has("big"), { timeoutMs: 15_000, label: "nạp bảng > 9 MiB" });
    addElement(board.doc, "nho", { type: "rect", x: 1, y: 1 });
    await waitFor(() => board.notices.some((n) => n.code === "TOO_LARGE"), { timeoutMs: 15_000, label: "TOO_LARGE" });
    expect(h.be.putsOf(BIG_WB)).toHaveLength(0);
  });
});

describe("CW-08 — giới hạn tần suất awareness của bảng trắng (WB_AWARENESS_MAX_HZ)", () => {
  /** Gửi `n` cập nhật con trỏ liên tiếp không nghỉ (một đợt dồn dập). */
  const burst = (c: TestClient, n: number): void => {
    for (let i = 0; i < n; i += 1) c.provider.setAwarenessField("pointer", { x: i, y: i });
  };

  it("vượt trần: server BỎ bớt tin (không đóng kết nối), đếm ở collab_awareness_dropped_total, hết đợt thì gửi lại được", async () => {
    await restart({ WB_AWARENESS_MAX_HZ: "20", MAX_MESSAGES_PER_SECOND: "1000" });
    const sender = wb(ALICE);
    const observer = wb(BOB);
    await waitFor(() => synced(sender) && synced(observer));
    await sleep(150); // để tin awareness khởi tạo của hai bên xong, xô đầy lại
    const applied = countAwarenessFrom(observer, sender);
    const base = applied();

    burst(sender, 150);
    const got = (await settled(applied)) - base;
    const dropped = await metric("collab_awareness_dropped_total", 'kind="whiteboard"');

    expect(got).toBeGreaterThanOrEqual(15); // phần trong ngân sách vẫn tới nơi
    expect(got).toBeLessThanOrEqual(20 + 8); // 20 token + chút hoàn token trong lúc xử lý
    expect(dropped).toBeGreaterThanOrEqual(150 - (20 + 8));
    expect(got + dropped).toBeGreaterThanOrEqual(150); // mỗi tin hoặc tới nơi hoặc bị bỏ, không mất dấu
    expect(sender.closes).toHaveLength(0); // bỏ chứ KHÔNG đóng
    expect(sender.provider.isAuthenticated).toBe(true);

    await sleep(1200); // ngân sách được hoàn lại
    const before = applied();
    sender.provider.setAwarenessField("pointer", { x: -1, y: -1 });
    await waitFor(() => applied() === before + 1, { label: "tin sau đợt dồn dập lại tới nơi" });
    expect(observer.provider.awareness?.getStates().get(sender.doc.clientID)?.["pointer"]).toEqual({ x: -1, y: -1 });
  });

  it("mặc định 60/s: đợt 130 tin bị cắt còn quanh 60, không bị đóng (khác trần chung 200/s)", async () => {
    const sender = wb(ALICE);
    const observer = wb(BOB);
    await waitFor(() => synced(sender) && synced(observer));
    await sleep(150);
    const applied = countAwarenessFrom(observer, sender);
    const base = applied();
    burst(sender, 130);
    const got = (await settled(applied)) - base;
    expect(got).toBeGreaterThanOrEqual(50);
    expect(got).toBeLessThan(130);
    expect(await metric("collab_awareness_dropped_total", 'kind="whiteboard"')).toBeGreaterThan(0);
    expect(sender.closes).toHaveLength(0);
  });

  it("chỉ áp cho bảng trắng: tài liệu cùng server không bị cắt tần suất con trỏ", async () => {
    await restart({ WB_AWARENESS_MAX_HZ: "5", MAX_MESSAGES_PER_SECOND: "1000" });
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(a) && synced(b));
    await sleep(150);
    const applied = countAwarenessFrom(b, a);
    const base = applied();
    for (let i = 0; i < 100; i += 1) a.provider.setAwarenessField("cursor", { anchor: i, head: i });
    const got = (await settled(applied)) - base;
    expect(got).toBeGreaterThanOrEqual(95);
    expect(await metric("collab_awareness_dropped_total", 'kind="document"')).toBe(0);
    expect(a.closes).toHaveLength(0);
  });

  it("tin PHẢN HỒI lại state của người khác (provider 3.4.4 làm vậy) không tính vào trần của người phản hồi", async () => {
    await restart({ WB_AWARENESS_MAX_HZ: "10", MAX_MESSAGES_PER_SECOND: "1000" });
    const a = wb(ALICE);
    const b = wb(BOB); // giữ nguyên hành vi phản hồi (echo) của provider
    await waitFor(() => synced(a) && synced(b));
    await sleep(150);
    const seenByB = countAwarenessFrom(b, a);
    const seenByA = countAwarenessFrom(a, b);

    burst(a, 60); // ~10 tin của A tới B → B phản hồi ~10 tin (state của A) lên server
    await settled(seenByB);
    await sleep(300); // tin phản hồi của B đã tới server
    expect(b.closes).toHaveLength(0); // phản hồi state người khác không bị nhầm là giả danh
    expect(await metric("collab_awareness_dropped_total", 'kind="whiteboard"')).toBeGreaterThanOrEqual(40); // chỉ tin của A bị bỏ

    // Nếu tin phản hồi bị tính, ngân sách 10 tin của B đã cạn và đợt 8 tin dưới đây chỉ còn qua được vài tin.
    const before = seenByA();
    burst(b, 8);
    await waitFor(() => seenByA() - before >= 8, { label: "8 tin của chính B đều tới nơi" });
  });

  it("đã cạn ngân sách: tin rời (state null) vẫn tới nơi; tin giả danh vẫn bị đóng (không bị 'bỏ êm')", async () => {
    await restart({ WB_AWARENESS_MAX_HZ: "5", MAX_MESSAGES_PER_SECOND: "1000" });
    const leaver = wb(ALICE);
    const impostor = wb(BOB);
    const watcher = wb(VIEWER, { mode: "view" });
    await waitFor(() => synced(leaver) && synced(impostor) && synced(watcher));
    await sleep(150);
    // Cả hai tin cuối được gửi NGAY sau đợt dồn dập (cùng nhịp) để ngân sách 5 tin chắc chắn đã cạn khi chúng tới server.
    burst(leaver, 40);
    leaver.provider.awareness?.setLocalState(null); // rời bảng
    burst(impostor, 40);
    impostor.provider.setAwarenessField("user", { id: ALICE, name: "Alice (giả)", color: "#B42318" }); // giả danh Alice

    await waitFor(() => !watcher.provider.awareness?.getStates().has(leaver.doc.clientID), { label: "con trỏ của người rời biến mất dù ngân sách đã cạn" });
    await waitFor(() => closedWith(impostor, "awareness-invalid"), { label: "giả danh vẫn bị đóng (không bị 'bỏ êm') dù ngân sách đã cạn" });
    expect(await metric("collab_awareness_dropped_total", 'kind="whiteboard"')).toBeGreaterThan(60); // ngân sách của cả hai đã thật sự cạn
    expect(closedWith(leaver, "awareness-invalid")).toBe(false);
  });

  it("30 người kéo hình cùng lúc ở 30 Hz (client không phản hồi lại state người khác): không ai bị đóng, server không phải bỏ tin nào", async () => {
    const users = Array.from({ length: 30 }, (_, i) => oid(0x300 + i));
    h.be.docs.get(WB)!.acl = new Map(users.map((u) => [u, "edit" as const]));
    const clients = users.map((u) => wb(u));
    clients.forEach(stopAwarenessEcho);
    await waitFor(() => clients.every(synced), { timeoutMs: 15_000, label: "30 client đã nối" });
    await sleep(200);

    const tickMs = 33; // ≈ 30 lần/giây/người
    const deadline = Date.now() + 1500;
    let tick = 0;
    while (Date.now() < deadline) {
      tick += 1;
      for (const c of clients) c.provider.setAwarenessField("pointer", { x: tick, y: tick });
      await sleep(tickMs);
    }
    await sleep(500);

    expect(clients.filter((c) => c.closes.length > 0)).toHaveLength(0);
    expect(await metric("collab_awareness_dropped_total", 'kind="whiteboard"')).toBe(0);
    const first = clients[0];
    const others = first ? [...(first.provider.awareness?.getStates().keys() ?? [])].filter((id) => id !== first.doc.clientID) : [];
    expect(others).toHaveLength(29); // ai cũng thấy đủ 29 con trỏ của người khác
  });
});
