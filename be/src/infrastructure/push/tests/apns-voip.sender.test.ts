import * as http2 from "node:http2";
import { ApnsVoipPushSender, voipExpirationEpoch } from "../apns-voip.sender";
import type { VoipPayload } from "../push.types";

// Chữ ký ES256 chỉ cần hợp lệ về mặt định dạng (server giả không verify JWT)
// — khoá vứt đi, sinh 1 lần cho test, KHÔNG dùng ở đâu khác.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgjIs/dzdpnltNNyp7
Z7kflIWV6CSOkLfMw9mz2xKAGomhRANCAASfJW+6KdGNREs0ulghUdwPUYvn7EDi
7zM0dmVxL5pNo21AgcyLiMZ3MO8sBal1H63C/8MCF+zU8HT0MmpZ1fgy
-----END PRIVATE KEY-----`;

const PAYLOAD: VoipPayload = {
  type: "call.incoming",
  targetUserId: "u1",
  callId: "507f1f77bcf86cd799439011",
  callUuid: "8f3b1c9e-0000-5000-8000-000000000000",
  mediaKind: "AUDIO",
  callerId: "u2",
  callerName: "Alice",
  sentAt: new Date().toISOString(),
};

type Handler = (
  headers: http2.IncomingHttpHeaders,
  respond: (status: number, body?: unknown) => void
) => void;

function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void>; requests: http2.IncomingHttpHeaders[] }> {
  const requests: http2.IncomingHttpHeaders[] = [];
  const server = http2.createServer((req, res) => {
    requests.push(req.headers);
    handler(req.headers, (status, body) => {
      res.writeHead(status);
      if (body) {
        res.end(JSON.stringify(body));
      } else {
        res.end();
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe("ApnsVoipPushSender", () => {
  it("200 → ok, không revoke, không retry", async () => {
    const { url, close } = await startServer((_h, respond) => respond(200));
    const sender = new ApnsVoipPushSender({
      keyId: "KEYID",
      teamId: "TEAMID",
      privateKey: TEST_PRIVATE_KEY,
      sandboxHost: url,
    });

    const result = await sender.send("device-token", "SANDBOX", "com.app", PAYLOAD);

    expect(result).toEqual({ ok: true, status: 200, shouldRevoke: false, retriable: false });
    sender.closeAll();
    await close();
  });

  it("410 → shouldRevoke true", async () => {
    const { url, close } = await startServer((_h, respond) => respond(410, { reason: "Unregistered" }));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("dead-token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.shouldRevoke).toBe(true);
    expect(result.retriable).toBe(false);
    sender.closeAll();
    await close();
  });

  it("400 BadDeviceToken → shouldRevoke true", async () => {
    const { url, close } = await startServer((_h, respond) => respond(400, { reason: "BadDeviceToken" }));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("bad-token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.shouldRevoke).toBe(true);
    sender.closeAll();
    await close();
  });

  it("400 lỗi khác BadDeviceToken → không revoke, không retry", async () => {
    const { url, close } = await startServer((_h, respond) => respond(400, { reason: "PayloadTooLarge" }));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.shouldRevoke).toBe(false);
    expect(result.retriable).toBe(false);
    sender.closeAll();
    await close();
  });

  it("429 → retriable, không revoke", async () => {
    const { url, close } = await startServer((_h, respond) => respond(429, { reason: "TooManyRequests" }));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.retriable).toBe(true);
    expect(result.shouldRevoke).toBe(false);
    sender.closeAll();
    await close();
  });

  it("5xx → retriable", async () => {
    const { url, close } = await startServer((_h, respond) => respond(503));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.retriable).toBe(true);
    sender.closeAll();
    await close();
  });

  it("403 InvalidProviderToken → làm mới JWT, retry đúng 1 lần, không revoke", async () => {
    let calls = 0;
    const { url, close } = await startServer((_h, respond) => {
      calls += 1;
      if (calls === 1) return respond(403, { reason: "InvalidProviderToken" });
      respond(200);
    });
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const result = await sender.send("token", "SANDBOX", "com.app", PAYLOAD);

    expect(calls).toBe(2);
    expect(result).toEqual({ ok: true, status: 200, shouldRevoke: false, retriable: false });
    sender.closeAll();
    await close();
  });

  it("gửi đúng headers apns-topic/push-type/priority/id + path theo token", async () => {
    const { url, close, requests } = await startServer((_h, respond) => respond(200));
    const sender = new ApnsVoipPushSender({ keyId: "KID", teamId: "TID", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    await sender.send("my-device-token", "SANDBOX", "com.mancode.vungnui", PAYLOAD);

    const headers = requests[0];
    expect(headers[":path"]).toBe("/3/device/my-device-token");
    expect(headers["apns-topic"]).toBe("com.mancode.vungnui.voip");
    expect(headers["apns-push-type"]).toBe("voip");
    expect(headers["apns-priority"]).toBe("10");
    expect(headers["apns-id"]).toBe(PAYLOAD.callUuid);
    expect(String(headers["authorization"])).toMatch(/^bearer /);
    sender.closeAll();
    await close();
  });

  it("JWT cache — 2 lần gửi liên tiếp dùng lại cùng 1 provider token", async () => {
    const { url, close, requests } = await startServer((_h, respond) => respond(200));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    await sender.send("t1", "SANDBOX", "com.app", PAYLOAD);
    await sender.send("t2", "SANDBOX", "com.app", PAYLOAD);

    expect(requests).toHaveLength(2);
    expect(requests[0]["authorization"]).toBe(requests[1]["authorization"]);
    sender.closeAll();
    await close();
  });

  it("apns-expiration = min(now + 60 s, payload.expiresAt): hạn đổ chuông còn 20 s → header ≈ now + 20; không expiresAt → now + 60 (như cũ)", async () => {
    const { url, close, requests } = await startServer((_h, respond) => respond(200));
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: url });

    const before = Math.floor(Date.now() / 1000);
    await sender.send("t1", "SANDBOX", "com.app", { ...PAYLOAD, expiresAt: new Date(Date.now() + 20_000).toISOString() });
    await sender.send("t2", "SANDBOX", "com.app", PAYLOAD);
    const after = Math.floor(Date.now() / 1000);

    const shortExp = Number(requests[0]["apns-expiration"]);
    const defaultExp = Number(requests[1]["apns-expiration"]);
    expect(shortExp).toBeGreaterThanOrEqual(before + 19);
    expect(shortExp).toBeLessThanOrEqual(after + 21);
    expect(defaultExp).toBeGreaterThanOrEqual(before + 60);
    expect(defaultExp).toBeLessThanOrEqual(after + 60);
    sender.closeAll();
    await close();
  });

  it("body VoIP mang callVersion/expiresAt/scopeKind/originDeviceId khi có (khoá phẳng, không bọc aps)", async () => {
    let received = "";
    const server = http2.createServer((req, res) => {
      req.setEncoding("utf-8");
      req.on("data", (chunk: string) => {
        received += chunk;
      });
      req.on("end", () => {
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const sender = new ApnsVoipPushSender({ keyId: "K", teamId: "T", privateKey: TEST_PRIVATE_KEY, sandboxHost: `http://127.0.0.1:${port}` });
    const expiresAt = new Date(Date.now() + 30_000).toISOString();

    await sender.send("t1", "SANDBOX", "com.app", { ...PAYLOAD, callVersion: "2", expiresAt, scopeKind: "GROUP", originDeviceId: "dev-a1" });

    expect(JSON.parse(received)).toMatchObject({ callVersion: "2", expiresAt, scopeKind: "GROUP", originDeviceId: "dev-a1", callUuid: PAYLOAD.callUuid });
    expect(JSON.parse(received)).not.toHaveProperty("aps");
    sender.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("lỗi kết nối (server không tồn tại) → retriable true, không throw", async () => {
    const sender = new ApnsVoipPushSender({
      keyId: "K",
      teamId: "T",
      privateKey: TEST_PRIVATE_KEY,
      sandboxHost: "http://127.0.0.1:1",
    });

    const result = await sender.send("token", "SANDBOX", "com.app", PAYLOAD);

    expect(result.retriable).toBe(true);
    expect(result.ok).toBe(false);
    sender.closeAll();
  });
});

