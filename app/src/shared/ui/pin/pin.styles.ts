import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `PinInput`.
 *
 * ── Số đo lấy từ Figma "BIDV OMNI MB" › section Pin (259:91096) ─────────────
 * KIỂU Ô VUÔNG (`variant: 'box'`) — ô 40 rộng × 48 cao · khe 8 (`Gap/Ga8`) ·
 * bo **16** (`Border/Bo16`) · viền 1 · chấm che **10** · dòng thông báo cách
 * hàng ô 8, cỡ chữ 13/17 (`CAPTION/T13`). Hai độ dài: 4 ô và 6 ô.
 *
 * KIỂU CHẤM TRÒN (`variant: 'dot'`) — vòng ngoài ⌀32, chấm trong ⌀16, khe 8;
 * ô rỗng là vòng #f6f6f6 KHÔNG có chấm. Đây là kiểu của màn **nhập PIN đăng
 * nhập** (có bàn phím số riêng bên dưới), khác hẳn hàng ô vuông của màn OTP.
 *
 * ⚠️ Bo 16 là số đọc từ biến `Border/Bo16` của section, và khớp với đo pixel:
 * ô 40×48 mà đoạn viền trên PHẲNG chỉ dài 10px ⇒ r ≈ (40−10)/2 ≈ 15–16. Với
 * bo 8 (giá trị cũ ở đây) đoạn phẳng phải dài 24px, và hàng ô trông vuông hẳn
 * so với ô nhập chính bo 24 trên cùng màn hình.
 *
 * ⚠️ `shrink` trên ô là phần THÊM so với thiết kế. Figma chốt bề rộng 40, mà
 * 8 ô × 40 + 7 khe = 376 > 343dp của khung nội dung — trên máy nhỏ hàng ô sẽ
 * tràn ra ngoài mép phải và ô cuối bị cắt mất. Cho phép co lại thì ô hẹp hơn
 * một chút nhưng KHÔNG ô nào biến mất.
 *
 * ⚠️ MÀU không chép từ Figma (#eeeeee / #00453c / #c30000 / #e6e6e6) mà đi qua
 * token — bảng màu chế độ tối là một bộ giá trị khác hẳn.
 *
 * ⛔ `twMergeConfig` bắt buộc: `tailwind-variants` tạo thực thể `twMerge` RIÊNG.
 * Không truyền thì slot nhận cả cỡ chữ lẫn màu chữ sẽ lặng lẽ ĐÁNH RƠI cỡ chữ.
 */
export const pinStyles = tv(
  {
    slots: {
      root: 'w-full gap-xs',
      /**
       * Khung neo cho ô nhập trong suốt. Phải có: `absolute inset-0` bám vào
       * cha gần nhất, mà nếu cha là `root` thì ô nhập phủ cả dòng thông báo —
       * chạm vào chữ lỗi cũng mở bàn phím, một hành vi không ai chờ đợi.
       */
      field: 'w-full',
      row: 'w-full flex-row items-center justify-center gap-xs',
      cell: 'h-control-md w-10 shrink items-center justify-center rounded-sm border bg-bg-input',
      char: 'text-body-lg font-semibold text-fg-1',
      /** Chấm che — ⌀10 theo Figma (đo tại tâm chấm: x 875→884). */
      dot: 'h-2.5 w-2.5 rounded-full bg-fg-1',
      /**
       * Ký tự GIỮ CHỖ của ô chưa điền — Figma vẽ dấu `–` (kiểu chữ số) hoặc
       * một chấm mờ (kiểu che) trong MỌI ô còn trống, màu `Foreground/Ink/Delta`
       * #e1e1e1; token gần nhất của repo là `fg-4` (#C5C5C5).
       *
       * ⛔ Đừng bỏ đi cho "gọn": hàng 6 ô trắng trơn không nói được còn thiếu
       * mấy chữ số, và ở kiểu `secure` thì ô đã điền (một chấm nhỏ) với ô chưa
       * điền gần như không phân biệt nổi trên màn hình nhỏ. Đây là tín hiệu
       * tiến độ chính của màn nhập OTP.
       */
      placeholder: 'text-body-lg text-fg-4',
      dotEmpty: 'h-2.5 w-2.5 rounded-full bg-fg-4',
      /**
       * Vòng ⌀32 của kiểu `dot`. Viền `border` TRẦN + `border-transparent` là
       * cố ý: bản vẽ không có viền, nhưng ô đang chờ chữ số phải nhìn ra được,
       * nên trạng thái `active` chỉ tô MÀU viền. ⛔ Bỏ `border` trần đi thì
       * variant `active` cho ra viền dày 0 — mất dấu vị trí đang nhập.
       */
      ring: 'h-8 w-8 items-center justify-center rounded-full border border-transparent bg-disabled-2',
      /** Chấm trong ⌀16 — chỉ vẽ khi ô ĐÃ điền. */
      ringDot: 'h-4 w-4 rounded-full bg-action-base',
      /**
       * Ô nhập THẬT: trong suốt, phủ kín hàng ô để chạm chỗ nào cũng mở bàn
       * phím. ⛔ Đừng đổi `opacity-0` thành ẩn hẳn (`hidden`/`display:none`) —
       * lúc đó nó không nhận được cú chạm và bàn phím không bao giờ hiện ra.
       */
      input: 'absolute inset-0 h-full w-full p-0 opacity-0',
      messageRow: 'w-full flex-row items-center justify-center gap-2xs',
      /**
       * ⛔ `shrink` bắt buộc. `<Text>` của React Native mặc định
       * `flexShrink: 0`, nên nó giữ nguyên bề rộng vừa đo được — bằng đúng cả
       * hàng — rồi icon 16 + khe 4 đẩy hàng rộng hơn khung chứa. Vì hàng này
       * `justify-center`, phần dôi chia ĐỀU hai bên: trên máy 320dp (khung nội
       * dung 288dp) một dòng lỗi dài đo được 308dp ⇒ chữ thò ~10dp MỖI bên,
       * cụt ở cả hai đầu, và KHÔNG có lỗi nào báo.
       *
       * ⚠️ `shrink` chứ KHÔNG phải `flex-1` như `input`/`date-picker`: `flex-1`
       * là `flex-basis: 0` + `grow`, chữ sẽ chiếm hết chỗ trống ⇒ `justify-center`
       * hết tác dụng và một dòng lỗi NGẮN tụt về sát icon bên trái, lệch hẳn
       * khỏi hàng ô vốn đang canh giữa. `shrink` chỉ co khi thật sự thiếu chỗ.
       */
      message: 'shrink text-caption-lg text-error',
    },
    variants: {
      state: {
        /**
         * ⚠️ `border-1` (#E6E6E6) đậm hơn bản vẽ đúng MỘT bậc: Figma khai
         * `Border/Grey/Default` #EEEEEE, mà token cùng giá trị trong repo là
         * `divider-1`. Giữ `border-1` có chủ ý — `divider-1` là token ĐƯỜNG KẺ
         * (kẻ ngang giữa hai dòng danh sách), còn đây là VIỀN của một ô nhập, và
         * ô PIN phải đổi màu viền đồng bộ với `Input` khi bảng màu đổi. Chênh
         * lệch mắt thường không thấy; ⛔ đừng "sửa" thành `divider-1` mà không
         * đổi cả `input.styles.ts` theo.
         */
        default: { cell: 'border-border-1' },
        /** Ô đang chờ chữ số kế tiếp — viền màu thương hiệu, thay cho con trỏ. */
        active: { cell: 'border-border-brand', ring: 'border-border-brand' },
        error: {
          cell: 'border-border-error',
          ring: 'bg-surface-error',
          ringDot: 'bg-error',
        },
        /**
         * Viền lấy `border-ink-disabled` (#E1E1E1 — đúng `Border/Ink/Disable`
         * của Figma), KHÔNG phải `disabled-2`.
         *
         * ⛔ `border-disabled-2` là #F6F6F6 ở chế độ sáng — NHẠT HƠN cả nền ô
         * khoá (#E6E6E6), nên viền không những mờ mà còn biến mất hẳn và hàng ô
         * bị khoá thành một mảng xám không biên. Cặp này khớp đúng cặp mà
         * `Input` dùng cho trạng thái `disabled`.
         *
         * `disabled-1` đã pha sẵn alpha ⇒ ⛔ đừng thêm modifier `/xx`.
         */
        disabled: {
          cell: 'border-border-ink-disabled bg-disabled-1',
          char: 'text-action-disabled-fg',
          dot: 'bg-action-disabled-fg',
          dotEmpty: 'bg-action-disabled-fg',
          placeholder: 'text-action-disabled-fg',
          ring: 'bg-disabled-1',
          ringDot: 'bg-action-disabled-fg',
        },
      },
    },
    defaultVariants: { state: 'default' },
  },
  { twMergeConfig },
);

export type PinVariants = VariantProps<typeof pinStyles>;

/** Trạng thái của một ô — suy ra trong `PinInput`, không phải prop công khai. */
export type PinCellState = NonNullable<PinVariants['state']>;

/**
 * Kiểu hiển thị của hàng ô.
 *
 * `box` — ô vuông 40×48 (OTP, mã xác thực). Mặc định, giữ nguyên hành vi cũ.
 * `dot` — chấm tròn ⌀32 không khung ô (màn nhập PIN đăng nhập).
 *
 * ⚠️ KHÔNG khai thành variant của `tv()`: hai kiểu dùng hai bộ slot khác nhau
 * (`cell`/`char`/`dot` ↔ `ring`/`ringDot`), nên chỗ rẽ nhánh nằm ở JSX của
 * `PinCell`, còn `tv()` chỉ lo TRẠNG THÁI. Nhét cả hai vào một variant thì mỗi
 * slot phải mang class của cả hai kiểu và `tailwind-merge` sẽ trộn chúng.
 */
export type PinVariant = 'box' | 'dot';
