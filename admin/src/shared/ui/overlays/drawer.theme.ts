/**
 * drawer.theme.ts — kit2 token centralisation cho `Drawer.tsx`.
 *
 * Đồng bộ ngôn ngữ visual với `modal.theme.ts` (Elevated Command Console):
 *  - Overlay KHÔNG chép lại: nhập thẳng `MODAL_OVERLAY_BASE` từ `modal.theme`
 *    (`bg-black/45 backdrop-blur-[12px] backdrop-saturate-125` — 3 tham số đó
 *    cân với nhau, giải thích ở `modal.theme.ts`). Drawer chỉ thêm animation
 *    vào/ra của riêng nó. Mở đồng thời Modal + Drawer là lệch tông lộ ngay,
 *    nên đây phải là MỘT hằng dùng chung chứ không phải hai chuỗi "hẹn nhau".
 *  - Content: gradient background · layered shadow (halo brand + deep drop +
 *    inset glow) · border brand primary-5/45.
 *  - Edge rail: 2px sáng brand ở CẠNH QUAY VÀO TRANG (right drawer → rail
 *    trái, left drawer → rail phải, …) qua inset shadow — không cần slot mới.
 *  - Header · close · body cùng recipe với Modal → user không cảm thấy 2 hệ
 *    rời rạc.
 *
 * Slide animations trong `src/styles/globals.css`.
 */
import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';
import { MODAL_OVERLAY_BASE } from './modal.theme';

/**
 * Shadow shared cho MỌI side — halo brand + deep drop shadow. Rail cạnh trong
 * (inset một chiều) được cộng thêm ở `compoundVariants` theo `side`.
 *
 * ⚠️ QUAN TRỌNG: Tailwind JIT chỉ scan STATIC string — KHÔNG resolve template
 * literal `${...}`. Nên mỗi side variant inline TOÀN BỘ shadow value ở dạng
 * static (không dùng `${SHADOW_BASE}`). Đổi shadow chung → sửa 4 chỗ.
 */
