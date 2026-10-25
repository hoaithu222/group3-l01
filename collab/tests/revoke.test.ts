import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, internal, oid, sleep, startHarness, synced, waitFor, type Harness, type TestClient } from "./helpers/harness";

const DOC = oid(1);
const DOC2 = oid(2);
const OTHER_WS = oid(0xf0);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);
const WS = "aaaaaaaaaaaaaaaaaaaaaaaa";

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
  h.be.addDoc(DOC2, { users: { [ALICE]: "edit", [BOB]: "edit" } });
});
afterEach(async () => {
  await h.stop();
});

const closedWith = (c: TestClient, reason: string): boolean => c.closes.some((e) => e.reason === reason);

describe("CW-D1 — thu hồi quyền khi đang mở tài liệu", () => {
  it("BE gọi /internal/kick sau khi gỡ quyền: kết nối đóng ngay, không nhận update mới, nối lại bị từ chối (forbidden)", async () => {
    const alice = connect(h, { docId: DOC, userId: ALICE });
    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(alice) && synced(bob));
    alice.text.insert(0, "trước khi bị đá. ");
    await waitFor(() => bob.text.toString() === "trước khi bị đá. ");

    h.be.docs.get(DOC)!.acl.delete(BOB); // BE gỡ quyền…
    const res = await internal(h, "/internal/kick", { docId: DOC, userId: BOB, reason: "revoked" }); // …rồi báo collab
    expect(res).toMatchObject({ status: 200, json: { data: { closed: 1 } } });

    await waitFor(() => closedWith(bob, "revoked"), { label: "Bob nhận CLOSE(revoked)" });
    await waitFor(() => bob.authFailed.includes("forbidden"), { timeoutMs: 8000, label: "nối lại → forbidden" });
    alice.text.insert(alice.text.length, "sau khi Bob bị đá.");
    await sleep(300);
    expect(bob.text.toString()).toBe("trước khi bị đá. "); // không nhận update mới
    expect(alice.provider.isAuthenticated).toBe(true); // người khác không bị ảnh hưởng
  });

  it("kick còn quyền (vd đổi vai trò): client nối lại và xác thực lại bình thường", async () => {
    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(bob));
    await internal(h, "/internal/kick", { docId: DOC, userId: BOB, reason: "revoked" });
    await waitFor(() => closedWith(bob, "revoked"));
    await waitFor(() => bob.authenticated.length === 2 && synced(bob), { timeoutMs: 8000, label: "nối lại thành công" });
  });

  it("kick theo workspace: mọi tài liệu của workspace đó, chỉ của user đó", async () => {
    h.be.addDoc(oid(3), { workspaceId: OTHER_WS, users: { [BOB]: "edit" } });
    const b1 = connect(h, { docId: DOC, userId: BOB });
    const b2 = connect(h, { docId: DOC2, userId: BOB });
    const b3 = connect(h, { docId: oid(3), userId: BOB });
    const a1 = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => [b1, b2, b3, a1].every(synced));
    h.be.docs.get(DOC)!.acl.delete(BOB);
    h.be.docs.get(DOC2)!.acl.delete(BOB);
    const res = await internal(h, "/internal/kick", { workspaceId: WS, userId: BOB, reason: "forbidden" });
    expect(res).toMatchObject({ status: 200, json: { data: { closed: 2 } } });
    await waitFor(() => closedWith(b1, "forbidden") && closedWith(b2, "forbidden"));
    expect(b3.provider.isAuthenticated).toBe(true);
    expect(a1.provider.isAuthenticated).toBe(true);
  });

  it("lưu trữ tài liệu: kick mọi người (archived) → nối lại ở chế độ chỉ xem", async () => {
    const alice = connect(h, { docId: DOC, userId: ALICE });
    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(alice) && synced(bob));
    h.be.docs.get(DOC)!.status = "ARCHIVED";
    const res = await internal(h, "/internal/kick", { docId: DOC, reason: "archived" });
    expect(res).toMatchObject({ json: { data: { closed: 2 } } });
    await waitFor(() => closedWith(alice, "archived") && closedWith(bob, "archived"));
    await waitFor(() => alice.authenticated.at(-1) === "readonly" && bob.authenticated.at(-1) === "readonly" && synced(alice) && synced(bob), { timeoutMs: 8000, label: "nối lại chỉ đọc" });
    expect(alice.authenticated).toEqual(["read-write", "readonly"]);
  });

  it("lưới an toàn: KHÔNG có tin kick, vòng kiểm lại quyền vẫn đá người hết quyền (≤ chu kỳ)", async () => {
    await h.stop();
    h = await startHarness({ ACCESS_RECHECK_MS: "150", ACCESS_CACHE_TTL_MS: "0" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
    const alice = connect(h, { docId: DOC, userId: ALICE });
    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(alice) && synced(bob));
    const removedAt = Date.now();
    h.be.docs.get(DOC)!.acl.delete(BOB);
    await waitFor(() => closedWith(bob, "forbidden"), { timeoutMs: 3000, label: "recheck đá Bob" });
    expect(Date.now() - removedAt).toBeLessThan(2000);
    expect(closedWith(alice, "forbidden")).toBe(false);
  });

  it("hạ quyền sửa → xem: kết nối chuyển readOnly, nhận thông báo READ_ONLY, update sau đó không được áp", async () => {
    await h.stop();
    h = await startHarness({ ACCESS_RECHECK_MS: "150", ACCESS_CACHE_TTL_MS: "0" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
    const alice = connect(h, { docId: DOC, userId: ALICE });
    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(alice) && synced(bob));

    h.be.docs.get(DOC)!.acl.set(BOB, "view");
    await waitFor(() => bob.notices.some((n) => n.code === "READ_ONLY"), { timeoutMs: 3000, label: "Bob nhận READ_ONLY" });
    bob.text.insert(0, "bị-từ-chối");
    await sleep(300);
    expect(alice.text.toString()).toBe("");
    expect(bob.provider.isAuthenticated).toBe(true); // vẫn xem được
    alice.text.insert(0, "alice gõ");
    await waitFor(() => bob.text.toString().includes("alice gõ"), { label: "Bob vẫn nhận nội dung" });
  });

  it("BE chớp tắt lúc kiểm lại: KHÔNG đá hàng loạt (giữ kết nối, đếm lỗi)", async () => {
    await h.stop();
    h = await startHarness({ ACCESS_RECHECK_MS: "0", ACCESS_CACHE_TTL_MS: "0" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit" } });
    const alice = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(alice));
    h.be.down = true;
    const result = await h.server.rechecker.runOnce();
    expect(result).toMatchObject({ checked: 1, closed: 0, errors: 1 });
    expect(alice.provider.isAuthenticated).toBe(true);
    h.be.down = false;
    expect(await h.server.rechecker.runOnce()).toMatchObject({ checked: 1, closed: 0, errors: 0 });
  });
});
