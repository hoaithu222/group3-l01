/**
 * Unit — URL ẢNH HIỂN THỊ ký sẵn (`shared/media/display-image.ts`): dựng URL ổn định theo "ô" thời gian, hạn 1–2 ô, bỏ `/`
 * cuối của `PUBLIC_API_URL`, kiểm chữ ký thời gian hằng + tách miền ký khỏi các HMAC khác dùng cùng `ENCRYPTION_KEY`.
 */
import { createHmac } from "crypto";
import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { hmacSha256Hex } from "../../../core/utils/crypto";
import { avatarUrlOf, displayImageExpiry, displayImageUrl, verifyDisplayImageSignature } from "..";

const ASSET = "65f0000000000000000000a1";
const OTHER_ASSET = "65f0000000000000000000a2";
const BUCKET = LIMITS.upload.displayImageUrlBucketSeconds;
/** Mốc đầu một ô (giây) — mọi mốc test tính từ đây cho dễ đọc. */
const BUCKET_START_S = 20_000 * BUCKET;
const at = (secondsIntoBucket: number): number => (BUCKET_START_S + secondsIntoBucket) * 1000;

function parse(url: string): { path: string; v: string; e: number; s: string } {
  const u = new URL(url);
  return { path: u.pathname, v: u.searchParams.get("v") ?? "", e: Number(u.searchParams.get("e")), s: u.searchParams.get("s") ?? "" };
}

function signedUrl(assetId: string, nowMs: number, variant: "THUMB" | "ORIGINAL" = "THUMB"): string {
  const url = displayImageUrl(assetId, variant, nowMs);
  if (!url) throw new Error("displayImageUrl phải trả URL khi có assetId");
  return url;
}

describe("displayImageUrl / displayImageExpiry / avatarUrlOf", () => {
  const originalApiUrl = env.PUBLIC_API_URL;
  beforeEach(() => {
    env.PUBLIC_API_URL = "https://api.example.test";
  });
  afterEach(() => {
    env.PUBLIC_API_URL = originalApiUrl;
  });

  it("URL tuyệt đối đúng hình `<gốc>/api/v1/assets/<id>/image?v=&e=&s=` (s = 64 hex)", () => {
    const url = signedUrl(ASSET, at(10), "ORIGINAL");
    expect(url).toMatch(new RegExp(`^https://api\\.example\\.test/api/v1/assets/${ASSET}/image\\?v=ORIGINAL&e=\\d+&s=[0-9a-f]{64}$`));
    expect(parse(signedUrl(ASSET, at(10))).v).toBe("THUMB"); // mặc định THUMB
    expect(displayImageUrl(ASSET, undefined, at(10))).toBe(signedUrl(ASSET, at(10), "THUMB"));
  });

  it("GIỐNG HỆT nhau trong cùng một ô (client cache theo URL); sang ô mới thì đổi", () => {
    const first = signedUrl(ASSET, at(0));
    expect(signedUrl(ASSET, at(1))).toBe(first);
    expect(signedUrl(ASSET, at(BUCKET / 2))).toBe(first);
    expect(signedUrl(ASSET, at(BUCKET) - 1)).toBe(first); // mili-giây cuối của ô
    const next = signedUrl(ASSET, at(BUCKET));
    expect(next).not.toBe(first);
    expect(parse(next).e - parse(first).e).toBe(BUCKET);
    // Hai bản THUMB/ORIGINAL của cùng ảnh dùng chung `e`/`s` (v không nằm trong chữ ký).
    expect(parse(signedUrl(ASSET, at(5), "ORIGINAL")).s).toBe(parse(signedUrl(ASSET, at(5), "THUMB")).s);
  });

  it("`e` luôn nằm trong (now + 1 ô, now + 2 ô] — kể cả đầu ô, giữa ô, mili-giây cuối ô", () => {
    for (const nowMs of [at(0), at(1), at(BUCKET / 2), at(BUCKET) - 1, at(BUCKET), at(3 * BUCKET + 17)]) {
      const nowS = nowMs / 1000;
      const { e } = parse(signedUrl(ASSET, nowMs));
      expect(e).toBe(displayImageExpiry(nowMs));
      expect(Number.isSafeInteger(e)).toBe(true);
      expect(e).toBeGreaterThan(nowS + BUCKET);
      expect(e).toBeLessThanOrEqual(nowS + 2 * BUCKET);
      expect(e % BUCKET).toBe(0); // làm tròn theo ô
    }
  });

  it("không có ảnh (null/undefined/chuỗi rỗng) → null", () => {
    expect(displayImageUrl(null)).toBeNull();
    expect(displayImageUrl(undefined, "ORIGINAL")).toBeNull();
    expect(displayImageUrl("", "THUMB", at(0))).toBeNull();
    expect(avatarUrlOf(null)).toBeNull();
    expect(avatarUrlOf(undefined)).toBeNull();
  });

  it("PUBLIC_API_URL có `/` cuối (một hoặc nhiều) không sinh `//api`", () => {
    for (const base of ["https://api.example.test/", "https://api.example.test///"]) {
      env.PUBLIC_API_URL = base;
      const url = signedUrl(ASSET, at(0));
      expect(url.startsWith(`https://api.example.test/api/v1/assets/${ASSET}/image?`)).toBe(true);
      expect(url.replace("https://", "")).not.toContain("//");
    }
  });

  it("avatarUrlOf = bản THUMB của displayImageUrl tại cùng thời điểm", () => {
    jest.spyOn(Date, "now").mockReturnValue(at(42));
    const url = avatarUrlOf(ASSET);
    expect(url).toBe(signedUrl(ASSET, at(42), "THUMB"));
    expect(parse(url ?? "").v).toBe("THUMB");
  });
});

