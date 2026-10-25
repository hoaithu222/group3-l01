import type { Request, Response, NextFunction } from "express";
import { requireTrustedOrigin, resetTrustedOriginCacheForTests } from "../trusted-origin";
import { ForbiddenError } from "../../exceptions";
import { getAllowedOrigins } from "../../config";

jest.mock("../../config", () => ({
  getAllowedOrigins: jest.fn(),
}));

function buildReq(headers: Record<string, string>): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

function run(headers: Record<string, string>): unknown {
  const next = jest.fn() as unknown as NextFunction;
  requireTrustedOrigin()(buildReq(headers), {} as Response, next);
  return (next as jest.Mock).mock.calls[0]?.[0];
}

describe("requireTrustedOrigin (CSRF cho refresh bằng cookie)", () => {
  beforeEach(() => {
    resetTrustedOriginCacheForTests();
    (getAllowedOrigins as jest.Mock).mockReturnValue(["https://admin.super-app.vn", "http://localhost:5173"]);
  });

  it("không có Origin (app di động dùng body, curl, server-to-server) ⇒ cho qua", () => {
    expect(run({})).toBeUndefined();
  });

  it("Origin nằm trong ALLOWED_ORIGINS ⇒ cho qua", () => {
    expect(run({ Origin: "https://admin.super-app.vn" })).toBeUndefined();
    expect(run({ Origin: "http://localhost:5173" })).toBeUndefined();
  });

  it("Origin lạ ⇒ ForbiddenError 403 (kể cả khi cùng site khác origin)", () => {
    const err = run({ Origin: "https://evil.super-app.vn" });

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).toMatchObject({ statusCode: 403 });
  });

  it("so khớp NGUYÊN origin: khác cổng/khác scheme/hậu tố đều bị chặn", () => {
    expect(run({ Origin: "http://localhost:5174" })).toBeInstanceOf(ForbiddenError);
    expect(run({ Origin: "http://admin.super-app.vn" })).toBeInstanceOf(ForbiddenError);
    expect(run({ Origin: "https://admin.super-app.vn.evil.com" })).toBeInstanceOf(ForbiddenError);
  });

  it('"Origin: null" (iframe sandbox, một số chuyển hướng) ⇒ bị chặn', () => {
    expect(run({ Origin: "null" })).toBeInstanceOf(ForbiddenError);
  });

  it("cùng origin với API (vd Swagger UI ở dev) ⇒ cho qua", () => {
    expect(run({ Origin: "http://localhost:3000", Host: "localhost:3000" })).toBeUndefined();
    expect(run({ Origin: "http://localhost:3000", Host: "api.khac.com" })).toBeInstanceOf(ForbiddenError);
  });

  it("dev với ALLOWED_ORIGINS=* (getAllowedOrigins() = true) ⇒ cho qua mọi origin", () => {
    (getAllowedOrigins as jest.Mock).mockReturnValue(true);

    expect(run({ Origin: "https://bat-ky-dau.example.com" })).toBeUndefined();
  });

  it("allowlist rỗng ⇒ chặn mọi Origin (không cấu hình = đóng)", () => {
    (getAllowedOrigins as jest.Mock).mockReturnValue([]);

    expect(run({ Origin: "https://admin.super-app.vn" })).toBeInstanceOf(ForbiddenError);
  });
});
