import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Input`.
 *
 * Tách khỏi `Input.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`) — không phải vì công thức dùng lại ở đâu khác.
 *
 * ── Số đo lấy từ Figma "BIDV OMNI MB" (Input 343×88, node 259:97583) ─────────
 * Nhãn 24 · khoảng cách 8 · ô 56 (đệm 16 + dòng chữ 24 + đệm 16) · bo 16 ·
 * viền 1 · khoảng cách trong ô 8 · khoảng cách `*` ↔ nhãn 2. Có thông báo dưới
 * ô thì cộng 8 + 16 (⇒ 112) hoặc 8 + 20 (⇒ 116). Hai ô cạnh nhau trong form
 * cách nhau 24 — khoảng cách đó thuộc về màn hình, không nhét vào component.
 *
 * ⚠️ MÀU không lấy từ Figma. Figma dùng `#dcebe9` / `#1a1a1a` / `#666`; ở đây
 * đi qua token (`border-1`, `fg-1`, `fg-2`…) để lần đổi bảng màu không phải sửa
 * hàng chục file.
 *
 * ⛔ `twMergeConfig` bắt buộc: `tailwind-variants` tạo thực thể `twMerge` RIÊNG.
 * Không truyền thì slot nào nhận cả cỡ chữ (`text-body-lg`) lẫn màu chữ
 * (`text-fg-1`) sẽ lặng lẽ ĐÁNH RƠI cỡ chữ — chữ vẫn hiện, chỉ sai cỡ, và
 * không có lỗi nào báo.
 */
