import { randomBytes } from "node:crypto";
import dgram from "node:dgram";
import tls from "node:tls";

/**
 * Thăm dò TURN từ phía BE (p0-08 be.md §3/§7, p0-11): xác minh hai đường mà app phải dùng khi mạng chặn UDP media (D-24 "TURN bắt buộc"):
 *  · UDP `turn.<domain>:3478` — gửi STUN Binding Request (RFC 5389), máy chủ TURN phải trả Binding Success đúng transaction id;
 *  · TLS `turn.<domain>:443`  — bắt bắt tay TLS (SNI = host) VÀ kiểm chứng chỉ (hợp lệ, còn hạn) — cert hết hạn là nguyên nhân "gọi hỏng mà không ai biết" hay gặp nhất.
 * Không xin cấp phát (Allocate): LiveKit phát credential TURN theo phiên người dùng nên BE không có credential tĩnh — probe kiểm được "máy chủ sống + cert đúng", không phải
 * "relay chạy đầy đủ" (cái đó do spike MED-13 trên thiết bị kiểm).
 *
 * Mọi hàm nhận hạn `timeoutMs` và KHÔNG BAO GIỜ ném — lỗi trả về trong kết quả (`ok: false, error`).
 */
export interface ProbeStep {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface TlsProbeStep extends ProbeStep {
  /** Số ngày tới hạn của chứng chỉ (âm = đã hết hạn). */
  daysToExpiry?: number;
}

export interface TurnProbeTarget {
  host: string;
  tlsPort: number;
  udpPort: number;
  timeoutMs?: number;
}

export interface TurnProbeResult {
  at: string;
  ok: boolean;
  error?: string;
  udp: ProbeStep;
  tls: TlsProbeStep;
}

export const TURN_PROBE_TIMEOUT_MS = 3000;

const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_SUCCESS = 0x0101;

/** Binding Request rỗng: 20 byte header (type, length=0, magic cookie, 12 byte transaction id). */
export function buildStunBindingRequest(): { packet: Buffer; transactionId: Buffer } {
  const transactionId = randomBytes(12);
  const packet = Buffer.alloc(20);
  packet.writeUInt16BE(STUN_BINDING_REQUEST, 0);
  packet.writeUInt16BE(0, 2);
  packet.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(packet, 8);
  return { packet, transactionId };
}

/** Phản hồi hợp lệ = Binding Success (0x0101), đúng magic cookie và ĐÚNG transaction id của yêu cầu (chặn gói lạ/trễ). */
export function isStunBindingSuccess(response: Buffer, transactionId: Buffer): boolean {
  if (response.length < 20) return false;
  return (
    response.readUInt16BE(0) === STUN_BINDING_SUCCESS &&
    response.readUInt32BE(4) === STUN_MAGIC_COOKIE &&
    response.subarray(8, 20).equals(transactionId)
  );
}

/** STUN Binding qua UDP; gửi lại một lần ở nửa hạn (UDP có thể rớt gói). */
export function probeStunUdp(host: string, port: number, timeoutMs: number = TURN_PROBE_TIMEOUT_MS): Promise<ProbeStep> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const { packet, transactionId } = buildStunBindingRequest();
    const startedAt = Date.now();
    let settled = false;
    const timers: NodeJS.Timeout[] = [];

    const finish = (step: ProbeStep): void => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      try {
        socket.close();
      } catch {
        // socket đã đóng
      }
      resolve(step);
    };
    const send = (): void => {
      socket.send(packet, port, host, (err) => {
        if (err) finish({ ok: false, error: (err as NodeJS.ErrnoException).code ?? "lỗi gửi UDP" });
      });
    };

    socket.on("message", (msg) => {
      if (isStunBindingSuccess(msg, transactionId)) finish({ ok: true, latencyMs: Date.now() - startedAt });
    });
    socket.on("error", (err: Error) => finish({ ok: false, error: (err as NodeJS.ErrnoException).code ?? "lỗi socket UDP" }));
    timers.push(setTimeout(send, Math.floor(timeoutMs / 2)));
    timers.push(setTimeout(() => finish({ ok: false, error: "hết thời gian chờ" }), timeoutMs));
    send();
  });
}

/** Bắt tay TLS với SNI = host, kiểm chứng chỉ (`rejectUnauthorized`), đọc hạn dùng rồi đóng ngay. */
export function probeTls(host: string, port: number, timeoutMs: number = TURN_PROBE_TIMEOUT_MS): Promise<TlsProbeStep> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true, timeout: timeoutMs });

    const finish = (step: TlsProbeStep): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(step);
    };

    socket.once("secureConnect", () => {
      const validTo = socket.getPeerCertificate().valid_to;
      const expiresAt = validTo ? new Date(validTo).getTime() : Number.NaN;
      finish({
        ok: socket.authorized,
        latencyMs: Date.now() - startedAt,
        ...(Number.isNaN(expiresAt) ? {} : { daysToExpiry: Math.floor((expiresAt - Date.now()) / 86_400_000) }),
        ...(socket.authorized ? {} : { error: String(socket.authorizationError) }),
      });
    });
    socket.once("timeout", () => finish({ ok: false, error: "hết thời gian chờ" }));
    socket.once("error", (err: Error) => finish({ ok: false, error: (err as NodeJS.ErrnoException).code ?? err.message }));
  });
}

export interface TurnProbeDeps {
  udp: typeof probeStunUdp;
  tls: typeof probeTls;
  now: () => Date;
}

const DEFAULT_DEPS: TurnProbeDeps = { udp: probeStunUdp, tls: probeTls, now: () => new Date() };

/** Chạy hai bước SONG SONG; tổng `ok` chỉ khi CẢ HAI ok. `error` ngắn gọn, không chứa khoá/địa chỉ nội bộ. */
export async function runTurnProbe(target: TurnProbeTarget, deps: TurnProbeDeps = DEFAULT_DEPS): Promise<TurnProbeResult> {
  const timeoutMs = target.timeoutMs ?? TURN_PROBE_TIMEOUT_MS;
  const [udp, tlsStep] = await Promise.all([deps.udp(target.host, target.udpPort, timeoutMs), deps.tls(target.host, target.tlsPort, timeoutMs)]);
  const failures = [
    ...(udp.ok ? [] : [`UDP ${target.udpPort}: ${udp.error ?? "lỗi"}`]),
    ...(tlsStep.ok ? [] : [`TLS ${target.tlsPort}: ${tlsStep.error ?? "lỗi"}`]),
  ];
  return {
    at: deps.now().toISOString(),
    ok: failures.length === 0,
    ...(failures.length > 0 && { error: failures.join("; ") }),
    udp,
    tls: tlsStep,
  };
}
