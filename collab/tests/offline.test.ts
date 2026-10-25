import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, oid, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
});
afterEach(async () => {
  await h.stop();
});

describe("CW-06 — mất mạng rồi gõ tiếp", () => {
  it("một người mất mạng, hai bên cùng gõ, nối lại → hợp nhất đủ, BE lưu bản hợp nhất", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(a) && synced(b));
    a.text.insert(0, "đầu. ");
    await waitFor(() => b.text.toString() === "đầu. ");

    b.goOffline();
    await waitFor(() => !b.provider.isAuthenticated, { label: "B ngắt kết nối" });
    a.text.insert(a.text.length, "A gõ khi B mất mạng. ");
    b.text.insert(b.text.length, "B gõ khi mất mạng. ");
    expect(b.text.toString()).not.toContain("A gõ");
    expect(b.provider.hasUnsyncedChanges).toBe(true);

    b.goOnline();
    await waitFor(() => synced(b) && a.text.toString() === b.text.toString() && a.text.toString().includes("B gõ") && a.text.toString().includes("A gõ"), { timeoutMs: 10_000, label: "hợp nhất sau khi nối lại" });
    await waitFor(() => !b.provider.hasUnsyncedChanges, { label: "hết thay đổi chưa đồng bộ" });
    await waitFor(() => h.be.textOf(DOC) === a.text.toString(), { label: "BE lưu bản hợp nhất" });
    expect(h.be.textOf(DOC)).toContain("đầu. ");
  });

  it("mỗi lần nối lại client được hỏi token mới (hàm token gọi lại) — nền cho CW-D5", async () => {
    let calls = 0;
    const { signToken } = await import("./helpers/harness");
    const a = connect(h, {
      docId: DOC,
      userId: ALICE,
      token: () => {
        calls += 1;
        return signToken({ userId: ALICE, docId: DOC });
      },
    });
    await waitFor(() => synced(a));
    expect(calls).toBe(1);
    a.goOffline();
    await waitFor(() => !a.provider.isAuthenticated);
    a.goOnline();
    await waitFor(() => synced(a), { timeoutMs: 10_000 });
    expect(calls).toBe(2);
  });

  it("collab dừng rồi chạy lại: client tự nối lại, nội dung đã lưu còn nguyên, gõ tiếp được", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "trước khi sập. ");
    await waitFor(() => h.be.textOf(DOC) === "trước khi sập. ");

    const port = h.port;
    const be = h.be;
    const clients = h.clients.splice(0);
    await h.server.stop(); // dừng êm: lưu nốt + đóng kết nối
    const h2 = await startHarness({ PORT: String(port) }, be);
    h2.clients.push(...clients);
    await waitFor(() => synced(a), { timeoutMs: 15_000, label: "A nối lại instance mới" });
    a.text.insert(a.text.length, "sau khi chạy lại.");
    await waitFor(() => be.textOf(DOC) === "trước khi sập. sau khi chạy lại.");
    h = h2;
  });
});
