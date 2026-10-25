import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Alert`.
 *
 * Tách khỏi `Alert.tsx` vì bảng tông kèm chú thích dài hơn phần JSX khá nhiều,
 * và file `.tsx` phải ≤ 200 dòng (`docs/rules/code-style.md`). Cùng cách chia
 * như `badge/badge.styles.ts` và `chip/chip.styles.ts`.
 *
 * ⚠️ Kiểu `AlertTone` ở ĐÂY chứ không ở `Alert.tsx`: `AlertIcon.tsx` cần nó, mà
 * `Alert.tsx` lại nhập `AlertIcon` — để kiểu ở `Alert.tsx` là tạo vòng nhập
 * (`import/no-cycle` báo lỗi).
 *
 * ── Màu nền: ĐẶC (`surface-*`), không phải nền trong suốt ────────────────────
 * ⛔ Đừng quay lại nhóm trong suốt (`bg-bg-info`…). Alpha của nhóm đó vừa hạ
 * 16% → 10%, và ở chế độ TỐI một lớp 10% phủ lên thẻ `#1E2826` cho ra `#26353C`
 * (info), `#213A30` (success), `#353625` (warning), `#352F2D` (error) — bốn hộp
 * chỉ nhỉnh hơn nền thẻ 1.15–1.23:1, sắc gần như bay hết. Tông của alert là tín
 * hiệu đọc bằng mắt trong nửa giây; mất nó thì bốn tông chỉ còn phân biệt bằng
 * màu chữ tiêu đề, tức là phải ĐỌC mới biết đang cảnh báo hay chỉ ghi chú.
 * `surface-*` giữ đúng sắc ở cả hai chế độ.
 *
 * ⚠️ Ở chế độ sáng đây gần như không phải thay đổi: trên thẻ trắng bản cũ ra
 * `#E7ECF6`, `surface-info` là `#E7EDF8`. Cái được thêm là hộp hết đổi màu theo
 * thứ nằm dưới — cùng một alert đặt trên `bg-base` trước đây ngả sang `#D9E3ED`.
 *
 * ── Nền GRADIENT của bản vẽ: cố ý BỎ ────────────────────────────────────────
 * Figma khai gradient hai chặng cho cả bốn tông (`BgAlertSuccess` #E6F4E7 →
 * #FFFFFF, `AlertInfo` #EBF5F5 → #FFF, `AlertWarning` #FDEFE6 → #FFF,
 * `AlertError` #FBE6E6 → #FFF). Ở đây dùng màu ĐẶC bằng đúng chặng thứ nhất:
 * dựng gradient thật phải bọc `<LinearGradient>` quanh hộp, mà thẻ đó không
 * nhận `className` — tức là mất luôn đường truyền `className` từ nơi gọi vào
 * `root`. Chênh lệch thị giác là nửa bên phải hộp nhạt hơn bản vẽ một chút.
 */
const alert = tv(
  {
    slots: {
      // Số đo lấy đúng Figma: bo 24, viền 1, đệm 16, cách nút đóng 16, cách
      // biểu tượng 8, cách khối hành động 12, cách tiêu đề với mô tả 4.
      //
      // ⚠️ Giữ `border` TRẦN, đừng đổi sang `border-hairline`: `tailwind-merge`
      // xếp `border-hairline` vào nhóm MÀU viền, nên biến thể `tone` bên dưới
      // (`border-border-info-subtle`…) đè mất nó — hộp còn màu viền nhưng bề dày
      // về 0, tức là mất hẳn viền, và không có lỗi nào báo.
      root: 'w-full flex-row items-start gap-md rounded-md border p-md',
      body: 'min-w-0 flex-1 flex-row items-start gap-xs',
      content: 'min-w-0 flex-1 justify-center gap-sm',
      header: 'w-full gap-2xs',
      icon: 'size-xl items-center justify-center',
      // Figma `Theme=Ma` (259:93590): nhãn `16/24 SemiBold`, thân `BODY/T14-Regular`
      // 14/20 màu `Foreground/Ink/Beta` (#666) — tức `fg-2`, KHÔNG phải `fg-3`
      // (#969696). `fg-3` là màu chữ MỜ; dùng cho thân alert thì đoạn văn quan
      // trọng nhất của hộp lại là đoạn nhạt nhất, và tương phản tụt xuống dưới
      // ngưỡng AA trên nền sáng.
      title: 'text-body-lg font-semibold',
      description: 'text-body-md text-fg-2',
      actions: 'flex-row flex-wrap items-center gap-sm',
    },
    variants: {
      /**
       * CHỮ đi qua token trạng thái KHÔNG có hậu tố số (`success`, `warning`…).
       * Đó là token DUY NHẤT trong bảng có giá trị khác nhau giữa hai theme —
       * thang số (`info-5`, `info-7`… nay đã gỡ khỏi `colors.json` vì không còn
       * dùng) giống hệt nhau ở sáng và tối, nên dùng chúng cho chữ là chấp nhận
       * tương phản kém ở một trong hai theme.
       *
       * ⚠️ VIỀN thì ngược lại, phải dùng bậc NHẠT: Figma khai đích danh
       * `Border/<tông>/Medium` (#B0DCB5 cho success, #F8CEB0 cho warning…) —
       * một sắc NHẠT, không phải màu trạng thái đầy đủ. Dùng `border-success`
       * trần thì hộp có một đường viền xanh đậm bao quanh, đậm hơn cả chữ tiêu
       * đề, và alert trông như một cái nút.
       *
       * ── ⛔ Hai chữ `border`, và đó không phải lỗi gõ ────────────────────────
       * Token tên là `border-error-subtle`, tiện ích viền là `border-` ⇒ class
       * đúng là `border-border-error-subtle`. Viết `border-error-subtle` là đòi
       * bậc `subtle` của HỌ MÀU `error` — bậc đó không tồn tại, Tailwind không
       * sinh class nào, NativeWind bỏ qua ÂM THẦM, và hộp mất hẳn viền.
       *
       * Vì sao `-subtle` thay cho bậc `-3` cũ: thang số (`error-3` — nay đã gỡ
       * khỏi `colors.json`) giống hệt nhau ở hai chế độ, nên ở chế độ TỐI nó
       * thành một đường sáng CHÓI so với nền hộp — đúng cái vẻ "nút bấm" mà
       * đoạn trên vừa loại bỏ. Bậc `-subtle` giữ NGUYÊN giá trị Figma ở chế độ
       * sáng rồi lật xuống một sắc tối tương ứng.
       */
      tone: {
        /**
         * ⛔ `info` là TEAL, không phải xanh dương — và đây là chỗ dễ "sửa
         * ngược" nhất của cả nhóm component này.
         *
         * Figma `Intent=Info` đo ở CẢ HAI theme (`Theme=Ma` 259:93623 và
         * `Theme=Pr` 259:93634) đều trả về `Foreground/Primary/Default` #00453C
         * + `Border/Primary/Medium` #54827C + nền `AlertInfo1` #EBF5F5. Trong
         * toàn bộ component set Alert (259:93589) KHÔNG có symbol nào dùng
         * `Foreground/Info/Default` (#1043A9) — tức là bản vẽ không có alert
         * xanh dương nào cả. Bản cũ ở đây tô xanh dương, và vì `info` là tông
         * MẶC ĐỊNH nên phần lớn alert trong app đang vẽ một hộp không tồn tại
         * trong design system.
         *
         * ⚠️ Badge thì NGƯỢC LẠI: `Status=info` của Badge (259:97085) đúng là
         * xanh dương #1043A9. Khác biệt này CÓ THẬT giữa hai component —
         * ⛔ đừng "sửa" Badge cho giống Alert.
         */
        info: { root: 'border-border-brand-subtle bg-surface-primary', title: 'text-fg-brand' },
        success: {
          root: 'border-border-success-subtle bg-surface-success',
          title: 'text-success',
        },
        warning: {
          root: 'border-border-warning-subtle bg-surface-warning',
          title: 'text-warning',
        },
        error: { root: 'border-border-error-subtle bg-surface-error', title: 'text-error' },
        /**
         * `Intent=None` của Figma (259:93722): hộp KHÔNG mang trạng thái nào.
         *
         * ⚠️ MÀU trùng khít `info` ở trên — cả hai đều là `Border/Primary/Medium`
         * + `Foreground/Primary/Default` — nên coi `brand` là BÍ DANH màu của
         * `info`. Thứ duy nhất tách chúng trong bản vẽ (và ở đây) là BIỂU TƯỢNG:
         * `info` có icon `alert-information` mặc định, `brand` cố ý KHÔNG có
         * icon nào (xem `AlertIcon.tsx`). Dùng `brand` cho ghi chú trung tính
         * ("Vui lòng kiểm tra thông tin trước khi xác thực giao dịch"), nơi mà
         * một biểu tượng cảnh báo sẽ làm người dùng tưởng có chuyện.
         *
         * ⛔ Giữ CẢ HAI tên: xoá hay đổi tên là phá API công khai của component
         * đang được dùng ở 8 nơi.
         */
        brand: { root: 'border-border-brand-subtle bg-surface-primary', title: 'text-fg-brand' },
      },
    },
    defaultVariants: { tone: 'info' },
  },
  { twMergeConfig },
);

type AlertVariants = VariantProps<typeof alert>;

export type AlertTone = NonNullable<AlertVariants['tone']>;

export { alert };
