/**
 * Định dạng SỐ và SỐ TIỀN — viết tay, không thư viện, không `Intl`.
 *
 * ── ⛔ Vì sao KHÔNG gọi thư viện ─────────────────────────────────────────────
 * Repo này đã trả giá đúng một lần: `format.utils.ts` cũ `import` gói `numeral`
 * chưa bao giờ được cài, một dòng `declare module 'numeral'` chép từ dự án cũ
 * làm `tsc` im lặng, và build vẫn xanh vì chưa ai gọi `formatCurrency()`. Gọi
 * một phát là nổ trên máy người dùng. Cả câu chuyện nằm ở
 * `scripts/check-imports.mjs:1-14`. Định dạng số là ~40 dòng số học chuỗi —
 * không đáng đánh đổi lấy một phụ thuộc nữa.
 *
 * ── ⛔ Vì sao KHÔNG `toLocaleString('vi-VN')` / `Intl.NumberFormat` ─────────
 * Hermes (máy JS của React Native) cắt bớt ICU để giảm dung lượng: `Intl` CÓ
 * mặt nên code chạy, nhưng dữ liệu ngôn ngữ không đầy đủ và KHÁC NHAU giữa
 * Android với iOS ⇒ cùng một số tiền hiện ra hai kiểu trên hai máy, mà không có
 * lỗi nào báo. Đây đúng là lý do `date.utils.ts` chọn dayjs thay cho
 * `Intl.DateTimeFormat` — xem chú thích đầu file đó.
 */

/**
 * Dấu phân cách hàng nghìn — **DẤU CHẤM**, theo quy ước Việt Nam.
 *
 * ⚠️ Đây là chỗ code CỐ Ý LỆCH bản vẽ, và lệch có lý do:
 * · Bản vẽ Figma ghi `89,500,000 VND` — dấu PHẨY, ở cả 4 chỗ có số tiền
 *   (`822:28746` và slide `193:25214`).
 * · Quy ước Việt Nam là dấu CHẤM: `89.500.000`; dấu phẩy dành cho phần thập
 *   phân — ngược hoàn toàn với en-US.
 *
 * Người dùng Việt đọc `89,5` là "tám mươi chín phẩy năm". Một app ngân hàng
 * hiển thị số tiền theo quy ước của nước khác là mời người ta đọc nhầm đơn vị,
 * nên ở đây quy ước quốc gia thắng bản vẽ. (Đã báo lại để bên thiết kế xác nhận.)
 *
 * ⛔ ĐỪNG viết dấu phân cách thẳng vào bất kỳ chỗ nào khác — đổi quy ước là sửa
 * ĐÚNG một dòng này, `DECIMAL_SEPARATOR` ngay bên dưới tự lật theo.
 */
export const THOUSANDS_SEPARATOR: ',' | '.' = '.';

/**
 * Dấu thập phân LUÔN là cái còn lại trong cặp `,`/`.` — không bao giờ trùng dấu
 * hàng nghìn, nếu không `1.234.56` không đọc được là số nào.
 * ⛔ Không export: đây là hệ quả của hằng số trên, không phải một lựa chọn thứ hai.
 *
 * ⚠️ Tra BẢNG chứ không so sánh `=== ','`. TypeScript thu hẹp `const` về đúng
 * literal của giá trị khởi tạo, nên phép so sánh đó thành "không bao giờ đúng"
 * và `tsc` báo TS2367 ngay khi ai đó lật `THOUSANDS_SEPARATOR` sang giá trị kia
 * — tức là đúng lúc file này cần chạy được nhất. Bảng tra thì đúng với cả hai.
 */
const OPPOSITE_SEPARATOR = { ',': '.', '.': ',' } as const;
const DECIMAL_SEPARATOR = OPPOSITE_SEPARATOR[THOUSANDS_SEPARATOR];

/**
 * Hậu tố tiền tệ mặc định.
 *
 * ⚠️ `VND` viết HOA, KHÔNG phải `₫` / `đ` / `VNĐ`. Bản vẽ dùng `VND` ở mọi màn
 * (`89,500,000 VND`); chỉ có số dư trên header slide 3 lỡ dùng `0đ` — một chỗ
 * lệch, đã ghi nhận là chưa chốt. Cách số một dấu cách.
 */
export const CURRENCY_UNIT = 'VND';

/** Khe giữa số và đơn vị. Bản vẽ có một chỗ dính liền (`100,000VND`) — đó là lỗi. */
const UNIT_SPACE = ' ';

/** Chèn dấu vào giữa mỗi nhóm 3 chữ số, tính từ PHẢI sang. `\B` chặn dấu ở đầu chuỗi. */
const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;

