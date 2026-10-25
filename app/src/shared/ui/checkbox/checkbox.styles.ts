import { type Insets } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import type { CheckboxSize } from './checkbox.types';

/**
 * Công thức style và số đo của `Checkbox`.
 *
 * Tách khỏi `Checkbox.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`) — không phải vì công thức dùng lại ở đâu khác.
 * Cùng lý do, cùng cách chia như `chip/chip.styles.ts`.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB / Checkbox - Radio button - Toggle"
 * (`259:96522`): khung 24dp, ô vẽ 20dp, bo góc 4, nét 1,5, cách nhãn 8dp.
 *
 * ── Màu ─────────────────────────────────────────────────────────────────────
 * Figma: viền chưa chọn `Border/Primary/Medium`, nền khi chọn
 * `Background/Primary/Active`, nền nửa chọn `Background/Primary/Medium` (nhạt
 * hơn hẳn — chủ ý của thiết kế, không phải nhầm lẫn), khoá thì cả ô lẫn nhãn về
 * xám. Ở đây tất cả đi qua token VAI TRÒ: thang `primary-*` giống hệt nhau ở hai
 * chế độ nên ô xanh đậm gần như vô hình trên nền tối.
 */
export const checkbox = tv(
  {
    slots: {
      /** Lớp nhận chạm. Dáng vẻ nằm ở `root` vì nó phụ thuộc `pressed`. */
      pressable: '',
      root: 'flex-row items-start gap-2',
      /**
       * Khung 24dp GIỮ CHỖ, ô vẽ chỉ 20dp nằm giữa — đúng cấu trúc Figma (icon
       * 24×24 với hình lùi vào 2dp mỗi bên).
       * ⚠️ Đừng bỏ khung này để vẽ thẳng ô 20dp: khung là thứ giữ ô thẳng hàng
       * với dòng chữ đầu tiên của nhãn.
       */
      frame: 'items-center justify-center',
      box: 'items-center justify-center border-medium',
      mark: '',
      /**
       * Nhãn CHUỖI.
       *
       * ⚠️ `BODY/T14-Regular` (14/20), KHÔNG phải `LABEL/T16-Semibold` như bản
       * dựng đầu. Cả 7 chỗ dùng checkbox trong bản vẽ (mọi màn đặt mua —
       * `259:125429` · `413:28756` · `896:27965` · `1108:28155` · `345:27530` ·
       * `965:27829` — và slide hướng dẫn `193:25410`) đều bind `BODY/T14-Regular`
       * cho dòng "Tôi đã đọc, đồng ý với các Điều kiện, điều khoản…". Chữ đậm
       * 16dp làm dòng điều khoản NẶNG hơn cả nhãn của nút bên dưới nó.
       *
       * ⛔ Cỡ chữ nằm ở slot GỐC, không tách theo `size`: thang chữ chỉ có hai
       * bậc body, `text-label-md` (bậc cũ của `sm`) và `text-body-md` có số đo
       * TRÙNG NHAU (14/20) nên tách ra chỉ tạo hai tên gọi cho cùng một thứ.
       * `size` đổi cỡ Ô VẼ, không đổi cỡ chữ.
       *
       * ⚠️ ĐỘ ĐẬM cũng phải để ở đây, và KHÔNG được lặp lại ở bất kỳ variant
       * nào: `tailwind-merge` chỉ coi `normal`/`medium`/`semibold`/`bold` là
       * nhóm độ đậm, còn `font-regular` rơi vào nhóm FONT-FAMILY nên nó KHÔNG
       * đè được `font-semibold` — hai class cùng sống và `.font-semibold` sinh
       * sau trong bảng CSS nên nó thắng, âm thầm. Xem `ProgressStep.tsx:50`.
       *
       * `flex-1` là thứ giữ nhãn dài xuống dòng thay vì tràn ra khỏi màn: trên
       * React Native `flexShrink` mặc định là 0, khác hẳn web.
       */
      label: 'flex-1 text-body-md font-regular',
      /**
       * Nhãn `ReactNode` — CHỈ bố cục, không có chữ nghĩa gì.
       *
       * ⛔ Không phải `<Text>`: nơi gọi cần tự dựng `<Text>` của mình để lồng
       * `<Text onPress>` gạch chân vào GIỮA câu (dòng "Điều kiện, điều khoản").
       * Bọc sẵn một `<Text>` ở đây thì style của nơi gọi và style của component
       * chồng lên nhau, và không ai đoán được cái nào thắng.
       *
       * ⛔ Cũng không được bỏ hẳn lớp bọc này: thiếu `flex-1` thì câu điều khoản
       * hai dòng KHÔNG xuống dòng mà chạy thẳng ra ngoài mép phải màn hình —
       * lỗi kinh điển của React Native, không có cảnh báo nào.
       */
      labelSlot: 'flex-1',
    },
    variants: {
      size: {
        sm: { frame: 'h-5 w-5', box: 'h-4 w-4 rounded-3xs' },
        md: { frame: 'h-6 w-6', box: 'h-5 w-5 rounded-3xs' },
      },
      tone: {
        off: { box: 'border-border-brand-subtle bg-transparent', label: 'text-fg-1' },
        on: {
          box: 'border-action-base bg-action-base',
          // Trắng trên nền xanh đậm — đúng phần bị khoét của icon trong Figma.
          mark: 'border-action-fg bg-action-fg',
          label: 'text-fg-1',
        },
        mixed: {
          box: 'border-action-tint-strong bg-action-tint-strong',
          /**
           * ⚠️ KHÔNG lấy `bg-1` cho gạch ngang dù Figma vẽ chỗ khoét thủng màu
           * trắng: nền ô là `action-*` nên ở chế độ TỐI nó SÁNG lên còn `bg-1`
           * thì gần đen ⇒ 1.52:1 (#1E2826 trên #1E4A41), gạch biến mất và ô nửa
           * chọn không phân biệt được với ô đã chọn. `action-fg` cũng không cứu
           * được (1.67:1 tối — vẫn xa ngưỡng 3:1). `fg-brand` đảo đúng chiều:
           * 6.76:1 sáng · 5.72:1 tối.
           */
          mark: 'border-fg-brand bg-fg-brand',
          label: 'text-fg-1',
        },
      },
      disabled: {
        /**
         * ⚠️ Nền `action-disabled` (#E6E6E6) lệch 11 mức so với bản vẽ — Figma
         * dùng `Background/Ink/Light` #F1F1F1. Giữ nguyên có chủ ý: repo KHÔNG
         * có token nào bằng đúng #F1F1F1 ở vai trò "nền của control bị khoá", mà
         * `action-disabled` chính là token vai trò đó và nó đi thành CẶP đã đo
         * tương phản với `action-disabled-fg`. ⛔ Đừng "sửa" bằng hex thô —
         * `src/shared/ui/AGENTS.md` cấm, và ô khoá sẽ đứng yên khi đổi theme.
         */
        true: {
          box: 'border-border-strong bg-action-disabled',
          label: 'text-action-disabled-fg',
        },
      },
      pressed: {
        // Figma không vẽ trạng thái bấm cho checkbox. Nhưng trên di động không
        // có con trỏ đổi hình, nên bấm mà không thấy phản hồi thì người dùng bấm
        // thêm lần nữa — và lần thứ hai BỎ CHỌN đúng thứ vừa chọn.
        true: { root: 'opacity-60' },
      },
    },
    compoundVariants: [
      /**
       * Ô ĐÃ CHỌN mà bị khoá: Figma tô đặc `Background/Ink/Medium` (#969696 =
       * `action-disabled-fg`) và để dấu TRẮNG.
       * ⚠️ Đừng đảo vai hai token: lấy `action-disabled` (#E6E6E6) làm nền thì ô
       * khoá-đã-chọn gần y hệt ô khoá-CHƯA-chọn, người dùng không biết mình đã
       * chọn hay chưa, và dấu #969696 trên #E6E6E6 chỉ 2.37:1 — dưới ngưỡng 3:1
       * của hình phi văn bản. Cặp đúng bản vẽ: 2.96:1 sáng · 3.60:1 tối.
       */
      {
        disabled: true,
        tone: 'on',
        class: {
          box: 'border-action-disabled-fg bg-action-disabled-fg',
          mark: 'border-action-white bg-action-white',
        },
      },
      {
        disabled: true,
        tone: 'mixed',
        class: {
          box: 'border-action-disabled-fg bg-action-disabled-fg',
          mark: 'border-action-white bg-action-white',
        },
      },
    ],
    defaultVariants: { size: 'md', tone: 'off' },
  },
  // ⛔ BẮT BUỘC — không truyền thì slot `label` có cả cỡ chữ lẫn màu chữ sẽ lặng
  // lẽ ĐÁNH RƠI cỡ chữ. Xem docs/rules/styling-nativewind.md.
  { twMergeConfig },
);

/**
 * Bù vùng chạm cho đủ 44dp — khung vẽ chỉ 20–24dp.
 * ⚠️ Không phóng to hình: ô checkbox to hơn thiết kế trông như lỗi hiển thị, còn
 * bấm trượt thì người dùng đổ lỗi cho app.
 */
export const HIT_SLOP: Record<CheckboxSize, Insets> = {
  sm: { bottom: 12, left: 12, right: 12, top: 12 },
  md: { bottom: 10, left: 10, right: 10, top: 10 },
};
