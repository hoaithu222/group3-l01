import type { NextFunction, Request, Response } from "express";
import { internalSecretMatches, requireInternalSecret } from "../internal-auth";

const SECRET = "internal-auth-test-secret-0123456789-abcdef";

jest.mock("../../config", () => ({ env: { COLLAB_SHARED_SECRET: "internal-auth-test-secret-0123456789-abcdef" } }));

function run(header: string | undefined): unknown {
  const req = { header: (name: string) => (name.toLowerCase() === "x-collab-secret" ? header : undefined) } as unknown as Request;
  const next = jest.fn() as unknown as NextFunction & jest.Mock;
  requireInternalSecret("collab")(req, {} as Response, next);
  return next.mock.calls[0]?.[0];
}

describe("requireInternalSecret('collab')", () => {
  it("đúng bí mật → cho qua (next không lỗi)", () => {
    expect(run(SECRET)).toBeUndefined();
  });

  it("thiếu / sai / khác độ dài → 401 AUTH_002", () => {
    for (const bad of [undefined, "", "sai", `${SECRET}x`, SECRET.slice(0, -1), SECRET.toUpperCase()]) {
      expect(run(bad)).toMatchObject({ statusCode: 401, errorCode: "AUTH_002" });
    }
  });

  it("internalSecretMatches so sánh chính xác, không lộ theo độ dài", () => {
    expect(internalSecretMatches(SECRET, SECRET)).toBe(true);
    expect(internalSecretMatches("a", SECRET)).toBe(false);
    expect(internalSecretMatches(undefined, SECRET)).toBe(false);
  });
});
