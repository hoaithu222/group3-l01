import http from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { isDraining, resetDrainForTests, startDrain } from "../drain";

/** p0-11 §5.2 / OPS-13: SIGTERM → health draining; socket của replica bị ngắt để client kết nối lại nơi khác; replica khác (Redis adapter) không bị đụng. */
describe("startDrain", () => {
  afterEach(() => resetDrainForTests());

  it("bật cờ ngay; sau độ trễ mới ngắt socket qua io.local (không broadcast toàn cụm)", () => {
    jest.useFakeTimers();
    try {
      const disconnectSockets = jest.fn();
      const io = { local: { disconnectSockets } };

      startDrain(io, 2000);

      expect(isDraining()).toBe(true);
      expect(disconnectSockets).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1999);
      expect(disconnectSockets).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("không có Socket.IO (worker/test) → chỉ bật cờ, không hẹn giờ", () => {
    expect(startDrain(null, 10)).toBeNull();
    expect(isDraining()).toBe(true);
  });

  it("Socket.IO thật: client nhận disconnect 'io server disconnect' (để tự kết nối lại nơi khác) và httpServer.close() gọi được callback", async () => {
    const httpServer = http.createServer();
    const server = new Server(httpServer, { transports: ["websocket"] });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address() as AddressInfo;
    const client: Socket = connect(`http://127.0.0.1:${port}`, { transports: ["websocket"], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("connect_error", reject);
      });

      const disconnected = new Promise<string>((resolve) => client.once("disconnect", resolve));
      const closed = new Promise<void>((resolve) => httpServer.close(() => resolve()));
      startDrain(server, 20);

      await expect(disconnected).resolves.toBe("io server disconnect");
      // Không còn socket giữ kết nối ⇒ callback của httpServer.close() được gọi (không bị treo tới force-exit).
      await expect(closed).resolves.toBeUndefined();
    } finally {
      client.close();
      await server.close();
    }
  });
});
