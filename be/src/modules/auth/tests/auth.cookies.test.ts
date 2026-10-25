import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import type { AuthService } from "../services/auth.service";

/**
 * Cờ cookie refresh token (web, `X-Client-Platform` vắng). Cờ tính từ `env.NODE_ENV` lúc NẠP controller nên mỗi
 * môi trường dựng controller trong một registry module riêng (`jest.isolateModules`) với `core/config` được
 * ghi đè `NODE_ENV`. Production: Secure + SameSite=Strict + HttpOnly; Path thu hẹp `/api/v1/auth`; Max-Age 7 ngày.
 */
const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token-abc",
  user: { id: "u1", email: "a@e.com" },
};

function buildApp(nodeEnv: "production" | "test"): express.Express {
  let app!: express.Express;
  jest.isolateModules(() => {
    jest.doMock("../../../core/config", () => {
      const actual = jest.requireActual("../../../core/config") as { env: Record<string, unknown> };
      return { ...actual, env: { ...actual.env, NODE_ENV: nodeEnv } };
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAuthController } = require("../controllers/auth.controller") as typeof import("../controllers/auth.controller");
    // Hàm thường, KHÔNG dùng jest.fn(): `resetMocks: true` (jest.config.ts) xoá implementation của mọi jest.fn() trước mỗi test.
    const service = {
      login: () => Promise.resolve(tokens),
      refreshToken: () => Promise.resolve({ ...tokens, refreshToken: "refresh-token-moi" }),
      logout: () => Promise.resolve(),
    } as unknown as AuthService;
    const controller = createAuthController(service);
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.post("/login", controller.login);
    app.post("/refresh", controller.refreshToken);
    app.post(
      "/logout",
      (req, _res, next) => {
        req.user = { id: "u1", email: "a@e.com" };
        next();
      },
      controller.logout
    );
  });
  return app;
}

function cookieOf(res: request.Response, name: string): string {
  const all = res.headers["set-cookie"] as unknown as string[] | undefined;
  return (all ?? []).find((c) => c.startsWith(`${name}=`)) ?? "";
}

describe("cookie refresh token — production", () => {
  const app = buildApp("production");

  it("login (web): refresh_token HttpOnly + Secure + SameSite=Strict + Path=/api/v1/auth + Max-Age 7 ngày", async () => {
    const res = await request(app).post("/login").send({ email: "a@e.com", password: "x" });

    const refresh = cookieOf(res, "refresh_token");
    expect(refresh).toContain("refresh_token=refresh-token-abc");
    expect(refresh).toMatch(/;\s*HttpOnly/i);
    expect(refresh).toMatch(/;\s*Secure/i);
    expect(refresh).toMatch(/;\s*SameSite=Strict/i);
    expect(refresh).toContain("Path=/api/v1/auth");
    expect(refresh).toContain("Max-Age=604800");
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it("KHÔNG còn đặt cờ is_authenticated ở login/refresh (đã gỡ: Path hẹp nên trang không đọc được, SameSite=Lax trong khi refresh là Strict, không client nào dùng)", async () => {
    const login = await request(app).post("/login").send({ email: "a@e.com", password: "x" });
    const refresh = await request(app).post("/refresh").set("Cookie", "refresh_token=cu").send({});

    expect(cookieOf(login, "is_authenticated")).toBe("");
    expect(cookieOf(refresh, "is_authenticated")).toBe("");
    expect(cookieOf(login, "refresh_token")).not.toBe("");
  });

  it("refresh bằng cookie xoay lại cookie với đúng cờ; app (X-Client-Platform) KHÔNG bao giờ nhận cookie", async () => {
    const web = await request(app).post("/refresh").set("Cookie", "refresh_token=cu").send({});
    const mobile = await request(app).post("/login").set("X-Client-Platform", "ANDROID").send({ email: "a@e.com", password: "x" });

    const rotated = cookieOf(web, "refresh_token");
    expect(rotated).toContain("refresh_token=refresh-token-moi");
    expect(rotated).toMatch(/HttpOnly/i);
    expect(rotated).toMatch(/Secure/i);
    expect(rotated).toMatch(/SameSite=Strict/i);
    expect(mobile.headers["set-cookie"]).toBeUndefined();
    expect(mobile.body.data.refreshToken).toBe("refresh-token-abc");
  });

  it("logout xoá cookie với CÙNG Path/cờ (Max-Age=0, Expires đã qua) — không để cookie sót lại ở path khác", async () => {
    const res = await request(app).post("/logout").set("Authorization", "Bearer x").send({});

    const cleared = cookieOf(res, "refresh_token");
    expect(cleared).toContain("Path=/api/v1/auth");
    expect(cleared).toMatch(/Max-Age=0/);
    // Max-Age=0 đã đủ để trình duyệt xoá; Expires (nếu có) không được ở tương lai.
    const expires = /Expires=([^;]+)/.exec(cleared)?.[1];
    expect(expires).toBeDefined();
    expect(new Date(expires as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(cleared).toMatch(/HttpOnly/i);
    expect(cleared).toMatch(/Secure/i);
    expect(cleared).toMatch(/SameSite=Strict/i);
    // Bản cũ của cờ (nếu trình duyệt còn giữ) vẫn được xoá đúng Path để không sót lại.
    expect(cookieOf(res, "is_authenticated")).toContain("Path=/api/v1/auth");
  });
});

describe("cookie refresh token — dev/test (HTTP, không Secure)", () => {
  const app = buildApp("test");

  it("SameSite=Lax, không Secure (localhost HTTP), vẫn HttpOnly + Path thu hẹp", async () => {
    const res = await request(app).post("/login").send({ email: "a@e.com", password: "x" });

    const refresh = cookieOf(res, "refresh_token");
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).not.toMatch(/Secure/i);
    expect(refresh).toContain("Path=/api/v1/auth");
  });
});
