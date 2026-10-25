/**
 * Toạ độ & diện mạo của phần TRANG TRÍ màn xác thực: hình lộ trình (`LearningRoadmapArt`) và các hoạ
 * tiết nền (`AuthBackdrop`). Tách khỏi component để JSX chỉ còn HÌNH, còn "đặt ở đâu, tô màu gì" nằm
 * một chỗ (`docs/rules/clean-code-standards.md §2`).
 *
 * ⛔ Mọi toạ độ là HẰNG SỐ, không random: nền phải giống hệt nhau giữa hai lần tải — nếu không mỗi lần
 *    F5 lại là một bức nền khác, và ảnh chụp màn hình để so sánh giao diện không bao giờ khớp.
 * ⛔ KHÔNG hex. Màu đi qua token (`var(--color-…)`, class `text-{tông}-{bậc}`) hoặc `hudMix()`.
 */

import type { CSSProperties } from 'react';

import type { SystemIconName } from '@/shared/ui';
import { hudMix } from '@/shared/utils/style/hud-fx.utils';

import { DOT_PAPER_STYLE } from './auth-motifs';

// ── Hình lộ trình ─────────────────────────────────────────────────────────────

/** Trạng thái một cột mốc: đã qua · đang học · sắp tới · đích. */
export type RoadmapNodeState = 'done' | 'current' | 'next' | 'goal';

export interface RoadmapNode {
  key: string;
  /** Toạ độ TÂM nút, tính bằng % của khung đường cong. */
  x: number;
  y: number;
  icon: SystemIconName;
  state: RoadmapNodeState;
}

/**
 * Năm cột mốc trên đường cong chữ S: bài học → luyện tập → ĐANG HỌC → kỹ năng xác thực → huy hiệu.
 *
 * `x`/`y` tính THẲNG từ phương trình hai cung elip ghép thành chữ S (xem `LearningRoadmapArt`):
 *   cung dưới-trái (tâm 0%·50%)   x = 50·cos t        y = 50 + 50·sin t    t: 90° → 0°
 *   cung trên-phải (tâm 100%·50%) x = 100 − 50·cos s  y = 50 − 50·sin s    s: 0° → 90°
 * Hai nút giữa mỗi cung lấy ở t = s = 45° ⇒ (35.36 · 85.36) và (64.64 · 14.64).
 *
 * ⛔ Đổi vị trí nút thì tính lại từ công thức. Đặt bằng mắt là nút lệch khỏi đường ngay khi khung bị
 *    kéo cao/hẹp khác đi — mà khung này CO GIÃN theo chiều cao khoang.
 */
export const ROADMAP_NODES: readonly RoadmapNode[] = [
  { key: 'lesson', x: 0, y: 100, icon: 'bookmark-bold', state: 'done' },
  { key: 'practice', x: 35.36, y: 85.36, icon: 'clipboard-check-bold', state: 'done' },
  { key: 'now', x: 50, y: 50, icon: 'map-pin-bold', state: 'current' },
  { key: 'skill', x: 64.64, y: 14.64, icon: 'shield-check-outline', state: 'next' },
  { key: 'badge', x: 100, y: 0, icon: 'star-bold', state: 'goal' },
];

interface RoadmapNodeLook {
  /** Cỡ + viền của vòng nút (class). */
  node: string;
  /** Màu icon (class `text-*`). */
  icon: string;
  iconSize: number;
  /** Nền / màu viền / bóng — giá trị pha từ token nên phải đi qua `style`. */
  style: CSSProperties;
}

/**
 * Viền "tem dán" `0 0 0 3px var(--color-bg-1)` ở các nút đặc: tách nút khỏi nét đường chạy xuyên qua
 * tâm nó. Lấy `bg-1` (lật theo theme) nên sáng thì viền trắng, tối thì viền navy — không bao giờ lệch
 * tông với tấm thẻ.
 *
 * Icon trên nền ĐẶC (`primary-6`, `accent-5`) dùng màu cố định `neutral-0` / `accent-9`: nền đó không
 * lật theo theme nên icon cũng KHÔNG được lật (`text-contrast.md §2.1`).
 */
