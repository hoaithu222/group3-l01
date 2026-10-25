/**
 * HudCorners — khung viền + nhấn 4 góc, vẽ trong CÙNG một hệ toạ độ.
 *
 * Chinese BigData HUD signature (ref: `.fora:before/after` pattern).
 * Công khai qua `@/shared/ui` — `BoxInfo`/`SummaryCard` dùng nó bên trong (`HudFrame` có lớp trang trí riêng), còn nơi
 * cần RIÊNG bốn ngoặc góc (vd nền màn xác thực, ghim vào khung nhìn) dùng thẳng. Cha PHẢI `position: relative`
 * (hoặc `fixed`/`absolute`) — overlay này `absolute inset-0` theo cha.
 *
 * ── 4 kiểu góc (`variant`) ──────────────────────────────────────────────────
 *
 *   bracket            dot                chamfer            none
 *   ┏━──────━┓        ▪──────▪           ╱────────╲         ┌────────┐
 *   │        │        │      │           │        │         │        │
 *   ┗━──────━┛        ▪──────▪           ╲────────╱         └────────┘
 *   ngoặc [ ] dày     chấm nhỏ ở góc     vát chéo 45°       viền trơn
 *   (mặc định)        gọn, ít "kỹ thuật" khung bát giác     không nhấn góc
 *
 * ── VÌ SAO component này vẽ LUÔN cả khung viền ──────────────────────────────
 * Bản trước chỉ vẽ 4 ngoặc góc, còn khung viền do CHA tự khai `border-2`. Hai
 * nét đó KHÔNG BAO GIỜ chồng khít được:
 *
 *   • `overflow: hidden` của cha cắt con theo PADDING BOX, mà `border` nằm
 *     NGOÀI padding box → ngoặc góc luôn bị đẩy vào trong đúng bằng bề dày
 *     viền. Kết quả: mỗi góc thành hai nét song song lệch nhau 2px, đọc ra
 *     như một ô vuông nhỏ dính ở góc chứ không phải dấu ngoặc.
 *   • `box-shadow` tô quầng theo TOÀN BỘ border box — kể cả 2 cạnh trong
 *     suốt của chữ L → quầng ra hình VUÔNG, càng làm góc trông như khối đặc.
 *     Nay dùng `filter: drop-shadow()`, quầng bám đúng hình đã vẽ.
 *
 * Gộp cả hai nét về một component là cách DUY NHẤT bảo đảm chúng cùng gốc toạ
 * độ: `frame` và phần nhấn góc đều `inset: 0` và cùng ăn nét vào TRONG, nên mép
 * NGOÀI luôn trùng khít dù bề dày khác nhau.
 *
 * ── Tone ────────────────────────────────────────────────────────────────────
 * Đọc biến của cha, KHÔNG sinh class cho từng màu:
 *   `--hud-c`        màu nhấn góc — mặc định `teal-5`.
 *   `--hud-frame-c`  màu khung viền — mặc định bằng `--hud-c`.
 * Cha đổi tone chỉ cần set 1–2 biến, vd `[--hud-c:var(--color-sky-5)]`.
 *
 * Usage:
 *   <HudCorners frame />                     // viền + ngoặc góc cùng bề dày
 *   <HudCorners frame variant="none" />      // CHỈ viền, bỏ hẳn 4 góc
 *   <HudCorners frame variant="dot" />       // 4 chấm nhỏ
 *   <HudCorners frame variant="chamfer" />   // vát chéo 45° → khung bát giác
 *   <HudCorners frame radius={8} />          // khớp cha bo góc 8px
 */

import { memo, type CSSProperties } from 'react';

const HUD = 'var(--hud-c, var(--color-teal-5))';
const FRAME = 'var(--hud-frame-c, var(--hud-c, var(--color-teal-5)))';

/**
 * Kiểu nhấn góc.
 * - `bracket` ngoặc [ ] — chữ ký HUD, đọc ra "khung kỹ thuật".
 * - `dot`     chấm vuông nhỏ ghim 4 góc — nhẹ hơn hẳn, hợp lưới thẻ dày.
 * - `chamfer` vát chéo 45° — khung cắt góc thành bát giác, không có nét thừa.
 * - `none`    bỏ hẳn phần nhấn, chỉ còn khung viền trơn.
 */
