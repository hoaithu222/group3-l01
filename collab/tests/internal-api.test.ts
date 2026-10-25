import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OTHER_SECRET } from "./fixtures/secrets";
import { connect, internal, oid, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const ALICE = oid(0xa1);

let h: Harness;
beforeEach(async () => {
  h = await startHarness({ METRICS_TOKEN: "metrics-token-for-tests" });
  h.be.addDoc(DOC, { users: { [ALICE]: "edit" } });
});
afterEach(async () => {
  await h.stop();
});

describe("API nội bộ, /health, /metrics", () => {
  it("các đường /internal/* yêu cầu đúng X-Collab-Secret", async () => {
    for (const path of ["/internal/kick", "/internal/apply", "/internal/flush"]) {
      expect((await internal(h, path, { docId: DOC }, { secret: null })).status).toBe(401);
      expect((await internal(h, path, { docId: DOC }, { secret: OTHER_SECRET })).status).toBe(401);
    }
    expect((await internal(h, "/internal/stats", undefined, { secret: null })).status).toBe(401);
    expect((await internal(h, "/internal/stats")).status).toBe(200);
  });

  it("kick: kiểm tra đầu vào (cần ít nhất một bộ lọc, id đúng dạng, lý do hợp lệ)", async () => {
    expect((await internal(h, "/internal/kick", {})).status).toBe(400);
    expect((await internal(h, "/internal/kick", { docId: "abc" })).status).toBe(400);
    expect((await internal(h, "/internal/kick", { docId: DOC, reason: "vì thích" })).status).toBe(400);
    expect((await internal(h, "/internal/kick", { docId: DOC, kind: "spreadsheet" })).status).toBe(400);
    expect(await internal(h, "/internal/kick", { docId: DOC })).toMatchObject({ status: 200, json: { data: { closed: 0 } } });
  });

  it("apply/flush: kiểm tra đầu vào; document không mở → open=false", async () => {
    expect((await internal(h, "/internal/apply", { docId: DOC })).status).toBe(400);
    expect((await internal(h, "/internal/apply", { docId: DOC, updateBase64: "" })).status).toBe(400);
    expect(await internal(h, "/internal/apply", { docId: DOC, updateBase64: Buffer.from([1, 2, 3]).toString("base64") })).toMatchObject({
      status: 200,
      json: { data: { open: false, applied: false } },
    });
    expect((await internal(h, "/internal/flush", {})).status).toBe(400);
  });

  it("JSON hỏng → 400 JSON chuẩn (không lộ stack)", async () => {
    const res = await fetch(`http://127.0.0.1:${h.port}/internal/kick`, { method: "POST", headers: { "X-Collab-Secret": h.config.sharedSecret, "Content-Type": "application/json" }, body: "{hỏng" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "VAL_001" } });
  });

  it("/health: công khai, có số liệu kết nối/document, phiên bản, trạng thái Redis/BE", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    const res = await internal(h, "/health", undefined, { secret: null });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ status: "ok", service: "collab", kinds: ["document"], connections: 1, documents: 1, pendingStates: 0, redis: "off" });
    expect((res.json as { be: { lastOkAt: string | null } }).be.lastOkAt).not.toBeNull();
  });

  it("/health chuyển 'degraded' khi BE vừa lỗi liên tục", async () => {
    h.be.down = true;
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => a.authFailed.includes("unavailable"));
    a.destroy();
    expect((await internal(h, "/health", undefined, { secret: null })).json).toMatchObject({ status: "degraded" });
    h.be.down = false;
  });

  it("/metrics: cần Bearer token khi đặt METRICS_TOKEN; có số đo kết nối/lưu/xác thực", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "đo");
    await waitFor(() => h.be.textOf(DOC) === "đo");

    expect((await fetch(`http://127.0.0.1:${h.port}/metrics`)).status).toBe(401);
    const res = await fetch(`http://127.0.0.1:${h.port}/metrics`, { headers: { Authorization: "Bearer metrics-token-for-tests" } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/collab_connections\{kind="document"\} 1/);
    expect(text).toMatch(/collab_documents_open\{kind="document"\} 1/);
    expect(text).toMatch(/collab_auth_total\{result="ok"\} 1/);
    expect(text).toMatch(/collab_store_total\{kind="document",result="ok"\} \d+/);
    expect(text).toContain("collab_store_duration_seconds_bucket");
  });

  it("đường lạ → 404 của Express; WebSocket vào path bất kỳ (kể cả /collab/) vẫn được nâng cấp", async () => {
    expect((await internal(h, "/khong-co")).status).toBe(404);
    const a = connect(h, { docId: DOC, userId: ALICE, path: "/collab/" });
    await waitFor(() => synced(a));
    const b = connect(h, { docId: DOC, userId: ALICE, path: "" });
    await waitFor(() => synced(b));
  });
});
