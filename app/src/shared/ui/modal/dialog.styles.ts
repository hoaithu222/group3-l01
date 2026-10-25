import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style và số đo của `Dialog`.
 *
 * Tách khỏi `Dialog.tsx` vì mỗi slot ở đây đều phải kèm số đo Figma và lý do —
 * để chung một file thì phần JSX đọc được bị chôn dưới chú thích và file vượt
 * trần 200 dòng của `src/shared/ui/AGENTS.md`. Cùng cách chia như
 * `bottom-sheet/bottom-sheet.styles.ts` và `navigation/app-bar.styles.ts`.
 *
 * Nguồn: Figma "BIDV SmartBanking v2.0" — section `Modals` (`element modal`
 * 259:96111).
 */
export const dialog = tv(
  {
    slots: {
      /* Token `overlay` đã pha sẵn alpha (`Opacity/Ink/Op80` = 80%) và đổi theo
         theme. ⛔ Đừng thay bằng màu đen thô kèm modifier độ trong: họ `black`
         không có bậc DEFAULT nên class đó không sinh ra CSS nào. Đậm/nhạt chỉnh
         ở TẦNG TOKEN (`src/styles/colors/colors.json`), không chỉnh ở đây. */
      backdrop: 'absolute inset-0 bg-overlay',
      root: 'flex-1 items-center justify-center px-4',
      /* ⚠️ `max-w` KHÔNG có trong bản thiết kế (Figma chỉ vẽ khung 375). Thêm
         vào để trên máy tính bảng hộp thoại không kéo ngang hết màn — một dòng
         chữ dài 700dp thì mắt không lần được về đầu dòng sau. */
      card: 'w-full max-w-[420px] gap-md rounded-md bg-bg-dialog px-4 py-6',
      /* ⚠️ `shrink` bắt buộc: `ScrollView` mặc định `flexShrink: 0` nên KHÔNG co
         theo `maxHeight` của thẻ — mô tả dài lại đẩy hai nút ra ngoài màn, đúng
         cái mà `maxHeight` sinh ra để chặn. */
      scrollBody: 'w-full shrink',
      /* Khe tiêu đề ↔ nội dung phụ: đúng `gap-md` mà `card` vốn đặt giữa các
         khối, nay `ScrollView` chen vào giữa nên phải khai lại ở đây. */
      body: 'w-full gap-md',
      header: 'w-full gap-xs',
      /* ⛔ `fg-on-dialog*`, KHÔNG phải `fg-1`/`fg-2`. Ở chế độ SÁNG hai cặp
         trùng khít nên nhìn màn hình không thấy khác gì; ở chế độ TỐI mô tả
         đang là `fg-2` = #B7C4C0 trong khi vai trò "chữ phụ trên hộp thoại" là
         #A9B8B4 — sáng hơn ý thiết kế, và mất luôn khả năng chỉnh riêng chữ của
         hộp thoại về sau. Đo lại cả hai chế độ trên nền `bg-dialog`:
         tiêu đề 17.4:1 (sáng #1A1A1A/#FFFFFF) và 12.85:1 (tối #F2F6F4/#232E2C);
         mô tả 5.74:1 (sáng #666666) và 6.81:1 (tối #A9B8B4) — đều trên 4.5:1. */
      title: 'text-header-sm font-semibold text-fg-on-dialog',
      description: 'text-body-md text-fg-on-dialog-muted',
      actions: 'w-full gap-xs',
      /* Hai nút chia đôi bề ngang. `Button` tự lo chiều cao 48 và bo tròn hết;
         lớp bọc này chỉ chia phần ngang — `flex-1` phải nằm ở ĐÂY vì `Button`
         chỉ có `fullWidth` (w-full), không có `flex-1`. */
      action: '',
    },
    variants: {
      /**
       * Hướng xếp hai nút.
       *
       * `row` (mặc định) = bản vẽ chính: phụ TRÁI, chính PHẢI, mỗi nút một nửa.
       * `column` = mock ở góc dưới phải section Modals: hai nút full-width xếp
       * chồng, nút CHÍNH ở trên.
       *
       * ⛔ Không phải chuyện thẩm mỹ: `Button` khoá `numberOfLines={1}`, nên ở
       * bố cục chia đôi một nhãn tiếng Việt dài ("Xác nhận và tiếp tục") bị cắt
       * cụt sau dấu "…" mà không có lỗi nào báo. Nhãn dài hoặc nút có icon thì
       * dùng `column`.
       *
       * ⚠️ `flex-1` chỉ đúng ở hàng NGANG. Trong cột, `flex-1` chia CHIỀU CAO
       * còn lại cho hai nút và làm chúng cao hơn 48dp của bản vẽ ⇒ cột dùng
       * `w-full`.
       */
      actionsDirection: {
        row: { actions: 'flex-row', action: 'flex-1' },
        column: { actions: 'flex-col', action: 'w-full' },
      },
    },
    defaultVariants: { actionsDirection: 'row' },
  },
  { twMergeConfig },
);

/**
 * Trần chiều cao của thẻ, theo TỈ LỆ màn hình.
 *
 * Figma không vẽ ca này (mọi mock đều là mô tả ngắn), nhưng nó CHẮC CHẮN xảy
 * ra: câu mô tả do backend trả về. Không có trần thì trên máy màn nhỏ thẻ cao
 * quá màn, hai nút bị đẩy ra ngoài và người dùng không có cách nào chạm tới —
 * hộp thoại thành cái bẫy. 0.8 để vẫn còn thấy dải nền mờ trên/dưới.
 */
export const MAX_HEIGHT_RATIO = 0.8;
