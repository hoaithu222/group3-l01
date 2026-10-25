import * as encoding from "lib0/encoding";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, oid, sleep, startHarness, synced, waitFor, type Harness, type TestClient } from "./helpers/harness";

const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);
const MALLORY = oid(0xd4);

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit", [MALLORY]: "view" } });
});
afterEach(async () => {
  await h.stop();
});

const rawSend = (c: TestClient, build: (e: encoding.Encoder) => void): void => {
  const e = encoding.createEncoder();
  encoding.writeVarString(e, `doc:${DOC}`);
  build(e);
  const ws = c.provider.configuration.websocketProvider.webSocket;
  ws?.send(encoding.toUint8Array(e));
};

const closedWith = (c: TestClient, reason: string): boolean => c.closes.some((e) => e.reason === reason);

describe("cổng kiểm message (message guard)", () => {
  it("chặn Stateless và BroadcastStateless từ client (kể cả viewer): đóng kết nối, người khác không nhận gì", async () => {
    const alice = connect(h, { docId: DOC, userId: ALICE });
    const mallory = connect(h, { docId: DOC, userId: MALLORY, mode: "view" });
    await waitFor(() => synced(alice) && synced(mallory));
    rawSend(mallory, (e) => {
      encoding.writeVarUint(e, 6); // BroadcastStateless
      encoding.writeVarString(e, JSON.stringify({ v: 1, type: "notice", code: "RESTORED" }));
    });
    await waitFor(() => closedWith(mallory, "unsupported-message"), { label: "mallory bị đóng" });
    await sleep(200);
    expect(alice.notices).toHaveLength(0);
    expect(alice.provider.isAuthenticated).toBe(true);
    mallory.destroy();

    const bob = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(bob));
    bob.provider.sendStateless("xin chào");
    await waitFor(() => closedWith(bob, "unsupported-message"), { label: "bob bị đóng vì Stateless" });
    bob.destroy();
  });

  it("awareness giả danh (user.id khác người đã xác thực) → đóng kết nối", async () => {
    const mallory = connect(h, { docId: DOC, userId: MALLORY, mode: "view", awarenessUser: null });
    await waitFor(() => synced(mallory));
    mallory.provider.setAwarenessField("user", { id: ALICE, name: "Alice (giả)", color: "#B42318" });
    await waitFor(() => closedWith(mallory, "awareness-invalid"), { label: "bị đóng vì giả danh" });
    mallory.destroy();
  });

  it("awareness sai khoá / tên quá dài / màu sai định dạng → đóng kết nối", async () => {
    const cases: Array<[string, unknown]> = [
      ["evil", { x: 1 }],
      ["user", { id: BOB, name: "x".repeat(81), color: "#175CD3" }],
      ["user", { id: BOB, name: "Bob", color: "đỏ" }],
      ["cursor", "x".repeat(3000)],
    ];
    for (const [key, value] of cases) {
      const c = connect(h, { docId: DOC, userId: BOB, awarenessUser: null });
      await waitFor(() => synced(c));
      c.provider.setAwarenessField(key, value);
      await waitFor(() => closedWith(c, "awareness-invalid"), { label: `awareness ${key} bị chặn` });
      c.destroy();
    }
  });

  it("awareness hợp lệ, có con trỏ: không bị đóng; provider phản hồi lại state của người khác cũng không bị nhầm là giả danh", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE, awarenessUser: { id: ALICE, name: "Alice", color: "#B42318" } });
    const b = connect(h, { docId: DOC, userId: BOB, awarenessUser: { id: BOB, name: "Bob", color: "#175CD3" } });
    await waitFor(() => synced(a) && synced(b));
    for (let i = 0; i < 10; i += 1) {
      a.provider.setAwarenessField("cursor", { anchor: i, head: i + 1 });
      b.provider.setAwarenessField("cursor", { anchor: i * 2, head: i * 2 });
      await sleep(30);
    }
    await sleep(300);
    expect(a.closes).toHaveLength(0);
    expect(b.closes).toHaveLength(0);
    expect(a.provider.isAuthenticated && b.provider.isAuthenticated).toBe(true);
  });

  it("flood quá MAX_MESSAGES_PER_SECOND → đóng (rate-limited)", async () => {
    await h.stop();
    h = await startHarness({ MAX_MESSAGES_PER_SECOND: "20" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit" } });
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    for (let i = 0; i < 200; i += 1) a.provider.setAwarenessField("cursor", { anchor: i, head: i });
    await waitFor(() => closedWith(a, "rate-limited"), { label: "bị chặn flood" });
    a.destroy();
  });
});
