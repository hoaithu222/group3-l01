import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Section`. Tách khỏi `Section.tsx` để file component giữ dưới 200 dòng — cùng cách bố trí với
 * `card/card.styles.ts`, `list/list-item.styles.ts`.
 */
export const sectionStyles = tv(
  {
    slots: {
      /**
       * ⛔ Khe tiêu đề → nội dung KHÔNG cố định: nó đi theo `tone` (xem biến thể
       * bên dưới). Để trống ở đây để mỗi tông tự khai đúng số đo của mình —
       * viết `gap-sm` sẵn ở slot gốc thì `tailwind-merge` vẫn cho biến thể đè
       * được, nhưng người đọc phải dò hai chỗ mới biết khe thật là bao nhiêu.
       */
      root: '',
      /**
       * Hàng tiêu đề LUÔN là `flex-row`, kể cả khi không có `action`.
       *
       * ⚠️ Vì `flex-1` của tiêu đề chỉ có nghĩa "chiếm hết chiều NGANG" khi cha
       * là hàng ngang. Bỏ lớp này rồi đặt `flex-1` thẳng vào `<Text>` trong một
       * khối DỌC thì flexGrow ăn theo trục dọc: tiêu đề giãn cao hết phần trống
       * còn lại của màn và đẩy nội dung xuống dưới mép.
       */
      header: 'flex-row items-center gap-sm',
      /**
       * Cụm icon + tiêu đề khi có `icon`. Khe icon → chữ 8 (`gap-xs`), hẹp hơn khe chữ → hành động 12 của hàng: icon
       * thuộc về TIÊU ĐỀ, không đứng riêng.
       * ⛔ `flex-1` bắt buộc — cùng lý do với `title` bên dưới: thiếu nó thì tiêu đề dài đẩy `action` ra khỏi mép.
       */
      heading: 'flex-1 flex-row items-center gap-xs',
      /**
       * ⛔ `flex-1` bắt buộc: trong React Native con của `flex-row` mặc định
       * `flexShrink: 0`, nên tiêu đề dài (2 dòng như "Thông tin khách hàng nhận
       * hàng") sẽ ĐẨY `action` ra khỏi mép phải — icon sửa 24×24 nằm ngoài màn,
       * không ai bấm được và cũng không có lỗi nào báo.
       */
      title: 'flex-1 font-semibold',
    },
    variants: {
      /**
       * ⚠️ `tone` quyết CẢ kiểu chữ LẪN khe dưới tiêu đề, vì trong bản vẽ hai
       * thứ đó luôn đi cùng nhau: tiêu đề brand đứng trên một cái THẺ (khe 12),
       * tiêu đề ink đứng trên một ĐOẠN VĂN (khe 8). Tách khe ra thành prop
       * riêng thì mọi nơi gọi phải nhớ ghép đúng cặp, và quên một lần là nhóm
       * đó lệch nhịp với phần còn lại của màn mà không có lỗi nào báo.
       *
       * ⛔ Nơi gọi vẫn đè được bằng `className="gap-…"` — `tailwind-merge` cho
       * class truyền vào thắng class của biến thể.
       */
      tone: {
        /**
         * Tông mặc định của cả 4 section. ✅ Đã mở Figma đối chiếu trực tiếp
         * (`822:28747`, `get_variable_defs`): `HEADER/T18-Semibold`
         * (18/24, weight 600) + `Foreground/Primary/Default` #00453C ⇒
         * `text-header-sm` (typography.json: 18/24) + `text-fg-brand`
         * (#00453C sáng / #57D9BE tối). ⛔ Đừng đổi sang `text-header-md`:
         * 24/32 là cỡ của tiêu đề MÀN, không phải tiêu đề nhóm.
         *
         * Khe 12 (`gap-sm`) đo ở `822:28748`: chữ 343×24 ở y=0, thẻ ở y=36.
         */
        brand: { root: 'gap-sm', title: 'text-header-sm text-fg-brand' },
        /**
         * Tông thường của slide quy định `193:25481`: `LABEL/T16-Semibold`
         * (16/24) + `Foreground/Ink/Default` #1A1A1A — dùng cho tiêu đề CẤP HAI
         * nằm bên trong một nhóm đã có tiêu đề brand.
         *
         * ⚠️ Khe **8** chứ không phải 12, và đó là số đo chứ không phải ý
         * thích: ở `193:25612` chữ tiêu đề cao 21 rồi đoạn văn bắt đầu ở
         * y=27.83 trên khung slide rộng 292.69 vẽ lại khung máy 343 (tỉ lệ
         * 0.8534) ⇒ (27.83 − 21) / 0.8534 = 8. Đoạn văn không có mép thẻ để đỡ
         * mắt như `Card`, nên khe 12 làm tiêu đề trôi hẳn khỏi đoạn nó đang mở.
         */
        default: { root: 'gap-xs', title: 'text-label-lg text-fg-1' },
      },
    },
    defaultVariants: { tone: 'brand' },
  },
  { twMergeConfig },
);

type SectionVariants = VariantProps<typeof sectionStyles>;

export type SectionTone = NonNullable<SectionVariants['tone']>;