export const ROADMAP_NODE_LOOK: Record<RoadmapNodeState, RoadmapNodeLook> = {
  done: {
    node: 'size-7',
    icon: 'text-neutral-0',
    iconSize: 14,
    style: { background: 'var(--color-primary-6)', boxShadow: '0 0 0 3px var(--color-bg-1)' },
  },
  current: {
    node: 'size-11 border-2',
    icon: 'text-primary-6',
    iconSize: 20,
    style: {
      background: 'var(--color-bg-1)',
      borderColor: 'var(--color-primary-5)',
      boxShadow: `0 0 0 3px var(--color-bg-1), 0 8px 20px -8px ${hudMix('var(--color-primary-6)', 75)}`,
    },
  },
  next: {
    node: 'size-8 border-2 border-dashed',
    icon: 'text-fg-5',
    iconSize: 15,
    style: { background: 'var(--color-bg-1)', borderColor: hudMix('var(--color-fg-5)', 70) },
  },
  goal: {
    node: 'size-10',
    icon: 'text-accent-9',
    iconSize: 18,
    style: {
      background: 'var(--color-accent-5)',
      boxShadow: `0 0 0 3px var(--color-bg-1), 0 0 22px -2px ${hudMix('var(--color-accent-5)', 70)}`,
    },
  },
};

/** Nửa ĐÃ ĐI của đường — nét liền màu thương hiệu, quầng mảnh để đọc ra "đã sáng đèn". */
export const ROADMAP_TRACK_DONE_STYLE: CSSProperties = {
  borderColor: 'var(--color-primary-5)',
  filter: `drop-shadow(0 0 6px ${hudMix('var(--color-primary-5)', 55)})`,
};

/** Nửa SẮP TỚI — nét đứt nhạt: đường đã vạch sẵn nhưng chưa đi. */
export const ROADMAP_TRACK_NEXT_STYLE: CSSProperties = {
  borderColor: hudMix('var(--color-fg-5)', 60),
};

/**
 * Quầng thở chậm sau nút "đang học" (`animate-auth-pulse`) — tan hết trước mép để không thành một đĩa
 * tròn có viền.
 */
export const ROADMAP_HALO_STYLE: CSSProperties = {
  background: `radial-gradient(circle, ${hudMix('var(--color-primary-5)', 50)} 0%, transparent 68%)`,
};

// ── Hoạ tiết nền ──────────────────────────────────────────────────────────────

/**
 * Bốn QUẦNG MÀU mềm ở bốn góc — tím (thương hiệu) · hồng · teal · hổ phách, đúng bốn tông của cả màn.
 *
 * Pha với `transparent` nên tự hợp theme: nền sáng ra bốn mảng phấn (oải hương, hồng, bạc hà, kem), nền
 * navy ra bốn vầng sương màu. Tan hết ở 72% bán kính — không đốm nào có mép.
 */
export const BACKDROP_GLOW_STYLE: CSSProperties = {
  backgroundImage: [
    `radial-gradient(42% 52% at 8% 12%, ${hudMix('var(--color-primary-5)', 24)}, transparent 72%)`,
    `radial-gradient(38% 48% at 94% 8%, ${hudMix('var(--color-pink-5)', 16)}, transparent 72%)`,
    `radial-gradient(44% 50% at 10% 96%, ${hudMix('var(--color-teal-5)', 18)}, transparent 72%)`,
    `radial-gradient(40% 46% at 92% 94%, ${hudMix('var(--color-accent-5)', 14)}, transparent 72%)`,
  ].join(','),
};

/**
 * Giấy chấm phủ cả trang, tan dần ra bốn mép khung nhìn — phủ đều tới tận mép thì đọc ra "lưới", tan
 * dần mới đọc ra một trang vở đặt dưới tấm thẻ. Mặt nạ chỉ đọc alpha nên màu đặc lấy `--color-bg-base`.
 */
const BACKDROP_DOTS_MASK =
  'radial-gradient(ellipse 85% 80% at 50% 50%, var(--color-bg-base) 35%, transparent 100%)';
export const BACKDROP_DOTS_STYLE: CSSProperties = {
  ...DOT_PAPER_STYLE,
  maskImage: BACKDROP_DOTS_MASK,
  WebkitMaskImage: BACKDROP_DOTS_MASK,
};

/**
 * Tông của sao & nét vẽ nền — HAI bậc: `-7` ở theme sáng, `-5` ở theme tối (`dark:`).
 *
 * ⛔ Không dùng một bậc `-5` chung: thang màu tông KHÔNG lật theo theme, mà `-5` chỉ hợp nền navy — trên
 *    `bg-base` sáng nó còn 1.6–2.4:1, cộng độ mờ của lớp (0.3–0.62) là sao hổ phách / teal gần như biến
 *    mất. Bậc `-7` ở theme sáng cho độ nổi xấp xỉ bậc `-5` trên nền tối.
 */
