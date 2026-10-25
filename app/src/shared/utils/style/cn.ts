import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import {
  BORDER_WIDTH,
  BREAKPOINTS,
  CONTAINER_MAX_WIDTH,
  CONTROL_HEIGHT,
  RADIUS,
  SPACING,
} from '@/shared/theme/layout.generated';
import { TYPOGRAPHY_ROLES } from '@/shared/theme/typography.generated';

/**
 * Gộp className, giải quyết xung đột theo kiểu "class truyền vào sau thì thắng".
 *
 * ── Vì sao NativeWind vẫn cần `tailwind-merge` ───────────────────────────────
 * Có một hiểu nhầm phổ biến (dự án tham chiếu `vci-sun-mobile` cũng viết vậy)
 * rằng NativeWind tự xử lý xung đột nên chỉ cần nối chuỗi. Không đúng.
 *
 * NativeWind biên dịch class thành CSS rồi áp theo **độ ưu tiên của CSS**, chứ
 * KHÔNG theo thứ tự bạn viết trong chuỗi. Nên:
 *
 *     <Button className="bg-primary-5" />                 // base
 *     <Button className={cn(base, 'bg-ink-5')} />         // muốn đè
 *
 * nếu chỉ nối chuỗi thì hai class cùng độ ưu tiên, và class nào thắng phụ thuộc
 * thứ tự Tailwind sinh ra chúng trong bảng CSS — tức là gần như ngẫu nhiên đối
 * với người viết. Prop `className` truyền từ ngoài vào lúc đè được lúc không.
 * `tailwind-merge` XOÁ class trước cùng nhóm, nên chỉ còn đúng một class.
 *
 * ── Vì sao phải `extendTailwindMerge` ────────────────────────────────────────
 * Thang chữ ở đây theo VAI TRÒ (`text-body-lg`, `text-header-md`) và nó THAY THẾ thang
 * mặc định (`text-sm`, `text-lg`). `tailwind-merge` không biết điều đó: gặp một
 * `text-*` lạ nó đoán là MÀU CHỮ. Hệ quả:
 *
 *     cn('text-header-md', 'text-fg-2')   // → chỉ còn 'text-fg-2'
 *
 * Cỡ chữ biến mất, mọi tiêu đề tụt về cỡ mặc định — không có lỗi nào báo, chỉ
 * là chữ trông sai. Khai các vai trò vào nhóm `font-size` để chúng xung đột với
 * NHAU thay vì với màu.
 *
 * Danh sách vai trò lấy từ `typography.generated.ts`, tức là từ chính
 * `typography.json` — thêm vai trò mới là tự có, không có nơi thứ hai để quên.
 */

const TYPOGRAPHY_ROLE_SET = new Set<string>(TYPOGRAPHY_ROLES);

/**
 * Thang hình học ĐẶT TÊN — `p-md`, `gap-xs`, `h-control-md`, `rounded-sm`,
 * `border-hairline`.
 *
 * ⛔ Phải khai, cùng lý do với thang chữ ở trên và cũng hỏng âm thầm y hệt.
 * `tailwind-merge` nhận diện giá trị giãn cách bằng "có phải số / độ dài không";
 * `md`, `2xs`, `control-md` KHÔNG phải, nên nó coi hai class là hai nhóm khác
 * nhau và GIỮ CẢ HAI:
 *
 *     cn('p-md', 'p-xs')  →  'p-md p-xs'      ⛔ không đè được
 *
 * Lúc đó thắng thua do thứ tự Tailwind sinh CSS quyết định — đúng thứ ngẫu
 * nhiên mà `cn()` sinh ra để dẹp. Triệu chứng: prop `className` truyền từ ngoài
 * lúc chỉnh được đệm, lúc không.
 *
 * ── ⚠️ `border-hairline` là ca tệ nhất, phải khai vào nhóm `border-w` ────────
 * `hairline` không phải độ dài, nên mặc định `tailwind-merge` xếp nó vào nhóm
 * **màu viền** (`border-<gì đó>` → đoán là màu). Hậu quả đo được:
 *
 *     cn('border-hairline', 'border-primary-4')  →  'border-primary-4'
 *
 * Bề dày biến mất ⇒ component **không còn viền nào** trên máy, và không có lỗi
 * nào báo. Recipe `tv()` nào để bề dày ở slot gốc còn màu ở variant là dính.
 *
 * Danh sách lấy từ `layout.generated.ts`, tức là từ chính `layout.json` — thêm
 * một bậc token mới là tự có hiệu lực, không có nơi thứ hai để quên.
 */
