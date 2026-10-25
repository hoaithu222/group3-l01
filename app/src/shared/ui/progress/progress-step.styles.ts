import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `ProgressStep`.
 *
 * Tách khỏi `ProgressStep.tsx` vì mỗi biến thể ở đây đều phải kèm số đo tương
 * phản đo được ở CẢ HAI chế độ — để chung một file thì phần JSX bị chôn dưới
 * chú thích và file vượt trần 200 dòng của `src/shared/ui/AGENTS.md`. Cùng cách
 * chia với `list/list-item.styles.ts` và `navigation/bottom-nav.styles.ts`.
 *
 * ⚠️ Đoạn nối dùng `flex-1` trong cột trái `self-stretch`, KHÔNG dùng chiều cao
 * cố định. Các bước trong Figma cao 48–152dp tuỳ độ dài mô tả; đặt số cứng thì
 * bước dài bị đứt đoạn nối ở giữa, bước ngắn bị đoạn nối chọc xuống chấm sau.
 */
export const progressStep = tv(
  {
    slots: {
      // Figma: cách cột trái 8, mỗi bước cao tối thiểu 64, đệm dưới 24.
      root: 'w-full flex-row items-start gap-xs',
      rail: 'w-xl items-center self-stretch',
      // Ba lớp đúng theo hình gốc: quầng 24 → vòng 18 → nhân 6. Chỉ 24 có tên
      // token; 18 và 6 nằm ngoài thang nên giữ số đo thô của Figma.
      //
      // ⚠️ `border` của vòng phải để TRẦN, đừng đổi sang `border-hairline`:
      // `tailwind-merge` xếp `border-hairline` vào nhóm MÀU viền, nên biến thể
      // `status` (`border-action-base`…) đè mất nó — vòng còn màu nhưng bề dày
      // về 0, tức là chấm mất viền, và không có lỗi nào báo.
      dotHalo: 'size-xl items-center justify-center rounded-full',
      dotRing: 'h-[18px] w-[18px] items-center justify-center rounded-full border',
      dotCore: 'h-1.5 w-1.5 rounded-full',
      /**
       * Đoạn nối là XANH NHẠT, không phải xám trung tính.
       *
       * Figma: đo pixel ở x=11–12 của dòng thời gian (đường 1dp nằm ở x=11.5
       * nên phủ 50% hai pixel) ra `#f5fafa` ⇒ màu thật là **#EBF5F5** =
       * `Background/Primary/Light`, trong repo là `action-tint`.
       *
       * ⚠️ Và đây là chỗ phải khai riêng cho chế độ TỐI. `action-tint` tối là
       * #16332C: đặt trên thẻ `bg-1` #1E2826 thì chênh lệch chỉ 1.11:1 — đoạn
       * nối biến mất hoàn toàn và dòng thời gian rời thành mấy cái chấm không
       * liên quan. `divider-1` tối (#2A3734 trên #1E2826, 1.22:1) thì vẫn vạch
       * ra được một sợi. Nên: đúng màu bản vẽ ở chế độ sáng, đổi sang đường kẻ trung tính ở
       * chế độ tối. ⛔ Đừng "dọn cho gọn" bằng cách bỏ nhánh `dark:`.
       */
      connector: 'w-px flex-1 bg-action-tint dark:bg-divider-1',
      content: 'min-w-0 flex-1 gap-2xs',
      /**
       * ⛔ Độ đậm nằm ở TỪNG biến thể `status`, không ở slot gốc.
       * `tailwind-merge` chỉ coi `normal`/`medium`/`semibold`/`bold` là nhóm độ
       * đậm; `font-regular` rơi vào nhóm FONT-FAMILY nên nó KHÔNG đè được
       * `font-semibold` viết ở đây — hai class cùng sống, mà `.font-semibold`
       * sinh sau trong bảng CSS nên nó thắng. Bước `pending` sẽ vẫn đậm, âm thầm.
       */
      title: 'text-body-lg',
      // Mô tả và dòng phụ (thời điểm xử lý, mã hồ sơ) là NỘI DUNG, phải đọc
      // được: `fg-3` chỉ 2.96:1 và `fg-4` chỉ 1.73:1 trên thẻ trắng — dưới cả
      // ngưỡng 3:1. `fg-2` cho 5.74:1 ở chế độ sáng, 8.42:1 ở chế độ tối.
      description: 'text-label-md text-fg-2',
      meta: 'text-caption-sm text-fg-2',
    },
    variants: {
      status: {
        /**
         * ⛔ Vòng phải là `action-base`, KHÔNG phải `primary-8`. Thang
         * `primary-*` cố ý giống hệt nhau ở hai chế độ, nên `primary-8`
         * (#00241F) nằm trên thẻ tối #1E2826 chỉ còn 1.09:1 — cả cái chấm biến
         * mất, dòng thời gian ở theme tối mất luôn phần cho biết bước nào đã
         * xong. `action-base` lật đúng chiều (#00453C → #3ECFB2): 10.96:1 ở
         * sáng, 7.77:1 ở tối.
         *
         * ⛔ Nền đã đổi màu theo chế độ thì LÕI buộc phải đổi cùng. `neutral-0`
         * là TRẮNG ở cả hai chế độ, mà `action-base` ở chế độ tối là màu SÁNG
         * #3ECFB2 ⇒ chấm trắng trên nền sáng, 1.95:1, mất hút. Lõi dùng đúng bạn
         * cùng cặp `action-fg` (10.96:1 sáng / 8.53:1 tối). Ghép chéo — giữ
         * `neutral-0` trên `action-base`, hay `action-fg` trên `primary-8` — là
         * mất một trong hai chế độ.
         *
         * Tiêu đề cũng vậy: `primary-7` (#002C26) trên thẻ tối cho 1.00:1 —
         * đúng bằng màu nền; `fg-brand` là token chữ thương hiệu ĐÃ đảo, cho
         * 8.71:1.
         */
        done: {
          dotCore: 'bg-action-fg',
          dotRing: 'border-action-base bg-action-base',
          title: 'font-semibold text-fg-brand',
        },
        /**
         * ⚠️ Quầng GIỮ token TRONG SUỐT `bg-primary` — ngoại lệ có chủ đích.
         * Quầng là một lớp sáng nhẹ, việc của nó là luôn nhỉnh hơn thứ nằm dưới:
         * 10% brand phủ lên thẻ tối cho #213934, nhỉnh 1.23:1 so với thẻ
         * #1E2826. Đổi sang `surface-primary` thì ở chế độ tối quầng chỉ còn
         * 1.11:1 — mờ hơn hẳn, gần như không thấy có quầng nào.
         */
        current: {
          dotCore: 'bg-action-base',
          dotHalo: 'bg-bg-primary',
          dotRing: 'border-border-brand bg-bg-1',
          title: 'font-semibold text-fg-1',
        },
        /**
         * Bước chưa tới vẫn phải CHÌM hơn `done`/`current` — thứ tự của dòng
         * thời gian đọc ra được là nhờ đó. Nhưng hạ bằng MÀU thì hỏng: `fg-4`
         * chỉ 1.73:1 trên thẻ trắng — dưới cả ngưỡng 3:1 của thành phần không
         * phải chữ, tức tiêu đề bước gần như không đọc nổi ở chế độ sáng; chế độ
         * tối cũng chỉ 3.06:1, tức trượt luôn ngưỡng 4.5 của chữ thường. Hạ bằng
         * NÉT — `font-regular` cạnh `font-semibold` của ba bước kia — giữ nguyên
         * thứ bậc mà màu vẫn đạt 5.74:1 sáng / 8.42:1 tối.
         */
        pending: {
          dotCore: 'bg-transparent',
          dotRing: 'border-border-2 bg-bg-1',
          title: 'font-regular text-fg-2',
        },
        /**
         * Cùng luật với `done`, và ở đây nó đã hỏng sẵn: lõi `neutral-0` trắng
         * trên `error` ở chế độ tối (#FF7B7B — đỏ SÁNG) chỉ còn 2.51:1, chấm
         * báo lỗi không có ruột. Cặp `action-error` / `action-error-fg` cho
         * 6.32:1 (sáng) và 7.02:1 (tối).
         */
        error: {
          dotCore: 'bg-action-error-fg',
          dotRing: 'border-action-error bg-action-error',
          title: 'font-semibold text-error',
        },
      },
      last: {
        false: { content: 'pb-xl', root: 'min-h-[64px]' },
      },
    },
    defaultVariants: { last: false, status: 'pending' },
  },
  { twMergeConfig },
);