describe("verifyDisplayImageSignature", () => {
  const now = at(100);
  const { e, s } = parse(signedUrl(ASSET, now));

  it("chữ ký đúng + còn hạn → true (chấp nhận hex viết hoa như DTO)", () => {
    expect(verifyDisplayImageSignature(ASSET, e, s, now)).toBe(true);
    expect(verifyDisplayImageSignature(ASSET, e, s.toUpperCase(), now)).toBe(true);
    expect(verifyDisplayImageSignature(ASSET, e, s, e * 1000 - 1)).toBe(true); // mili-giây cuối trước hạn
  });

  it("sai assetId / sai exp / sai chữ ký → false", () => {
    expect(verifyDisplayImageSignature(OTHER_ASSET, e, s, now)).toBe(false);
    expect(verifyDisplayImageSignature(ASSET, e + 1, s, now)).toBe(false);
    expect(verifyDisplayImageSignature(ASSET, e - BUCKET, s, now)).toBe(false);
    const flipped = `${s.slice(0, -1)}${s.endsWith("0") ? "1" : "0"}`;
    expect(verifyDisplayImageSignature(ASSET, e, flipped, now)).toBe(false);
    // Chữ ký của asset khác (cùng exp) không dùng được cho asset này.
    expect(verifyDisplayImageSignature(ASSET, e, parse(signedUrl(OTHER_ASSET, now)).s, now)).toBe(false);
  });

  it("hết hạn (đúng mốc e và sau đó) → false", () => {
    expect(verifyDisplayImageSignature(ASSET, e, s, e * 1000)).toBe(false);
    expect(verifyDisplayImageSignature(ASSET, e, s, e * 1000 + 60_000)).toBe(false);
  });

  it("exp không phải số nguyên an toàn → false", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, e + 0.5, 2 ** 53]) {
      expect(verifyDisplayImageSignature(ASSET, bad, s, now)).toBe(false);
    }
  });

  it("chữ ký không phải đúng 64 hex → false — kể cả `<chữ ký đúng>` + đuôi rác/ký tự lẻ (Buffer.from(hex) cắt ngầm)", () => {
    for (const bad of ["", "z".repeat(64), "abc", s.slice(0, 63), `${s}zz`, `${s}a`, `${s}00`, ` ${s}`]) {
      expect(verifyDisplayImageSignature(ASSET, e, bad, now)).toBe(false);
    }
  });

  it("tách miền ký: s = HMAC('display-image:v1|<id>|<e>'), KHÁC HMAC thô '<id>|<e>' và chữ ký gateway tải Local '<id>|<variant>|<e>'", () => {
    expect(s).toBe(hmacSha256Hex(`display-image:v1|${ASSET}|${e}`));
    expect(s).not.toBe(hmacSha256Hex(`${ASSET}|${e}`));
    const localDownloadSig = (variant: string) =>
      createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY, "hex")).update(`${ASSET}|${variant}|${e}`).digest("hex");
    expect(s).not.toBe(localDownloadSig("THUMB"));
    expect(s).not.toBe(localDownloadSig("ORIGINAL"));
  });
});