export type HudCornerVariant = 'bracket' | 'dot' | 'chamfer' | 'none';

export interface HudCornersProps {
  /** Kiểu nhấn góc. Default `bracket`. */
  variant?: HudCornerVariant;
  /**
   * Kích thước phần nhấn góc (px): chiều dài cánh ngoặc · cạnh vát · (chấm thì
   * dùng `thickness`). Default 8 — cánh ngắn thì góc đọc ra "dấu nhấn", cánh
   * dài quá lại thành viền đôi ở hai cạnh.
   */
  size?: number;
  /**
   * Bề dày nét nhấn góc (px) — chấm `dot` dùng số này làm cạnh chấm. Default 1.5.
   *
   * 1.5px là cỡ nét của `HudFrame`/`HudInfoBox`, tức cỡ nét CHUẨN của ngôn ngữ
   * HUD trong kit. Bản trước để 2–3px nên panel/thẻ đứng cạnh HudFrame là thấy
   * đậm hơn hẳn, đọc ra như hai hệ khung khác nhau.
   */
  thickness?: number;
  /**
   * Vẽ khung viền nối 4 góc. Bật khi muốn HudCorners lo TRỌN phần viền — và khi
   * đó cha PHẢI bỏ `border-*` của chính nó, nếu không lại thành hai nét.
   * Default `false`.
   */
  frame?: boolean;
  /**
   * Bề dày khung viền (px). Default = `thickness` để hai nét trùng khít.
   * Đặt nhỏ hơn `thickness` để viền mảnh mà góc vẫn được nhấn (vd 1 / 1.5).
   */
  frameWidth?: number;
  /**
   * Thụt toàn bộ overlay vào trong (px) — dùng khi cha CÓ viền riêng n px và
   * muốn phần nhấn góc nằm sát mép trong của viền đó. Default 0.
   */
  inset?: number;
  /**
   * Bo góc (px) — phải khớp `rounded-*` của cha. Default 0 (góc vuông HUD).
   * ⛔ Vô nghĩa với `chamfer`: vát góc và bo góc là hai cách xử lý CÙNG một góc.
   */
  radius?: number;
  /** Quầng sáng bám theo hình đã vẽ. Default `true`. */
  glow?: boolean;
}

/**
 * Mô tả 4 góc.
 *  `place`  neo vị trí ngoặc / chấm
 *  `edges`  2 cạnh được tô dày `t` (kiểu `bracket`)
 *  `round`  bo ĐÚNG góc ngoài của ngoặc đó (3 góc còn lại giữ vuông — bo cả 4
 *           thì hai đầu cánh cũng cong và dấu ngoặc mất hình chữ L)
 *  `cut`    neo + phép quay của nét vát 45° (kiểu `chamfer`). `k` là phần lùi
 *           vào MỖI đầu nét: đầu nét cắt vuông góc với thân, nên nếu ghim đúng
 *           mép thì nó thò ra ngoài đường viền đúng nửa bề dày — ở zoom thấy rõ
 *           hai cái mấu nhỏ chỗ nét chéo gặp nét thẳng.
 */
