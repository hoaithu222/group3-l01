import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollabTokenError, verifyCollabToken } from "../src/auth/verify-collab-token";
import { OTHER_SECRET, TEST_SECRET } from "./fixtures/secrets";
import { connect, oid, signToken, sleep, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const OTHER_DOC = oid(2);
const ALICE = oid(0xa1);
const BOB = oid(0xb2);
const GHOST = oid(0xee);

describe("verifyCollabToken", () => {
  const good = (): string => signToken({ userId: ALICE, docId: DOC });
  const failureOf = (token: string, secret = TEST_SECRET): string => {
    try {
      verifyCollabToken(token, secret);
    } catch (err) {
      return err instanceof CollabTokenError ? err.failure : "other";
    }
    return "ok";
  };

  it("token hợp lệ → claim đã chuẩn hoá", () => {
    const c = verifyCollabToken(good(), TEST_SECRET);
    expect(c).toMatchObject({ userId: ALICE, docId: DOC, kind: "document", mode: "edit", sv: 1 });
  });

  it("từ chối: hết hạn, sai bí mật, sai aud, sai iss, thuật toán khác HS256, alg=none, thiếu/sai claim", () => {
    expect(failureOf(signToken({ userId: ALICE, docId: DOC, expiresInSeconds: -60 }))).toBe("expired");
    expect(failureOf(good(), OTHER_SECRET)).toBe("signature");
    expect(failureOf(signToken({ userId: ALICE, docId: DOC, audience: "be" }))).toBe("signature");
    expect(failureOf(signToken({ userId: ALICE, docId: DOC, issuer: "ai-do" }))).toBe("signature");
    expect(failureOf(signToken({ userId: ALICE, docId: DOC, algorithm: "HS512" }))).toBe("signature");
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: ALICE, aud: "collab", iss: "superapp-be", kind: "document", docId: DOC, mode: "edit", sv: 1, jti: "x", exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url")}.`;
    expect(failureOf(none)).toBe("signature");
    expect(failureOf("khong-phai-jwt")).toBe("malformed");
    expect(failureOf(signToken({ userId: "not-an-object-id", docId: DOC }))).toBe("claims");
    expect(failureOf(signToken({ userId: ALICE, docId: "123" }))).toBe("claims");
    expect(failureOf(signToken({ userId: ALICE, docId: DOC, kind: "spreadsheet" }))).toBe("claims");
    const noMode = jwt.sign({ docId: DOC, sv: 1 }, TEST_SECRET, { subject: ALICE, audience: "collab", issuer: "superapp-be", expiresIn: 60, jwtid: "j" });
    expect(failureOf(noMode)).toBe("claims");
  });

  it("token cũ chưa có `kind` → mặc định document", () => {
    const legacy = jwt.sign({ docId: DOC, mode: "view", sv: 2 }, TEST_SECRET, { subject: ALICE, audience: "collab", issuer: "superapp-be", expiresIn: 60, jwtid: "j" });
    expect(verifyCollabToken(legacy, TEST_SECRET)).toMatchObject({ kind: "document", mode: "view", sv: 2 });
  });
});

describe("xác thực kết nối WebSocket", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await startHarness();
    h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "view" } });
    h.be.addDoc(OTHER_DOC, { users: { [ALICE]: "edit" } });
  });
  afterEach(async () => {
    await h.stop();
  });

  it("edit → read-write; view → readonly", async () => {
    const a = connect(h, { docId: DOC, userId: ALICE });
    const b = connect(h, { docId: DOC, userId: BOB, mode: "view" });
    await waitFor(() => synced(a) && synced(b));
    expect(a.authenticated).toEqual(["read-write"]);
    expect(b.authenticated).toEqual(["readonly"]);
  });

  it("mức thấp hơn của (token, BE) thắng: token edit nhưng BE cho view → readonly; token view nhưng BE cho edit → readonly", async () => {
    const bobEditToken = connect(h, { docId: DOC, userId: BOB, mode: "edit" });
    const aliceViewToken = connect(h, { docId: DOC, userId: ALICE, mode: "view" });
    await waitFor(() => synced(bobEditToken) && synced(aliceViewToken));
    expect(bobEditToken.authenticated).toEqual(["readonly"]);
    expect(aliceViewToken.authenticated).toEqual(["readonly"]);
  });

  it("tài liệu ARCHIVED: BE trả mode view → mọi người chỉ đọc dù token edit", async () => {
    h.be.docs.get(DOC)!.status = "ARCHIVED";
    const a = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a));
    expect(a.authenticated).toEqual(["readonly"]);
  });

  const denied = async (opts: Parameters<typeof connect>[1], reason: string, code: number): Promise<void> => {
    const c = connect(h, opts);
    await waitFor(() => c.authFailed.length > 0, { label: `nhận authenticationFailed(${reason})` });
    expect(c.authFailed[0]).toBe(reason);
    await waitFor(() => c.closes.some((e) => e.code === code), { label: `socket đóng mã ${code}` });
    c.destroy(); // tránh vòng nối lại
  };

  it("token sai chữ ký / hết hạn / của tài liệu khác / tên document không khớp → unauthorized (4401)", async () => {
    await denied({ docId: DOC, userId: ALICE, token: signToken({ userId: ALICE, docId: DOC, secret: OTHER_SECRET }) }, "unauthorized", 4401);
    await denied({ docId: DOC, userId: ALICE, token: signToken({ userId: ALICE, docId: DOC, expiresInSeconds: -30 }) }, "unauthorized", 4401);
    await denied({ docId: DOC, userId: ALICE, token: signToken({ userId: ALICE, docId: OTHER_DOC }) }, "unauthorized", 4401);
    await denied({ docId: DOC, userId: ALICE, name: `doc:${OTHER_DOC}` }, "unauthorized", 4401);
    await denied({ docId: DOC, userId: ALICE, token: "" }, "unauthorized", 4401);
  });

  it("BE nói không được vào (không có trong ACL / sessionVersion lệch) → forbidden (4403)", async () => {
    await denied({ docId: DOC, userId: GHOST }, "forbidden", 4403);
    h.be.docs.get(DOC)!.sessionVersion.set(ALICE, 2); // phiên đã bị thu hồi hàng loạt
    await denied({ docId: DOC, userId: ALICE }, "forbidden", 4403);
  });

  it("tài nguyên không tồn tại / tên sai dạng / loại chưa bật → not-found (4404)", async () => {
    const missing = oid(9);
    await denied({ docId: missing, userId: ALICE }, "not-found", 4404);
    await denied({ docId: DOC, userId: ALICE, name: "hello-world" }, "not-found", 4404);
    await denied({ docId: DOC, userId: ALICE, name: `wb:${DOC}`, kind: "whiteboard" }, "not-found", 4404); // COLLAB_KINDS mặc định chỉ document
  });

  it("BE sập → unavailable (4503): từ chối kết nối MỚI (fail-closed)", async () => {
    h.be.down = true;
    await denied({ docId: DOC, userId: ALICE }, "unavailable", 4503);
  });

  it("quá số kết nối/tài liệu và/người → too-many-connections (4429)", async () => {
    await h.stop();
    h = await startHarness({ MAX_CONNECTIONS_PER_DOC: "2", MAX_CONNECTIONS_PER_USER_PER_DOC: "1" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit", [GHOST]: "edit" } });
    const a1 = connect(h, { docId: DOC, userId: ALICE });
    await waitFor(() => synced(a1));
    await denied({ docId: DOC, userId: ALICE }, "too-many-connections", 4429); // người thứ 2 của cùng user
    const b = connect(h, { docId: DOC, userId: BOB });
    await waitFor(() => synced(b));
    await denied({ docId: DOC, userId: GHOST }, "too-many-connections", 4429); // đã đủ 2 người
    expect(a1.provider.isAuthenticated).toBe(true);
  });

  it("chặn nâng cấp WebSocket khi một IP thất bại xác thực quá ngưỡng (429) và path nội bộ (404)", async () => {
    await h.stop();
    h = await startHarness({ MAX_FAILED_AUTH_PER_IP_PER_MINUTE: "3" });
    h.be.addDoc(DOC, { users: { [ALICE]: "edit" } });
    for (let i = 0; i < 3; i += 1) await denied({ docId: DOC, userId: ALICE, token: "sai" }, "unauthorized", 4401);

    const status = (path: string): Promise<number> =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${h.port}${path}`);
        ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        ws.on("open", () => {
          ws.close();
          resolve(101);
        });
        ws.on("error", () => undefined);
      });
    expect(await status(`/collab?doc=${DOC}`)).toBe(429);
    await h.stop();
    h = await startHarness();
    expect(await status("/internal/kick")).toBe(404);
    expect(await status("/health")).toBe(404);
    expect(await status(`/collab?doc=${DOC}`)).toBe(101);
  });

  it("socket không xác thực trong AUTH_TIMEOUT_MS bị đóng (4408)", async () => {
    await h.stop();
    h = await startHarness({ AUTH_TIMEOUT_MS: "250" });
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/collab?doc=${DOC}`);
      ws.on("close", (c) => resolve(c));
      ws.on("error", () => undefined);
    });
    expect(code).toBe(4408);
    await sleep(10);
  });
});
