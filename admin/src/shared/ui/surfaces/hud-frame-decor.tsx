/**
 * HudFrameDecor — lớp TRANG TRÍ của `HudFrame intensity="prime"`.
 *
 * Đây là "khung xịn" của kit2: một bậc TRÊN `cyber`. Cyber mới chỉ dày nét lên
 * và lan quầng sáng ra; prime dựng thêm phần vỏ MÁY MÓC của một thiết bị đo:
 *
 *   ┌── ‖‖‖‖ ─────────────────────────────╴╴╴ ┐   ← thước chia + vệt quét
 *   │ ░ (rọi sáng góc)                        │
 *   │            children                     │
 *   │                                         │
 *   └ ────────────────────────────────── ▮▮▮ ─┘   ← ray đáy + 3 chốt phải
 *
 * Năm lớp, kể từ ngoài vào:
 *   1. `bevel`  — nẹp trong 1px sáng ở mép TRÊN + bóng đổ nhẹ ở mép DƯỚI. Đây là
 *                 thứ làm khung "có bề dày" thay vì một nét kẻ phẳng.
 *   2. `ticks`  — thước chia mép trên (vạch 1px, bước 6px), mask tắt dần sang
 *                 phải. Chỉ 1/3 bề rộng: chạy hết chiều ngang là ra hoa văn, mất
 *                 chất thiết bị.
 *   3. `sweep`  — vệt sáng chạy dọc mép trên (xem `--animate-hud-sweep`).
 *   4. `corner` — quầng rọi từ góc trên-trái vào lòng khung, tắt ở ~55%.
 *   5. `rail`   — ray 1px đáy khung + 3 chốt sáng ở mép phải (đối xứng với chốt
 *                 trái của `DetailPanelHeader`, khép kín card từ trên xuống dưới).
 *
 * ⛔ KHÔNG dùng file này trực tiếp — nó là helper NỘI BỘ của `HudFrame`, không
 *    xuất qua barrel `@/shared/ui` (kit2-architecture §1). Muốn khung prime thì
 *    `<HudFrame intensity="prime">`.
 *
 * ⚠️ Toàn bộ lớp ở đây là `aria-hidden` + `pointer-events-none` và nằm ở `z-0`,
 *    tức DƯỚI `z-10` của tầng nội dung trong `HudFrame`. Không lớp nào được
 *    chắn cú bấm hay lọt vào cây trợ năng.
 */
import { memo, type CSSProperties } from 'react';

import { cn } from '@/shared/utils/style/cn';

interface HudFrameDecorProps {
  /** Token màu nền của tone (dùng bậc `-5`), vd `sky` → `--color-sky-5`. */
  tone: string;
  /**
   * Bật vệt sáng quét mép trên. Mặc định TẮT ở `HudFrame` — chuyển động chạy
   * vô hạn chỉ đáng bật cho panel HERO (1-2 cái/màn), bật cả lưới là màn hình
   * nhấp nháy khắp nơi.
   */
  sweep?: boolean;
  /** Thước chia mép trên. Tắt khi header panel đã có sẵn hoa văn riêng. */
  ticks?: boolean;
}

/** Pha `tone-5` với nền — gom một chỗ để 5 lớp không lệch cú pháp `color-mix`. */
const mix = (tone: string, pct: number, over = 'transparent') =>
  `color-mix(in srgb, var(--color-${tone}-5) ${pct}%, ${over})`;

/**
 * Nẹp trong: sáng ở mép TRÊN, tối dần xuống mép DƯỚI.
 *
 * Dùng `inset box-shadow` chứ không phải `border`: khung ngoài của `HudFrame`
 * đã cắt `clip-path` cho góc vát, mà `border` KHÔNG chạy theo `clip-path` — vẽ
 * bằng border là hai nét lệch nhau đúng ở hai góc vát.
 */
const bevelStyle = (tone: string): CSSProperties => ({
  boxShadow: `inset 0 1px 0 ${mix(tone, 30)}, inset 0 -1px 0 var(--color-divider-white-10), inset 0 -18px 24px -24px ${mix(tone, 55)}`,
});

/** Thước chia — vạch 1px, bước 6px, cao 4px, tắt dần sang phải. */
const tickStyle = (tone: string): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(90deg, ${mix(tone, 55)} 0 1px, transparent 1px 6px)`,
  WebkitMaskImage: 'linear-gradient(to right, black 0, transparent 100%)',
  maskImage: 'linear-gradient(to right, black 0, transparent 100%)',
});

/** Vệt quét — dải sáng 28% bề rộng, hai đầu tan dần. */
const sweepStyle = (tone: string): CSSProperties => ({
  background: `linear-gradient(90deg, transparent 0%, ${mix(tone, 85)} 50%, transparent 100%)`,
  boxShadow: `0 0 8px ${mix(tone, 60)}`,
});

/** Quầng rọi góc trên-trái — bán kính lớn, tắt hẳn ở 55% để không phủ số liệu. */
const cornerGlowStyle = (tone: string): CSSProperties => ({
  background: `radial-gradient(120% 90% at 0% 0%, ${mix(tone, 14)} 0%, transparent 55%)`,
});

const HudFrameDecor = memo(function HudFrameDecor({
  tone,
  sweep = false,
  ticks = true,
}: HudFrameDecorProps) {
  const railFade = `linear-gradient(to left, transparent 0%, ${mix(tone, 45)} 60%, transparent 100%)`;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {/* 1 — nẹp trong */}
      <div className="absolute inset-0" style={bevelStyle(tone)} />

      {/* 4 — quầng rọi góc TL (đặt trước ticks/sweep để không phủ lên nét sáng) */}
      <div className="absolute inset-0" style={cornerGlowStyle(tone)} />

      {/* 2 — thước chia mép trên, bắt đầu sau vùng chip 48px của header */}
      {ticks && <div className="absolute left-12 top-0 h-1 w-1/3" style={tickStyle(tone)} />}

      {/*
        3 — vệt quét. `overflow-hidden` ở hộp NGOÀI, `translateX(±100%)` ở hộp
        TRONG: vệt chạy hết bề rộng rồi biến mất ngay tại mép khung, không thò ra
        ngoài card và không sinh thanh cuộn ngang cho lưới bọc nó.
      */}
      {sweep && (
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <div
            className={cn(
              'h-full w-[28%] animate-hud-sweep will-change-transform',
              'motion-reduce:animate-none motion-reduce:hidden',
            )}
            style={sweepStyle(tone)}
          />
        </div>
      )}

      {/* 5 — ray đáy + 3 chốt phải */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2">
        <div className="h-px flex-1" style={{ background: railFade }} />
        <div className="flex shrink-0 items-center gap-[2px] pr-1">
          <div className="h-px w-2" style={{ background: mix(tone, 40) }} />
          <div className="h-px w-2" style={{ background: mix(tone, 65) }} />
          <div className="h-px w-2" style={{ background: mix(tone, 90) }} />
        </div>
      </div>
    </div>
  );
});

HudFrameDecor.displayName = 'HudFrameDecor';

export default HudFrameDecor;
