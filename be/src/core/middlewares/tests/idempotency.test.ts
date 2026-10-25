import type { Request, Response, NextFunction } from "express";
import { idempotencyKey } from "../idempotency";
import { IdempotencyInProgressError, ValidationError } from "../../exceptions";

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

import { redis } from "../../../infrastructure/redis";

function buildRes(): Response {
  const res = {
    statusCode: 200,
    json: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as Response;
  return res;
}

describe("idempotencyKey", () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
  });

  it("không có header và không required → next() không lỗi", async () => {
    const middleware = idempotencyKey("test-scope");
    const req = { header: () => undefined, body: {}, user: { id: "u1" } } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, buildRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it("required=true và thiếu key → ValidationError", async () => {
    const middleware = idempotencyKey("test-scope", { required: true });
    const req = { header: () => undefined, body: {}, user: { id: "u1" } } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, buildRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it("key hợp lệ, chưa xử lý trước đó → đặt PENDING rồi next()", async () => {
    const middleware = idempotencyKey("test-scope");
    const req = {
      header: () => "a-valid-key-123",
      body: {},
      user: { id: "u1" },
    } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, buildRes(), next);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining("idem:u1:test-scope:"),
      "PENDING",
      60
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("key đang PENDING → IdempotencyInProgressError", async () => {
    (redis.get as jest.Mock).mockResolvedValue("PENDING");
    const middleware = idempotencyKey("test-scope");
    const req = {
      header: () => "a-valid-key-123",
      body: {},
      user: { id: "u1" },
    } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, buildRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(IdempotencyInProgressError));
  });

  it("key đã có response lưu sẵn → replay, đặt header Idempotent-Replayed", async () => {
    (redis.get as jest.Mock).mockResolvedValue({ status: 201, body: { data: { assetId: "a1" } } });
    const middleware = idempotencyKey("test-scope");
    const req = {
      header: () => "a-valid-key-123",
      body: {},
      user: { id: "u1" },
    } as unknown as Request;
    const res = buildRes();
    (res.status as unknown) = jest.fn().mockReturnValue(res);
    const next = jest.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Idempotent-Replayed", "true");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { assetId: "a1" } });
    expect(next).not.toHaveBeenCalled();
  });

  describe("lưu phản hồi theo mã trạng thái", () => {
    /** Chạy middleware với key hợp lệ rồi để handler trả `status` — trả về lệnh `redis.set` CUỐI CÙNG (lúc `res.json`). */
    async function runAndRespond(status: number, body: unknown): Promise<unknown[]> {
      const req = { header: () => "a-valid-key-123", body: {}, user: { id: "u1" } } as unknown as Request;
      const res = buildRes();
      const original = res.json as jest.Mock;
      await idempotencyKey("test-scope")(req, res, jest.fn() as unknown as NextFunction);
      (redis.set as jest.Mock).mockClear();

      res.statusCode = status;
      res.json(body);

      expect(original).toHaveBeenCalledWith(body);
      expect(redis.set).toHaveBeenCalledTimes(1);
      return (redis.set as jest.Mock).mock.calls[0];
    }

    it("2xx và 4xx kết luận về chính yêu cầu (400/409/422) → lưu { status, body } 24 giờ", async () => {
      for (const status of [201, 400, 409, 422]) {
        const body = { status, marker: "x" };
        expect(await runAndRespond(status, body)).toEqual([expect.stringContaining("idem:u1:test-scope:"), { status, body }, 24 * 3600]);
      }
    });

    it("429 (hạn mức của scopeLimiter đặt sau) → KHÔNG lưu, nhả khoá để cùng key thử lại được khi hết chặn", async () => {
      expect(await runAndRespond(429, { error: { code: "RATE_003" } })).toEqual([expect.stringContaining("idem:u1:test-scope:"), "", 1]);
    });

    it("5xx → không lưu, nhả khoá", async () => {
      expect(await runAndRespond(503, { error: { code: "SYS_503" } })).toEqual([expect.stringContaining("idem:u1:test-scope:"), "", 1]);
    });
  });

  it("key không hợp lệ (quá ngắn) → ValidationError", async () => {
    const middleware = idempotencyKey("test-scope");
    const req = { header: () => "short", body: {}, user: { id: "u1" } } as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;
    await middleware(req, buildRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});