describe("voipExpirationEpoch", () => {
  const NOW = Date.UTC(2026, 8, 26, 9, 0, 0);
  const nowSec = Math.floor(NOW / 1000);

  it("min(now + 60, expiresAt)", () => {
    expect(voipExpirationEpoch({ expiresAt: new Date(NOW + 45_000).toISOString() }, NOW)).toBe(nowSec + 45);
    expect(voipExpirationEpoch({ expiresAt: new Date(NOW + 600_000).toISOString() }, NOW)).toBe(nowSec + 60);
  });

  it("thiếu/sai định dạng expiresAt → now + 60 (như trước p2-02)", () => {
    expect(voipExpirationEpoch({}, NOW)).toBe(nowSec + 60);
    expect(voipExpirationEpoch({ expiresAt: "hỏng" }, NOW)).toBe(nowSec + 60);
  });

  it("đã quá hạn → epoch trong quá khứ (không âm) — APNs bỏ; job push.voip cũng đã chặn lượt gửi trễ", () => {
    expect(voipExpirationEpoch({ expiresAt: new Date(NOW - 5_000).toISOString() }, NOW)).toBe(nowSec - 5);
    expect(voipExpirationEpoch({ expiresAt: new Date(0).toISOString() }, NOW)).toBe(0);
  });
});
