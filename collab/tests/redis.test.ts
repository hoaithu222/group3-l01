import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { BeMock } from "./helpers/be-mock";
import { connect, internal, oid, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

/**
 * Nhiều instance qua Redis. CHỈ chạy khi có `REDIS_URL` (CI job `collab` dựng service redis; máy dev: `REDIS_URL=redis://127.0.0.1:6379 npm test`).
 * Dùng tiền tố khoá ngẫu nhiên nên không đụng dữ liệu khác trong cùng Redis (chỉ pub/sub + khoá redlock sống ~1 s).
 */
const REDIS_URL = process.env["REDIS_URL"];
const DOC = oid(1);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);

/** Chờ bus Redis của instance sẵn sàng (health.redis = ok). */
async function redisReady(h: Harness): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await internal(h, "/health", undefined, { secret: null });
    if ((res.json as { redis?: string }).redis === "ok") return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Redis chưa sẵn sàng");
}

describe.skipIf(!REDIS_URL)("nhiều instance collab qua Redis", () => {
  const harnesses: Harness[] = [];
  const mocks: BeMock[] = [];
  afterEach(async () => {
    for (const h of harnesses.splice(0).reverse()) await h.stop();
    for (const be of mocks.splice(0)) await be.stop();
  });

  const startPair = async (): Promise<[Harness, Harness, BeMock]> => {
    const be = new BeMock();
    await be.start();
    mocks.push(be);
    be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
    const prefix = `collab-test-${randomBytes(4).toString("hex")}:`;
    const env = { REDIS_URL: REDIS_URL ?? "", REDIS_KEY_PREFIX: prefix };
    const a = await startHarness({ ...env, INSTANCE_ID: "inst-a" }, be);
    const b = await startHarness({ ...env, INSTANCE_ID: "inst-b" }, be);
    harnesses.push(a, b);
    await Promise.all([redisReady(a), redisReady(b)]);
    return [a, b, be];
  };

  it("hai người ở HAI instance khác nhau vẫn thấy nhau: nội dung + awareness đồng bộ, BE lưu bản hợp nhất", async () => {
    const [a, b, be] = await startPair();
    const alice = connect(a, { docId: DOC, userId: ALICE, awarenessUser: { id: ALICE, name: "Alice", color: "#B42318" } });
    const bob = connect(b, { docId: DOC, userId: BOB, awarenessUser: { id: BOB, name: "Bob", color: "#175CD3" } });
    await waitFor(() => synced(alice) && synced(bob), { timeoutMs: 10_000 });

    alice.text.insert(0, "từ instance A. ");
    bob.text.insert(0, "từ instance B. ");
    await waitFor(() => alice.text.toString() === bob.text.toString() && alice.text.length === 30, { timeoutMs: 10_000, label: "hội tụ xuyên instance" });
    const names = (): string[] => [...(alice.provider.awareness?.getStates().values() ?? [])].map((s) => (s as { user?: { name?: string } }).user?.name ?? "");
    await waitFor(() => names().includes("Bob"), { timeoutMs: 10_000, label: "awareness xuyên instance" });
    await waitFor(() => be.textOf(DOC) === alice.text.toString(), { timeoutMs: 10_000, label: "BE lưu bản hợp nhất" });
    expect((await internal(a, "/health", undefined, { secret: null })).json).toMatchObject({ redis: "ok" });
  });

  it("kick gửi tới MỘT instance được phát tới các instance khác (bus Redis)", async () => {
    const [a, b] = await startPair();
    const bob = connect(b, { docId: DOC, userId: BOB });
    await waitFor(() => synced(bob), { timeoutMs: 10_000 });
    const res = await internal(a, "/internal/kick", { userId: BOB, docId: DOC, reason: "revoked" });
    expect(res).toMatchObject({ status: 200, json: { data: { closed: 0 } } }); // A không giữ kết nối của Bob…
    await waitFor(() => bob.closes.some((c) => c.reason === "revoked"), { timeoutMs: 10_000, label: "…nhưng B đóng theo bus" });
  });
});
