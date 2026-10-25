import { decodeListCursor, encodeListCursor } from "../services/resource-list.cursor";

const ID = "0123456789abcdef01234567";

describe("resource-list.cursor", () => {
  it("round-trip theo từng cách sắp", () => {
    const at = new Date("2026-09-19T01:02:03.456Z");
    expect(decodeListCursor(encodeListCursor("createdAt", at, ID), "createdAt")).toEqual({ value: at, id: ID });
    expect(decodeListCursor(encodeListCursor("name", "bai giang", ID), "name")).toEqual({ value: "bai giang", id: ID });
    expect(decodeListCursor(encodeListCursor("size", 2048, ID), "size")).toEqual({ value: 2048, id: ID });
  });

  it("cursor của cách sắp khác / hỏng / id sai → 400", () => {
    const sizeCursor = encodeListCursor("size", 1, ID);
    expect(() => decodeListCursor(sizeCursor, "name")).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decodeListCursor("@@@", "size")).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decodeListCursor(encodeListCursor("size", 1, "x"), "size")).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decodeListCursor(Buffer.from('{"s":"createdAt","v":"khong-phai-ngay","i":"' + ID + '"}').toString("base64url"), "createdAt")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});
