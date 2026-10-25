/**
 * PageHeaderChip — HÌNH KHỐI CHUẨN cho MỌI control bấm được mà page ghim lên
 * thanh header: chip tab, nút action, nút quay lại.
 *
 * ⛔ ĐÂY LÀ NGUỒN DUY NHẤT của hình khối đó. Muốn thêm control mới thì dùng chip
 *    này, đừng vẽ khung riêng — cùng một thanh header có hai ba hệ nút là user
 *    không đọc ra "cái nào bấm được thì trông thế nào".
 *
 * ⛔ Chip của page CỐ Ý KHÔNG dùng `HEADER_ICON_BUTTON_CLASS`. Khung vuông +
 *    viền là ngôn ngữ của cụm UTILITY TOÀN CỤC vế phải (luôn có mặt ở mọi
 *    trang). Control của page đi theo NỘI DUNG nên dùng chip dính đáy thanh.
 *
 * Hình khối — HÌNH BÌNH HÀNH, hai cạnh đứng vát SONG SONG:
 *  1. `edge` — nền tone sáng, đóng vai trò viền 1px. ⛔ `clip-path` CẮT MẤT cả
 *     `border` lẫn `box-shadow` của phần tử nên KHÔNG có cách nào dùng `border`
 *     ở đây; xem docblock đầu `page-header.theme.ts` để biết bản trước hỏng
 *     những gì khi cố dựng chip bằng `border`.
 *  2. `face` — thụt vào 1px, phủ lên `edge` chỉ chừa đúng 1px viền.
 *  3. Quầng sáng bằng `filter: drop-shadow` trên wrapper — bám đúng hình đã clip.
 *
 * `side` = HƯỚNG NGHIÊNG (đỉnh trên đổ về phía tiêu đề), KHÔNG phải "chip nằm
 * bên nào":
 *   `start` → nghiêng SANG PHẢI (cụm bên TRÁI tiêu đề)
 *   `end`   → nghiêng SANG TRÁI (cụm bên PHẢI tiêu đề)
 * Ngoại lệ có chủ đích: nút QUAY LẠI đứng bên trái nhưng dùng `end` vì nó phải
 * đổ ra NGOÀI — đó là hướng nó đưa user đi.
 *
 * ⛔ MÀU CHIP LUÔN `primary` — KHÔNG bám `tone` của module. Tone module chỉ dành
 *    cho bảng tên (thứ KHÔNG bấm được).
 */
import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { Tooltip } from '@/shared/ui';
import { SystemIcon, type SystemIconName } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import { pageNavStyles } from './page-header.theme';
import ChipElement from './chip-element';

export type PageHeaderChipSide = 'start' | 'end';

/**
 * Chip neo vào ĐÂU theo chiều dọc của thanh header.
 *
 * `bottom` (mặc định) — dính mép dưới thanh, đọc như dải tab mọc lên từ ray
 *   đáy. Dùng cho control THUỘC NỘI DUNG trang, tức là các TAB.
 * `center` — canh giữa thanh, cùng hàng với logo · nút icon vế phải. Dùng cho
 *   control KHÔNG phải tab: điều hướng RA KHỎI trang (nút quay lại) hoặc action
 *   của khung nhìn — chúng đứng ngay cạnh dãy icon toàn cục nên phải khớp hàng
 *   với dãy đó, tụt xuống ray đáy là đọc ra như tab lạc chỗ.
 */
export type PageHeaderChipAnchor = 'bottom' | 'center';

const s = pageNavStyles();

/**
 * Hình bình hành — độ vát đọc từ `--chip-cut` (khai ở `pageNavStyles.item`) nên
 * co theo bậc màn hình mà KHÔNG cần hai bản clip-path riêng.
 */
const CLIP: Record<PageHeaderChipSide, string> = {
  start: 'polygon(var(--chip-cut) 0, 100% 0, calc(100% - var(--chip-cut)) 100%, 0 100%)',
  end: 'polygon(0 0, calc(100% - var(--chip-cut)) 0, 100% 100%, var(--chip-cut) 100%)',
};

/**
 * Bevel sáng mảnh ở cạnh trên — đọc ra như tấm kim loại vát.
 * Trắng qua token `white-10` + `color-mix`, KHÔNG hardcode `rgb()`/hex
 * (`color-system.md`).
 */
const BEVEL =
  'linear-gradient(180deg, color-mix(in srgb, var(--color-white-10) 22%, transparent) 0 1px, transparent 1px)';

