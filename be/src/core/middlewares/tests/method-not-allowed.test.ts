import express from "express";
import request from "supertest";
import { errorHandler } from "../errorHandler";
import { methodNotAllowed } from "../method-not-allowed";

function appWith(allowed?: readonly string[]) {
  const app = express();
  app.use(express.json());
  app.use("/ro", methodNotAllowed(allowed), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("methodNotAllowed", () => {
  it.each(["patch", "put", "post", "delete"] as const)("%s → 405 CONTRIB_001 kèm header Allow", async (method) => {
    const res = await request(appWith(["GET"]))[method]("/ro").send({ members: [{ userId: "x", score: 100 }] });
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("GET");
    expect(res.body.error.code).toBe("CONTRIB_001");
    expect(res.body.error.details).toEqual({ allowed: ["GET"] });
  });

  it("GET và HEAD đi qua khi cho phép GET", async () => {
    const app = appWith(["GET"]);
    expect((await request(app).get("/ro")).status).toBe(200);
    expect((await request(app).head("/ro")).status).toBe(200);
  });

  it("cho phép nhiều phương thức và ghi đủ vào Allow", async () => {
    const app = appWith(["GET", "POST"]);
    expect((await request(app).post("/ro")).status).toBe(200);
    const res = await request(app).delete("/ro");
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("GET, POST");
  });
});
