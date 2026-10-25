import type { ThemeColorKey } from '@/shared/theme';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Bản sắc HÌNH ẢNH của chế độ "Thi đấu trực tiếp" — tông, icon, bộ nhận diện đáp án, huy chương.
 *
 * ── Vì sao có bảng RIÊNG mà không đọc `study-modes.constants.ts` ─────────────────────────────────────────────────────
 * `live-quiz` không được import từ `features/study` (`check:imports`, không có cặp nào khai trong `feature-boundaries.json`).
 * Nên tông `warning` + icon `flash` được KHAI LẠI ở đây — hai bảng phải khớp nhau bằng tay (Trang chủ/tổng quan bộ học nhìn
 * thấy "Thi đấu trực tiếp" màu cam + tia chớp, vào tới đây phải cùng màu cùng icon).
 *
 * ⛔ Mọi màu là token VAI TRÒ đã đo tương phản (`action-*` + `*-fg` CÙNG CẶP, `surface-*`, `border-*`). Không hex, không thang số.
 * ⚠️ Màu KHÔNG phải kênh thông tin duy nhất: mỗi đáp án còn có CHỮ CÁI + HÌNH KHỐI riêng (người mù màu vẫn phân biệt).
 */
export const LIVE_QUIZ_TONE: IconTileTone = 'warning';
export const LIVE_QUIZ_ICON: IconName = 'flash';

/** Nền + viền nhạt của khối "nổi bật" của chế độ (thẻ PIN, thẻ chờ) — cùng họ với ô `IconTile` tông `warning`. */
export const HERO_SURFACE = 'border-hairline border-border-warning-subtle bg-surface-warning';

export type AnswerShapeName = 'circle' | 'diamond' | 'hexagon' | 'square' | 'star' | 'triangle';

export interface AnswerIdentity {
  /** Nền ĐẶC của ô đáp án. */
  fill: string;
  /** Chữ trên nền đó — ⛔ luôn là `*-fg` CÙNG CẶP (ghép chéo là mất phần tương phản đã đo). */
  ink: string;
  /** Cùng màu chữ ở dạng token, cho hình SVG (không nhận className). */
  inkToken: ThemeColorKey;
  shape: AnswerShapeName;
}

/**
 * Sáu bộ nhận diện đáp án A–F (BE cho tối đa 6 lựa chọn). Ba tông đầu là thương hiệu · xanh dương · vàng, tông thứ tư là cam
 * của chế độ; ⛔ cố ý KHÔNG dùng đỏ/xanh lá cho A–D: hai màu đó dành riêng cho ĐÚNG/SAI ở màn lộ đáp án, dùng lẫn thì người
 * chơi đọc "ô xanh lá" thành "đáp án đúng" ngay từ lúc còn đang chọn. Từ E trở đi mới mượn xanh lá/mực — lúc đó hình khối
 * và chữ cái là dấu nhận biết chính.
 */
export const ANSWER_IDENTITIES: readonly [AnswerIdentity, ...AnswerIdentity[]] = [
  { fill: 'bg-action-base', ink: 'text-action-fg', inkToken: 'action-fg', shape: 'triangle' },
  {
    fill: 'bg-action-info',
    ink: 'text-action-info-fg',
    inkToken: 'action-info-fg',
    shape: 'diamond',
  },
  {
    fill: 'bg-action-accent',
    ink: 'text-action-accent-fg',
    inkToken: 'action-accent-fg',
    shape: 'circle',
  },
  {
    fill: 'bg-action-warning',
    ink: 'text-action-warning-fg',
    inkToken: 'action-warning-fg',
    shape: 'square',
  },
  {
    fill: 'bg-action-success',
    ink: 'text-action-success-fg',
    inkToken: 'action-success-fg',
    shape: 'hexagon',
  },
  { fill: 'bg-action-ink', ink: 'text-action-ink-fg', inkToken: 'action-ink-fg', shape: 'star' },
];

export interface MedalStyle {
  fill: string;
  ink: string;
  inkToken: ThemeColorKey;
}

/**
 * Vàng · bạc · đồng của bục nhận giải. Hạng luôn có CON SỐ trên huy chương — màu chỉ để đẹp, không mang nghĩa một mình.
 * `action-accent` (vàng) · `action-grey-press` (xám bạc; chữ `action-ink` đo ≥ 6:1 ở cả hai chế độ) · `action-warning` (cam đồng).
 */
export const MEDALS: Record<1 | 2 | 3, MedalStyle> = {
  1: { fill: 'bg-action-accent', ink: 'text-action-accent-fg', inkToken: 'action-accent-fg' },
  2: { fill: 'bg-action-grey-press', ink: 'text-action-ink', inkToken: 'action-ink' },
  3: { fill: 'bg-action-warning', ink: 'text-action-warning-fg', inkToken: 'action-warning-fg' },
};

/** Chiều cao cột bục (dp) theo hạng — cột nhất cao nhất. Số đo hình học của hình vẽ, không phải cỡ chữ/màu. */
export const PODIUM_HEIGHT: Record<1 | 2 | 3, number> = { 1: 104, 2: 76, 3: 56 };
