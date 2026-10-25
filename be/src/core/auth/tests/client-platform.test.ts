import type { Request } from "express";
import { readClientPlatform, readDeviceIdHeader } from "../client-platform";
import { ValidationError } from "../../exceptions";

/** `req.header()` của Express không phân biệt hoa/thường — bản giả chỉ cần tra đúng tên header mã nguồn dùng. */
const requestWith = (headers: Record<string, string | undefined>): Request =>
  ({ header: (name: string) => headers[name] }) as unknown as Request;

describe("readClientPlatform (B11 — X-Client-Platform)", () => {
  it("không có header (hoặc rỗng) ⇒ undefined = client web, giữ cookie", () => {
    expect(readClientPlatform(requestWith({}))).toBeUndefined();
    expect(readClientPlatform(requestWith({ "X-Client-Platform": "" }))).toBeUndefined();
  });

  it("ANDROID | IOS ⇒ app di động", () => {
    expect(readClientPlatform(requestWith({ "X-Client-Platform": "ANDROID" }))).toBe("ANDROID");
    expect(readClientPlatform(requestWith({ "X-Client-Platform": "IOS" }))).toBe("IOS");
  });

  it.each(["WEB", "android", "ios", "ANDROID ", "windows"])(
    "giá trị sai %j ⇒ 400 VAL_001 (không lặng lẽ rơi về nhánh web)",
    (value) => {
      let thrown: unknown;
      try {
        readClientPlatform(requestWith({ "X-Client-Platform": value }));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ValidationError);
      expect(thrown).toMatchObject({ statusCode: 400, errorCode: "VAL_001" });
    }
  );
});

describe("readDeviceIdHeader (X-Device-Id)", () => {
  it("không có header, rỗng hoặc chỉ khoảng trắng ⇒ undefined", () => {
    expect(readDeviceIdHeader(requestWith({}))).toBeUndefined();
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "" }))).toBeUndefined();
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "   " }))).toBeUndefined();
  });

  it("cắt khoảng trắng hai đầu", () => {
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "  device-12345678  " }))).toBe("device-12345678");
  });

  it("đúng 64 ký tự vẫn nhận; 65 ký tự trở lên coi như không gửi (header do client tự khai — không lưu chuỗi dài tuỳ ý vào Session/DeviceToken)", () => {
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "d".repeat(64) }))).toBe("d".repeat(64));
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "d".repeat(65) }))).toBeUndefined();
    expect(readDeviceIdHeader(requestWith({ "X-Device-Id": "d".repeat(4096) }))).toBeUndefined();
  });
});