/**
 * Thân chip khi BẬT — loang tone từ ĐÁY LÊN, cùng công thức với nền bảng tên
 * module (`PageHeaderTitle.plateStyle`) nên tab đang mở và tiêu đề ở giữa đọc ra
 * MỘT hệ, thay vì hai khối màu khác nhau đứng cạnh nhau.
 *
 * Khác bảng tên hai điểm:
 *  1. Đậm hơn hẳn (92/46/14% so với 20/6/0%) — bảng tên là nền trang trí, còn
 *     đây là state BẬT của một control, phải thắng được các chip idle bên cạnh.
 *  2. ⛔ Nhạt dần về `header-to` chứ KHÔNG về `transparent`. Bảng tên vẽ thẳng
 *     trên nền header nên trong suốt là đúng; chip thì có lớp `edge` NẰM DƯỚI
 *     `face` — face trong suốt là lộ nguyên mảng `edge`, mất hẳn hiệu ứng viền
 *     1px và nửa trên chip đọc ra đậm gấp đôi ý đồ.
 */
const ACTIVE_FACE = `linear-gradient(to top,
  color-mix(in srgb, var(--color-primary-5) 92%, var(--color-header-to)) 0%,
  color-mix(in srgb, var(--color-primary-5) 46%, var(--color-header-to)) 55%,
  color-mix(in srgb, var(--color-primary-5) 14%, var(--color-header-to)) 100%)`;

function buildSurface(side: PageHeaderChipSide, active: boolean) {
  return {
    /** Quầng sáng đặt trên wrapper — `drop-shadow` bám đúng hình đã clip. */
    wrap: {
      filter: active
        ? 'drop-shadow(0 0 10px color-mix(in srgb, var(--color-primary-5) 55%, transparent))'
        : undefined,
    } satisfies CSSProperties,
    /**
     * Lớp đóng vai trò viền 1px. Khi bật, viền cũng loang từ đáy lên cho khớp
     * nền — nhưng đỉnh vẫn giữ 55% chứ KHÔNG về 0: mất viền trên là hình bình
     * hành hở nóc, đọc ra như chip bị cắt mất một phần.
     */
    edge: {
      clipPath: CLIP[side],
      background: active
        ? `linear-gradient(to top,
      var(--color-primary-3) 0%,
      color-mix(in srgb, var(--color-primary-4) 55%, transparent) 100%)`
        : 'color-mix(in srgb, var(--color-primary-5) 40%, transparent)',
    } satisfies CSSProperties,
    /**
     * Thân chip: active loang từ đáy lên (`ACTIVE_FACE`); idle trong mờ + bevel.
     *
     * ⛔ Bevel CHỈ cho idle: nền active đã trong dần về phía trên, thêm một vạch
     *    trắng 1px ở đúng chỗ mờ nhất là nó nổi lên như nét thừa.
     */
    face: {
      clipPath: CLIP[side],
      background: active
        ? ACTIVE_FACE
        : `${BEVEL}, color-mix(in srgb, var(--color-primary-5) 14%, color-mix(in srgb, var(--color-header-to) 72%, transparent))`,
    } satisfies CSSProperties,
  };
}

/** 4 tổ hợp `side × active` dựng sẵn — không tạo object style mới mỗi render. */
const SURFACE = {
  start: { idle: buildSurface('start', false), active: buildSurface('start', true) },
  end: { idle: buildSurface('end', false), active: buildSurface('end', true) },
} as const;

/**
 * Ba lớp dựng hình khối: wrapper quầng sáng → `edge` (viền 1px) → `face` (thân).
 * Export vì mọi chip của page đều cần y hệt nhau.
 */
export const ChipSurface = memo(function ChipSurface({
  side,
  active,
}: {
  side: PageHeaderChipSide;
  active: boolean;
}) {
  const surface = SURFACE[side][active ? 'active' : 'idle'];

  return (
    // ⛔ PHẢI truyền `active`: slot `surface` mang mức mờ của state (idle 60% →
    //    hover 100%). Gọi `s.surface()` trơn là rơi về defaultVariant `false` →
    //    chip đang mở cũng bị làm mờ như chip thường.
    <span aria-hidden className={s.surface({ active })} style={surface.wrap}>
      <span className={s.edge()} style={surface.edge} />
      <span className={s.face()} style={surface.face} />
    </span>
  );
});

