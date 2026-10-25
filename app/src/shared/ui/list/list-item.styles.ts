import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `ListItem` (Figma `List item` 259:97535, 259:97604,
 * 259:97607). Tách khỏi `ListItem.tsx` để file component giữ dưới 200 dòng —
 * cùng cách bố trí với `alert/`, `button/`, `date-picker/`.
 *
 * ── ⚠️ Cạm bẫy số một: nhãn dài đẩy giá trị ra khỏi màn hình ─────────────────
 * ❌ Cách viết bản năng — nhãn `shrink` co theo nội dung, giá trị `flex-1` —
 * hỏng THẬT trên máy 360dp với nhãn "Số tiền đề nghị vay tối đa theo hạn mức":
 * nhãn có `flex-basis: auto` nên toàn bộ phần thiếu chỗ bị dồn vào nó, còn giá
 * trị `flex-basis: 0` không có gì để co — Yoga chia cho giá trị đúng **0px**.
 * Số tiền biến mất, hoặc rớt xuống mỗi dòng một chữ số. Không lỗi nào báo, và
 * chỉ lộ ra với đúng bộ dữ liệu dài.
 *
 * ✅ Cách đúng, cũng là đúng bằng Figma: CẢ HAI cột đều `flex-1`. `flex-basis`
 * = 0 ở hai bên nên mỗi bên luôn giữ đúng một nửa hàng; nhãn dài thì tự xuống
 * dòng trong nửa của nó, không mượn được nửa của giá trị.
 */
