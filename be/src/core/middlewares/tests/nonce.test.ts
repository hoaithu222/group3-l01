import type { Request, Response, NextFunction } from "express";
import { requireNonce } from "../nonce";
import { UnauthorizedError } from "../../exceptions";

jest.mock("../../utils/nonce", () => ({
  NonceUtils: { consume: jest.fn() },
}));

import { NonceUtils } from "../../utils/nonce";

function buildReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

describe("requireNonce middleware", () => {
  it("nonce hợp lệ (consume trả true) → next() không có lỗi", async () => {
    (NonceUtils.consume as jest.Mock).mockResolvedValue(true);
    const next = jest.fn() as unknown as NextFunction;

    await requireNonce()(buildReq({ nonce: "a".repeat(32) }), {} as Response, next);

    expect(NonceUtils.consume).toHaveBeenCalledWith("a".repeat(32));
    expect(next).toHaveBeenCalledWith();
  });

  it("thiếu field nonce trong body → next(UnauthorizedError AUTH_018), KHÔNG gọi consume", async () => {
    const next = jest.fn() as unknown as NextFunction;

    await requireNonce()(buildReq({}), {} as Response, next);

    expect(NonceUtils.consume).not.toHaveBeenCalled();
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.errorCode).toBe("AUTH_018");
    expect(err.statusCode).toBe(401);
  });

  it("consume() trả false (đã dùng / hết hạn / chưa từng cấp) → CÙNG lỗi AUTH_018", async () => {
    (NonceUtils.consume as jest.Mock).mockResolvedValue(false);
    const next = jest.fn() as unknown as NextFunction;

    await requireNonce()(buildReq({ nonce: "b".repeat(32) }), {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.errorCode).toBe("AUTH_018");
    expect(err.message).toBe("Mã nonce không hợp lệ hoặc đã hết hạn, vui lòng lấy mã mới");
  });

  it("hỗ trợ fieldName tuỳ chỉnh", async () => {
    (NonceUtils.consume as jest.Mock).mockResolvedValue(true);
    const next = jest.fn() as unknown as NextFunction;

    await requireNonce("customNonce")(
      buildReq({ customNonce: "c".repeat(32) }),
      {} as Response,
      next
    );

    expect(NonceUtils.consume).toHaveBeenCalledWith("c".repeat(32));
    expect(next).toHaveBeenCalledWith();
  });

  it("nonce không phải string (vd number) → next(AUTH_018), KHÔNG gọi consume", async () => {
    const next = jest.fn() as unknown as NextFunction;

    await requireNonce()(buildReq({ nonce: 12345 }), {} as Response, next);

    expect(NonceUtils.consume).not.toHaveBeenCalled();
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err.errorCode).toBe("AUTH_018");
  });
});
