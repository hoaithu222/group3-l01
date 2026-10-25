import { canonicalJson, formatVerifyCode, generateVerifyCode, hashCanonical, sha256Hex, shortHash, VERIFY_CODE_RE } from "../services/export/verify-code";

describe("verify-code — mã xác thực + mã băm dữ liệu (p4-06 be.md §5.7)", () => {
  it("JSON chuẩn hoá: đổi thứ tự khoá không đổi chuỗi/mã băm, kể cả đối tượng lồng nhau", () => {
    const a = { boardId: "b1", period: "ALL", members: [{ id: "u1", score: 91, share: 58.7 }], formula: { weights: { points: 60, onTime: 20, peer: 20 } } };
    const b = { formula: { weights: { peer: 20, onTime: 20, points: 60 } }, members: [{ share: 58.7, score: 91, id: "u1" }], period: "ALL", boardId: "b1" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
    expect(hashCanonical(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("đổi bất kỳ số liệu nào → mã băm đổi; thứ tự phần tử mảng có nghĩa", () => {
    const base = { members: [{ id: "u1", score: 91 }, { id: "u2", score: 64 }] };
    expect(hashCanonical(base)).not.toBe(hashCanonical({ members: [{ id: "u1", score: 91.1 }, { id: "u2", score: 64 }] }));
    expect(hashCanonical(base)).not.toBe(hashCanonical({ members: [{ id: "u2", score: 64 }, { id: "u1", score: 91 }] }));
  });

  it("bỏ qua undefined, giữ null, chuẩn hoá Date thành ISO", () => {
    expect(canonicalJson({ a: undefined, b: null, c: new Date("2026-09-15T00:00:00Z") })).toBe('{"b":null,"c":"2026-09-15T00:00:00.000Z"}');
    expect(canonicalJson([1, undefined, "x"])).toBe('[1,null,"x"]');
  });

  it("sha256Hex khớp vector chuẩn", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("mã xác thực: 10 ký tự, bảng chữ cái dễ đọc, các lần sinh khác nhau", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVerifyCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(VERIFY_CODE_RE);
    expect(generateVerifyCode(Buffer.alloc(10, 0))).toBe("AAAAAAAAAA");
  });

  it("định dạng in ở chân trang: ABCD-EFGH-JK và 3f2a…9c", () => {
    expect(formatVerifyCode("ABCDEFGHJK")).toBe("ABCD-EFGH-JK");
    expect(shortHash("3f2a" + "0".repeat(58) + "9c")).toBe("3f2a…9c");
  });
});
