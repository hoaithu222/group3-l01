/**
 * socket.ratelimit — token bucket (be.md p0-03 §5.7/§9) + packet middleware
 * (whitelist / RT-12 payload quá khổ / RT-429 hết token). `consumeToken`
 * nhận `nowMs` tường minh để test không phụ thuộc đồng hồ thật.
 */
import type { Socket } from "socket.io";
import {
  consumeToken,
  clearRateLimit,
  clearAllRateLimits,
  registerRateLimiter,
} from "../socket.ratelimit";
import { SocketEvent } from "../socket.events";

describe("consumeToken — token bucket theo socket/category", () => {
  afterEach(() => clearAllRateLimits());

  it("typing: capacity 2 — 2 lần đầu qua, lần 3 (cùng thời điểm) bị chặn", () => {
    expect(consumeToken("s1", "typing", 0)).toBe(true);
    expect(consumeToken("s1", "typing", 0)).toBe(true);
    expect(consumeToken("s1", "typing", 0)).toBe(false);
  });

  it("typing: refill 1 token/s — sau 1000ms lại có 1 lượt (RT-08: spam 20/s chỉ ≤1/s đi qua)", () => {
    consumeToken("s1", "typing", 0);
    consumeToken("s1", "typing", 0);
    expect(consumeToken("s1", "typing", 500)).toBe(false);
    expect(consumeToken("s1", "typing", 1000)).toBe(true);
    expect(consumeToken("s1", "typing", 1000)).toBe(false);
  });

  it("presence: capacity 1, refill 1/10s", () => {
    expect(consumeToken("s2", "presence", 0)).toBe(true);
    expect(consumeToken("s2", "presence", 5_000)).toBe(false);
    expect(consumeToken("s2", "presence", 10_000)).toBe(true);
  });

  it("room: capacity 20/10s (roomJoinPerWindow/roomJoinWindowSeconds)", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(consumeToken("s3", "room", 0)).toBe(true);
    }
    expect(consumeToken("s3", "room", 0)).toBe(false);
  });

  it("authRefresh: capacity 3/60s", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(consumeToken("s4", "authRefresh", 0)).toBe(true);
    }
    expect(consumeToken("s4", "authRefresh", 0)).toBe(false);
  });

  it("bucket độc lập theo socketId — socket khác không bị ảnh hưởng", () => {
    expect(consumeToken("s5", "typing", 0)).toBe(true);
    expect(consumeToken("s5", "typing", 0)).toBe(true);
    expect(consumeToken("s5", "typing", 0)).toBe(false);
    expect(consumeToken("s6", "typing", 0)).toBe(true);
  });

  it("clearRateLimit reset bucket của 1 socket (gọi lúc disconnect)", () => {
    consumeToken("s7", "typing", 0);
    consumeToken("s7", "typing", 0);
    expect(consumeToken("s7", "typing", 0)).toBe(false);
    clearRateLimit("s7");
    expect(consumeToken("s7", "typing", 0)).toBe(true);
  });
});

describe("registerRateLimiter — packet middleware", () => {
  afterEach(() => clearAllRateLimits());

  function makeSocket(id: string): {
    socket: Socket;
    dispatch: (packet: unknown[]) => { nextCalled: boolean; nextErr?: Error };
  } {
    let middleware: ((packet: unknown[], next: (err?: Error) => void) => void) | undefined;
    const socket = {
      id,
      use(fn: typeof middleware) {
        middleware = fn;
        return socket;
      },
    } as unknown as Socket;

    const dispatch = (packet: unknown[]) => {
      let nextCalled = false;
      let nextErr: Error | undefined;
      middleware?.(packet, (err) => {
        nextCalled = true;
        nextErr = err;
      });
      return { nextCalled, nextErr };
    };

    return { socket, dispatch };
  }

  it("sự kiện KHÔNG trong whitelist → bỏ (không gọi next, không ack)", () => {
    const { socket, dispatch } = makeSocket("w1");
    registerRateLimiter(socket);
    const ack = jest.fn();
    const { nextCalled } = dispatch(["some:unknown-event", {}, ack]);
    expect(nextCalled).toBe(false);
    expect(ack).not.toHaveBeenCalled();
  });

  it("payload > 16 KiB (RT-12) → ack RT_413, không forward", () => {
    const { socket, dispatch } = makeSocket("w2");
    registerRateLimiter(socket);
    const ack = jest.fn();
    const bigPayload = { data: "x".repeat(20 * 1024) }; // ~20 KiB
    const { nextCalled } = dispatch([SocketEvent.TYPING_START, bigPayload, ack]);
    expect(nextCalled).toBe(false);
    expect(ack).toHaveBeenCalledWith({ ok: false, code: "RT_413" });
  });

  it("hết token (RT_429) → ack lỗi, không forward — sự kiện hợp lệ trước đó vẫn qua", () => {
    const { socket, dispatch } = makeSocket("w3");
    registerRateLimiter(socket);
    const ack1 = jest.fn();
    const ack2 = jest.fn();
    const ack3 = jest.fn();

    // typing capacity = 2
    expect(dispatch([SocketEvent.TYPING_START, { scopeType: "CHANNEL" }, ack1]).nextCalled).toBe(true);
    expect(dispatch([SocketEvent.TYPING_START, { scopeType: "CHANNEL" }, ack2]).nextCalled).toBe(true);
    const third = dispatch([SocketEvent.TYPING_START, { scopeType: "CHANNEL" }, ack3]);
    expect(third.nextCalled).toBe(false);
    expect(ack3).toHaveBeenCalledWith({ ok: false, code: "RT_429" });
    expect(ack1).not.toHaveBeenCalled();
    expect(ack2).not.toHaveBeenCalled();
  });

  it("sự kiện hợp lệ, trong hạn mức → forward (gọi next())", () => {
    const { socket, dispatch } = makeSocket("w4");
    registerRateLimiter(socket);
    const { nextCalled } = dispatch([SocketEvent.JOIN_ROOM, { kind: "ch", id: "1" }]);
    expect(nextCalled).toBe(true);
  });
});
