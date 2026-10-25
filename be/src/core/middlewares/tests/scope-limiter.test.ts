import type { Request, Response, NextFunction } from "express";
import { scopeLimiter } from "../scope-limiter";
import { ScopeRateLimitError } from "../../exceptions";

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn().mockResolvedValue(undefined),
  },
}));

import { redis } from "../../../infrastructure/redis";

describe("scopeLimiter", () => {
  it("cho qua tới khi vượt max, sau đó ném ScopeRateLimitError (429)", async () => {
    const incrMock = redis.incr as jest.Mock;
    incrMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);

    const middleware = scopeLimiter("test", () => "user-1", [{ max: 5, windowSeconds: 5 }]);
    const req = {} as Request;
    const res = {} as Response;

    for (let i = 0; i < 5; i++) {
      const next = jest.fn() as unknown as NextFunction;
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }

    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ScopeRateLimitError));
  });

  it("Redis không khả dụng (incr trả null) → cho qua", async () => {
    (redis.incr as jest.Mock).mockResolvedValueOnce(null);
    const middleware = scopeLimiter("test2", () => "user-2", [{ max: 1, windowSeconds: 5 }]);
    const next = jest.fn() as unknown as NextFunction;
    await middleware({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("keyFn trả null → bỏ qua giới hạn", async () => {
    const middleware = scopeLimiter("test3", () => null, [{ max: 1, windowSeconds: 5 }]);
    const next = jest.fn() as unknown as NextFunction;
    await middleware({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