const SPACING_NAMES = Object.keys(SPACING);
const HEIGHT_NAMES = [...SPACING_NAMES, ...Object.keys(CONTROL_HEIGHT).map((n) => `control-${n}`)];
const RADIUS_NAMES = Object.keys(RADIUS);
const BORDER_WIDTH_NAMES = Object.keys(BORDER_WIDTH);

/**
 * Tên các bậc màn hình — `phone` · `tablet` · `tablet-lg`.
 *
 * ── ⛔ `max-w-screen-<bậc>` là ĐIỂM MÙ, và là điểm mù ĐẮT nhất trong file này ─
 * `tailwind-merge` CÓ biết dạng `max-w-screen-*`, nhưng nó tra tên bậc trong
 * `theme.breakpoint`, mà mặc định của khoá đó chỉ nhận cỡ áo (`sm` `md` `lg`
 * `xl` `2xl`). Thang `sm/md/lg` ở repo này đã bị GỠ (xem `docs/rules/
 * responsive.md`), nên `screen-tablet` không khớp bậc nào ⇒ class rơi ra ngoài
 * mọi nhóm và `tailwind-merge` giữ CẢ HAI. Đo được trước khi sửa:
 *
 *     cn('tablet:max-w-screen-tablet', 'tablet:max-w-none')
 *       → 'tablet:max-w-screen-tablet tablet:max-w-none'   ❌ giữ cả hai
 *     cn('tablet:max-w-[560px]', 'tablet:max-w-none')
 *       → 'tablet:max-w-none'                              ✅ (số đo thô thì đè được)
 *
 * ⚠️ Khai `max-w` vào `classGroups` (phần dưới) KHÔNG cứu được: chỗ đó chỉ nhận
 * TÊN GIÃN CÁCH (`max-w-md`). Phải sửa ở `theme.breakpoint`.
 *
 * Triệu chứng thật (thời trần còn là `max-w-screen-tablet`): `tablet:max-w-none` truyền vào KHÔNG đè được.
 * ⛔ Trần nay là `max-w-content` (`layout.json` nhóm `container`) — CÙNG điểm mù, vì `content` không phải tên
 * giãn cách ⇒ nhóm `max-w` bên dưới nhận thêm tên trần (`isMaxWidth`); thiếu nó là `AppBar`/`BottomActionBar` kẹt 720dp.
 *
 * ⛔ Lấy ĐỘNG từ `BREAKPOINTS`, không viết cứng: thêm một bậc vào `layout.json`
 * là tự có hiệu lực — đúng cách file này làm với spacing/radius/border ở trên.
 */
const BREAKPOINT_NAMES = Object.keys(BREAKPOINTS);

/** `['md','xs']` → hàm nhận biết dùng cho `classGroups`. */
const oneOf = (names: readonly string[]) => {
  const set = new Set<string>(names);
  return (value: string) => set.has(value);
};

const isSpacing = oneOf(SPACING_NAMES);
const isHeight = oneOf(HEIGHT_NAMES);
const isMaxWidth = oneOf([...SPACING_NAMES, ...Object.keys(CONTAINER_MAX_WIDTH)]);

/**
 * ⚠️ `min-h-*` / `max-h-*` KHÔNG nhận `control-*`.
 *
 * `tailwind.config.js` chỉ wire `height: layout.height`; Tailwind 3.4 lấy
 * `minHeight`/`maxHeight` từ `theme('spacing')` chứ KHÔNG kế thừa từ `height`.
 * Nên `min-h-control-md` không sinh ra class nào — đã kiểm bằng cách biên dịch
 * thật. Chỉ `h-*` mới dùng được tên `control-*`.
 */