const CORNERS = [
  {
    key: 'tl',
    place: { top: 0, left: 0 },
    edges: (t: number) => ({ borderTopWidth: t, borderLeftWidth: t }),
    round: (r: number) => ({ borderTopLeftRadius: r }),
    cut: (s: number, k: number) => ({
      top: s - k,
      left: k,
      transformOrigin: '0 0',
      rotate: '-45deg',
    }),
  },
  {
    key: 'tr',
    place: { top: 0, right: 0 },
    edges: (t: number) => ({ borderTopWidth: t, borderRightWidth: t }),
    round: (r: number) => ({ borderTopRightRadius: r }),
    cut: (s: number, k: number) => ({
      top: s - k,
      right: k,
      transformOrigin: '100% 0',
      rotate: '45deg',
    }),
  },
  {
    key: 'bl',
    place: { bottom: 0, left: 0 },
    edges: (t: number) => ({ borderBottomWidth: t, borderLeftWidth: t }),
    round: (r: number) => ({ borderBottomLeftRadius: r }),
    cut: (s: number, k: number) => ({
      bottom: s - k,
      left: k,
      transformOrigin: '0 100%',
      rotate: '45deg',
    }),
  },
  {
    key: 'br',
    place: { bottom: 0, right: 0 },
    edges: (t: number) => ({ borderBottomWidth: t, borderRightWidth: t }),
    round: (r: number) => ({ borderBottomRightRadius: r }),
    cut: (s: number, k: number) => ({
      bottom: s - k,
      right: k,
      transformOrigin: '100% 100%',
      rotate: '-45deg',
    }),
  },
] as const;

/**
 * Khung bát giác cho `chamfer`: cắt 4 góc của chính lớp viền, phần bị cắt do 4
 * nét chéo đắp lại. Không cắt thì nét chéo nằm ĐÈ lên góc vuông còn nguyên và
 * ra hình tam giác đặc ở mỗi góc.
 */
const chamferClip = (s: number) =>
  `polygon(${s}px 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, ${s}px 100%, 0 calc(100% - ${s}px), 0 ${s}px)`;

const HudCorners = memo(function HudCorners({
  variant = 'bracket',
  size = 8,
  thickness = 1.5,
  frame = false,
  frameWidth,
  inset = 0,
  radius = 0,
  glow = true,
}: HudCornersProps) {
  // Ngoặc góc chỉ đọc được khi cánh dài hơn hẳn bề dày — cánh 4px nét 3px thì
  // ra cục vuông. Ép tối thiểu gấp 3 lần thay vì để call-site tự canh.
  const arm = Math.max(size, thickness * 3);
  const glowStyle = glow
    ? `drop-shadow(0 0 ${thickness + 1}px color-mix(in srgb, ${HUD} 55%, transparent))`
    : undefined;
  const isChamfer = variant === 'chamfer';

  return (
    <div aria-hidden className="pointer-events-none absolute z-20" style={{ inset }}>
      {frame && (
        <span
          className="absolute inset-0"
          style={{
            border: `${frameWidth ?? thickness}px solid ${FRAME}`,
            borderRadius: isChamfer ? undefined : radius || undefined,
            clipPath: isChamfer ? chamferClip(arm) : undefined,
          }}
        />
      )}

      {variant !== 'none' &&
        CORNERS.map((c) => {
          const base: CSSProperties = { position: 'absolute', filter: glowStyle };

          if (variant === 'dot') {
            return (
              <span
                key={c.key}
                style={{
                  ...base,
                  ...c.place,
                  width: thickness * 2,
                  height: thickness * 2,
                  background: HUD,
                }}
              />
            );
          }

          if (isChamfer) {
            // Cạnh huyền của tam giác vuông cân cạnh `arm` = arm·√2, trừ đi
            // `thickness` để hai đầu nét lùi vào nửa bề dày mỗi bên (xem `cut`).
            const back = thickness / 2 / Math.SQRT2;
            return (
              <span
                key={c.key}
                style={{
                  ...base,
                  ...c.cut(arm, back),
                  width: arm * Math.SQRT2 - thickness,
                  height: thickness,
                  background: HUD,
                }}
              />
            );
          }

          return (
            <span
              key={c.key}
              style={{
                ...base,
                ...c.place,
                width: arm,
                height: arm,
                borderStyle: 'solid',
                // ⛔ `borderWidth: 0` PHẢI đứng TRƯỚC `c.edges()`. Đặt sau là nó
                // xoá sạch bề dày của 2 cạnh vừa khai → ngoặc góc biến mất và
                // mọi thẻ trông y như `variant="none"` (đã dính đúng lỗi này).
                borderWidth: 0,
                borderColor: HUD,
                ...c.edges(thickness),
                ...(radius ? c.round(radius) : null),
              }}
            />
          );
        })}
    </div>
  );
});

export default HudCorners;
