/**
 * confirm-dialog.theme.ts — cấu hình variant + recipe cho `ConfirmDialog.tsx`.
 *
 * Tách khỏi `modal.theme.ts` vì ConfirmDialog KHÔNG dùng khung header/footer của
 * modal thường: nó chạy `frame="hud"` (khung vát 4 góc) + layout DỌC, CĂN GIỮA.
 * Cùng pattern per-component theme với `drawer.theme.ts`.
 *
 * ── VÌ SAO KHÁC FormModal ───────────────────────────────────────────────────
 * FormModal = màn nhập liệu → tiêu đề nằm trái, mắt quét từ trái sang, khung
 * chữ nhật. ConfirmDialog = khoảnh khắc quyết định → mọi thứ dồn về TRỤC GIỮA
 * (gem → tiêu đề → mô tả → khuyến nghị → hàng nút), khung vát góc + sáng theo
 * mức độ nghiêm trọng. Hai hệ phải nhìn ra ngay là khác nhau.
 *
 * ── PHÂN VAI MÀU (quan trọng — đừng đảo lại) ────────────────────────────────
 *   KHUNG  = brand green cố định (biến `--hud`, mặc định `primary-5`).
 *   NGỮ NGHĨA (đỏ/vàng/xanh…) = CHỈ ở gem icon + nút hành động + quầng nhỏ sau
 *   gem, qua biến `--accent` mỗi variant set trên panel.
 *
 * ⚠️ Bản trước cho màu variant lái CẢ khung + quầng inset + aura → nguyên tấm
 * dialog bị nhuộm vàng/đỏ, nền navy mất, chữ và gem tụt tương phản, nhìn "đục".
 * Mẫu thiết kế gốc cũng làm đúng vậy: khung cyan CỐ ĐỊNH, chỉ icon cam + nút
 * cam. Màu ngữ nghĩa là ĐIỂM NHẤN, không phải lớp phủ.
 *
 * ── NỀN (đọc từ dưới lên) ───────────────────────────────────────────────────
 *  0. `panel` gradient + lưới `texture` 28px — do `modal.theme.ts` lo.
 *  1. `aura`        — quầng NHỎ màu `--accent`, đúng sau gem ở đỉnh.
 *  2. `counterGlow` — quầng lạnh rất nhẹ đáy panel, chống "chết nền" nửa dưới.
 *  3. `sheen`       — vệt sáng chéo mảnh quét đỉnh, giả phản chiếu kính.
 */
import { tv } from 'tailwind-variants';

import { twMergeFontExtend } from '@/shared/utils/style/cn';
import type { SystemIconName } from '@/shared/ui/icons/Icons';
import type { GemColor } from '../icons/GemIcon';
import type { ButtonSkin } from '@/shared/ui/actions/Button';

interface ConfirmVariantConfig {
  /**
   * Class set biến `--accent` (màu ngữ nghĩa) trên panel — BẮT BUỘC string
   * tĩnh để Tailwind JIT quét được. KHÔNG set `--hud`: khung giữ brand green.
   */
  accent: string;
  gemColor: GemColor;
  icon: SystemIconName;
  iconCn: string;
  /** Skin built-in của Button (đã đúng hover/active). */
  actionSkin?: ButtonSkin;
  /** Chỉ dùng cho variant không có skin tương ứng — phải khai cả `active:*`. */
  actionCn?: string[];
  defaultLabel: string;
}

export const CONFIRM_VARIANTS = {
  confirm: {
    accent: '[--accent:var(--color-sky-5)]',
    gemColor: 'blue',
    icon: 'folder-outline',
    iconCn: 'size-full text-sky-3',
    actionSkin: 'base',
    defaultLabel: 'Xác nhận',
  },
  delete: {
    accent: '[--accent:var(--color-red-5)]',
    gemColor: 'red',
    icon: 'trash-can-outline',
    iconCn: 'size-full text-red-3',
    actionSkin: 'danger',
    defaultLabel: 'Xóa',
  },
  success: {
    accent: '[--accent:var(--color-green-5)]',
    gemColor: 'green',
    icon: 'circle-check-outline',
    iconCn: 'size-full text-green-3',
    actionCn: [
      'border-green-6 bg-green-6 text-neutral-0',
      'hover:bg-green-7 hover:border-green-7',
      'active:bg-green-8 active:border-green-8',
    ],
    defaultLabel: 'Xác nhận',
  },
  warning: {
    accent: '[--accent:var(--color-yellow-5)]',
    gemColor: 'yellow',
    icon: 'triangle-exclamation-outline',
    iconCn: 'size-full text-yellow-3',
    actionCn: [
      'border-yellow-6 bg-yellow-6 text-neutral-0',
      'hover:bg-yellow-7 hover:border-yellow-7',
      'active:bg-yellow-8 active:border-yellow-8',
    ],
    defaultLabel: 'Tiếp tục',
  },
  info: {
    accent: '[--accent:var(--color-sky-5)]',
    gemColor: 'blue',
    icon: 'circle-exclamation-outline',
    iconCn: 'size-full text-sky-3',
    actionSkin: 'base',
    // Không để "OK": tiếng Anh giữa giao diện tiếng Việt và không nói nút làm gì (`interaction-ux.md §6` cấm
    // nhãn "OK"). Đây chỉ là nhãn dự phòng — nơi gọi biết ngữ cảnh thì truyền `actionLabel` cụ thể ("Đã hiểu"…).
    defaultLabel: 'Đồng ý',
  },
} as const satisfies Record<string, ConfirmVariantConfig>;

