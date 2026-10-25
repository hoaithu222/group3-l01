import jwt from "jsonwebtoken";
import { CollabTokenService, COLLAB_TOKEN_AUDIENCE, COLLAB_TOKEN_ISSUER, collabDocumentName, toWebSocketUrl } from "..";

const SECRET = "unit-test-collab-secret-0123456789-abcdefghijk";
const USER = "66f1a2b3c4d5e6f708192a3b";
const DOC = "66f1a2b3c4d5e6f708192a3c";
const NOW = new Date("2026-09-26T12:00:00.000Z");

const service = (over: Partial<{ secret: string | undefined; publicUrl: string | undefined }> = {}) =>
  new CollabTokenService({
    secret: () => ("secret" in over ? over.secret : SECRET),
    publicUrl: () => ("publicUrl" in over ? over.publicUrl : "wss://superapp.vcijsc.com/collab"),
    now: () => NOW,
  });

describe("CollabTokenService", () => {
  it("phát JWT HS256 aud=collab iss=superapp-be, sống đúng 5 phút, mang kind/docId/mode/sv", () => {
    const issued = service().issue({ userId: USER, sessionVersion: 7, kind: "document", resourceId: DOC, mode: "edit" });
    const payload = jwt.verify(issued.token, SECRET, { algorithms: ["HS256"], audience: COLLAB_TOKEN_AUDIENCE, issuer: COLLAB_TOKEN_ISSUER, clockTolerance: 1e9 }) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: USER, aud: "collab", iss: "superapp-be", kind: "document", docId: DOC, mode: "edit", sv: 7 });
    expect(typeof payload.jti).toBe("string");
    expect(payload.exp).toBe(Math.floor(NOW.getTime() / 1000) + 300);
    expect(issued.expiresAt.toISOString()).toBe("2026-09-26T12:05:00.000Z");
    expect(jwt.decode(issued.token, { complete: true })?.header.alg).toBe("HS256");
  });

  it("mỗi lần cấp có jti khác nhau", () => {
    const a = jwt.decode(service().issue({ userId: USER, sessionVersion: 1, kind: "document", resourceId: DOC, mode: "view" }).token) as jwt.JwtPayload;
    const b = jwt.decode(service().issue({ userId: USER, sessionVersion: 1, kind: "document", resourceId: DOC, mode: "view" }).token) as jwt.JwtPayload;
    expect(a.jti).not.toBe(b.jti);
  });

  it("trả url WebSocket công khai (đổi http(s) → ws(s), bỏ dấu / cuối) và documentName theo loại", () => {
    const view = service({ publicUrl: "http://localhost:4000/" }).issue({ userId: USER, sessionVersion: 1, kind: "document", resourceId: DOC, mode: "view" });
    expect(view.url).toBe("ws://localhost:4000");
    expect(view.documentName).toBe(`doc:${DOC}`);
    expect(collabDocumentName("whiteboard", DOC)).toBe(`wb:${DOC}`);
    expect(toWebSocketUrl("https://x.vn/collab/")).toBe("wss://x.vn/collab");
    expect(toWebSocketUrl("wss://x.vn/collab")).toBe("wss://x.vn/collab");
  });

  it("chưa cấu hình bí mật hoặc URL → 503 DOC_009 (fail-closed), không phát token", () => {
    for (const over of [{ secret: undefined }, { publicUrl: undefined }]) {
      expect(() => service(over).issue({ userId: USER, sessionVersion: 1, kind: "document", resourceId: DOC, mode: "edit" })).toThrow(
        expect.objectContaining({ statusCode: 503, errorCode: "DOC_009" })
      );
    }
  });

  it("token KHÔNG kiểm được bằng JWT_SECRET/bí mật khác (không dùng chung khoá chính)", () => {
    const token = service().issue({ userId: USER, sessionVersion: 1, kind: "document", resourceId: DOC, mode: "edit" }).token;
    expect(() => jwt.verify(token, "test-jwt-secret-key-for-testing-only")).toThrow();
  });
});
