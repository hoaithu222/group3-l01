/**
 * HudFrame — khung panel big-screen (kit2).
 *
 * Ngôn ngữ hình khối lấy từ template dashboard Trung Quốc (BigDataView 003 /
 * 020 / 025): khung 1px sáng dần ở góc trên-trái, **vát góc** (notch) TL + BR,
 * **bracket [ ]** ở 2 góc vuông còn lại (TR + BL) và quầng sáng nhẹ bên ngoài.
 *
 *   ╱───────────────────┐        ← notch TL, bracket TR
 *   │                   │
 *   │     children      │
 *   │                   │
 *   └───────────────────╱        ← bracket BL, notch BR
 *
 * Frame KHÔNG tự thêm padding — body do caller quản lý (giữ max-density theo
 * `visual-hierarchy.md`). Root luôn `h-full` + `min-h-0` để panel con scroll
 * được trong grid flex.
 *
 * Usage cơ bản:
 *   <HudFrame tone="sky">
 *     <DetailPanelHeader title="SƠ ĐỒ TỔ CHỨC" />
 *     <div className="min-h-0 flex-1 overflow-y-auto p-2">…</div>
 *   </HudFrame>
 *
 * Usage "cyber" (dashboard big-screen TQ style):
 *   <HudFrame tone="azure" intensity="cyber" scanlines>…</HudFrame>
 */

