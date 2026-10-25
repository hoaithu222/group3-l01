import {
  CURRENT_KEY_VERSION,
  decryptAesGcm,
  decryptSecret,
  encryptAesGcm,
  encryptSecret,
  isSealedSecret,
} from "../crypto";

describe("AES-256-GCM (encryptAesGcm/decryptAesGcm)", () => {
  it("giải mã ra đúng plaintext", () => {
    const plain = "0123456789012";
    expect(decryptAesGcm(encryptAesGcm(plain))).toBe(plain);
  });

  it("IV ngẫu nhiên: cùng plaintext cho ra hai chuỗi khác nhau", () => {
    expect(encryptAesGcm("123456789")).not.toBe(encryptAesGcm("123456789"));
  });

  it("chuỗi mã hoá không chứa plaintext", () => {
    const enc = encryptAesGcm("9704123456789012");
    expect(Buffer.from(enc, "base64").toString("utf8")).not.toContain("9704123456789012");
  });

  it("dữ liệu bị sửa (sai auth tag) → ném lỗi thay vì trả rác", () => {
    const raw = Buffer.from(encryptAesGcm("123456789"), "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptAesGcm(raw.toString("base64"))).toThrow();
  });

  it("payload quá ngắn → ném lỗi", () => {
    expect(() => decryptAesGcm(Buffer.from("short").toString("base64"))).toThrow();
  });
});

describe("AES-256-GCM dạng object có keyVersion (encryptSecret/decryptSecret — p5-03)", () => {
  it("round-trip: giải mã ra đúng plaintext, kể cả JSON token", () => {
    const plain = JSON.stringify({ accessToken: "ya29.abc", refreshToken: "1//0gXYZ" });
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("có đủ ciphertext/iv/tag/keyVersion; bản mã không chứa plaintext; IV ngẫu nhiên mỗi lần", () => {
    const a = encryptSecret("ghp_supersecrettoken");
    const b = encryptSecret("ghp_supersecrettoken");
    expect(Object.keys(a).sort()).toEqual(["ciphertext", "iv", "keyVersion", "tag"]);
    expect(a.keyVersion).toBe(CURRENT_KEY_VERSION);
    expect(JSON.stringify(a)).not.toContain("ghp_supersecrettoken");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("dữ liệu bị sửa (sai auth tag hoặc ciphertext) → ném lỗi thay vì trả rác", () => {
    const sealed = encryptSecret("token");
    const badTag = { ...sealed, tag: Buffer.alloc(16, 1).toString("base64") };
    expect(() => decryptSecret(badTag)).toThrow();
    const raw = Buffer.from(sealed.ciphertext, "base64");
    raw[0] ^= 0xff;
    expect(() => decryptSecret({ ...sealed, ciphertext: raw.toString("base64") })).toThrow();
  });

  it("keyVersion lạ → ném lỗi (không thử khoá hiện hành)", () => {
    expect(() => decryptSecret({ ...encryptSecret("token"), keyVersion: 99 })).toThrow(/keyVersion/);
  });

  it("đầu vào sai hình (null, chuỗi, thiếu trường, IV sai độ dài) → ném lỗi", () => {
    expect(() => decryptSecret(null)).toThrow();
    expect(() => decryptSecret("abc")).toThrow();
    expect(() => decryptSecret({ ciphertext: "x" })).toThrow();
    expect(() => decryptSecret({ ...encryptSecret("t"), iv: Buffer.alloc(4).toString("base64") })).toThrow();
  });

  it("isSealedSecret nhận đúng hình và từ chối chuỗi phẳng của encryptAesGcm", () => {
    expect(isSealedSecret(encryptSecret("x"))).toBe(true);
    expect(isSealedSecret(encryptAesGcm("x"))).toBe(false);
    expect(isSealedSecret({ ciphertext: "a", iv: "b", tag: "c", keyVersion: "1" })).toBe(false);
  });

  it("tương thích ngược: encryptAesGcm/decryptAesGcm (chuỗi phẳng) vẫn hoạt động độc lập", () => {
    expect(decryptAesGcm(encryptAesGcm("9704123456789012"))).toBe("9704123456789012");
  });
});
