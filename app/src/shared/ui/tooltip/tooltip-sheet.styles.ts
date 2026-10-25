import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `TooltipSheet` (tấm trượt cho tooltip CẤP 3).
 *
 * Tách khỏi `TooltipSheet.tsx` vì mỗi slot đều phải kèm số đo Figma và lý do —
 * để chung một file thì phần JSX bị chôn dưới chú thích và file vượt trần 200
 * dòng của `src/shared/ui/AGENTS.md`.
 *
 * Nguồn: Figma "BIDV SmartBanking v2.0" — sheet cấp 3 của section `Tooltips`
 * (`259:97797`).
 */
export const tooltipSheet = tv(
  {
    slots: {
      backdrop: 'absolute inset-0 bg-overlay',
      /**
       * ⚠️ `shrink` là bắt buộc, không phải trang trí.
       *
       * `ScrollView` trong React Native mặc định `flexShrink: 0`. Không đặt thì
       * nó KHÔNG co theo `maxHeight` của sheet: nội dung dài tràn xuống dưới mép
       * màn, và người dùng không cuộn tới được mấy dòng cuối.
       */
      body: 'shrink',
      bullet: 'flex-1 text-body-lg text-fg-on-popup',
      /**
       * Ô 24dp bọc biểu tượng ✕ — chỗ tô lớp phản hồi lúc nhấn. ⚠️ Cùng cỡ với
       * biểu tượng nên bố cục không đổi; vùng chạm 48dp vẫn do `hitSlop={12}`.
       */
      closeButton: 'size-xl items-center justify-center rounded-full',
      // Figma vẽ dấu chấm bằng `list-disc`; ở RN phải tự vẽ một ô tròn.
      dot: 'mt-xs h-2xs w-2xs rounded-full bg-fg-on-popup',
      /** Vùng bắt cử chỉ vuốt: tay nắm + hàng tiêu đề. */
      grab: 'w-full pt-xl',
      grabber: 'mb-md h-2xs w-9 self-center rounded-full bg-divider-2',
      header: 'flex-row items-center gap-md px-md',
      /**
       * Figma: bo trên 24 (`border/bo24`), padding trên 24, nền `BgPopup`.
       *
       * ⚠️ Nền của sheet này KHÁC nền của `BottomSheet` — đối chiếu lại Figma
       * thì section Bottom sheet bind `Background/White/Default` còn sheet cấp 3
       * của Tooltip bind `BgPopup`. Hai biến khác nhau thật, không phải sơ suất.
       *
       * ── Trần bề rộng từ máy tính bảng ──────────────────────────────────────
       * ⛔ Sheet KHÔNG được kéo hết bề ngang máy tính bảng: nội dung ở đây là
       * mấy gạch đầu dòng giải thích một khái niệm, thả tự do trên màn 1000dp
       * thì mỗi dòng dài gấp ba mức đọc thoải mái và nút ✕ bay tận mép phải.
       * Kẹp `max-w-content` (720dp) rồi canh giữa — cùng token với `BottomSheet`
       * và với trần nội dung của `Screen`.
       *
       * ⚠️ `w-full` ở đầu chuỗi là thứ giữ cho `tablet:self-center` không bóp
       * sheet lại: `alignSelf` đổi bề rộng mặc định từ "kéo giãn" sang "vừa nội
       * dung".
       */
      root: 'w-full overflow-hidden rounded-t-md bg-bg-popup tablet:max-w-content tablet:self-center',
      title: 'flex-1 text-header-sm font-semibold text-fg-on-popup',
    },
    variants: {
      /**
       * ⛔ Nút ✕ là đường thoát chính của tấm — không có phản hồi lúc chạm thì
       * trong ~150ms trước khi tấm bắt đầu trượt xuống, người dùng kết luận
       * "bấm không ăn". Cùng lớp nền nhấn `action-tint` với `SheetHeader` và
       * `CalendarDay` để cả bộ component phản hồi giống nhau.
       */
      pressed: {
        true: { closeButton: 'bg-action-tint' },
      },
    },
    defaultVariants: { pressed: false },
  },
  { twMergeConfig },
);
