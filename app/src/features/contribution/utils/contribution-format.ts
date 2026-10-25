import type { ContributionFormula, ContributionMember, ContributionWeights } from '../api/contribution.types';
import { formatDateTimeIn } from './zoned-format';

/** Chữ thay cho thành phần chưa có dữ liệu — ⛔ không bao giờ hiện `0`: 0 điểm khác hẳn "chưa có gì để tính". */
export const NO_DATA_LABEL = 'Chưa có dữ liệu';

export type ComponentKey = 'onTime' | 'peer' | 'points';

export const COMPONENT_KEYS: readonly ComponentKey[] = ['points', 'onTime', 'peer'];

export const COMPONENT_LABELS: Readonly<Record<ComponentKey, string>> = {
  onTime: 'Đúng hạn',
  peer: 'Điểm chấm',
  points: 'Điểm thẻ',
};

/**
 * Số thập phân kiểu Việt Nam (dấu PHẨY): `91` → `"91,0"`. ⛔ Không `toLocaleString()`/`Intl` — Hermes cắt ICU nên cùng một số hiện hai kiểu
 * trên Android và iOS (`screen-layout.md`).
 */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Bỏ số 0 thừa: `8` → `"8"`, `2.5` → `"2,5"`, `0.333` → `"0,33"`. */
export function formatPoints(value: number): string {
  return String(Number(value.toFixed(2))).replace('.', ',');
}

export const formatScore = (score: number): string => formatDecimal(score, 1);

export const formatShare = (share: number): string => `${formatDecimal(share, 1)}%`;

/** `60 / 20 / 20` — điểm thẻ / đúng hạn / điểm chấm. */
export function formatWeights(weights: ContributionWeights): string {
  return `${weights.points} / ${weights.onTime} / ${weights.peer}`;
}

/** Số gốc của MỘT thành phần, đi cạnh phần trăm ("8 điểm thẻ" · "3/4 đúng hạn" · "chấm 8,0 (5 lượt)"). Thiếu dữ liệu → chữ, không phải 0. */
export function componentRaw(key: ComponentKey, member: ContributionMember): string {
  if (member.components[key] === null) return NO_DATA_LABEL;
  if (key === 'points') return `${formatPoints(member.storyPointsDone)} điểm thẻ`;
  if (key === 'onTime') return `${member.tasksOnTime}/${member.tasksWithDue} đúng hạn`;
  return `chấm ${formatDecimal(member.peerScoreAvg ?? 0)} (${member.reviewCount} lượt)`;
}

function joinVi(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}`;
}

/**
 * Câu giải thích khi có thành phần chưa có dữ liệu: "20 % đúng hạn được chia lại cho hai thành phần còn lại". `null` khi đủ ba thành
 * phần. Dùng trọng số ĐÃ CẤU HÌNH (không phải `weightsUsed`) — đó mới là con số người đọc thấy ở thẻ công thức.
 */
export function redistributionNote(member: ContributionMember, weights: ContributionWeights): string | null {
  const missing = COMPONENT_KEYS.filter((key) => member.components[key] === null);
  if (missing.length === 0) return null;
  if (missing.length === COMPONENT_KEYS.length) return 'Chưa có dữ liệu nào để tính điểm.';
  const parts = missing.map((key) => `${weights[key]} % ${COMPONENT_LABELS[key].toLowerCase()}`);
  return `${joinVi(parts)} được chia lại cho ${missing.length === 1 ? 'hai thành phần' : 'thành phần'} còn lại`;
}

/** "điểm thẻ 75 · đúng hạn 25" — trọng số THẬT SỰ áp dụng sau khi chia lại; chỉ liệt kê thành phần có dữ liệu (không có "0 %" gây hiểu nhầm). */
export function weightsUsedText(member: ContributionMember): string {
  return COMPONENT_KEYS.filter((key) => member.components[key] !== null)
    .map((key) => `${COMPONENT_LABELS[key].toLowerCase()} ${formatPoints(member.weightsUsed[key])}`)
    .join(' · ');
}

/** Nhãn trợ năng cho một hàng thành viên — đọc đủ điểm, tỉ lệ và số gốc chứ không chỉ con số. */
export function memberSpokenLabel(member: ContributionMember): string {
  const parts = COMPONENT_KEYS.map((key) => `${COMPONENT_LABELS[key]}: ${componentRaw(key, member)}`);
  return `${member.user.name}, ${formatScore(member.score)} điểm, ${formatShare(member.share)} của nhóm. ${parts.join('. ')}`;
}

/** "Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60/20/20)" — `null` khi công thức chưa từng đổi. */
export function formulaChangeText(formula: ContributionFormula, timezone: string): string | null {
  if (!formula.changedAt) return null;
  const when = formatDateTimeIn(formula.changedAt, timezone);
  const by = formula.changedBy ? ` bởi ${formula.changedBy.name}` : '';
  const before = formula.previousWeights ? ` (trước: ${formatWeights(formula.previousWeights)})` : '';
  return `Trọng số đổi lúc ${when}${by}${before}`;
}
