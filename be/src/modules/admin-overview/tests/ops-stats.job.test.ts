/**
 * Cron `ops.stats-broadcast` (p0-03): chỉ quét + phát `ops:stats` khi có admin ở room `admin:ops`; payload chỉ SỐ đếm; đăng ký cron TĨNH 30 giây.
 */
const mockHasWatchers = jest.fn();
jest.mock("../../../infrastructure/socket/socket.ops-watch", () => ({ hasOpsWatchers: (...a: unknown[]) => mockHasWatchers(...a) }));

const mockCountAll = jest.fn();
jest.mock("../../../infrastructure/socket", () => ({ registryCountAll: (...a: unknown[]) => mockCountAll(...a) }));

const mockEmitToRoom = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));

const mockDefineCron = jest.fn();
const mockRegisterJob = jest.fn();
jest.mock("../../../infrastructure/queue", () => ({
  defineCron: (...a: unknown[]) => mockDefineCron(...a),
  registerJob: (...a: unknown[]) => mockRegisterJob(...a),
}));

import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { OPS_STATS_JOB, broadcastOpsStats } from "../jobs/ops-stats.job";

// `resetMocks: true` xoá lịch sử lời gọi trước MỖI test — chụp lại các lời gọi lúc import (registerJob/defineCron chạy ở module scope).
const registeredJobs = [...mockRegisterJob.mock.calls];
const definedCrons = [...mockDefineCron.mock.calls];

describe("broadcastOpsStats", () => {
  beforeEach(() => {
    mockHasWatchers.mockReset();
    mockCountAll.mockReset().mockResolvedValue({ onlineUsers: 7, socketConnections: 11 });
    mockEmitToRoom.mockReset();
  });

  it("không có admin nào ở admin:ops → KHÔNG quét registry, KHÔNG phát", async () => {
    mockHasWatchers.mockResolvedValue(false);
    expect(await broadcastOpsStats()).toEqual({ sent: false });
    expect(mockCountAll).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it("có người xem → phát ops:stats tới room admin:ops với đúng hai số đếm (không danh tính)", async () => {
    mockHasWatchers.mockResolvedValue(true);
    expect(await broadcastOpsStats()).toEqual({ sent: true });
    expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
    expect(mockEmitToRoom).toHaveBeenCalledWith("admin:ops", SocketEvent.OPS_STATS, { socketConnections: 11, onlineUsers: 7 });
    expect(SocketEvent.OPS_STATS).toBe("ops:stats");
  });

  it("đăng ký processor + cron TĨNH 30 giây trên queue cron (không scheduler theo-thực-thể)", () => {
    expect(registeredJobs).toEqual([["cron", OPS_STATS_JOB, expect.any(Function)]]);
    expect(definedCrons).toEqual([
      [expect.objectContaining({ schedulerId: OPS_STATS_JOB, queue: "cron", jobName: OPS_STATS_JOB, pattern: "*/30 * * * * *" })],
    ]);
  });
});
