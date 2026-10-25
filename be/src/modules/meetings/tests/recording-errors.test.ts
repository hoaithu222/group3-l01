import { maskStorageKey } from "../services/admin-recording.service";
import { sanitizeRecordingError } from "../services/recording-errors";

describe("sanitizeRecordingError — lý do lỗi hiển thị cho người điều khiển/admin (không lộ URL ký, khoá object)", () => {
  it.each([
    ["Lỗi https://bucket.s3.amazonaws.com/recordings/w/m/r.mp4?X-Amz-Signature=abc kết nối", "Lỗi [liên kết] kết nối"],
    ["upload recordings/66f0/77a1/88b2.mp4 thất bại", "upload [tệp] thất bại"],
    ["  nhiều   khoảng\ttrắng\n xuống dòng ", "nhiều khoảng trắng xuống dòng"],
    ["", "Lỗi không xác định"],
    [undefined, "Lỗi không xác định"],
  ])("%j → %j", (raw, expected) => {
    expect(sanitizeRecordingError(raw)).toBe(expected);
  });

  it("nhận Error, cắt còn 300 ký tự", () => {
    expect(sanitizeRecordingError(new Error("boom"))).toBe("boom");
    expect(sanitizeRecordingError("x".repeat(1000))).toHaveLength(300);
  });

  it("maskStorageKey che đoạn giữa của khoá object", () => {
    expect(maskStorageKey("recordings/ws/meeting/id.mp4")).toBe("recordings/…/id.mp4");
    expect(maskStorageKey("id.mp4")).toBe("id.mp4");
  });
});
