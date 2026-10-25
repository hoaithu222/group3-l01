import { normalizeSearch, graphemeLength } from "../normalize";

describe("normalizeSearch", () => {
  it("bỏ dấu tiếng Việt và hạ chữ thường", () => {
    expect(normalizeSearch("Mét khối")).toBe("met khoi");
  });

  it("xử lý đ/Đ và gộp khoảng trắng thừa", () => {
    expect(normalizeSearch("ĐÀ  NẴNG")).toBe("da nang");
  });

  it("chuẩn hoá NFC và NFD của cùng ký tự về cùng kết quả", () => {
    const nfc = "é".normalize("NFC");
    const nfd = "é".normalize("NFD");
    expect(normalizeSearch(nfc)).toBe(normalizeSearch(nfd));
  });
});

describe("graphemeLength", () => {
  it("đếm emoji ghép ZWJ là 1 ký tự", () => {
    expect(graphemeLength("👨‍👩‍👧")).toBe(1);
  });

  it("đếm chuỗi ASCII bình thường", () => {
    expect(graphemeLength("abc")).toBe(3);
  });
});
