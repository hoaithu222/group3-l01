import dgram from "node:dgram";
import { AddressInfo } from "node:net";
import { buildStunBindingRequest, isStunBindingSuccess, probeStunUdp, probeTls, runTurnProbe, type TurnProbeDeps } from "../turn-probe";

/** Máy chủ UDP giả: trả lời STUN Binding Success (đúng/sai transaction id) hoặc im lặng. */
function fakeStunServer(mode: "ok" | "wrong-txid" | "silent"): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = dgram.createSocket("udp4");
    server.on("message", (msg, rinfo) => {
      if (mode === "silent") return;
      const reply = Buffer.from(msg);
      reply.writeUInt16BE(0x0101, 0); // Binding Success
      if (mode === "wrong-txid") reply[10] ^= 0xff;
      server.send(reply, rinfo.port, rinfo.address);
    });
    server.bind(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() }));
  });
}

describe("STUN Binding (RFC 5389)", () => {
  it("Binding Request: 20 byte, type 0x0001, độ dài 0, magic cookie 0x2112A442, transaction id ngẫu nhiên 12 byte", () => {
    const a = buildStunBindingRequest();
    const b = buildStunBindingRequest();
    expect(a.packet).toHaveLength(20);
    expect(a.packet.readUInt16BE(0)).toBe(0x0001);
    expect(a.packet.readUInt16BE(2)).toBe(0);
    expect(a.packet.readUInt32BE(4)).toBe(0x2112a442);
    expect(a.packet.subarray(8)).toEqual(a.transactionId);
    expect(a.transactionId.equals(b.transactionId)).toBe(false);
  });

  it("isStunBindingSuccess: chỉ nhận Binding Success đúng cookie + transaction id", () => {
    const { packet, transactionId } = buildStunBindingRequest();
    const ok = Buffer.from(packet);
    ok.writeUInt16BE(0x0101, 0);
    expect(isStunBindingSuccess(ok, transactionId)).toBe(true);
    expect(isStunBindingSuccess(packet, transactionId)).toBe(false); // vẫn là Request
    const wrongCookie = Buffer.from(ok);
    wrongCookie.writeUInt32BE(1, 4);
    expect(isStunBindingSuccess(wrongCookie, transactionId)).toBe(false);
    expect(isStunBindingSuccess(ok, Buffer.alloc(12))).toBe(false);
    expect(isStunBindingSuccess(Buffer.alloc(8), transactionId)).toBe(false);
  });
});

describe("probeStunUdp", () => {
  it("máy chủ trả Binding Success → ok kèm latency", async () => {
    const server = await fakeStunServer("ok");
    try {
      const step = await probeStunUdp("127.0.0.1", server.port, 1500);
      expect(step.ok).toBe(true);
      expect(step.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      server.close();
    }
  });

  it("phản hồi sai transaction id bị bỏ qua → hết thời gian chờ", async () => {
    const server = await fakeStunServer("wrong-txid");
    try {
      const step = await probeStunUdp("127.0.0.1", server.port, 300);
      expect(step).toEqual({ ok: false, error: "hết thời gian chờ" });
    } finally {
      server.close();
    }
  });

  it("máy chủ im lặng → hết thời gian chờ, không treo và không ném", async () => {
    const server = await fakeStunServer("silent");
    try {
      const startedAt = Date.now();
      const step = await probeStunUdp("127.0.0.1", server.port, 300);
      expect(step.ok).toBe(false);
      expect(Date.now() - startedAt).toBeLessThan(2000);
    } finally {
      server.close();
    }
  });
});

describe("probeTls", () => {
  it("cổng đóng → ok:false với mã lỗi (ECONNREFUSED), không ném", async () => {
    const closed = await new Promise<number>((resolve) => {
      const s = dgram.createSocket("udp4"); // lấy một cổng trống rồi bỏ đi
      s.bind(0, "127.0.0.1", () => {
        const { port } = s.address() as AddressInfo;
        s.close(() => resolve(port));
      });
    });
    const step = await probeTls("127.0.0.1", closed, 800);
    expect(step.ok).toBe(false);
    expect(typeof step.error).toBe("string");
  });
});

describe("runTurnProbe", () => {
  const now = () => new Date("2026-09-26T10:00:00.000Z");
  const deps = (udp: Awaited<ReturnType<TurnProbeDeps["udp"]>>, tls: Awaited<ReturnType<TurnProbeDeps["tls"]>>): TurnProbeDeps => ({
    udp: () => Promise.resolve(udp),
    tls: () => Promise.resolve(tls),
    now,
  });
  const target = { host: "turn.example.test", tlsPort: 443, udpPort: 3478 };

  it("cả hai đường ok → ok, không có error", async () => {
    const result = await runTurnProbe(target, deps({ ok: true, latencyMs: 12 }, { ok: true, latencyMs: 40, daysToExpiry: 60 }));
    expect(result).toEqual({ at: "2026-09-26T10:00:00.000Z", ok: true, udp: { ok: true, latencyMs: 12 }, tls: { ok: true, latencyMs: 40, daysToExpiry: 60 } });
  });

  it("một đường lỗi → ok=false, error nêu đúng đường (không lộ chi tiết khác)", async () => {
    const udpDown = await runTurnProbe(target, deps({ ok: false, error: "hết thời gian chờ" }, { ok: true, daysToExpiry: 10 }));
    expect(udpDown.ok).toBe(false);
    expect(udpDown.error).toBe("UDP 3478: hết thời gian chờ");

    const both = await runTurnProbe(target, deps({ ok: false, error: "ECONNREFUSED" }, { ok: false, error: "CERT_HAS_EXPIRED" }));
    expect(both.error).toBe("UDP 3478: ECONNREFUSED; TLS 443: CERT_HAS_EXPIRED");
  });
});
