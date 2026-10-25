import React from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons';
import Text from '@/shared/ui/primitives/Text';

/**
 * Tone của gem icon — khớp 1:1 với `ModuleColor` (xem `module-color.ts`) để
 * header page đồng bộ tuyệt đối với màu tile/dock của module. Thêm tone mới ở
 * ĐÂY rồi map identity trong `getModuleTitleIconColor`.
 */
export type TitleIconColor =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'sky'
  | 'teal'
  | 'indigo'
  | 'pink'
  | 'fuchsia'
  | 'azure'
  | 'lime'
  | 'emerald';

export interface TitleScreenProps {
  /** System icon name (e.g. "house-bold", "gear-bold") */
  icon?: SystemIconName;
  iconColor?: TitleIconColor;
  title: string;
  /**
   * Nhãn phụ (thường viết hoa / EN) đặt sau divider — pattern "tiêu đề kép"
   * của dashboard big-screen. Optional.
   */
  subtitle?: string;
  /** Content rendered inline after the title (vd breadcrumb link). */
  titleTrailing?: React.ReactNode;
  /**
   * Optional slot đặt GIỮA title-left và `right` — thường là dải KPI
   * `<SummaryPill>` (Figma 10144-432960). Khi có, một vertical divider tự
   * chèn giữa `summary` và `right`.
   */
  summary?: React.ReactNode;
  /** Content rendered on the right side */
  right?: React.ReactNode;
  onBack?: () => void;
  /**
   * Bật corner brackets [ ] 4 góc — pattern universal Chinese big-screen
   * dashboard (BigDataView). Dùng cho monitoring / big-screen page. Default false.
   */
  brackets?: boolean;
  className?: string;
}

/** Gem icon container — vát góc TL/BR + gradient tone-4 → tone-6 + glow. */
const iconStyle = (tone: TitleIconColor): React.CSSProperties => ({
  clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
  border: `1px solid var(--color-${tone}-3)`,
  background: `linear-gradient(to bottom right, var(--color-${tone}-4), var(--color-${tone}-6))`,
  boxShadow: `inset 0 0 10px 0 var(--color-${tone}-4), 0 0 14px color-mix(in srgb, var(--color-${tone}-5) 45%, transparent)`,
});

/**
 * Nền header: vệt sáng tone loang từ trái + sọc chéo RẤT mờ, tắt sớm.
 *
 * Sọc chéo chỉ là accent nhận diện, KHÔNG trải dài — một trang có thêm 2-3
 * panel header cũng có sọc, để rộng là rối mắt (feedback thực tế).
 */
const bandStyle = (tone: TitleIconColor): React.CSSProperties => ({
  backgroundImage: `linear-gradient(to right,
      color-mix(in srgb, var(--color-${tone}-5) 14%, transparent) 0%,
      color-mix(in srgb, var(--color-${tone}-5) 4%, transparent) 22%,
      transparent 45%),
    repeating-linear-gradient(122deg,
      transparent 0 16px,
      color-mix(in srgb, var(--color-${tone}-5) 5%, transparent) 16px 32px)`,
  WebkitMaskImage: 'linear-gradient(to right, black 0, black 120px, transparent 320px)',
  maskImage: 'linear-gradient(to right, black 0, black 120px, transparent 320px)',
});