import { memo, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/shared/utils/style/cn';
import type { TitleIconColor } from '../layout/TitleScreen';
import HudFrameDecor from './hud-frame-decor';

export type HudFrameTone = TitleIconColor;

/**
 * Cường độ visual của frame.
 * - `default`: nhẹ nhàng, phù hợp panel nội dung dày, không gây phân tâm.
 * - `cyber`: bracket dày hơn, glow lan xa, thêm top-accent line + corner accents
 *   ở 2 góc notch → cảm giác "smart dashboard TQ", dùng cho panel hero/dashboard.
 * - `prime`: MỘT BẬC TRÊN cyber — thêm lớp vỏ "thiết bị đo" của `HudFrameDecor`
 *   (nẹp trong có bề dày · thước chia mép trên · quầng rọi góc · ray đáy + chốt),
 *   bracket 16px và quầng sáng 3 lớp. Dùng cho card của MÀN ĐIỀU HÀNH — nơi
 *   khung là một phần của thẩm mỹ màn hình, không chỉ là đường ranh giới.
 *
 * ⚠️ prime tốn 5 lớp vẽ/khung. Một màn 6-8 panel thì không sao (đo trên
 *    dashboard tổng quan); lưới 20+ card thì dùng `weight="hairline"` thay vì
 *    prime — xem `HudFrameWeight`.
 */
export type HudFrameIntensity = 'default' | 'cyber' | 'prime';

/**
 * Độ NẶNG của nét khung — trục biến thể độc lập với `intensity`.
 * - `regular`: giữ nguyên nét cũ (bracket 1.5-2px, quầng sáng lan xa).
 * - `hairline`: bracket 1px + chấm góc nhỏ + quầng ôm sát viền. Dùng khi khung
 *   LẶP LẠI DÀY ĐẶC (lưới 20+ card): ở mật độ đó nét 2px và glow lan xa cộng
 *   dồn thành mảng sáng, mắt không còn đọc được ranh giới từng card.
 */
export type HudFrameWeight = 'regular' | 'hairline';

export interface HudFrameProps {
  /** Tone khung — khớp `iconColor` của TitleScreen / module color. Default `sky`. */
  tone?: HudFrameTone;
  /** Vát góc TL + BR. Tắt khi panel nằm sát mép layout khác. Default `true`. */
  notch?: boolean;
  /** Bracket [ ] góc TR + BL. Default `true`. */
  corners?: boolean;
  /** Quầng sáng ngoài theo tone. Default `true`. */
  glow?: boolean;
  /**
   * Cường độ visual. Default `default` để không ảnh hưởng ~99 call-site hiện có.
   * `cyber` bật thêm decoration TQ: corners dày hơn, glow lan xa, top accent stripe,
   * corner accent trên 2 góc notch.
   */
  intensity?: HudFrameIntensity;
  /**
   * Độ nặng của nét viền. Default `regular` để không đổi ~99 call-site hiện có.
   * `hairline` cho lưới card dày — xem `HudFrameWeight`.
   */
  weight?: HudFrameWeight;
  /**
   * Overlay scan-line ngang mờ giả lập CRT phosphor — vibe big-screen TQ.
   * Default `false` để không ảnh hưởng call-site cũ; bật khi dùng cho dashboard.
   */
  scanlines?: boolean;
  /**
   * Vệt sáng chạy dọc mép trên — CHỈ có tác dụng khi `intensity="prime"`.
   *
   * Default `false` và nên giữ như vậy cho phần lớn panel: đây là chuyển động
   * chạy vô hạn, bật cả lưới card là màn hình nhấp nháy khắp nơi và mắt không
   * còn neo vào đâu được. Bật cho ĐÚNG panel hero của màn.
   *
   * Máy bật `prefers-reduced-motion` tự tắt (`motion-reduce:hidden`).
   */
  sweep?: boolean;
  /**
   * Thước chia ở mép trên khung — CHỈ có tác dụng khi `intensity="prime"`.
   * Default `true`; tắt khi header bên trong đã có hoa văn riêng và hai lớp
   * vạch nằm chồng nhau.
   */
  ticks?: boolean;
  /**
   * Kích thước vát góc TL + BR (px). Default 12 — giữ nguyên toàn bộ 99 call-site.
   * Tăng lên 18-24 khi cần cạnh vát rõ như dashboard TQ.
   * Bỏ qua khi `notch=false`.
   */
  notchSize?: number;
  /** Class cho lớp nội dung (bg-bg-1) — vd `p-2`. */
  bodyClassName?: string;
  /**
   * Style cho lớp nội dung — dành cho nền phải TÍNH bằng `color-mix` (gradient
   * pha tone, panel bán trong suốt…) mà class Tailwind diễn đạt không nổi.
   * Ghi đè `bg-bg-1`, nên chỉ dùng khi thật sự cần; nền phẳng vẫn đi qua
   * `bodyClassName`.
   */
  bodyStyle?: CSSProperties;
  /** Class cho root (vd `col-span-2`). */
  className?: string;
  children: ReactNode;
}

/** Kích thước vát góc mặc định — 12px khớp bracket 8px của DetailPanelHeader. */
const DEFAULT_NOTCH = 12;

/** Dựng polygon clip-path theo notchSize truyền vào. */
function buildClip(n: number): string {
  return `polygon(${n}px 0, 100% 0, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, 0 100%, 0 ${n}px)`;
}

/**
 * Viền gradient: sáng ở góc TL (tone-5) → nhạt dần về BR (border-1).
 * `cyber` tăng opacity điểm đầu (70%→90%) + thêm mid-stop để nét viền rõ hơn.
 * `hairline` hạ opacity điểm đầu xuống dưới cả mức `default` và siết quầng sáng
 * lại sát viền — nét vẫn thấy rõ nhưng không cộng dồn khi xếp lưới.
 */
function frameStyle(
  tone: HudFrameTone,
  notch: boolean,
  glow: boolean,
  intensity: HudFrameIntensity,
  weight: HudFrameWeight,
  clip: string,
): CSSProperties {
  const isCyber = intensity === 'cyber';
  const isPrime = intensity === 'prime';
  const isHairline = weight === 'hairline';
  const startPct = isHairline ? 68 : isPrime ? 100 : isCyber ? 90 : 70;
  const midPct = isHairline ? 16 : isPrime ? 46 : isCyber ? 35 : 22;
  const boxShadow = glow
    ? isHairline
      ? // Hairline: MỘT lớp quầng ôm sát — đủ tách card khỏi nền, không loang.
        `0 0 12px -8px color-mix(in srgb, var(--color-${tone}-5) 75%, transparent)`
      : isPrime
        ? // Prime: 3 lớp — chân đế đổ xuống (card "nổi" khỏi nền), halo lan, nét
          // sát viền. Lớp chân đế dùng `popup-shadow` (token, tự lật theme) chứ
          // KHÔNG pha tone: bóng đổ có màu ở nền sáng đọc ra như vệt loang bẩn.
          `0 6px 20px -12px var(--color-popup-shadow),
         0 0 34px -8px color-mix(in srgb, var(--color-${tone}-5) 52%, transparent),
         0 0 10px -3px color-mix(in srgb, var(--color-${tone}-5) 85%, transparent)`
        : isCyber
          ? // Cyber: 2 lớp glow — sát viền + lan xa, đọc như "neon halo".
            `0 0 32px -6px color-mix(in srgb, var(--color-${tone}-5) 55%, transparent),
         0 0 12px -4px color-mix(in srgb, var(--color-${tone}-5) 80%, transparent)`
          : `0 0 24px -10px color-mix(in srgb, var(--color-${tone}-5) 70%, transparent)`
    : undefined;
  return {
    clipPath: notch ? clip : undefined,
    background: `linear-gradient(150deg,
      color-mix(in srgb, var(--color-${tone}-5) ${startPct}%, transparent) 0%,
      color-mix(in srgb, var(--color-${tone}-5) ${midPct}%, transparent) 30%,
      var(--color-border-1) 70%)`,
    boxShadow,
  };
}

const HudFrame = memo(function HudFrame({
  tone = 'sky',
  notch = true,
  corners = true,
  glow = true,
  intensity = 'default',
  weight = 'regular',
  scanlines = false,
  sweep = false,
  ticks = true,
  notchSize = DEFAULT_NOTCH,
  bodyClassName,
  bodyStyle,
  className,
  children,
}: HudFrameProps) {
  const bracket = `var(--color-${tone}-5)`;
  const isCyber = intensity === 'cyber';
  const isPrime = intensity === 'prime';
  const isHairline = weight === 'hairline';
  const clip = buildClip(notchSize);

  // Cyber → bracket to hơn (3.5 = 14px) + dày hơn (2px).
  // Default giữ nguyên 2.5 = 10px, 1.5px như cũ để không đổi ~99 call-site.
  // Hairline → cánh DÀI như cyber nhưng nét 1px: đọc vẫn ra dấu ngoặc góc, mà
  // không thành gạch đậm khi 20+ card xếp cạnh nhau.
  // Prime → cánh 16px: khung này đi với card cỡ panel (≥240px), cánh 14px của
  // cyber ở cỡ đó đọc ra như dấu nháy chứ không ra ngoặc góc.
  const bracketSize = isPrime ? 'size-4' : isHairline || isCyber ? 'size-3.5' : 'size-2.5';
  const bracketThick = isHairline ? 1 : isCyber || isPrime ? 2 : 1.5;
  // Chấm khoá góc notch — co theo nét viền để không nặng hơn chính cái bracket.
  const dotPx = isHairline ? 4 : 6;
  // Nét 1px cần quầng để không "biến mất" trên nền navy; nét 2px thì đủ tự thân.
  const bracketGlow =
    isHairline || isCyber || isPrime
      ? `drop-shadow(0 0 ${isHairline ? 2 : 3}px color-mix(in srgb, var(--color-${tone}-5) 70%, transparent))`
      : undefined;

  return (
    <div
      className={cn('relative h-full min-h-0 p-px', className)}
      style={frameStyle(tone, notch, glow, intensity, weight, clip)}
    >
      <div
        className={cn(
          'relative flex h-full min-h-0 flex-col overflow-hidden bg-bg-1 z-30',
          bodyClassName,
        )}
        style={notch ? { clipPath: clip, ...bodyStyle } : bodyStyle}
      >
        {/* Scan-line overlay — pattern SVG lặp, opacity thấp để không cản đọc.
            z-0 để nằm dưới content (content KHÔNG khai z-index tự cao hơn). */}
        {scanlines && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-40"
            style={{
              background: `repeating-linear-gradient(
                180deg,
                transparent 0,
                transparent 3px,
                color-mix(in srgb, var(--color-${tone}-5) 6%, transparent) 3px,
                color-mix(in srgb, var(--color-${tone}-5) 6%, transparent) 4px
              )`,
            }}
          />
        )}

        {/* Lớp vỏ "thiết bị đo" của prime — 5 lớp trang trí, xem `hud-frame-decor`.
            Đặt SAU scanlines để nẹp trong và ray đáy không bị vạch CRT cắt ngang. */}
        {isPrime && <HudFrameDecor sweep={sweep} ticks={ticks} tone={tone} />}

        {/* Top accent stripe — dải sáng ngang ~60% bề rộng, mờ dần 2 đầu.
            Chỉ ở `cyber` để không đè lên header của panel bình thường. */}
        {isCyber && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-[6%] right-[34%] top-0 z-10 h-px"
            style={{
              background: `linear-gradient(90deg,
                transparent 0%,
                color-mix(in srgb, var(--color-${tone}-5) 80%, transparent) 30%,
                color-mix(in srgb, var(--color-${tone}-5) 80%, transparent) 70%,
                transparent 100%)`,
              boxShadow: `0 0 8px color-mix(in srgb, var(--color-${tone}-5) 55%, transparent)`,
            }}
          />
        )}

        {/* Content — z-10 trên overlay scanline nhưng dưới decoration. */}
        <div className="relative z-10 flex h-full min-h-0 flex-col">{children}</div>
      </div>

      {/* Bracket [ ] ở 2 góc KHÔNG bị vát — pattern BigDataView 025. */}
      {corners && (
        <>
          <span
            aria-hidden
            className={cn('pointer-events-none absolute right-0 top-0 z-20', bracketSize)}
            style={{
              borderRight: `${bracketThick}px solid ${bracket}`,
              borderTop: `${bracketThick}px solid ${bracket}`,
              filter: bracketGlow,
            }}
          />
          <span
            aria-hidden
            className={cn('pointer-events-none absolute bottom-0 left-0 z-20', bracketSize)}
            style={{
              borderBottom: `${bracketThick}px solid ${bracket}`,
              borderLeft: `${bracketThick}px solid ${bracket}`,
              filter: bracketGlow,
            }}
          />
        </>
      )}

      {/*
        Chấm nhấn tại 2 góc notch (TL + BR). Notch cắt vát nên không đặt
        L-bracket được — dùng chấm tròn glow thay, tạo cảm giác "khoá góc" HUD.

        ⛔ Chấm phải nằm TRONG khung. Bản trước đặt lệch âm nửa đường kính
        (`top: -3` / `right: -3`) nên nửa chấm thò ra NGOÀI mép card: ở lưới card
        nó thành đốm sáng lơ lửng giữa hai card, đọc như bụi màn hình chứ không
        ra dấu góc — và `overflow-y-auto` của lưới bắt được phần thò đó nên đáy
        panel mọc thanh cuộn ngang. Nay ghim mép chấm ngay sau nét viền 1px.
      */}
      {corners && (isCyber || isHairline || isPrime) && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-full"
            style={{
              width: dotPx,
              height: dotPx,
              left: notchSize,
              top: 1,
              background: bracket,
              boxShadow: `0 0 ${dotPx}px ${bracket}`,
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-full"
            style={{
              width: dotPx,
              height: dotPx,
              right: 1,
              bottom: notchSize,
              background: bracket,
              boxShadow: `0 0 ${dotPx}px ${bracket}`,
            }}
          />
        </>
      )}
    </div>
  );
});

HudFrame.displayName = 'HudFrame';

export default HudFrame;
