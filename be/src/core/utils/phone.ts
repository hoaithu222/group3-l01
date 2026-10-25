/**
 * Số điện thoại — chuẩn hoá E.164 để LƯU và TRA CỨU KHỚP CHÍNH XÁC (`User.phone`).
 *
 * Vì sao chuẩn hoá ở MỘT chỗ: người dùng gõ `0912 345 678`, `+84 912.345.678`, `84912345678`, `0084912345678`… cho CÙNG một
 * số. Nếu lưu nguyên văn thì tra `phone = "0912345678"` không bao giờ khớp bản lưu `+84912345678`. Mọi đường ghi (đăng ký, cập nhật
 * hồ sơ) và mọi đường tra (thêm thành viên, tìm người) PHẢI qua `normalizePhone`.
 *
 * Phạm vi: nội địa Việt Nam (di động `03x/05x/07x/08x/09x` = 10 số, cố định `02x` = 11 số) + số quốc tế đầy đủ dạng E.164 khi có `+`
 * hoặc `00`. Đây KHÔNG phải xác minh số có thật/có chủ — chỉ kiểm hình dạng (chưa có OTP/SMS ở dự án này).
 */

/** Di động VN sau khi bỏ `0`/`84`: 9 chữ số, đầu 3/5/7/8/9. */
const VN_MOBILE = /^[35789]\d{8}$/;
/** Điện thoại bàn VN sau khi bỏ `0`/`84`: 10 chữ số, đầu 2 (mã vùng 2x). */
const VN_LANDLINE = /^2\d{9}$/;
/** E.164: mã quốc gia không bắt đầu bằng 0; tổng 8–15 chữ số (ITU-T E.164 tối đa 15). */
const E164_DIGITS = /^[1-9]\d{7,14}$/;
/** Ký tự người dùng hay dùng để ngăn cách số. `+` chỉ hợp lệ ở ĐẦU chuỗi. */
const PHONE_SHAPE = /^\+?[\d\s.\-()]+$/;

function normalizeVietnam(national: string): string | null {
  // "+84 (0) 912…" là lỗi gõ rất hay gặp: bỏ số 0 trung kế thừa sau mã quốc gia.
  const digits = national.startsWith("0") ? national.slice(1) : national;
  return VN_MOBILE.test(digits) || VN_LANDLINE.test(digits) ? `+84${digits}` : null;
}

/**
 * Trả E.164 (`+84912345678`) hoặc `null` nếu không giống một số điện thoại hợp lệ.
 *
 * ⚠ Không nhận số thiếu số 0 đầu (`912345678`): quá dễ nhầm với chuỗi số bất kỳ khi phân loại ô tìm kiếm.
 */
export function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > 32 || !PHONE_SHAPE.test(text)) return null;

  let digits = text.replace(/\D/g, "");
  let international = text.startsWith("+");
  // Tiền tố quay số quốc tế "00" tương đương "+".
  if (!international && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  if (digits.length === 0) return null;

  if (international) {
    if (digits.startsWith("84")) return normalizeVietnam(digits.slice(2));
    return E164_DIGITS.test(digits) ? `+${digits}` : null;
  }
  if (digits.startsWith("0")) return normalizeVietnam(digits.slice(1));
  // "84912345678" (thiếu dấu +): chỉ chấp nhận khi phần còn lại đúng dạng số VN.
  if (digits.startsWith("84")) return normalizeVietnam(digits.slice(2));
  return null;
}

/**
 * Che số để HIỂN THỊ gợi ý (`+84 ****** 678`): giữ 2 chữ số đầu (thường là mã quốc gia) và 3 chữ số cuối.
 * Dùng khi cần cho người tra cứu nhận ra đúng tài khoản mà không lộ số đầy đủ.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return `+${digits.slice(0, 2)} ${"*".repeat(digits.length - 5)} ${digits.slice(-3)}`;
}
