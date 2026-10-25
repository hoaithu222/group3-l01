import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, oid, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);
const CAROL = oid(0xc3);

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit", [CAROL]: "edit" } });
});
afterEach(async () => {
  await h.stop();
});

describe("CW-05 — nhiều người soạn cùng lúc", () => {
  it("hai người gõ đồng thời vào cùng vị trí: hội tụ, không mất ký tự", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(a) && synced(b), { label: "cả hai đã đồng bộ" });

    a.text.insert(0, "Xin chào ");
    b.text.insert(0, "thế giới");
    await waitFor(() => a.text.toString() === b.text.toString() && a.text.length === "Xin chào ".length + "thế giới".length, { label: "hội tụ" });

    const merged = a.text.toString();
    expect(merged).toContain("Xin chào ");
    expect(merged).toContain("thế giới");
    expect(b.text.toString()).toBe(merged);
  });

  it("gõ dồn dập xen kẽ từ 3 client: bản của mọi người và bản lưu ở BE giống hệt, đủ ký tự", async () => {
    const clients = [connect(h, { docId: DOC, userId: ALICE }), connect(h, { docId: DOC, userId: BOB }), connect(h, { docId: DOC, userId: CAROL })];
    await waitFor(() => clients.every(synced));

    const PER_CLIENT = 150;
    await Promise.all(
      clients.map(async (c, ci) => {
        for (let i = 0; i < PER_CLIENT; i += 1) {
          c.text.insert(Math.floor(c.text.length / 2), String.fromCharCode(0x61 + ci));
          if (i % 25 === 0) await new Promise((r) => setTimeout(r, 5));
        }
      }),
    );
    const total = PER_CLIENT * clients.length;
    await waitFor(() => clients.every((c) => c.text.length === total) && clients.every((c) => c.text.toString() === clients[0]?.text.toString()), { label: "hội tụ 450 ký tự", timeoutMs: 10_000 });
    for (const [ci, c] of clients.entries()) expect([...c.text.toString()].filter((ch) => ch === String.fromCharCode(0x61 + ci))).toHaveLength(PER_CLIENT);

    // Debounce → BE nhận state đầy đủ.
    await waitFor(() => h.be.textOf(DOC) === clients[0]?.text.toString(), { label: "BE lưu đủ" });
  });

  it("con trỏ/awareness: người kia thấy tên + màu của mình", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE, awarenessUser: { id: ALICE, name: "Alice", color: "#B42318" } });
    const b = connect(h, { docId: DOC, userId: BOB, awarenessUser: { id: BOB, name: "Bob", color: "#175CD3" } });
    await waitFor(() => synced(a) && synced(b));

    const seenByA = (): Array<{ name?: string; color?: string }> =>
      [...(a.provider.awareness?.getStates().values() ?? [])].map((s) => (s as { user?: { name?: string; color?: string } }).user ?? {});
    await waitFor(() => seenByA().some((u) => u.name === "Bob" && u.color === "#175CD3"), { label: "A thấy Bob" });
    expect(seenByA().some((u) => u.name === "Alice")).toBe(true);
  });

  it("người mở sau nhận đủ nội dung đã lưu ở BE", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    a.text.insert(0, "nội dung có sẵn");
    await waitFor(() => h.be.textOf(DOC) === "nội dung có sẵn");
    a.destroy();

    const late = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(late));
    expect(late.text.toString()).toBe("nội dung có sẵn");
  });
});