/**
 * `toFixed` bỏ cuộc từ 1e21 trở lên và trả về KÝ HIỆU KHOA HỌC (`'1e+21'`).
 * Chuỗi đó đi thẳng ra màn hình thành `"1e+21 VND"` — trông như app hỏng, và
 * không có lỗi nào báo vì về mặt kiểu nó vẫn là `string`.
 *
 * ⚠️ Trên ngưỡng 2^53 (~9.007e15) thì bản thân `number` đã mất độ chính xác;
 * hàm này chỉ lo phần HIỂN THỊ cho khỏi lòi ký hiệu khoa học ra, không cứu được
 * chữ số bị mất. Số tiền VND thật (tối đa ~1e13) nằm an toàn dưới ngưỡng đó.
 */
const EXPONENTIAL_RE = /^(-?)(\d+)(?:\.(\d+))?e\+(\d+)$/;

function expandExponential(text: string): string {
  const match = EXPONENTIAL_RE.exec(text);
  if (!match) return text;
  const [, sign = '', lead = '', fraction = '', exponent = '0'] = match;
  return `${sign}${lead}${fraction}${'0'.repeat(Math.max(0, Number(exponent) - fraction.length))}`;
}

/** Giá trị nhận vào. `null`/`undefined` là ca THẬT: API trả về thiếu trường. */
export type NumericInput = number | null | undefined;

export interface FormatNumberOptions {
  /**
   * Số chữ số sau dấu thập phân. Mặc định `0` — VND không có đơn vị lẻ, và
   * `89.500.000,00 VND` vừa thừa thông tin vừa dài thêm 3 ký tự trên màn 375dp.
   */
  decimals?: number;
  /**
   * Trả về khi giá trị không dùng được (`null`, `undefined`, `NaN`, `Infinity`).
   * ⚠️ Mặc định là CHUỖI RỖNG, không phải `'0'`: hiển thị `0 VND` cho một số dư
   * chưa tải xong là nói dối người dùng về tiền của họ.
   */
  fallback?: string;
  /** Hậu tố sau số (`'VND'`, `'chỉ'`, `'B-Point'`). Bỏ trống ⇒ chỉ có số. */
  unit?: string;
}

/**
 * Số có phân cách hàng nghìn.
 *
 * @example
 *   formatNumber(89500000)                    // '89.500.000'
 *   formatNumber(1234.567, { decimals: 2 })   // '1.234,57'
 *   formatNumber(5, { unit: 'chỉ' })          // '5 chỉ'
 *   formatNumber(undefined)                   // ''
 */
export function formatNumber(value: NumericInput, options: FormatNumberOptions = {}): string {
  const { decimals = 0, fallback = '', unit } = options;

  // ⛔ Phải chặn cả `NaN` lẫn `Infinity`, không chỉ `null`/`undefined`:
  // `(0/0).toFixed(0)` cho `'NaN'` và chuỗi đó hiện nguyên si lên màn hình.
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;

  const fixed = expandExponential(value.toFixed(Math.max(0, decimals)));
  const negative = fixed.startsWith('-');
  const [integer = '0', fraction] = (negative ? fixed.slice(1) : fixed).split('.');

  /**
   * ⚠️ `(-0.4).toFixed(0)` cho `'-0'`. Để nguyên thì màn hình hiện `-0 VND` và
   * trình đọc màn hình nói "âm không đồng" — vô nghĩa với người dùng.
   */
  const zero = /^0*$/.test(integer) && (fraction === undefined || /^0*$/.test(fraction));
  const sign = negative && !zero ? '-' : '';

  const grouped = integer.replace(GROUP_RE, THOUSANDS_SEPARATOR);
  const number = fraction ? `${grouped}${DECIMAL_SEPARATOR}${fraction}` : grouped;

  return unit ? `${sign}${number}${UNIT_SPACE}${unit}` : `${sign}${number}`;
}

/**
 * Số tiền — như `formatNumber` nhưng mặc định kèm hậu tố `VND`.
 *
 * Không có đơn vị lẻ nên giá trị lẻ bị LÀM TRÒN (`1234.56` → `'1.235 VND'`).
 * Cần giữ phần lẻ (tỷ giá, lãi suất) thì truyền `decimals`.
 *
 * @example
 *   formatCurrency(89500000)                // '89.500.000 VND'
 *   formatCurrency(-1000)                   // '-1.000 VND'
 *   formatCurrency(500000, { unit: 'B-Point' })  // '500.000 B-Point'
 *   formatCurrency(89500000, { unit: '' })  // '89.500.000'  (chỉ số, không đơn vị)
 *   formatCurrency(null, { fallback: '—' }) // '—'
 */
export function formatCurrency(value: NumericInput, options: FormatNumberOptions = {}): string {
  return formatNumber(value, { unit: CURRENCY_UNIT, ...options });
}