const DECOR_TONE = {
  primary: 'text-primary-7 dark:text-primary-5',
  // Hồng đi họ `pink-*`, KHÔNG `secondary-*`: `secondary` của hệ nay là cyan (khớp bảng màu chart +
  // lưới teal của khung app), còn màn xác thực giữ bộ bốn tông tím · hồng · teal · hổ phách.
  pink: 'text-pink-7 dark:text-pink-5',
  teal: 'text-teal-7 dark:text-teal-5',
  accent: 'text-accent-7 dark:text-accent-5',
} as const;

export interface BackdropSparkle {
  key: string;
  top: string;
  left: string;
  size: number;
  /** Màu (class `text-*`, một mục của `DECOR_TONE`). */
  tone: string;
  /** Lệch pha nhịp nhấp nháy. Âm ⇒ vào trang là mỗi ngôi sao đã ở một điểm khác nhau của chu kỳ. */
  delay: string;
}

/**
 * Năm ngôi sao nhỏ — sao là mô-típ XP/huy hiệu của nền tảng. Đặt trong các DẢI LỀ quanh tấm thẻ: dải
 * trên/dưới (≤ 5% · ≥ 94% chiều cao — khung nhìn 720–800px vẫn lọt trong lề `py-14` 56px) và hai dải bên
 * (≤ 3% · ≥ 96% bề ngang). Màn hẹp thì sao ở dải bên nằm khuất sau tấm thẻ — đúng ý, không cần ẩn riêng.
 */
export const BACKDROP_SPARKLES: readonly BackdropSparkle[] = [
  { key: 'n1', top: '4%', left: '18%', size: 12, tone: DECOR_TONE.primary, delay: '0s' },
  { key: 'n2', top: '5%', left: '71%', size: 10, tone: DECOR_TONE.accent, delay: '-2.2s' },
  { key: 'e', top: '38%', left: '96.5%', size: 12, tone: DECOR_TONE.teal, delay: '-3.6s' },
  { key: 'w', top: '58%', left: '2.5%', size: 14, tone: DECOR_TONE.pink, delay: '-1.4s' },
  { key: 's', top: '94.5%', left: '60%', size: 14, tone: DECOR_TONE.primary, delay: '-4.4s' },
];

export interface BackdropDoodle {
  key: string;
  icon: SystemIconName;
  top: string;
  left: string;
  size: number;
  /** Nghiêng vài độ cho ra nét "vẽ tay bên lề vở" — thẳng tắp thì đọc ra icon giao diện. */
  rotate: number;
  /** Màu (class `text-*`, một mục của `DECOR_TONE`). Độ mờ chung của cả lớp đặt ở nơi dùng. */
  tone: string;
}

/**
 * Bốn nét vẽ bên lề vở (icon NÉT MẢNH, rất mờ) — bài học · công thức · bài kiểm tra · gửi bài. Chỉ hiện
 * từ `xl`: dưới 1280px lề hai bên tấm thẻ hẹp hơn icon, nét vẽ sẽ bị mép thẻ cắt dở.
 *
 * `left` tính để icon nằm TRỌN trong lề ở 1280px (lề mỗi bên = (1280 − 1070) / 2 = 105px).
 */
export const BACKDROP_DOODLES: readonly BackdropDoodle[] = [
  {
    key: 'lesson',
    icon: 'bookmark-outline',
    top: '14%',
    left: '4%',
    size: 44,
    rotate: -12,
    tone: DECOR_TONE.primary,
  },
  {
    key: 'formula',
    icon: 'sigma-outline',
    top: '70%',
    left: '3.5%',
    size: 40,
    rotate: 10,
    tone: DECOR_TONE.teal,
  },
  {
    key: 'quiz',
    icon: 'clipboard-check-outline',
    top: '18%',
    left: '92.5%',
    size: 42,
    rotate: 8,
    tone: DECOR_TONE.pink,
  },
  {
    key: 'share',
    icon: 'paper-plane-top-outline',
    top: '72%',
    left: '93%',
    size: 38,
    rotate: -8,
    tone: DECOR_TONE.accent,
  },
];
