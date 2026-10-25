/**
 * parse-time.utils — bộ phân tích chuỗi giờ người dùng GÕ TAY cho `TimePicker`.
 *
 * Chấp nhận SỐ THUẦN hoặc SỐ + DẤU HAI CHẤM (không nhận `h`, `.`, khoảng trắng
 * giữa, `-`). Số thuần được đọc theo độ dài, đúng thói quen gõ nhanh trên bàn
 * phím số: `1530` → 15:30, `930` → 09:30, `15` → 15:00.
 *
 * Hàm thuần — KHÔNG React, KHÔNG side-effect. Mọi thông báo lỗi trả về sẵn
 * tiếng Việt để component chỉ việc hiển thị.
 */

/** Mã lỗi — dùng khi caller cần phân nhánh thay vì đọc chuỗi thông báo. */
export type TimeParseErrorCode =
  | 'INVALID_CHARS'
  | 'MULTIPLE_COLONS'
  | 'MISSING_HOUR'
  | 'HOUR_TOO_LONG'
  | 'MINUTE_TOO_LONG'
  | 'TOO_MANY_DIGITS'
  | 'HOUR_OUT_OF_RANGE'
  | 'MINUTE_OUT_OF_RANGE';

export type TimeParseResult =
  /** Chuỗi rỗng → yêu cầu XOÁ giá trị (không phải lỗi). */
  | { ok: true; value: null }
  | { ok: true; value: string; hour: number; minute: number }
  | { ok: false; code: TimeParseErrorCode; message: string };

/** Thông báo lỗi tiếng Việt theo mã. Export để test/consumer đối chiếu. */
export const TIME_PARSE_MESSAGES: Record<TimeParseErrorCode, string> = {
  INVALID_CHARS: 'Chỉ nhập số và dấu hai chấm. Ví dụ: 1530 hoặc 15:30',
  MULTIPLE_COLONS: 'Chỉ được dùng một dấu hai chấm',
  MISSING_HOUR: 'Thiếu số giờ trước dấu hai chấm',
  HOUR_TOO_LONG: 'Giờ tối đa 2 chữ số',
  MINUTE_TOO_LONG: 'Phút tối đa 2 chữ số',
  TOO_MANY_DIGITS: 'Nhập tối đa 4 chữ số. Ví dụ: 1530 = 15:30',
  HOUR_OUT_OF_RANGE: 'Giờ phải từ 00 đến 23',
  MINUTE_OUT_OF_RANGE: 'Phút phải từ 00 đến 59',
};

const fail = (code: TimeParseErrorCode): TimeParseResult => ({
  ok: false,
  code,
  message: TIME_PARSE_MESSAGES[code],
});

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ghép về dạng chuẩn "HH:mm" (24h). */
export const formatTimeValue = (hour: number, minute: number) => `${pad2(hour)}:${pad2(minute)}`;

/**
 * Đổi chữ số / dấu hai chấm FULLWIDTH (bộ gõ tiếng Nhật–Trung–Hàn hay sinh ra)
 * về ASCII. Không làm bước này thì `１５３０` bị báo "ký tự không hợp lệ" dù
 * người dùng nhìn thấy đúng là số.
 */
const foldFullwidth = (raw: string) =>
  raw
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\uFF1A/g, ':');

/** Chỉ số và dấu hai chấm — mọi ký tự khác đều bị loại ngay từ cửa. */
const ALLOWED_RE = /^[0-9:]+$/;

/**
 * Phân tích chuỗi người dùng gõ thành giờ:phút.
 *
 * | Gõ vào  | Kết quả | Vì sao |
 * |---------|---------|--------|
 * | `''`    | xoá     | ô trống = bỏ giá trị |
 * | `9`     | 09:00   | 1 chữ số = giờ |
 * | `15`    | 15:00   | 2 chữ số = giờ |
 * | `930`   | 09:30   | 3 chữ số = H + mm |
 * | `1530`  | 15:30   | 4 chữ số = HH + mm |
 * | `15:30` | 15:30   | dạng đầy đủ |
 * | `7:5`   | 07:05   | thiếu số 0 ở đầu vẫn hiểu |
 * | `15:`   | 15:00   | đang gõ dở — phút mặc định 00 |
 */