export const drawerStyles = tv(
  {
    slots: {
      overlay: [
        // Nền lấy thẳng từ `modal.theme` — Drawer chỉ khác ở animation vào/ra.
        MODAL_OVERLAY_BASE,
        'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      ].join(' '),
      content: [
        'fixed z-50 flex flex-col outline-none',
        // Gradient background — đồng ngôn ngữ Modal panel.
        'bg-gradient-to-b from-bg-dialog-2 via-bg-dialog to-bg-dialog',
        // Border sharp brand primary — đọc rõ trên overlay đen.
        //
        // ⚠️ MÉP QUAY VÀO TRANG DÀY 4px, VÀ ĐÓ LÀ CỐ Ý. Nó là HAI lớp cộng lại:
        // `border-l-2` (màu ở đây, 45%) + ray `inset 2px 0 0 …55%` trong shadow
        // của từng `side`. Đã đối chiếu với dự án gốc: y hệt, không phải base
        // tự cộng thêm một lớp. Ai thấy dày quá thì hạ ĐÚNG MỘT lớp (bỏ
        // `border-l-2`, hoặc hạ 45% → ~20%) và phải sửa cả bên gốc cho khớp —
        // ĐỪNG xoá ray inset, nó là chi tiết nhận diện của hệ lớp nổi.
        'border-primary-5/45',
      ].join(' '),
      /**
       * Header — gradient bg + accent dọc trước title. Dùng chung ngôn ngữ với
       * `modalLayoutStyles.header` để 2 hệ trông cùng gia đình.
       */
      header: [
        'relative flex shrink-0 items-start justify-between gap-3 px-4 pt-3.5 pb-3',
        'bg-gradient-to-b from-bg-dialog-2/60 via-bg-dialog-2/20 to-transparent',
        // Ray gradient sáng dưới header (thay border phẳng).
        "after:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px]",
        'after:bg-gradient-to-r after:from-transparent after:via-primary-5/55 after:to-transparent',
        'after:shadow-[0_2px_6px_color-mix(in_srgb,var(--color-primary-5)_25%,transparent)]',
      ].join(' '),
      title: 'text-body-14-semibold uppercase tracking-[0.08em] text-fg-1',
      description: 'mt-1 text-caption-12 text-fg-4',
      close: [
        'flex size-8 shrink-0 cursor-pointer items-center justify-center',
        'border border-transparent bg-transparent text-fg-2 outline-none',
        'transition-[color,border-color,background-color,transform] duration-150 ease-out',
        'hover:scale-105 hover:border-error/50 hover:bg-error/12 hover:text-error',
        'active:scale-95',
        'focus-visible:border-error/50 focus-visible:ring-2 focus-visible:ring-error/25',
        '-mt-0.5 -mr-0.5',
      ].join(' '),
      // ⚠️ KHÔNG `[scrollbar-gutter:stable]` — gutter chỉ chừa ở cạnh phải và nằm
      // NGOÀI padding → inset thành 16px trái / 26px phải, lệch hẳn so với header
      // + footer (`px-4`). Xem giải thích đầy đủ ở `modal.theme.ts` slot `body`.
      body: 'min-h-0 flex-1 overflow-auto p-4',
      footer: [
        'flex shrink-0 items-center justify-end gap-3 px-4 py-3',
        'border-t border-divider-1',
        'bg-gradient-to-t from-bg-dialog-2/50 via-bg-dialog-2/15 to-transparent',
      ].join(' '),
    },
    variants: {
      side: {
        right: {
          content: [
            'right-0 top-0 h-full max-w-[100vw] border-l-2',
            // Edge rail 2px sáng brand tại CẠNH TRÁI (mép trong tiếp giáp viewport)
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_15%,transparent),0_28px_72px_-8px_var(--color-popup-shadow),0_16px_40px_-12px_rgba(0,0,0,0.55),inset_0_0_48px_color-mix(in_srgb,var(--color-primary-5)_5%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--color-teal-5)_8%,transparent),inset_2px_0_0_color-mix(in_srgb,var(--color-primary-5)_55%,transparent)]',
            'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
          ].join(' '),
        },
        left: {
          content: [
            'left-0 top-0 h-full max-w-[100vw] border-r-2',
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_15%,transparent),0_28px_72px_-8px_var(--color-popup-shadow),0_16px_40px_-12px_rgba(0,0,0,0.55),inset_0_0_48px_color-mix(in_srgb,var(--color-primary-5)_5%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--color-teal-5)_8%,transparent),inset_-2px_0_0_color-mix(in_srgb,var(--color-primary-5)_55%,transparent)]',
            'data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
          ].join(' '),
        },
        top: {
          content: [
            'left-0 top-0 w-full max-h-[100vh] border-b-2',
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_15%,transparent),0_28px_72px_-8px_var(--color-popup-shadow),0_16px_40px_-12px_rgba(0,0,0,0.55),inset_0_0_48px_color-mix(in_srgb,var(--color-primary-5)_5%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--color-teal-5)_8%,transparent),inset_0_-2px_0_color-mix(in_srgb,var(--color-primary-5)_55%,transparent)]',
            'data-[state=open]:animate-slide-in-top data-[state=closed]:animate-slide-out-top',
          ].join(' '),
        },
        bottom: {
          content: [
            'left-0 bottom-0 w-full max-h-[100vh] border-t-2',
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_15%,transparent),0_28px_72px_-8px_var(--color-popup-shadow),0_16px_40px_-12px_rgba(0,0,0,0.55),inset_0_0_48px_color-mix(in_srgb,var(--color-primary-5)_5%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--color-teal-5)_8%,transparent),inset_0_2px_0_color-mix(in_srgb,var(--color-primary-5)_55%,transparent)]',
            'data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom',
          ].join(' '),
        },
      },
      size: {
        sm: {},
        md: {},
        lg: {},
        xl: {},
      },
    },
    compoundVariants: [
      { side: 'right', size: 'sm', class: { content: 'w-80' } },
      { side: 'right', size: 'md', class: { content: 'w-[480px]' } },
      { side: 'right', size: 'lg', class: { content: 'w-[640px]' } },
      { side: 'right', size: 'xl', class: { content: 'w-[800px]' } },
      { side: 'left', size: 'sm', class: { content: 'w-80' } },
      { side: 'left', size: 'md', class: { content: 'w-[480px]' } },
      { side: 'left', size: 'lg', class: { content: 'w-[640px]' } },
      { side: 'left', size: 'xl', class: { content: 'w-[800px]' } },
      { side: 'top', size: 'sm', class: { content: 'h-64' } },
      { side: 'top', size: 'md', class: { content: 'h-[360px]' } },
      { side: 'top', size: 'lg', class: { content: 'h-[480px]' } },
      { side: 'top', size: 'xl', class: { content: 'h-[600px]' } },
      { side: 'bottom', size: 'sm', class: { content: 'h-64' } },
      { side: 'bottom', size: 'md', class: { content: 'h-[360px]' } },
      { side: 'bottom', size: 'lg', class: { content: 'h-[480px]' } },
      { side: 'bottom', size: 'xl', class: { content: 'h-[600px]' } },
    ],
    defaultVariants: {
      side: 'right',
      size: 'md',
    },
  },
  {
    // tv() có twMerge instance riêng: nếu không khai báo, `text-body-14-semibold`
    // trong slot `title` bị coi là MÀU và bị `text-fg-1` nuốt mất → tiêu đề
    // drawer rơi về cỡ chữ mặc định. Xem `cn.ts` § twMergeFontExtend.
    twMergeConfig: twMergeFontExtend,
  },
);

export type DrawerRecipeVariants = VariantProps<typeof drawerStyles>;
export type DrawerSide = NonNullable<DrawerRecipeVariants['side']>;
export type DrawerSize = NonNullable<DrawerRecipeVariants['size']>;