/** Chữ tiêu đề gradient (fg-1 → tone) + glow — signature big-screen title. */
const titleStyle = (tone: TitleIconColor): React.CSSProperties => ({
  backgroundImage: `linear-gradient(180deg, var(--color-fg-1) 30%, color-mix(in srgb, var(--color-${tone}-4) 80%, var(--color-fg-1)) 100%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  filter: `drop-shadow(0 0 10px color-mix(in srgb, var(--color-${tone}-5) 40%, transparent))`,
});

/**
 * ⛔ TRANG NGHIỆP VỤ KHÔNG DÙNG `TitleScreen` LÀM TIÊU ĐỀ TRANG NỮA — dùng `<PageHeader>`
 *    (`@/shared/widgets/header`): tiêu đề · nút quay lại · tab · action lên THANH HEADER
 *    qua portal, trả lại trọn dải này (~45px kèm khe `gap-2`) cho nội dung. Component còn
 *    giữ cho showcase kit2 và cho kiểu `TitleIconColor` (tone dùng chung với bảng tên).
 */
function TitleScreen({
  icon,
  iconColor = 'yellow',
  title,
  subtitle,
  titleTrailing,
  summary,
  right,
  onBack,
  brackets = false,
  className,
}: TitleScreenProps) {
  const hasSummary = summary != null && summary !== false;
  const tone = iconColor;
  const toneVar = `var(--color-${tone}-5)`;

  return (
    <div className={cn('relative flex w-full shrink-0 flex-col gap-0', className)}>
      {/* HUD band — gradient tone + sọc chéo, ghim sau nội dung. */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={bandStyle(tone)} />

      {/* Corner brackets [ ] — chỉ mount khi `brackets=true`. */}
      {brackets && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-1 size-2.5 border-l-[1.5px] border-t-[1.5px]"
            style={{ borderColor: toneVar }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 size-2.5 border-r-[1.5px] border-t-[1.5px]"
            style={{ borderColor: toneVar }}
          />
        </>
      )}

      {/* Main row */}
      <div className="relative flex w-full items-center justify-between gap-2">
        {/* Left: back arrow + gem icon + title cluster */}
        <div className="flex shrink-0 items-center gap-2">
          {onBack && (
            <button
              aria-label="Quay lại"
              className="flex cursor-pointer items-center text-fg-3 transition-colors hover:text-fg-1"
              type="button"
              onClick={onBack}
            >
              <SystemIcon name="angle-left-outline" size={18} />
            </button>
          )}

          {icon && (
            <div
              className="relative flex size-8 shrink-0 items-center justify-center"
              style={iconStyle(tone)}
            >
              <SystemIcon className="text-neutral-0" name={icon} size={18} />
            </div>
          )}

          {/*
            Tiêu đề màn hình là `<h1>` THẬT, không phải `<span>`.

            Trước đây nó render ra `<span>`, nên mọi trang dùng `TitleScreen`
            không có heading nào — người dùng trình đọc màn hình mất hẳn cách
            nhảy theo tiêu đề, và cây heading của trang bắt đầu từ `<h2>` của
            các khối con. Không đổi gì về hình: cỡ chữ vẫn do `size` quyết định.
          */}
          <Text
            as="h1"
            className="m-0 block truncate"
            size="large"
            style={titleStyle(tone)}
            weight="medium"
          >
            {title}
          </Text>

          {subtitle && (
            <>
              <span aria-hidden className="h-4 w-px shrink-0" style={{ background: toneVar }} />
              <span className="shrink-0 whitespace-nowrap text-caption-10-medium uppercase tracking-[0.18em] text-fg-3">
                {subtitle}
              </span>
            </>
          )}

          {/* Sọc chéo trang trí — 3 vạch nhạt dần (BigDataView 003).
              Bump opacity để không "nhạt nhòa" trên dark bg. */}
          <span aria-hidden className="hidden shrink-0 items-center gap-1 md:flex">
            <span
              className="h-3.5 w-1 -skew-x-[20deg]"
              style={{ background: toneVar, boxShadow: `0 0 4px ${toneVar}` }}
            />
            <span
              className="h-3.5 w-1 -skew-x-[20deg]"
              style={{ background: `color-mix(in srgb, ${toneVar} 65%, transparent)` }}
            />
            <span
              className="h-3.5 w-1 -skew-x-[20deg]"
              style={{ background: `color-mix(in srgb, ${toneVar} 35%, transparent)` }}
            />
          </span>

          {titleTrailing}
        </div>

        {/* Middle: summary slot (KPI pills) — grows, right-aligned */}
        {hasSummary && (
          <div className="scrollbar-hidden flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto">
            {summary}
          </div>
        )}

        {right && (
          <div className="flex shrink-0 items-center gap-2">
            {hasSummary && <div className="h-5 w-px shrink-0 bg-border-2" />}
            {right}
          </div>
        )}
      </div>

      {/* Rail dưới — chip tone đặc + line loang + 2 vạch nhịp (HUD divider). */}
      <div aria-hidden className="relative mt-1 flex h-px w-full shrink-0 items-center gap-1">
        <span
          className="h-px w-16 shrink-0"
          style={{ background: toneVar, boxShadow: `0 0 8px ${toneVar}` }}
        />
        <span
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, color-mix(in srgb, ${toneVar} 45%, transparent) 0%, color-mix(in srgb, ${toneVar} 8%, transparent) 55%, transparent 100%)`,
          }}
        />
        <span
          className="h-px w-2 shrink-0"
          style={{ background: `color-mix(in srgb, ${toneVar} 55%, transparent)` }}
        />
        <span
          className="h-px w-1 shrink-0"
          style={{ background: `color-mix(in srgb, ${toneVar} 35%, transparent)` }}
        />
      </div>
    </div>
  );
}

export default TitleScreen;