export const inputStyles = tv(
  {
    slots: {
      /**
       * ⚠️ `tablet:max-w-content` (720dp) là phần THÊM so với bản vẽ (bản vẽ chỉ
       * có khung điện thoại 375dp). Ô nhập kéo dài 1200dp trên máy tính bảng nằm
       * ngang trông như lỗi bố cục, và mắt phải quét cả màn hình để đi từ nhãn
       * sang giá trị vừa gõ.
       *
       * ⚠️ CÙNG token với trần nội dung của `Screen` (như `vci-sun-mobile`: ô
       * nhập lấp đúng cột 720 của form), không phải một số riêng. Bản 560 cũ
       * hụt 128dp so với cột 688 của màn có trần ⇒ ô nhập ngắn hơn thẻ và nút
       * ngay bên dưới, mép phải lởm chởm.
       *
       * ⛔ `max-w-` chứ KHÔNG phải `w-`: `max-w` chỉ CHẶN, không ép — máy hẹp
       * 320dp vẫn co lại được. Nơi gọi cần ô tràn hết bề ngang trên máy tính
       * bảng thì truyền `className="tablet:max-w-none"`.
       */
      root: 'gap-xs tablet:max-w-content',
      labelRow: 'w-full flex-row items-center gap-xs',
      labelGroup: 'flex-1 flex-row items-center gap-3xs',
      label: 'flex-1 text-label-lg font-semibold text-fg-1',
      /**
       * ⛔ `error` TRẦN, không phải `error-5`. Xem lý do ở biến thể `tone` bên
       * dưới — dấu `*` mà chìm vào nền tối thì ô bắt buộc trông y hệt ô không.
       */
      required: 'text-label-lg font-semibold text-error',
      // Chú thích phải nhãn ("Tối đa 50 ký tự") là NỘI DUNG, không phải
      // placeholder: `fg-3` chỉ 2.96:1 trên thẻ trắng ⇒ `fg-2`, 5.74:1 ở chế độ
      // sáng và 8.42:1 ở chế độ tối. Cùng lý do với `tone: hint` bên dưới.
      //
      // ⚠️ `caption-lg` = 13/17, KHÔNG phải `caption-sm` (12/16): section Input
      // của Figma không khai kiểu chữ 12px nào — caption duy nhất trong bảng
      // biến là `CAPTION/T13-Regular`, và instance help text (259:97588) cao
      // đúng 16–17. ⛔ Đừng hạ về `caption-sm` "cho nhỏ gọn": 12px là cỡ chữ
      // nhỏ nhất mà bản vẽ KHÔNG dùng ở đây.
      //
      // ⛔ `shrink` bắt buộc — xem chú thích chung ở `hintRow`/`messageRow`.
      hint: 'shrink text-caption-lg text-fg-2',
      /**
       * Hàng chú thích và hàng thông báo đều là `[icon 16] + khe 4 + [chữ]` —
       * đúng component "Message Text" của Figma (259:97588 / 259:97596).
       *
       * ⛔ Biểu tượng KHÔNG phải trang trí: `src/shared/ui/AGENTS.md` chốt
       * "đừng để MÀU là dấu hiệu duy nhất". Màu `warning` chỉ đạt 4.06:1 và
       * người mù màu đỏ-lục không phân biệt nổi dòng lỗi với dòng gợi ý nếu
       * chỉ khác nhau ở màu chữ. `PinInput` đã làm đúng từ đầu; `Input` thì
       * không, nên hai component cùng bộ báo lỗi theo hai cách khác nhau.
       *
       * ── ⛔ Phần CHỮ của hai hàng này PHẢI co được ─────────────────────────
       * `<Text>` của React Native mặc định `flexShrink: 0`, nên nó giữ nguyên
       * bề rộng vừa đo được — bằng đúng cả hàng — rồi icon 16 + khe 4 đẩy nó
       * lòi ra ngoài. Đo trên máy 320dp (ô nhập rộng 288dp sau lề 16 mỗi bên):
       * 16 + 4 + 288 = 308 ⇒ dòng lỗi thò **20dp** khỏi mép phải ô, chữ chạy ra
       * ngoài thẻ, và KHÔNG có lỗi nào báo. `numberOfLines` cũng không cứu
       * được: bề rộng chưa bao giờ bị chặn thì không có gì để xuống dòng.
       * ✅ `date-picker/date-picker.styles.ts` đã làm đúng (`message: 'flex-1 …'`).
       *
       * ⚠️ `hintRow` dùng `shrink`, KHÔNG phải `flex-1` như `messageRow`: nó là
       * em của `labelGroup` trong cùng `labelRow`, chỉ được ăn phần còn thừa —
       * cho `flex-1` là nó giành chỗ của chính cái nhãn. `shrink` giữ bề rộng
       * tự nhiên và chỉ co lại đúng lúc hàng không đủ chỗ.
       */
      hintRow: 'shrink flex-row items-center gap-2xs',
      messageRow: 'w-full flex-row items-center gap-2xs',
      /**
       * Chiều cao là `min-h-` chứ không phải `h-`: người dùng có thể phóng to cỡ
       * chữ hệ thống, và chiều cao cứng sẽ CẮT mất phần dưới của dấu tiếng Việt
       * (`Ộ`, `Ẳ`) mà không có lỗi nào báo.
       *
       * ⛔ Hệ quả: KHÔNG có `min-h-control-lg`. Thang `control-*` chỉ được nối vào
       * `theme.height`, còn `minHeight` ăn theo thang giãn cách — gõ
       * `min-h-control-lg` thì Tailwind không sinh ra class nào, NativeWind bỏ
       * qua lặng lẽ, và ô nhập tụt xuống ôm sát chữ. Giữ `min-h-14` / `min-h-12`.
       *
       * ⚠️ Giữ `border` TRẦN, đừng đổi sang `border-hairline`: `tailwind-merge`
       * xếp `border-hairline` vào nhóm MÀU viền, nên biến thể `state` bên dưới
       * (`border-border-1`…) đè mất nó — ô nhập còn màu viền nhưng bề dày về 0,
       * tức là mất hẳn viền, và không có lỗi nào báo.
       */
      /**
       * ⚠️ `rounded-md` = **24dp**, KHÔNG phải 6px như Tailwind gốc (thang bo
       * góc đã bị thay, xem `src/shared/ui/AGENTS.md`).
       *
       * 24 là số ĐỌC THẲNG từ biến Figma, không phải suy ra: node 259:97573
       * bind `Border/Bo24` = 24 và trong node KHÔNG có biến `Bo16` nào.
       * (Bản trước ở đây ghi 16 vì suy luận hình học ngược dấu — đo "phần viền
       * thẳng còn 24" rồi kết luận bo = 16, trong khi phần thẳng 24 trên cạnh
       * cao 56 chính là dấu hiệu của bo 16, còn bo 24 cho phần thẳng 8. Số đo
       * pixel thật khớp bo 24: ở dòng cách mép trên 4px viền đã dịch vào 10.7px,
       * đúng công thức `24 − √(24² − 20²)`; bo 16 chỉ cho 5.4px.)
       */
      field: 'w-full flex-row items-center gap-xs rounded-md border bg-bg-input px-md',
      /**
       * `p-0` bắt buộc: `TextInput` trên Android tự thêm đệm mặc định của nền
       * tảng. Để nguyên thì chữ lệch khỏi tâm ô và hai ô cạnh nhau cao khác
       * nhau dù cùng một component.
       */
      control: 'flex-1 p-0 text-body-lg text-fg-1',
      /**
       * Hàng icon + ô nhập khi nhãn nằm TRONG khung (`labelInside`). Với bố cục
       * mặc định (nhãn ngoài khung) thì slot này không được dựng — chính `field`
       * đã là hàng đó rồi, thêm một lớp View nữa chỉ tốn một node.
       */
      controlRow: 'w-full flex-row items-center gap-xs',
      /**
       * `text-body-md` = 14/20, khớp `BODY/T14-Regular` mà Figma bind cho dòng
       * message.
       *
       * ⚠️ Ba nguồn từng nói ba số khác nhau (12/16 trong code cũ, 13/16 đo trên
       * ảnh render, 14/20 từ biến). Hình học phân xử: trong cùng section Input,
       * bản KHÔNG message (`259:97572`) cao 88 còn bản CÓ message
       * (`259:97573`) cao 116 — chênh đúng 28 = gap 8 + lineHeight 20. Với
       * 13/17 sẽ ra 25, với 12/16 ra 24. ⛔ Đừng hạ xuống `caption` lần nữa.
       *
       * ⛔ `flex-1` bắt buộc — xem chú thích chung ở `hintRow`/`messageRow`:
       * thiếu nó thì dòng lỗi thò 20dp ra ngoài ô nhập trên máy 320dp.
       */
      message: 'flex-1 text-body-md',
    },
    variants: {
      size: {
        md: { field: 'min-h-14 py-md' },
        /**
         * ⚠️ Figma chỉ có MỘT cỡ (56). `sm` = 48 là suy ra cho ô trong hàng/ô
         * lọc, vẫn ≥ 44dp — ngưỡng chạm tối thiểu của cả Apple lẫn Google.
         */
        sm: { field: 'min-h-12 py-sm' },
      },
      state: {
        default: { field: 'border-border-1' },
        /**
         * Viền GIỮ NGUYÊN 1px lúc focus, chỉ đổi màu. Nhảy lên `border-2` làm
         * nội dung trong ô dịch 1px — đúng vào lúc người dùng đang nhìn con trỏ.
         *
         * ⛔ KHÔNG dùng `border-ring-focus`: `ring-focus` là token CÓ SẴN ĐỘ
         * TRONG (10% ở chế độ sáng — xem `TOKEN_ALPHA` trong colors.generated).
         * Nó là màu của quầng sáng 4dp quanh ô (`Focus ring/primary` trong
         * Figma), không phải màu viền; đặt lên `border-*` thì viền focus mờ tới
         * mức gần như không thấy, và người dùng bàn phím ngoài mất dấu vị trí.
         * Figma dùng `Border/Primary/Active` = token `border-brand`.
         *
         * ── ⚠️ Quầng sáng focus 4dp: cố ý KHÔNG dựng ─────────────────────────
         * Figma khai `Focus ring/primary` (DROP_SHADOW, offset 0, radius 0,
         * spread 4, màu `Opacity/Primary/Op10` = token `ring-focus`). Bỏ vì:
         *  · React Native KHÔNG có `spread` cho bóng — `shadowRadius` là độ NHOÈ
         *    chứ không phải vành đặc, còn `elevation` của Android chỉ nhận một
         *    con số và tự tô bóng xám, không nhận màu thương hiệu;
         *  · dựng giả bằng một `<View>` bọc ngoài `-inset-1` thì mọi nơi gọi
         *    phải chừa thêm 4dp lề, nếu không ô nhập đầu tiên của form bị cắt
         *    quầng ở mép màn hình;
         *  · trên điện thoại KHÔNG có tiêu điểm bàn phím — viền đổi màu ở trên
         *    đã là dấu hiệu focus duy nhất người dùng cần.
         * ⇒ `ring-focus` hiện KHÔNG được dùng ở đâu. Đó là chủ ý, không phải
         * token bị bỏ quên; cần quầng thật (máy tính bảng có bàn phím) thì đây
         * là chỗ dựng nó.
         */
        focused: { field: 'border-border-brand' },
        /**
         * ⛔ `border-border-error` — hai chữ `border`, không phải lỗi gõ: token
         * tên `border-error`, tiện ích viền là `border-`. Bậc `error-5` cũ giống
         * hệt nhau ở hai chế độ nên viền lỗi trên ô tối chỉ còn 2.39:1: người
         * dùng thấy dòng chữ đỏ dưới ô mà KHÔNG thấy ô nào đang đỏ, và trong
         * form dài thì họ phải dò từng ô. Token trần lật sang #FF6B6B ⇒ 5.46:1.
         */
        error: { field: 'border-border-error' },
        /**
         * Ô CHỈ ĐỌC — Figma vẽ hẳn một trạng thái riêng (hàng "Read only" của
         * cả ba kiểu ô): nền #e6e6e6, **KHÔNG viền**, và chữ vẫn ĐEN đầy đủ.
         * Đó là điểm phân biệt với `disabled` (chữ #969696): dữ liệu trong ô
         * chỉ-đọc là dữ liệu ĐÚNG mà người dùng cần ĐỌC — số tài khoản, tên chủ
         * thẻ — chứ không phải một ô đã hết liên quan.
         *
         * ⛔ `border-transparent` chứ KHÔNG bỏ `border`: bỏ hẳn thì
         * `tailwind-merge` giữ lại `border` trần ở slot gốc, và React Native lấy
         * `borderColor` mặc định là ĐEN — ô chỉ-đọc có một khung đen quanh mình.
         *
         * ⛔ Cũng KHÔNG đổi màu chữ: đổi là hoà luôn vào `disabled` và mất hẳn
         * tầng phân biệt "khoá vì chưa tới lượt" ↔ "khoá vì không được sửa".
         */
        readonly: { field: 'border-transparent bg-action-disabled' },
        /**
         * Cặp `action-disabled` / `action-disabled-fg` là cặp ĐÃ ĐO tương phản.
         * ⛔ Đừng quay lại `bg-disabled-1` + `text-fg-5`: ở chế độ SÁNG đó là
         * #D9D9D9 trên #E6E6E6 — 1.13:1, tức là chữ trong ô bị khoá KHÔNG NHÌN
         * THẤY ĐƯỢC. Ô khoá thường là ô đã điền sẵn (số tài khoản, tên chủ thẻ)
         * mà người dùng cần ĐỌC để đối chiếu, nên xoá chữ đi là xoá luôn công
         * dụng của nó. Cặp mới: 2.37:1 sáng / 3.44:1 tối — vẫn mờ đúng nghĩa
         * "khoá", nhưng đọc được ở cả hai chế độ.
         *
         * Viền lấy `border-ink-disabled` (bậc vô hiệu hoá của họ `border-*`)
         * thay cho `disabled-2` — vốn là token NỀN bị đem đi làm viền. Cả hai
         * đều chìm vào ruột ô; cái được là viền hết phụ thuộc thứ nằm sau ô, và
         * ở chế độ sáng #E1E1E1 còn vạch được một mép mờ trên thẻ trắng
         * (1.31:1) chỗ mà #F6F6F6 cũ không vạch nổi gì.
         */
        disabled: {
          field: 'border-border-ink-disabled bg-action-disabled',
          control: 'text-action-disabled-fg',
        },
      },
      /**
       * Ô nhiều dòng: chữ phải bám MÉP TRÊN. Để `items-center` thì dòng đầu nằm
       * giữa ô rỗng rồi nhảy lên khi người dùng xuống dòng thứ hai.
       */
      multiline: {
        true: { field: 'items-start', control: 'min-h-20' },
      },
      /**
       * Kiểu "Text area" / "Money Form" của Figma: nhãn và chú thích nằm BÊN
       * TRONG khung, nội dung xếp dưới nhãn. Khung thành cột và tự cao theo
       * nội dung.
       *
       * ⚠️ Khai SAU `multiline` là bắt buộc: `tailwind-variants` gộp theo thứ
       * tự khai báo, mà `multiline` đặt `items-start`. Ở bố cục CỘT thì
       * `items-start` làm nhãn và ô nhập co lại bằng bề rộng chữ, khung rỗng
       * một mảng bên phải — `items-stretch` phải là cái thắng.
       *
       * ⚠️ Khe 4 (`gap-2xs`) giữa nhãn và nội dung là số SUY RA — cột này của
       * bản vẽ không khai biến khe nào. Khe 8 của bố cục nhãn-ngoài-khung nhìn
       * quá thưa khi cả hai đã nằm chung trong một khung có đệm 16.
       *
       * ⛔ Đây KHÔNG phải kiểu mặc định. Bản vẽ dùng nhãn-ngoài-khung cho gần
       * hết form; nhãn-trong-khung chỉ dành cho ô ghi chú nhiều dòng và ô số
       * tiền. Bật nhầm thì ô nhập cao hơn hẳn phần còn lại của form.
       */
      labelInside: {
        true: { field: 'flex-col items-stretch gap-2xs' },
      },
      /**
       * ⛔ Token trạng thái TRẦN (`error`, `success`), không phải bậc số. Các
       * bậc `error-5` / `success-5` giống hệt nhau ở hai chế độ, nên trên nền
       * tối chúng chỉ còn 2.39:1 và 2.99:1 — dưới ngưỡng AA. Dòng báo lỗi là
       * dòng BẮT BUỘC phải đọc được (nó nói vì sao form không gửi đi được), mà
       * lại thành dòng khó đọc nhất trên màn hình. Token trần lật sang #FF7B7B
       * / #4ADE9B ở chế độ tối ⇒ 6.04:1 và 8.81:1; ở chế độ sáng giá trị
       * KHÔNG đổi (#C30000 / #00810E), nên đây thuần là vá chế độ tối.
       */
      tone: {
        error: { message: 'text-error' },
        hint: { message: 'text-fg-2' },
        success: { message: 'text-success' },
      },
    },
    defaultVariants: {
      size: 'md',
      state: 'default',
      tone: 'error',
      multiline: false,
      labelInside: false,
    },
  },
  { twMergeConfig },
);

export type InputVariants = VariantProps<typeof inputStyles>;

/** Trạng thái viền — suy ra trong `Input`, không phải prop công khai. */
export type InputState = NonNullable<InputVariants['state']>;