export type ConfirmDialogVariant = keyof typeof CONFIRM_VARIANTS;

export const confirmDialogStyles = tv(
  {
    slots: {
      /** Trục giữa: gem → (title + description) → tip → actions. */
      root: 'relative flex flex-col items-center gap-4 px-6 pb-5 pt-7 text-center',
      /**
       * Quầng màu ngữ nghĩa — NHỎ, neo ngay sau gem ở đỉnh panel. Bản trước là
       * blob 360px lệch góc trên-trái phủ nửa dialog → nhuộm cả nền.
       * `opacity` hạ ở light theme: cùng alpha mix, quầng màu trên nền TRẮNG đọc
       * mạnh hơn hẳn trên navy, không hạ thì thành vết ố.
       */
      aura: [
        'pointer-events-none absolute -top-16 left-1/2 size-[260px] -translate-x-1/2 rounded-full',
        'bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_66%)]',
        'opacity-45 blur-[28px] dark:opacity-80',
      ],
      /** Quầng lạnh rất nhẹ ở đáy — giữ nửa dưới panel không bị "chết nền". */
      counterGlow: [
        'pointer-events-none absolute -bottom-24 left-1/2 h-[220px] w-[420px] -translate-x-1/2 rounded-[50%]',
        'bg-[radial-gradient(ellipse,color-mix(in_srgb,var(--color-teal-5)_12%,transparent),transparent_70%)]',
        'opacity-50 blur-[32px] dark:opacity-90',
      ],
      sheen: [
        'pointer-events-none absolute inset-x-0 top-0 h-28',
        'bg-[linear-gradient(115deg,transparent_36%,color-mix(in_srgb,var(--color-neutral-0)_7%,transparent)_50%,transparent_64%)]',
      ],
      /** Nút đóng — nổi ở góc phải trên, KHÔNG dùng header bar của Modal. */
      close: [
        'absolute right-3 top-3 z-20 flex size-8 cursor-pointer items-center justify-center',
        'border border-transparent bg-transparent text-fg-on-dialog-muted outline-none',
        'transition-[color,border-color,background-color,transform] duration-150 ease-out',
        'hover:scale-105 hover:border-error/50 hover:bg-error/12 hover:text-error',
        'active:scale-95 focus-visible:border-error/50 focus-visible:ring-2 focus-visible:ring-error/25',
      ],
      /** Hàng chứa gem + 2 "cánh" gạch ngang hai bên (chi tiết HUD của mẫu). */
      gemRow: 'relative flex items-center justify-center gap-4',
      /**
       * Cánh dùng màu KHUNG (brand), không dùng màu ngữ nghĩa — xem §PHÂN VAI MÀU.
       * 2px chứ không 1px: ở 1px + opacity thấp nó đọc ra "vết xước" chứ không ra
       * chi tiết cố ý.
       */
      wing: 'pointer-events-none h-[2px] w-12 shrink-0',
      /** Title + description bám sát nhau thành 1 khối, tách khỏi các cụm khác. */
      titleGroup: 'flex flex-col items-center gap-2',
      title: 'text-h4-medium text-fg-on-dialog',
      description: 'max-w-[40ch] text-body-14 leading-relaxed text-fg-on-dialog-muted',
      /** Gạch ngăn mảnh, sáng ở giữa — cùng ngôn ngữ "ray" của hệ modal. */
      divider: 'h-px w-full bg-gradient-to-r from-transparent via-border-2 to-transparent',
      tipRow: 'flex flex-wrap items-center justify-center gap-x-2 gap-y-1',
      tipLabel: 'text-body-14-medium text-primary-5',
      tipText: 'text-body-14 text-fg-on-dialog-muted',
      actions: 'flex w-full gap-3',
      cancel: 'flex-1',
      /**
       * Nút hành động PHỤ (bố cục 3 nút) — giữ skin `base` mặc định của Button,
       * KHÔNG lấy `--accent`: hai nút cùng tô màu ngữ nghĩa sẽ triệt tiêu điểm
       * nhấn của nút chính, user không còn biết nút nào là hành động cuối.
       */
      secondaryAction: 'flex-1',
      /** Glow theo màu ngữ nghĩa cho nút hành động — điểm sáng cuối của bố cục. */
      action: 'flex-1 shadow-[0_0_22px_-6px_color-mix(in_srgb,var(--accent)_75%,transparent)]',
    },
    variants: {
      /**
       * Bố cục 3 nút: siết gap + cấm gãy dòng. Nhãn tiếng Việt nhiều từ ("Lưu &
       * Rời khỏi") với `flex-1` (basis 0) sẽ tự ngắt dòng giữa chừng nếu không
       * chặn — 3 nút lệch chiều cao nhìn ra ngay là lỗi.
       */
      triple: {
        true: {
          actions: 'gap-2',
          cancel: 'whitespace-nowrap',
          secondaryAction: 'whitespace-nowrap',
          action: 'whitespace-nowrap',
        },
      },
      /** Hướng "cánh": gradient tắt dần về phía ngoài. */
      side: {
        left: {
          wing: 'bg-gradient-to-r from-transparent to-[var(--hud,var(--color-primary-5))]',
        },
        right: {
          wing: 'bg-gradient-to-l from-transparent to-[var(--hud,var(--color-primary-5))]',
        },
      },
    },
  },
  {
    // slot `title` có CẢ font token lẫn màu → không khai báo thì twMerge của tv()
    // nuốt mất cỡ chữ. Xem `cn.ts` § twMergeFontExtend.
    twMergeConfig: twMergeFontExtend,
  },
);
