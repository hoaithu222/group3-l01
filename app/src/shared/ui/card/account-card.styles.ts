import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `AccountCard` — thẻ chọn tài khoản nguồn (Figma
 * "Card tài khoản nguồn" 259:97665). Tách khỏi `AccountCard.tsx` để file
 * component giữ dưới 200 dòng — cùng khuôn với `card.styles.ts` và
 * `media-card.styles.ts` trong chính nhóm này.
 *
 * ── Quyết định 1: nền ĐẶC thay cho dải màu ──────────────────────────────────
 * Figma tô nền bằng gradient hai điểm dừng xanh rêu `#00453C → #076055`
 * (`BgCardTKnguon1/2`). React Native không vẽ được gradient bằng CSS nên ở đây
 * dùng nền đặc `action-base` — đúng điểm dừng ĐẦU của chính dải đó.
 *
 * ⚠️ Chênh lệch hai điểm dừng NHÌN THẤY được trên thẻ 343×96 (đo pixel ảnh
 * Figma: `#05594e` ở góc trái trên, `#00463d` ở mép phải), nên đây là lệch có
 * thật chứ không phải "không đáng kể". Cần đúng dải màu thì bọc
 * `<LinearGradient>` ở NGOÀI và truyền `className="bg-transparent"`, hoặc dựng
 * `<Defs><LinearGradient>` bằng `react-native-svg` — gói đó ĐÃ có sẵn trong
 * `package.json`, nhánh này không tốn thêm phụ thuộc nào.
 *
 * ⛔ Nền là `action-base` chứ KHÔNG phải `primary-8`, và chữ là `action-fg` chứ
 * không phải `fg-inverse`. Thang `primary-*` cố ý giữ nguyên một giá trị ở cả hai
 * chế độ, còn `fg-inverse` thì ĐẢO — ghép hai cái đó lại thì ở chế độ tối thẻ ra
 * xanh đậm #00241F còn chữ hoá gần ĐEN (#08120F): **1.15:1**, chữ biến mất hẳn
 * chứ không chỉ "dưới ngưỡng AA". Cặp `action-base`/`action-fg` đảo CÙNG chiều
 * nên giữ **10.96:1** (sáng) / **8.53:1** (tối); nhãn `action-fg/80` giữ
 * **7.60:1** / **5.54:1** — cả hai đều qua ngưỡng 4.5:1 của chữ thường.
 * ⚠️ Số đo tính lại từ `src/styles/colors/colors.json`; bảng màu TỐI đã được
 * dựng lại một lần, nên ⛔ đừng chép số cũ ở đâu về đây mà không đo lại.
 *
 * ── Quyết định 2: chữ XUỐNG DÒNG chứ không cắt ─────────────────────────────
 * ⛔ Figma cắt hai dòng chữ bằng `text-ellipsis`. Ở đây thì không: hai dòng đó
 * là SỐ TÀI KHOẢN và SỐ DƯ. "26110002…" khiến người dùng phải mở màn khác để
 * kiểm tra mình đang chuyển từ tài khoản nào, còn số dư bị cắt thì đọc sai bậc
 * nghìn/triệu. Thẻ cao thêm 20px là cái giá rẻ hơn nhiều.
 */
export const accountCardStyles = tv(
  {
    slots: {
      // px-md / py-xl và bo 24px lấy đúng số của Figma.
      root: 'w-full flex-row items-center gap-sm rounded-md bg-action-base px-md py-xl',
      info: 'flex-1 gap-2xs',
      line: 'flex-row items-baseline gap-2xs',
      /**
       * ⛔ CẢ HAI cột đều `flex-1`. Nhãn mà không có `flex` là hỏng THẬT: con của
       * Yoga mặc định `flexShrink: 0`, nên nhãn giữ nguyên bề rộng TỰ NHIÊN còn
       * `value` (`flex-basis: 0`) chỉ nhận phần THỪA — kể cả khi phần đó bằng 0.
       * Máy 320dp với nhãn "Tài khoản thanh toán nguồn": cột thông tin còn ~192dp,
       * nhãn ăn ~170dp, số tài khoản còn ~18dp và rớt xuống MỖI DÒNG MỘT CHỮ SỐ.
       * `flex-basis` = 0 ở cả hai bên thì mỗi bên luôn giữ đúng một nửa hàng —
       * cùng cách vá của `ListItem`, và nó cũng làm hai dòng nhãn/giá trị thẳng
       * cột với nhau. ⛔ Giá trị KHÔNG bao giờ nhận `numberOfLines`: xem Quyết
       * định 2 ở đầu file. Cần cắt thì cắt NHÃN.
       *
       * ⚠️ `/80` chỉ chạy vì `action-fg` là token ĐẶC. Token đã pha sẵn alpha
       * (`white-*`, `overlay`…) thì modifier độ trong không có tác dụng nào.
       */
      label: 'flex-1 text-label-md text-action-fg/80',
      value: 'flex-1 text-label-md font-semibold text-action-fg',
    },
    variants: {
      /**
       * Thẻ bị khoá: đổi CẶP màu sang `action-disabled` / `action-disabled-fg`.
       *
       * ⛔ Đừng khoá bằng `opacity-*`: lớp mờ ăn cả logo ngân hàng đặt ở khe
       * `leading` (sai nhận diện của họ), còn cặp `action-disabled` /
       * `action-disabled-fg` đảo theo chế độ nên nó luôn là "chữ xám trên nền
       * xám CỦA CHÍNH CHẾ ĐỘ ĐÓ", không phải một lớp mờ chồng lên màu sáng.
       *
       * ⚠️ Đo lại từ `colors.json`: `action-disabled-fg` là **#969696** (sáng) /
       * **#7C8A86** (tối) trên nền `action-disabled` **#E6E6E6** / **#2A3734** ⇒
       * **2.37:1** và **3.44:1** — DƯỚI 4.5:1, và đó là chủ ý: WCAG 2.1 §1.4.3
       * loại trừ đích danh thành phần đang không hoạt động, chữ mờ CHÍNH LÀ tín
       * hiệu "bấm không được" (xem `scripts/check-contrast.mjs`, `isDisabledToken`).
       * ⛔ Đừng kéo cặp này lên cho "đạt chuẩn" — thẻ khoá sẽ trông y hệt thẻ bấm được.
       */
      disabled: {
        true: {
          label: 'text-action-disabled-fg/80',
          root: 'bg-action-disabled',
          value: 'text-action-disabled-fg',
        },
      },
    },
    defaultVariants: { disabled: false },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);
