/**
 * Số điện thoại — chuẩn hoá E.164 và hiển thị.
 *
 * ── ⚠️ ĐỒNG BỘ với `be/src/core/utils/phone.ts` (`normalizePhone`) ─────────────────────────────────────────
 * Backend chuẩn hoá SĐT theo đúng các luật này rồi lưu/tra khớp CHÍNH XÁC (`User.phone`). Sửa một bên là phải
 * sửa bên kia và bộ ca thử ở `tests/shared/phone.utils.test.ts` (cùng bảng ví dụ với `phone.test.ts` của BE),
 * nếu không client báo "hợp lệ" mà BE từ chối 400 (hoặc ngược lại, chặn nhầm một số hợp lệ).
 *
 * Phạm vi: nội địa Việt Nam (di động `03x/05x/07x/08x/09x` = 10 số, máy bàn `02x` = 11 số) + số quốc tế đầy đủ
 * khi có `+`/`00`. Chỉ kiểm HÌNH DẠNG — không xác minh số có thật/có chủ (chưa có OTP/SMS ở dự án này).
 */

/** Di động VN sau khi bỏ `0`/`84`: 9 chữ số, đầu 3/5/7/8/9. */
const VN_MOBILE = /^[35789]\d{8}$/;
/** Máy bàn VN sau khi bỏ `0`/`84`: 10 chữ số, đầu 2 (mã vùng). */
const VN_LANDLINE = /^2\d{9}$/;
/** E.164: mã quốc gia không bắt đầu bằng 0; tổng 8–15 chữ số. */
const E164_DIGITS = /^[1-9]\d{7,14}$/;
/** Ký tự người dùng hay dùng để ngăn cách số. `+` chỉ hợp lệ ở ĐẦU chuỗi. */
const PHONE_SHAPE = /^\+?[\d\s.\-()]+$/;

function normalizeVietnam(national: string): string | null {
  // "+84 (0) 912…" là lỗi gõ rất hay gặp: bỏ số 0 trung kế thừa sau mã quốc gia.
  const digits = national.startsWith('0') ? national.slice(1) : national;
  return VN_MOBILE.test(digits) || VN_LANDLINE.test(digits) ? `+84${digits}` : null;
}

/**
 * Trả E.164 (`+84912345678`) hoặc `null` nếu không giống một số điện thoại hợp lệ.
 *
 * ⚠️ Cố ý KHÔNG nhận số thiếu số 0 đầu (`912345678`): quá dễ nhầm với chuỗi số bất kỳ khi phân loại ô tìm kiếm.
 */
export function normalizePhone(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > 32 || !PHONE_SHAPE.test(text)) return null;

  let digits = text.replace(/\D/g, '');
  let international = text.startsWith('+');
  // Tiền tố quay số quốc tế "00" tương đương "+".
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (digits.length === 0) return null;

  if (international) {
    if (digits.startsWith('84')) return normalizeVietnam(digits.slice(2));
    return E164_DIGITS.test(digits) ? `+${digits}` : null;
  }
  if (digits.startsWith('0')) return normalizeVietnam(digits.slice(1));
  // "84912345678" (thiếu dấu +): chỉ chấp nhận khi phần còn lại đúng dạng số VN.
  if (digits.startsWith('84')) return normalizeVietnam(digits.slice(2));
  return null;
}

/** Ô nhập SĐT hợp lệ khi rỗng (không bắt buộc) HOẶC chuẩn hoá được — dùng cho `refine` của schema form. */
export function isEmptyOrValidPhone(raw: string | undefined): boolean {
  const text = (raw ?? '').trim();
  return text === '' || normalizePhone(text) !== null;
}

/**
 * E.164 → dạng người Việt đọc: `+84912345678` → `0912 345 678`, máy bàn `+842438123456` → `024 3812 3456`.
 * Số quốc tế (không phải +84) giữ nguyên E.164 — không có quy tắc chia nhóm chung cho mọi nước.
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith('+84')) return e164;
  const national = e164.slice(3);
  if (VN_MOBILE.test(national)) return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  if (VN_LANDLINE.test(national)) return `0${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
  return e164;
}