export function parseTimeInput(raw: string): TimeParseResult {
  const text = foldFullwidth(raw).trim();
  if (!text) return { ok: true, value: null };
  if (!ALLOWED_RE.test(text)) return fail('INVALID_CHARS');

  let hour: number;
  let minute: number;
  const colonCount = (text.match(/:/g) ?? []).length;

  if (colonCount > 1) return fail('MULTIPLE_COLONS');

  if (colonCount === 1) {
    const [hh, mm] = text.split(':');
    if (!hh) return fail('MISSING_HOUR');
    if (hh.length > 2) return fail('HOUR_TOO_LONG');
    if (mm.length > 2) return fail('MINUTE_TOO_LONG');
    hour = Number(hh);
    // `15:` = đang gõ dở, chưa tới phút → coi như tròn giờ thay vì bắt lỗi.
    minute = mm ? Number(mm) : 0;
  } else {
    if (text.length > 4) return fail('TOO_MANY_DIGITS');
    if (text.length <= 2) {
      hour = Number(text);
      minute = 0;
    } else {
      // 3 chữ số: "930" = 9 giờ 30 · 4 chữ số: "1530" = 15 giờ 30.
      const cut = text.length - 2;
      hour = Number(text.slice(0, cut));
      minute = Number(text.slice(cut));
    }
  }

  if (hour > 23) return fail('HOUR_OUT_OF_RANGE');
  if (minute > 59) return fail('MINUTE_OUT_OF_RANGE');

  return { ok: true, value: formatTimeValue(hour, minute), hour, minute };
}

/**
 * Có nên bật báo đỏ NGAY khi người dùng còn đang gõ dở hay không.
 *
 * Vì sao cần: gõ `930` phải đi qua bước `93`, mà `93` đọc ra là 93 giờ → sai
 * khoảng. Báo đỏ ở đó là ô nháy đỏ giữa lúc gõ dù người dùng chẳng làm gì sai.
 * Nên: chuỗi TOÀN SỐ và ngắn hơn 4 chữ số coi như "chưa gõ xong" — im lặng,
 * để lúc Enter / rời ô mới kết luận. Các lỗi không thể cứu bằng cách gõ thêm
 * (sai ký tự, thừa chữ số, thừa dấu hai chấm) thì báo ngay.
 */
export function shouldReportWhileTyping(raw: string): boolean {
  const text = foldFullwidth(raw).trim();
  return !(/^[0-9]+$/.test(text) && text.length < 4);
}

/**
 * Chuỗi đã gõ ĐỦ 4 chữ số chưa — mốc để tự chèn dấu hai chấm NGAY lúc gõ.
 *
 * Chỉ chốt ở đúng 4 chữ số, KHÔNG sớm hơn: `153` đọc ra 01:53, tự đổi ở đó thì
 * ký tự kế tiếp rơi vào "01:530" — hỏng đúng lúc người dùng đang gõ `1530`.
 * Dạng 3 chữ số (`930`) không tự đổi lúc gõ, để dành tới Enter / rời ô.
 */
export function isCompleteDigitEntry(raw: string): boolean {
  return /^[0-9]{4}$/.test(foldFullwidth(raw).trim());
}

/** Tách giá trị "HH:mm" của model thành số. Giá trị hỏng → `null` cả hai. */
export function splitTimeValue(value: string | null | undefined): {
  hour: number | null;
  minute: number | null;
} {
  const res = parseTimeInput(value ?? '');
  if (!res.ok || res.value === null) return { hour: null, minute: null };
  return { hour: res.hour, minute: res.minute };
}
