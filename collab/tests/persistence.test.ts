import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, internal, oid, sleep, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);

let h: Harness;
const start = async (env: Record<string, string> = {}): Promise<void> => {
  h = await startHarness(env);
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
};
afterEach(async () => {
  await h.stop();
});

describe("lưu/khôi phục state qua BE", () => {
  beforeEach(() => start());

  it("gộp nhiều lần gõ thành ít lần PUT (debounce) và base version tăng dần theo phản hồi của BE", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    for (let i = 0; i < 20; i += 1) {
      a.text.insert(a.text.length, `${i},`);
      await sleep(10);
    }
    await waitFor(() => h.be.textOf(DOC) === a.text.toString(), { label: "BE nhận đủ" });
    const puts = h.be.putsOf(DOC);
    expect(puts.length).toBeGreaterThan(0);
    expect(puts.length).toBeLessThan(20);
    expect(puts.map((p) => p.baseVersion)).toEqual([...puts.keys()]); // 0,1,2… — collab nhớ version BE trả về
  });

  it("người cuối rời → lưu NGAY dù debounce dài", async () => {
    await h.stop();
    await start({ STORE_DEBOUNCE_MS: "5000", STORE_MAX_DEBOUNCE_MS: "20000" });
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "lưu khi rời");
    await sleep(150);
    expect(h.be.textOf(DOC)).toBe(""); // chưa tới hạn debounce
    a.destroy();
    await waitFor(() => h.be.textOf(DOC) === "lưu khi rời", { timeoutMs: 3000, label: "lưu khi người cuối rời" });
  });

  it("BE chậm 3 s: update gõ trong lúc PUT đang treo KHÔNG bị mất", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(a) && synced(b));
    h.be.putDelayMs = 3000;
    a.text.insert(0, "một ");
    await waitFor(() => h.be.putsOf(DOC).length === 1, { label: "PUT đầu bắt đầu" });
    b.text.insert(0, "hai ");
    a.text.insert(0, "ba ");
    await sleep(200);
    expect(a.text.toString()).toBe(b.text.toString()); // đồng bộ giữa client không phụ thuộc BE
    h.be.putDelayMs = 0;
    await waitFor(() => h.be.textOf(DOC) === a.text.toString() && a.text.toString().split(" ").filter(Boolean).length === 3, {
      timeoutMs: 15_000,
      label: "BE có đủ 3 phần",
    });
  });

  it("BE lỗi tạm thời: giữ state, báo SAVE_FAILED, thử lại tới khi lưu được, báo SAVE_RECOVERED", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    h.be.failPuts = 3;
    a.text.insert(0, "phải-lưu-được");
    await waitFor(() => a.notices.some((n) => n.code === "SAVE_FAILED"), { label: "nhận SAVE_FAILED" });
    await waitFor(() => h.be.textOf(DOC) === "phải-lưu-được", { timeoutMs: 8000, label: "lưu được sau khi BE hồi phục" });
    await waitFor(() => a.notices.some((n) => n.code === "SAVE_RECOVERED"), { label: "nhận SAVE_RECOVERED" });
  });

  it("BE sập hẳn khi người cuối rời: document KHÔNG bị dỡ, state được giữ và lưu khi BE quay lại", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "sống-sót-qua-sự-cố");
    await waitFor(() => h.be.putsOf(DOC).length >= 1);
    h.be.down = true;
    a.text.insert(a.text.length, "!");
    a.destroy();
    await sleep(500);
    expect(h.server.persistence.pendingCount()).toBe(1);
    expect(h.server.hocuspocus.getDocumentsCount()).toBe(1); // còn trong RAM
    h.be.down = false;
    await waitFor(() => h.be.textOf(DOC) === "sống-sót-qua-sự-cố!", { timeoutMs: 8000, label: "lưu sau khi BE quay lại" });
    await waitFor(() => h.server.persistence.pendingCount() === 0);
    await waitFor(() => h.server.hocuspocus.getDocumentsCount() === 0, { label: "dỡ document sau khi lưu xong" });
  });

  it("client mới nối lúc BE sập: nhận unavailable; BE quay lại thì nối lại được", async () => {
    h.be.down = true;
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => a.authFailed.includes("unavailable"), { label: "unavailable" });
    h.be.down = false;
    await waitFor(() => synced(a), { timeoutMs: 10_000, label: "tự nối lại sau khi BE hồi phục" });
  });

  it("state vượt trần: báo TOO_LARGE, không gọi PUT", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "x".repeat(5 * 1024 * 1024 + 4096));
    await waitFor(() => a.notices.some((n) => n.code === "TOO_LARGE"), { timeoutMs: 8000, label: "TOO_LARGE" });
    expect(h.be.putsOf(DOC)).toHaveLength(0);
  });

  it("BE từ chối vì đã lưu trữ (409): đóng kết nối, không giữ state để thử lại", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    h.be.docs.get(DOC)!.status = "ARCHIVED";
    a.text.insert(0, "gõ-sau-khi-lưu-trữ");
    await waitFor(() => a.notices.some((n) => n.code === "ARCHIVED"), { label: "ARCHIVED" });
    await waitFor(() => a.closes.some((c) => c.reason === "archived"), { label: "bị đóng (archived)" });
    expect(h.server.persistence.pendingCount()).toBe(0);
    expect(h.be.textOf(DOC)).toBe("");
  });

  it("CW-D4 — khôi phục snapshot khi 2 người đang sửa: cả hai thấy nội dung khôi phục; PUT cũ (base version cũ) được BE hợp nhất, không ghi đè", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(a) && synced(b));
    a.text.insert(0, "phiên bản hiện tại");
    await waitFor(() => b.text.toString() === "phiên bản hiện tại" && h.be.textOf(DOC) === "phiên bản hiện tại");

    // Mô phỏng BE khôi phục: xoá nội dung hiện tại, chèn nội dung snapshot, tính delta, ghi state mới (version+1), rồi gọi /internal/apply.
    const doc = h.be.docs.get(DOC)!;
    const work = new Y.Doc();
    Y.applyUpdate(work, doc.state);
    const before = Y.encodeStateVector(work);
    work.transact(() => {
      const t = work.getText("t");
      t.delete(0, t.length);
      t.insert(0, "nội dung snapshot cũ");
    });
    doc.state = Y.encodeStateAsUpdate(work);
    doc.version += 1;
    const delta = Y.encodeStateAsUpdate(work, before);

    const res = await internal(h, "/internal/apply", { docId: DOC, updateBase64: Buffer.from(delta).toString("base64"), reason: "restore" });
    expect(res).toMatchObject({ status: 200, json: { data: { open: true, applied: true, connections: 2 } } });
    await waitFor(() => a.text.toString() === "nội dung snapshot cũ" && b.text.toString() === "nội dung snapshot cũ", { label: "cả hai thấy nội dung khôi phục" });
    await waitFor(() => a.notices.some((n) => n.code === "RESTORED") && b.notices.some((n) => n.code === "RESTORED"));

    // Người dùng gõ tiếp sau khôi phục → BE (base version cũ → hợp nhất) vẫn giữ khôi phục + chữ mới.
    b.text.insert(b.text.length, " + gõ tiếp");
    await waitFor(() => h.be.textOf(DOC) === "nội dung snapshot cũ + gõ tiếp", { timeoutMs: 5000, label: "BE hợp nhất đúng" });
    expect(h.be.putsOf(DOC).some((p) => (p.baseVersion ?? 0) < doc.version)).toBe(true); // đã đi qua nhánh hợp nhất
  });

  it("/internal/flush: lưu ngay state đang sống (cho snapshot MANUAL); document không mở → open=false", async () => {
    await h.stop();
    await start({ STORE_DEBOUNCE_MS: "10000", STORE_MAX_DEBOUNCE_MS: "20000" });
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "chưa-tới-hạn-debounce");
    await sleep(100);
    expect(h.be.textOf(DOC)).toBe("");
    const res = await internal(h, "/internal/flush", { docId: DOC });
    expect(res).toMatchObject({ status: 200, json: { data: { open: true, flushed: true } } });
    expect(h.be.textOf(DOC)).toBe("chưa-tới-hạn-debounce");
    expect(await internal(h, "/internal/flush", { docId: oid(9) })).toMatchObject({ json: { data: { open: false, flushed: true, yjsVersion: null } } });
  });

  it("dừng êm (SIGTERM): lưu nốt state còn treo trong debounce trước khi thoát", async () => {
    await h.stop();
    await start({ STORE_DEBOUNCE_MS: "30000", STORE_MAX_DEBOUNCE_MS: "60000" });
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "phải-lưu-khi-dừng");
    await sleep(100);
    expect(h.be.textOf(DOC)).toBe("");
    await h.server.stop();
    expect(h.be.textOf(DOC)).toBe("phải-lưu-khi-dừng");
  });
});