const isSpacingOnly = isSpacing;

/**
 * Cấu hình mở rộng, tách riêng để `tailwind-variants` dùng chung.
 *
 * ⛔ Bắt buộc phải truyền vào `tv()` qua `twMergeConfig`: `tailwind-variants`
 * tạo THỰC THỂ `twMerge` RIÊNG của nó. Không truyền thì một recipe `tv()` nhận
 * cả cỡ chữ lẫn màu từ compound variant sẽ lặng lẽ đánh rơi cỡ chữ — đúng cái
 * bẫy mô tả ở trên, nhưng ở một chỗ khó thấy hơn nhiều.
 */
export const twMergeConfig = {
  extend: {
    /**
     * Thang bậc màn hình mà `tailwind-merge` dùng để hiểu `max-w-screen-*`.
     * ⛔ Không bỏ: xem cảnh báo ở `BREAKPOINT_NAMES`.
     */
    theme: {
      breakpoint: BREAKPOINT_NAMES,
    },
    classGroups: {
      'font-size': [{ text: [(value: string) => TYPOGRAPHY_ROLE_SET.has(value)] }],

      // Đệm trong.
      p: [{ p: [isSpacing] }],
      px: [{ px: [isSpacing] }],
      py: [{ py: [isSpacing] }],
      pt: [{ pt: [isSpacing] }],
      pr: [{ pr: [isSpacing] }],
      pb: [{ pb: [isSpacing] }],
      pl: [{ pl: [isSpacing] }],

      // Lề ngoài.
      m: [{ m: [isSpacing] }],
      mx: [{ mx: [isSpacing] }],
      my: [{ my: [isSpacing] }],
      mt: [{ mt: [isSpacing] }],
      mr: [{ mr: [isSpacing] }],
      mb: [{ mb: [isSpacing] }],
      ml: [{ ml: [isSpacing] }],

      // Khoảng cách giữa các con.
      gap: [{ gap: [isSpacing] }],
      'gap-x': [{ 'gap-x': [isSpacing] }],
      'gap-y': [{ 'gap-y': [isSpacing] }],

      // Kích thước. `h` nhận thêm `control-*`, `max-w` nhận thêm tên trần (`content`); các
      // nhóm còn lại thì không — xem chú thích `isSpacingOnly` và `BREAKPOINT_NAMES` ở trên.
      h: [{ h: [isHeight] }],
      w: [{ w: [isSpacingOnly] }],
      size: [{ size: [isSpacingOnly] }],
      'min-h': [{ 'min-h': [isSpacingOnly] }],
      'min-w': [{ 'min-w': [isSpacingOnly] }],
      'max-h': [{ 'max-h': [isSpacingOnly] }],
      'max-w': [{ 'max-w': [isMaxWidth] }],

      // Vị trí tuyệt đối.
      inset: [{ inset: [isSpacing] }],
      'inset-x': [{ 'inset-x': [isSpacing] }],
      'inset-y': [{ 'inset-y': [isSpacing] }],
      top: [{ top: [isSpacing] }],
      right: [{ right: [isSpacing] }],
      bottom: [{ bottom: [isSpacing] }],
      left: [{ left: [isSpacing] }],

      // Bo góc — thang đã GHI ĐÈ Tailwind, nên `rounded-sm` ở đây là 16dp.
      rounded: [{ rounded: RADIUS_NAMES }],
      'rounded-t': [{ 'rounded-t': RADIUS_NAMES }],
      'rounded-r': [{ 'rounded-r': RADIUS_NAMES }],
      'rounded-b': [{ 'rounded-b': RADIUS_NAMES }],
      'rounded-l': [{ 'rounded-l': RADIUS_NAMES }],

      // ⛔ Nhóm quan trọng nhất — xem cảnh báo `border-hairline` ở trên.
      'border-w': [{ border: BORDER_WIDTH_NAMES }],
    },
  },
} as const;

const twMerge = extendTailwindMerge(twMergeConfig);

/**
 * @example
 *   cn('px-4 py-2', isActive && 'bg-primary-5', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
