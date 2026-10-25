/**
 * command-palette.theme.ts — token tập trung + `tv()` recipe cho Command
 * Palette (⌘K). Theo `widget-composition.md §1`: một widget, một file theme.
 *
 * TÁI DÙNG bốn nguồn dùng chung thay vì chép lại bề mặt (`kit2-architecture.md
 * §5b`):
 *  - `MODAL_OVERLAY_CLASS` (`overlays/modal.theme`) — lớp phủ mờ toàn màn,
 *    CHUNG với Modal/FormModal/Drawer.
 *  - `modalStyles().texture()` / `.corner()` (`overlays/modal.theme`) — lưới
 *    nền 28px + 4 ngoặc góc, "chữ ký" thị giác của MỌI lớp nổi toàn màn trong
 *    hệ này (Modal/FormModal/ConfirmDialog/Drawer). Panel của ta KHÔNG tự vẽ
 *    lại — gọi thẳng slot của `modalStyles`, đổi token ở một chỗ là cả hệ đổi
 *    theo. Thiếu hai thứ này là panel trông "phẳng", lệch hẳn phần còn lại.
 *  - `POPUP_ITEM_CLASS` / `POPUP_ITEM_ICON_CLASS` (`overlays/popup-surface.theme`)
 *    — dòng kết quả, y hệt Menu/ContextMenu/Popover.
 *  - Ô tìm kiếm dùng thẳng token `field.theme` (đã kéo theo `<Input>`).
 *
 * Panel neo GẦN ĐỈNH màn hình (KHÔNG canh giữa như Modal) — đúng quy ước
 * spotlight/command palette, mắt không phải rời xa vùng đang thao tác. Vì vậy
 * KHÔNG gọi `modalStyles().panel()` (khung đó định vị canh giữa + có kích
 * thước theo `ModalSize`) — chỉ mượn các slot TRANG TRÍ (`texture`, `corner`,
 * `topRail`), còn khung/kích thước là recipe riêng dưới đây.
 *
 * ⛔ `overflow-visible` ở `panel` là BẮT BUỘC (giống Modal) — 4 ngoặc góc vẽ
 * bằng margin ÂM nên nằm ngoài biên panel; `overflow-hidden` sẽ cắt mất chúng.
 * Vùng cần cắt (danh sách dài) đã có `overflow-y-auto` riêng ở slot `list`.
 *
 * ⛔ KHÔNG có `rounded-*` ở đây, cố ý: kit2 dùng ngôn ngữ góc vuông/vát 45°
 * (xem `modal.theme.ts`), không có component nào bo tròn góc.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';

const TV = { twMergeConfig: twMergeFontExtend } as const;

export const commandPaletteStyles = tv(
  {
    slots: {
      /** Panel chính — kính mờ + viền primary, cùng chiều sâu với Modal nhưng neo trên. */
      panel: [
        'fixed inset-x-0 top-[10vh] z-50 mx-auto flex w-[calc(100%-2rem)] max-w-xl flex-col',
        'max-h-[min(28rem,70dvh)] touch:max-h-[min(28rem,70dvh)] overflow-visible outline-none',
        'bg-gradient-to-b from-bg-dialog-2 via-bg-dialog to-bg-dialog',
        'border-2 border-primary-5/45',
        'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary-5)_10%,transparent),0_32px_80px_-12px_var(--color-popup-shadow),0_12px_32px_-16px_var(--color-popup-shadow)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2',
      ],
      searchRow: 'relative flex shrink-0 items-center gap-2 border-b border-divider-2 px-1 py-1',
      list: 'relative min-h-0 flex-1 overflow-y-auto p-1.5',
      groupLabel: 'px-2.5 pt-2.5 pb-1 text-caption-10-medium tracking-wide text-fg-4 uppercase',
      empty: 'px-3 py-10 text-center text-body-14 text-fg-4',
      footer: 'relative flex shrink-0 items-center gap-4 border-t border-divider-2 px-3 py-2',
    },
  },
  TV,
);