export const listItemStyles = tv(
  {
    slots: {
      // `py-2xs` = 4px trên/dưới, đúng padding frame "List item" của Figma.
      // ⚠️ `items-start` chứ không `items-center`: khi giá trị xuống hai dòng
      // (ngày giờ, địa chỉ) nhãn phải thẳng hàng với DÒNG ĐẦU của giá trị chứ
      // không trôi xuống giữa khối.
      root: 'w-full flex-row items-start gap-sm py-2xs',
      content: 'flex-1',
      labelBox: 'flex-1 justify-center gap-2xs',
      label: 'text-fg-2', // fg-3 chỉ 2.96:1 trên thẻ trắng ⇒ fg-2 (5.74:1).
      valueBox: 'flex-1 gap-2xs',
      value: 'w-full font-semibold',
      description: 'text-label-md text-fg-2', // fg-4 chỉ 1.73:1 ⇒ fg-2 (5.74:1).
      /**
       * Khe mô tả DƯỚI GIÁ TRỊ — component gốc trong Figma có HAI khe phụ 16dp,
       * không phải một: `Support text` dưới cột NHÃN (khe `description`, node
       * `I259:97607;1357:33159`) **và** `right` dưới cột GIÁ TRỊ
       * (`I259:97607;245:1922`). Cả hai đang `hidden` trong instance mẫu nên rất
       * dễ bỏ sót khe thứ hai. Dùng cho dòng phụ của số tiền: tỉ giá quy đổi,
       * "≈ 1.234,56 USD", ngày hiệu lực.
       */
      valueDescription: 'text-label-md text-fg-2',
    },
    variants: {
      align: {
        /** Nhãn trái – giá trị phải, cùng hàng. Figma 15.5/24 → `text-body-lg`. */
        row: {
          content: 'flex-row items-start gap-xs',
          label: 'text-body-lg',
          value: 'text-right text-body-lg',
          valueBox: 'items-end',
          /* ⚠️ `text-right` chứ không trông vào `items-end` của `valueBox`:
             `alignItems` chỉ canh CẢ KHỐI chữ về phải, còn dòng thứ hai của một
             câu xuống dòng vẫn canh trái bên trong khối đó. */
          valueDescription: 'w-full text-right',
        },
        /**
         * Nhãn trên – giá trị dưới, cho dòng mở đầu thẻ ("Khoản vay /
         * 100.000.000 VND", Figma 259:97604). Figma dùng 14/20 → `text-label-md`.
         */
        stacked: {
          content: 'flex-col gap-2xs',
          label: 'text-label-md',
          labelBox: 'w-full flex-none',
          value: 'text-left text-label-md',
          valueBox: 'w-full flex-none items-start',
          valueDescription: 'w-full text-left',
        },
      },
      /**
       * MẬT ĐỘ hàng. ⚠️ Khai NGAY SAU `align` là bắt buộc: `align` đặt cỡ chữ
       * (`text-body-lg`) cho `label`/`value`, mà `tv()` nối class theo THỨ TỰ
       * khai báo rồi để `tailwind-merge` xử lý — khai TRƯỚC `align` thì
       * `text-body-lg` đè ngược lại và `size="sm"` không đổi được gì, đúng kiểu
       * hỏng âm thầm mà `tsc` lẫn `eslint` đều không thấy.
       */
      size: {
        /** Nhịp 32 (15.5/24 + `py-2xs`) — hàng nhãn–giá trị của màn xác nhận. */
        md: {},
        /**
         * Hàng thông số ĐẶC của thẻ sản phẩm (Figma `259:125365` và 5 bản sao ở
         * các màn chi tiết sản phẩm): `BODY/T14-Regular` 14/20, ba hàng cách
         * nhau đúng 24 (y = 28 · 52 · 76).
         *
         * ⚠️ 24 = 20 (chiều cao chữ) + `py-3xs` × 2 (2 + 2). ⛔ Đừng đổi sang
         * `h-6` cứng: chữ Việt bị phóng cỡ theo cài đặt hệ thống sẽ tràn ra
         * ngoài chiều cao khoá, và Android cắt cụt dấu.
         *
         * ⚠️ `sm` cũng là biến thể đúng cho hàng có HUY HIỆU: Figma vẽ hàng đó
         * (`259:97607`) cao **28** — con cao 24 ở y=2 ⇒ đệm dọc 2 (`py-3xs`),
         * trong khi ba kiểu hàng còn lại đệm 4. Để `md` thì hàng trạng thái cao
         * 32 thay vì 28. Lệch 4dp, vô hại về thị giác — ghi ra để khỏi ai đó
         * "phát hiện" lại và đi sửa nhầm chỗ.
         */
        sm: {
          label: 'text-body-md',
          root: 'py-3xs',
          value: 'text-body-md',
        },
      },
      emphasis: {
        default: {},
        /** Dòng tổng tiền (Figma chưa có mẫu riêng): giữ nguyên CỠ chữ — đổi cỡ
         *  làm hàng lệch nhịp với các dòng còn lại — chỉ tăng NÉT của hai cột. */
        strong: { label: 'font-medium text-fg-2', value: 'font-bold' },
        /**
         * HÀNG ĐIỀU HƯỚNG có mô tả (danh sách "Tôi", "Cài đặt"): nhãn là TIÊU ĐỀ của hàng nên phải là chữ chính
         * (`fg-1`, `font-medium`), mô tả bên dưới mới là chữ phụ (`fg-2`). Mặc định `label` là `text-fg-2` vì
         * thiết kế vẽ hàng nhãn–giá trị (nhãn xám, giá trị đậm); dùng nguyên cho hàng điều hướng thì tiêu đề và
         * mô tả cùng một màu xám, chỉ còn cỡ chữ phân biệt.
         * ⚠️ Khai TRƯỚC `selected`/`disabled` bên dưới để hàng đang chọn/đang khoá vẫn thắng.
         */
        // `font-semibold` (600) chứ không `font-medium` (500): với Plus Jakarta Sans nét 500 chỉ đậm hơn Regular một chút,
        // trên máy ảo tiêu đề và mô tả (14) gần như cùng một "độ đậm" — nét 600 mới tách được hai tầng chữ ở hàng có mô tả.
        title: { label: 'font-semibold text-fg-1' },
        /**
         * Như `title` nhưng cho hàng THAO TÁC PHÁ HUỶ (Xoá, Rời nhóm…): cả nhãn lẫn icon (do nơi gọi tô) cùng đỏ. Trước đây `tone="error"`
         * chỉ tô cột GIÁ TRỊ nên hàng chỉ có nhãn không đỏ chỗ nào ngoài icon — người dùng không thấy đây là hành động nguy hiểm.
         * ⚠️ Khai SAU `title` để đè màu nhãn.
         */
        danger: { label: 'font-medium text-error' },
      },
      /**
       * Màu GIÁ TRỊ (Figma `foreground/highlight` cam ⇒ `warning`). Bốn tông
       * trạng thái là token TRẦN nên đã đảo sẵn theo chế độ; ⛔ `brand` phải là
       * `fg-brand` — `primary-6` không đảo, #003730 trên thẻ tối còn 1.15:1.
       * ⛔ `muted` là ô hiện SỐ TIỀN: `fg-3` chỉ 2.96:1 ở chế độ sáng (chế độ
       * tối 4.61:1 nên lỗi chỉ lộ ra một bên) ⇒ `fg-2`, 5.74:1 / 8.42:1.
       */
      tone: {
        default: { value: 'text-fg-1' },
        muted: { value: 'text-fg-2' },
        brand: { value: 'text-fg-brand' },
        success: { value: 'text-success' },
        warning: { value: 'text-warning' },
        error: { value: 'text-error' },
        info: { value: 'text-info' },
      },
      // Thẻ trong Figma phân cách bằng khoảng trống chứ không bằng kẻ, nên mặc
      // định TẮT — bật khi danh sách dài và mắt cần mốc bám.
      divider: {
        true: { root: 'border-b border-b-divider-1' },
      },
      // Bấm được thì hàng phải cao tối thiểu 44dp. Hàng một dòng chỉ cao 32dp
      // (24 chữ + 8 padding); dưới ngưỡng đó người dùng bấm trượt, và họ đổ lỗi
      // cho app chứ không cho ngón tay mình.
      //
      // `active:opacity-70` = phản hồi CHẠM (NativeWind tự nối `onPressIn`/`onPressOut` của `Pressable`). Thiếu nó thì
      // hàng điều hướng không đổi gì lúc chạm — Android không có gợn sóng mặc định — và người dùng bấm lần hai.
      // Hàng khoá không phát `onPressIn` nên không mờ. Cùng mức 70% với các hàng tự dựng trong feature (`ActivityItem`…).
      pressable: {
        true: { root: 'min-h-[44px] items-center active:opacity-70' },
      },
      /**
       * Hàng ĐANG ĐƯỢC CHỌN trong một danh sách chọn một giá trị (tấm trượt đáy
       * chọn cửa hàng `365:30369`, chọn Tỉnh/Thành `700:27216`).
       *
       * ⛔ Nền tint KHÔNG được là dấu hiệu duy nhất (luật `src/shared/ui/AGENTS.md`):
       * phần mang thông tin thật là `accessibilityState={{ selected }}` ở
       * `ListItem.tsx` cộng với dấu tick mà nơi gọi đặt vào khe `trailing`. Nền
       * chỉ để mắt quét nhanh thấy mình đang ở đâu trong danh sách 63 mục.
       *
       * ⚠️ Token `bg-primary` là nấc phủ 10% (`Opacity/Primary/Op10`) nên class
       * là `bg-bg-primary` — hai chữ "bg" là ĐÚNG. Viết `bg-primary` là đòi một
       * màu tên `primary`; nó không có bậc `DEFAULT` nên NativeWind bỏ qua ÂM
       * THẦM và dòng đang chọn mất nền.
       *
       * ⛔ Chỉ đổi NỀN và MÀU NHÃN — không đụng `py`, `gap` hay `items-*`. Hàng
       * chọn và hàng thường nằm cạnh nhau trong cùng một danh sách; lệch một
       * pixel bố cục là cả danh sách giật khi người dùng đổi lựa chọn.
       *
       * ── `label: text-fg-1` — đo điểm ảnh trên `700:27218` và `365:30369` ───
       * Nhãn dòng ĐANG CHỌN của bản vẽ là **#1A1A1A** (`fg-1`), các dòng còn
       * lại #666666 (`fg-2`, slot gốc). Biến thể này trước chỉ đổi nền nên dòng
       * đang chọn vẫn ra `fg-2`: sai màu, và mờ hơn đúng cái dòng mắt cần bám.
       * ⛔ Sửa ở tầng biến thể chứ không mở prop `labelClassName` cho `ListItem`
       * — `selected` đã có sẵn và `SelectOptionRow` đã truyền, nên không cần
       * thêm API nào có thể bị dùng để phá thang chữ.
       *
       * ⚠️ Tương phản đo trên nền THẬT (`bg-primary` phủ 10% trên `bg-dialog`):
       * sáng #E5ECEB ⇒ `fg-1` **14.53:1** · tối #263E3A ⇒ `fg-1` **10.47:1**.
       * Cả hai vượt 4.5:1, và cao hơn `fg-2` cũ (4.79 / 6.34) ở cả hai chế độ.
       *
       * ⛔ Khai `label` ở đây phải nằm SAU `emphasis` (nó đặt `text-fg-2` cho
       * dòng tổng tiền) và TRƯỚC `disabled` (dòng khoá vẫn phải xám) — `tv()`
       * nối class theo thứ tự khai báo rồi để `tailwind-merge` chọn cái cuối.
       */
      selected: {
        true: { label: 'text-fg-1', root: 'bg-bg-primary' },
      },
      /**
       * ⛔ Khai SAU `tone`/`emphasis` là bắt buộc, không phải sắp xếp cho đẹp:
       * `tv()` nối class theo THỨ TỰ khai báo rồi để `tailwind-merge` xử lý —
       * khai trước `tone` thì `text-fg-1` của `tone: default` đè ngược lại và
       * hàng bị khoá trông y hệt hàng thường.
       *
       * Hạ bằng MÀU CHỮ (`action-disabled-fg`, token đã đảo theo chế độ) chứ
       * không bằng `opacity-*`: khe `value` nhận cả phần tử React (huy hiệu,
       * ô nhập) và lớp mờ sẽ ăn luôn những thứ đó.
       */
      disabled: {
        true: {
          description: 'text-action-disabled-fg',
          label: 'text-action-disabled-fg',
          value: 'text-action-disabled-fg',
          valueDescription: 'text-action-disabled-fg',
        },
      },
    },
    // ⛔ `size: 'md'` phải nằm ở đây: nó là hành vi CŨ của mọi nơi đang gọi.
    defaultVariants: { align: 'row', emphasis: 'default', size: 'md', tone: 'default' },
  },
  { twMergeConfig },
);

export type ListItemVariants = VariantProps<typeof listItemStyles>;
