import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Nới vùng chạm của hai nút `−` / `+`.
 *
 * ⚠️ Bản vẽ cho mỗi nút một ô **26×24** (Figma `290:126630`, ba ô con tại
 * x=16/50/84, y=16) — dưới hẳn ngưỡng chạm 44dp mà cả Apple lẫn Google khuyến
 * nghị. ⛔ Phóng to hình vẽ là sai bản thiết kế (`docs/rules/mobile-ux.md`), nên
 * bù bằng `hitSlop`: 26+10+10 = **46** ngang, 24+10+10 = **44** dọc.
 *
 * ⚠️ 10 chứ không phải 12 như `InputSecureToggle`, và đó là số ĐO chứ không
 * phải ý thích: hai nút cách nhau đúng 42dp (khe 8 + ô số 26 + khe 8), nên nới
 * 12 mỗi phía là hai vùng chạm CHỒNG nhau ở giữa — cú chạm vào ô số rơi vào nút
 * vẽ sau (`+`) và người dùng thấy số tự tăng khi họ chỉ định chạm vào con số.
 * Với 10 thì 10+10 = 20 < 42, hai vùng vẫn rời nhau.
 */
export const HIT_SLOP = 10;

/**
 * Công thức style của `Stepper`.
 *
 * ── ⛔ KHUNG lấy từ `input/input.styles.ts`, đây chỉ là phần RUỘT ────────────
 * Trong Figma khối này là một BIẾN THỂ của chính component `Input` (còn nguyên
 * các khe ẩn `VND`, `icon_ht_cancel`), nên `Stepper.tsx` dùng lại slot `field`
 * của `inputStyles` cho cái khung — bo 24, viền 1, nền `bg-input`, đệm 16, khe
 * 8, cao tối thiểu 56. Chép chuỗi class sang đây là cầm chắc hai component lệch
 * nhau ở lần đổi token kế tiếp (xem chú thích đầu `select/Select.tsx`).
 *
 * ── Số đo Figma `290:126630` (đã mở `get_metadata` + `get_variable_defs` đối
 *    chiếu lại trực tiếp, không phải chép từ báo cáo) ─────────────────────────
 * Khung **126×56** · `Padding/Pa16` · `Gap/Ga8` · `Border/Bo24` (⇒ `rounded-md`)
 * · ba ô con 26×24 tại x = 16 · 50 · 84, y = 16 · chữ `BODY/T16-Regular` (16/24)
 * màu `Foreground/Ink/Active` #1A1A1A · `−`/`+` lúc chạm biên đổi sang
 * `Grays/Gray 2` #AEAEB2 · nền `Background/White/Default`.
 *
 * ── ⚠️ Viền: bản vẽ là `Border/Primary/Light` #DCEBE9, code ra #E6E6E6 ───────
 * Đã kiểm lại và ĐÂY KHÔNG PHẢI lỗi của `Stepper`, nên ⛔ đừng "sửa" ở file này.
 * Ba lý do, theo thứ tự quan trọng:
 *
 *  1. **Cùng một biến, cùng một quyết định.** `Input` (`703:27411`, `259:97583`)
 *     cũng bind đúng `Border/Primary/Light`, và `input.styles.ts` đã cố ý ánh xạ
 *     nó sang `border-1`. `Stepper` dùng LẠI slot `field` của `inputStyles`, nên
 *     đổi riêng ở đây là tách hai component ra làm hai màu viền cho cùng một
 *     khung — đúng thứ mà cả hai file đang cố tránh.
 *  2. **Mắt không phân biệt được.** Trên nền ô trắng, #DCEBE9 đo được 1.23:1
 *     còn #E6E6E6 đo được 1.25:1 — chênh 0.02, tức một sợi viền 1px hơi ngả
 *     xanh so với một sợi ghi.
 *  3. **Chép thẳng hex thì hỏng chế độ tối.** Token duy nhất mang đúng #DCEBE9 ở
 *     nấc thang là `primary-2`, mà thang SỐ không đảo theo chế độ: ở chế độ tối
 *     nó vẫn #DCEBE9 trên nền ô #1E2826 ⇒ **12.33:1**, một khung viền sáng chói
 *     quanh ô nhập. `border-1` lật sang #3C4C48 và giữ đúng sắc thái "một mép
 *     mờ".
 *
 * ⚠️ Repo CÓ một token vai trò trùng màu — `header-border` (#DCEBE9 sáng /
 * #20443C tối) — nhưng nó là viền chân thanh tiêu đề. Mượn nó cho ô nhập là
 * buộc hai thứ không liên quan phải đổi màu cùng nhau. Muốn bám #DCEBE9 thật
 * thì phải là token vai trò MỚI (ví dụ `border-brand-light`, sáng #DCEBE9 / tối
 * #20443C) và phải áp ở `input.styles.ts` cho CẢ họ ô nhập — quyết định đó
 * thuộc về người giữ `src/styles/`, không thuộc về file này.
 *
 * ⚠️ 126 KHÔNG viết cứng vào `w-`: 16 + 26 + 8 + 26 + 8 + 26 + 16 = 126 tự ra
 * đúng từ ba ô con, mà ô số dùng `min-w-` nên số ba chữ số ("100") vẫn nới được
 * khung thay vì bị cắt. ⛔ Đóng cứng `w-[126px]` là "10 chỉ" thành "1…" ở cỡ
 * chữ hệ thống lớn, và không có lỗi nào báo.
 */
export const stepperStyles = tv(
  {
    slots: {
      /**
       * ⛔ `w-auto self-start` đè `w-full` của slot `field`: ô nhập chiếm hết bề
       * ngang form, còn ô tăng/giảm là một khối 126dp đứng nép trái (bản vẽ đặt
       * nó dưới nhãn "Số lượng", không kéo dài hết hàng). Thiếu cặp này thì khối
       * giãn ra cả 343dp và hai nút văng về hai mép màn hình.
       */
      root: 'w-auto justify-center self-start',
      /** Ô chạm 26×24 của bản vẽ — biểu tượng 24dp nằm giữa, phần dôi là hitSlop. */
      button: 'w-[26px] items-center justify-center',
      value: 'min-w-[26px] text-center text-body-lg text-fg-1',
    },
    variants: {
      /**
       * ⛔ Cả khối bị khoá thì CON SỐ cũng phải mờ theo. Chỉ làm mờ hai nút là
       * người dùng thấy một con số đen nhánh giữa hai nút xám và tưởng vẫn sửa
       * được bằng cách chạm vào số. `field` của `inputStyles` đã lo phần nền và
       * viền của trạng thái `disabled`.
       */
      disabled: {
        true: { value: 'text-action-disabled-fg' },
      },
    },
    defaultVariants: { disabled: false },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

export type StepperVariants = VariantProps<typeof stepperStyles>;
