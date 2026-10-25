import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style và số đo của `AppBar`.
 *
 * Tách khỏi `AppBar.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), cùng cách chia như `chip/chip.styles.ts`.
 *
 * ── Số đo lấy từ Figma (component set `259:95932` iOS / `259:95998` Android) ──
 * Ba `Type`, chiều cao trên máy mẫu iPhone (thanh trạng thái 54) / Android (24):
 *
 *   | `Type`   | iOS | Android | Hàng `_type`                        |
 *   | -------- | --- | ------- | ----------------------------------- |
 *   | `Sm`     | 118 |  88     | 56 — tiêu đề 18/24 cùng hàng nút    |
 *   | `Lg`     | 150 | 120     | 88 — tiêu đề 24/32 xuống dòng dưới  |
 *   | `Search` | 118 |  88     | 56 — ô tìm kiếm 267×48 bo tròn hết  |
 *
 * Chỉ 8 (khe) + 56/88 là số THẬT của component; 54 kia là tai thỏ của đúng
 * chiếc máy dựng thiết kế.
 *
 * ⛔ Vì vậy KHÔNG viết `h-[118px]`. Máy khác có tai thỏ cao thấp khác nhau, còn
 * Android thì thanh trạng thái mỏng hơn hẳn — viết cứng thì hoặc tiêu đề chui
 * xuống dưới đồng hồ, hoặc thừa một dải trống. `insets.top` là số đo LÚC CHẠY,
 * không class Tailwind nào thay được.
 */
export const appBar = tv(
  {
    slots: {
      root: '',
      /**
       * `min-h-12` = 48dp — CỐ Ý thấp hơn hàng `_type` 56 của Figma (chủ dự án chê "thanh tiêu đề cách xa nội dung
       * bên dưới quá"). Chữ tiêu đề cao 24 nằm giữa hàng nên khe dưới chữ = (48 − 24) / 2 = 12dp (bản 56 là 16dp),
       * cộng `pt` của nội dung và đệm `py-xs` mà đa số màn tự thêm ⇒ từ chữ tiêu đề tới khối đầu còn ~20dp thay vì
       * ~32dp. 48 vẫn đủ nút Quay lại (24dp icon + `hitSlop` 12 = 48dp vùng chạm). Dùng `min-h` chứ không
       * phải `h`: có phụ đề — hoặc người dùng phóng cỡ chữ hệ thống lên 2× — thì hàng phải cao thêm chứ không
       * được cắt chữ.
       *
       * ⚠️ Giữ thang SỐ: `control-md` (48) chỉ được thêm vào `height` nên `min-h-control-md` KHÔNG
       * tồn tại — gõ vào là NativeWind bỏ qua âm thầm.
       *
       * ── Trần bề rộng từ máy tính bảng ──────────────────────────────────────
       * Kẹp `max-w-content` (720dp, `layout.json` nhóm `container`) và canh giữa,
       * ĐÚNG token trần nội dung của `Screen`: không có nó thì trên máy tính bảng
       * nút "Quay lại" dính mép trái màn trong khi cột nội dung bắt đầu tận giữa
       * màn — tiêu đề không còn nằm trên phần nội dung mà nó đặt tên cho.
       *
       * ⚠️ Trần đặt ở `row`/`largeBlock`, ⛔ KHÔNG ở `root`: `root` là chỗ đổ nền
       * + viền dưới của biến thể `opaque`, kẹp nó là nền chỉ còn 720dp giữa màn.
       *
       * ⚠️ Vì trần KHÔNG nằm ở `root` nên prop `className` (đi vào `root`) không
       * đè được nó. Đường đè là prop `contentClassName` của `AppBar` — nó rót
       * thẳng vào hai slot này. ⛔ Đừng đổi `className` sang đây: `className` còn
       * là chỗ nơi gọi chỉnh nền và viền dưới.
       */
      row: 'min-h-12 flex-row items-center gap-md px-md tablet:w-full tablet:max-w-content tablet:self-center',
      leadingGroup: 'flex-1 flex-row items-center gap-sm',
      titleBlock: '',
      /**
       * ⛔ `fg-on-header`, KHÔNG phải `fg-on-nav`.
       *
       * Hai họ token nghe giống nhau nhưng nằm trên hai cái nền ngược nhau:
       * `fg-on-nav*` là chữ trên THANH TAB DƯỚI (nền gradient xanh đậm) nên nó
       * là màu TRẮNG ở cả hai chế độ; `fg-on-header*` là chữ trên thanh tiêu đề,
       * nằm trên nền SÁNG của màn hình nên nó là màu mực (`#1A1A1A`) ở chế độ
       * sáng. Dùng nhầm `fg-on-nav` ở đây là tiêu đề trắng trên nền trắng —
       * không lỗi nào báo, chữ chỉ đơn giản biến mất.
       */
      title: 'font-semibold text-fg-on-header',
      subtitle: 'text-caption-sm text-fg-on-header-muted',
      actions: 'shrink-0 flex-row items-center gap-sm',
      /**
       * Hàng tiêu đề lớn — cùng trần với `row` để hai hàng thẳng cột với nhau.
       *
       * ── Số đo (`259:95935`, khung `_type` của `Type=Lg` cao đúng 88) ────────
       * `p8/16/8/16` + hàng icon 24 + `gap16` + tiêu đề 24/32 = **88**, tức
       * 8 (đệm trên, ở `row`) + 24 + 16 (`pt-md` ở đây) + 32 + 8 (`pb-xs`).
       * ❌ Bản cũ để `row` giữ `min-h-14` (56) và `largeBlock` `pb-sm` (12) ⇒
       * 56 + 32 + 12 = **100**, cao hơn bản vẽ 12dp: khối tiêu đề của mọi màn
       * cấp 1 tụt xuống và dải gradient sau lưng bị đẩy lệch theo.
       */
      largeBlock: 'px-md pb-xs pt-md tablet:w-full tablet:max-w-content tablet:self-center',
      /** Khe của ô tìm kiếm — 267dp trong khung 375 chính là "phần còn lại". */
      searchSlot: 'flex-1',
    },
    variants: {
      variant: {
        compact: { titleBlock: 'flex-1', title: 'text-header-sm' },
        /**
         * ⛔ `min-h-0` là bắt buộc, không phải dọn dẹp cho gọn.
         *
         * Ở `Lg` hàng nút KHÔNG cao 56: khung `_type` chỉ chừa `p8` trên và
         * hàng icon 24 (8 + 24 = 32), phần còn lại của 88dp là khe 16 + tiêu đề
         * 32 + đệm dưới 8 do `largeBlock` giữ. Để nguyên `min-h-12` của slot
         * gốc là cộng thừa 16dp vào một thanh mà bản vẽ đã chốt cứng chiều cao.
         */
        large: { row: 'min-h-0 pt-xs', titleBlock: 'gap-2xs', title: 'text-header-md' },
        /**
         * `Type=Search` (`259:95973`): hàng `_type` cao 56 — padding dọc **4** (`p4/16/4/16`) vì ô tìm
         * kiếm cao 48 chứ không phải icon 24. 4 + 48 + 4 = 56, nên hàng này PHẢI giữ `min-h-14` (không
         * theo `min-h-12` của slot gốc: ô 48 + đệm không lọt vào 48). Đệm dưới `pb-xs` (8) bù phần
         * `Screen` không còn tự chừa `pt-xs` dưới thanh tiêu đề nữa.
         */
        search: { row: 'min-h-14 pb-xs pt-2xs' },
      },
      /**
       * ⚠️ Mặc định là TRONG SUỐT, không phải có nền.
       *
       * Đo bằng Plugin API: hai instance "App bar" (`259:95781` 375×118 và
       * `259:95865` 375×150) đều có `fills: []` và `effects: []`. Thanh thật sự
       * nằm TRÊN dải gradient của màn hình chứ không tự đổ nền.
       *
       * ⛔ Đừng nhầm với thanh dưới: `259:95760` mới là thứ có nền trắng 90% +
       * `BACKGROUND_BLUR`. Chuỗi "Background blur/8" xuất hiện khi tra biến của
       * section App bar là của thanh dưới nằm chung section — chép nhầm sang
       * đây là thanh tiêu đề mọc ra một mảng màu không có trong bản vẽ.
       *
       * Vì vậy `opaque` là biến thể phải TỰ CHỌN, dùng cho màn KHÔNG có gradient.
       *
       * ⚠️ Nền là `bg-base`, ⛔ KHÔNG phải `header-from`. `header-from`
       * (#A6CDCC) là điểm ĐẦU của dải gradient — đậm nhất — nên tô đặc cả thanh
       * bằng nó cho ra một mảng xanh mà bản vẽ không có ở đâu. Fill DUY NHẤT
       * Figma khai cho khung `_type` là `#E6F0F0` và nó đang **tắt**
       * (`visible: false`), tức thiết kế chưa chốt thanh nền đặc. `bg-base`
       * (#F0F5F5) là màu gần nhất ĐÃ có token và liền mạch với nền màn hình,
       * phần tách thanh khỏi nội dung do `header-border` lo.
       * ⚠️ Muốn đúng #E6F0F0 thì cần một token mới (`header-solid`) — việc của
       * nhóm token, đã ghi vào báo cáo.
       * Tương phản chữ `fg-on-header` trên nền này: 15.8:1 (sáng #1A1A1A trên
       * #F0F5F5) · 18.2:1 (tối #F2F6F4 trên #070A0A).
       */
      opaque: {
        true: { root: 'border-b border-header-border bg-bg-base' },
      },
    },
    defaultVariants: { variant: 'compact', opaque: false },
  },
  { twMergeConfig },
);

/**
 * Khoảng hở giữa thanh trạng thái và hàng nội dung — 4dp (Figma vẽ 8; hạ 4 cùng lượt hạ hàng nội dung
 * 56 → 48 để cả thanh tiêu đề gọn lại: chữ tiêu đề vẫn cách mép dưới thanh trạng thái 4 + 12 = 16dp).
 *
 * Nằm ở `paddingTop` cùng `insets.top` chứ không phải một class `pt-1`: hai giá
 * trị này phải CỘNG vào nhau, mà style nội tuyến thì đè lên class chứ không cộng.
 */
export const STATUS_BAR_GAP = 4;

/** `large` cho màn CẤP 1, `compact` cho màn cấp 2 trở đi · `search` cho màn có ô tìm. */
export type AppBarVariant = 'compact' | 'large' | 'search';
