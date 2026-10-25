/**
 * @file money.utils.ts
 * @description Shared money formatter — auto-scale suffix (tr / tỷ) theo giá trị.
 *   Base unit: **tỷ** (VND × 10^9) — quy ước nội bộ của module KH-TT / Doanh thu.
 *   Compact (mặc định UI): số nguyên floor + suffix (kiểu bảng chứng khoán).
 *   Detail (hover / tooltip): full decimal + đơn vị chữ ("tỷ", "triệu", "đồng").
 */

import { isFiniteNumber } from './number.utils';

/** Ngưỡng scale: ≥ 1 tỷ → "tỷ"; ≥ 0.001 tỷ (= 1 triệu) → "tr"; nhỏ hơn → "đ". */
export type MoneyScale = 'ty' | 'tr' | 'dong';

/**
 * ⛔ Mọi formatter dưới đây chặn bằng `!isFiniteNumber(...)` chứ KHÔNG bằng
 * `== null`: `NaN == null` là `false` nên `NaN` lọt qua guard cũ rồi
 * `toLocaleString()` in thẳng chữ "NaN" giữa một cột tiền. Hay gặp nhất là
 * `Number(v)` trong tooltip formatter của Recharts — lúc chưa có payload thì `v`
 * là `undefined` và `Number(undefined)` cho ra `NaN`. `±Infinity` (chia cho 0)
 * cũng bị chặn ở đây.
 */

export interface MoneyCompactResult {
  /** Chuỗi hiển thị: "12.345 tỷ" · "789 tr" · "500.000". (locale vi-VN — dấu chấm hàng nghìn, dấu phẩy thập phân) */
  text: string;
  /** Suffix riêng để UI style (mờ hơn, size nhỏ hơn). */
  suffix: string;
  /** Scale đã chọn theo độ lớn value. */
  scale: MoneyScale;
}

/**
 * Chọn scale phù hợp theo `abs(valueTy)`.
 *  - |x| ≥ 1        → tỷ  ("tỷ")
 *  - |x| ≥ 0.001    → triệu ("tr")
 *  - còn lại        → đồng ("đ")
 */
function pickScale(valueTy: number): MoneyScale {
  const v = Math.abs(valueTy);
  if (v >= 1) return 'ty';
  if (v >= 0.001) return 'tr';
  return 'dong';
}

/**
 * Compact — integer FLOOR + separator "." (VN locale) + suffix ngắn ("tỷ" / "tr" / "đ").
 * 0 / null → { text: '0', suffix: '', scale: 'ty' } (giữ chỗ trong bảng).
 * Dùng cho ô số hiển thị mặc định (view mode) — style stock-ticker.
 *
 * `forceScale` — ép hiển thị theo 1 đơn vị cố định (bỏ auto-scale). Vd truyền
 * `'tr'` để luôn hiện triệu bất kể độ lớn (2.446 tỷ → "2.446.000 tr").
 *
 * `fractionDigits` — số chữ số thập phân giữ lại (floor, KHÔNG round lên), áp
 * cho CẢ `ty` lẫn `tr`. Trước đây chỉ áp cho `ty`, nên caller dùng auto-scale mà
 * xin 1 chữ số thập phân bị mất phần lẻ ngay khi giá trị tụt xuống thang triệu
 * (0,4005 tỷ hiện "400 tr" thay vì "400,5 tr"). Scale `dong` vẫn nguyên đồng —
 * không có đồng lẻ.
 *
 * `padFraction` — LUÔN in đủ `fractionDigits` chữ số, kể cả khi phần lẻ bằng 0
 * ("15" → "15,0"). Bật cho BẢNG: một cột mà số thì "15" số thì "12,7" là hai độ
 * dài khác nhau, hàng số hết thẳng cột và mắt phải dò lại dấu phẩy ở từng dòng.
 * Tắt (mặc định) cho nhãn chart / KPI — ở đó mỗi số đứng một mình, đuôi ",0"
 * chỉ tốn chỗ.
 */