export interface PageHeaderChipProps {
  /** Nhãn hiển thị. Bỏ trống + có `icon` → chip icon-only (BẮT BUỘC `tooltip`). */
  label?: string;
  /** Nhãn rút gọn dùng ở màn hẹp / máy chạm. Xem `pageNavStyles.labelFull`. */
  shortLabel?: string;
  icon?: SystemIconName;
  /** Hướng nghiêng — xem chú thích đầu file. */
  side?: PageHeaderChipSide;
  /** Neo dọc trong thanh header — mặc định `bottom`. Xem `PageHeaderChipAnchor`. */
  anchor?: PageHeaderChipAnchor;
  /**
   * Siết BỀ NGANG cho control PHỤ TRỢ đứng chung dải đáy với tab (quay lại…),
   * để cả cụm bám sát dải tab mà không đẩy bảng tên lệch tâm.
   *
   * ⛔ KHÔNG đổi chiều cao — mọi thứ trên dải đáy cao bằng nhau.
   * ⚠️ Với chip ICON-ONLY đây là NO-OP có chủ ý: đệm của chúng đã ở sàn so với
   *    độ vát `--chip-cut`. Xem variant `iconOnly` trong `page-header.theme.ts`.
   */
  compact?: boolean;
  /** Đích điều hướng THẬT. Có href → render `<Link>`. */
  href?: string;
  newTab?: boolean;
  /** Sáng lên (nền primary loang + quầng sáng) — tab đang mở / chế độ đang bật. */
  active?: boolean;
  /** Ngữ nghĩa "trang hiện tại" cho chip TAB (`aria-current="page"`). */
  current?: boolean;
  /** Ngữ nghĩa "đang bật" cho chip TOGGLE (`aria-pressed`). */
  pressed?: boolean;
  disabled?: boolean;
  /** Tooltip — BẮT BUỘC khi chip icon-only (cũng là `aria-label` của chip đó). */
  tooltip?: string;
  onSelect?: () => void;
  className?: string;
  children?: ReactNode;
}

function PageHeaderChip({
  label,
  shortLabel,
  icon,
  side = 'start',
  anchor = 'bottom',
  compact = false,
  href,
  newTab,
  active = false,
  current,
  pressed,
  disabled = false,
  tooltip,
  onSelect,
  className,
  children,
}: PageHeaderChipProps) {
  const iconOnly = label == null && children == null;

  const chip = (
    <ChipElement
      // Cờ cho SLOT header đẩy chip xuống sát ray đáy. `center` thì bỏ hẳn
      // thuộc tính — slot vốn `items-center` nên chip tự về giữa thanh.
      anchorBottom={anchor === 'bottom'}
      // Tên đọc của chip: icon-only lấy `tooltip`; CÓ `shortLabel` thì GHIM về
      // nhãn ĐẦY ĐỦ. Cả hai nhãn cùng nằm trong DOM (CSS chọn cái hiện) — để tên
      // tự suy từ nội dung thì máy tính bảng đọc bản rút gọn, còn nơi không có
      // CSS (test, chế độ đọc) đọc DÍNH cả hai: "Sự kiện webhookWebhook".
      aria-label={iconOnly ? tooltip : shortLabel ? label : undefined}
      ariaCurrent={current}
      ariaPressed={pressed}
      className={cn(
        s.item({ side, active, iconOnly, compact }),
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      disabled={disabled}
      href={href}
      newTab={newTab}
      onActivate={onSelect}
    >
      <ChipSurface active={active} side={side} />

      {icon && <SystemIcon name={icon} />}
      {/* Có `shortLabel` → render CẢ HAI nhãn để CSS chọn theo bề rộng. Dựng
          bằng CSS chứ KHÔNG bằng media-query trong JS: chip phải có đúng nhãn
          ngay từ khung hình đầu tiên. */}
      {label != null &&
        (shortLabel ? (
          <>
            <span className={s.labelFull()}>{label}</span>
            <span className={s.labelShort()}>{shortLabel}</span>
          </>
        ) : (
          <span className={s.label()}>{label}</span>
        ))}
      {children}
    </ChipElement>
  );

  // Chip đang khoá không nhận pointer event → Radix không bao giờ mở tooltip,
  // nên khỏi bọc thêm một lớp provider vô ích.
  if (!tooltip || disabled) return chip;

  return (
    <Tooltip content={tooltip} side="bottom">
      {chip}
    </Tooltip>
  );
}

export default memo(PageHeaderChip);
