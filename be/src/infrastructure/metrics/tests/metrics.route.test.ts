import type { Request, Response } from "express";

jest.mock("../../queue", () => ({
  QUEUE_NAMES: ["cron"],
  getQueue: jest.fn(() => ({
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 3 }),
  })),
}));

import { metricsHandler } from "../metrics.route";

function mockRes(): Response {
  const res = {
    statusCode: 200,
    status: jest.fn(function (this: Response, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
  };
  return res as unknown as Response;
}

describe("metricsHandler", () => {
  it("localhost không cần token — trả prometheus text có http_request_duration_seconds", async () => {
    const req = { ip: "127.0.0.1", header: jest.fn().mockReturnValue(undefined) } as unknown as Request;
    const res = mockRes();

    await metricsHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", expect.stringContaining("text/plain"));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining("http_request_duration_seconds"));
  });

  it("request ngoài localhost không có METRICS_TOKEN (env trống) → 401", async () => {
    const req = { ip: "203.0.113.10", header: jest.fn().mockReturnValue(undefined) } as unknown as Request;
    const res = mockRes();

    await metricsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "AUTH_002" }) })
    );
  });
});