export function formatMoneyCompact(
  valueTy: number | null | undefined,
  forceScale?: MoneyScale,
  fractionDigits = 0,
  padFraction = false,
): MoneyCompactResult {
  if (!isFiniteNumber(valueTy) || valueTy === 0) {
    // 0 cũng phải đủ chữ số khi `padFraction`, không thì đúng dòng có số 0 lại
    // là dòng lệch cột.
    const zero =
      padFraction && fractionDigits > 0
        ? (0).toLocaleString('vi-VN', {
            maximumFractionDigits: fractionDigits,
            minimumFractionDigits: fractionDigits,
          })
        : '0';
    return { text: zero, suffix: '', scale: forceScale ?? 'ty' };
  }
  const sign = valueTy < 0 ? '-' : '';
  const abs = Math.abs(valueTy);
  const scale = forceScale ?? pickScale(valueTy);

  // `fractionDigits > 0` → giữ N chữ số thập phân (floor, KHÔNG round lên):
  // 2,82 → "2,8" · 150 → "150" (KHÔNG "150,0" — bảng dày số, đuôi ",0" chỉ tốn
  // cột mà không thêm thông tin). Mặc định 0 = số nguyên, giữ nguyên hành vi cũ
  // cho KPI / donut / các nơi ngoài bảng KH-TT & bảng NT.
  const factor = 10 ** fractionDigits;
  const toText = (scaled: number) =>
    `${sign}${(Math.floor(scaled * factor) / factor).toLocaleString('vi-VN', {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: padFraction ? fractionDigits : 0,
    })}`;

  if (scale === 'ty') {
    return { text: toText(abs), suffix: 'tỷ', scale };
  }
  if (scale === 'tr') {
    return { text: toText(abs * 1_000), suffix: 'tr', scale };
  }
  // dong — nguyên đồng, không suffix chữ (dùng "đ" phía sau)
  return {
    text: `${sign}${Math.floor(abs * 1_000_000_000).toLocaleString('vi-VN')}`,
    suffix: 'đ',
    scale,
  };
}

/**
 * Detail — 3 chữ số thập phân + đơn vị chữ đầy đủ ("tỷ" / "triệu" / "đồng").
 * Dùng cho tooltip / title attribute khi user hover xem chi tiết.
 * 0 / null → "0 đ".
 *
 * `forceScale` — ép hiển thị theo 1 đơn vị cố định (bỏ auto-scale). Truyền
 * cùng scale với `formatMoneyCompact` để đảm bảo tooltip đồng bộ với số
 * hiển thị bên ngoài (VD: display "12.345 tr" → tooltip "12.345 triệu").
 */
export function formatMoneyDetail(
  valueTy: number | null | undefined,
  forceScale?: MoneyScale,
): string {
  if (!isFiniteNumber(valueTy) || valueTy === 0) {
    // Khi ép scale, giữ đúng đơn vị (kể cả 0) để đồng bộ với display.
    if (forceScale === 'ty') return '0 tỷ';
    if (forceScale === 'tr') return '0 triệu';
    return '0 đ';
  }
  const scale = forceScale ?? pickScale(valueTy);
  if (scale === 'ty') {
    return `${valueTy.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} tỷ`;
  }
  if (scale === 'tr') {
    return `${(valueTy * 1_000).toLocaleString('vi-VN', {
      maximumFractionDigits: 3,
    })} triệu`;
  }
  return `${Math.round(valueTy * 1_000_000_000).toLocaleString('vi-VN')} đ`;
}

/**
 * One-liner cho JSX inline khi không cần tách suffix (compact text + suffix
 * gộp lại thành 1 chuỗi — tiện dùng trong tooltip text hoặc CSV export).
 */
export function formatMoneyCompactInline(valueTy: number | null | undefined): string {
  const r = formatMoneyCompact(valueTy);
  return r.suffix ? `${r.text} ${r.suffix}` : r.text;
}

/**
 * Như `formatMoneyCompact` nhưng nhận số ĐỒNG THÔ thay vì số tỷ.
 *
 * Vì sao cần: quy ước "đơn vị gốc là tỷ" ở trên sinh ra từ module KH-TT, nơi BE
 * trả sẵn số tỷ. Phần còn lại của app (bảng, KPI, dữ liệu nhập tay) cầm số đồng
 * nguyên — và mỗi chỗ tự chia `1e9` là mỗi chỗ một cơ hội quên, hoặc chia nhầm
 * `1e6`. Wrapper này ỦY QUYỀN cho cùng một hàm nên KHÔNG có luật thứ hai về
 * ngưỡng scale hay cách làm tròn.
 *
 *   formatMoneyCompactRaw(119_710_000_000, 1)  →  { text: '119,7', suffix: 'tỷ' }
 */
export function formatMoneyCompactRaw(
  valueDong: number | null | undefined,
  fractionDigits = 0,
  padFraction = false,
): MoneyCompactResult {
  if (!isFiniteNumber(valueDong)) return formatMoneyCompact(valueDong);
  return formatMoneyCompact(valueDong / 1_000_000_000, undefined, fractionDigits, padFraction);
}
