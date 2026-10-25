/**
 * Thành phần HIỂN THỊ dùng chung của huy hiệu kỹ năng xác thực (p6-06) — p6-03/p6-07/p6-08 và thẻ thành viên (p1-02) import từ đây thay vì
 * import `features/career` (feature không import chéo). Không gọi API: nơi dùng tự tải dữ liệu rồi truyền vào.
 */
export { ProofOfWorkSheet } from './ProofOfWorkSheet';
export type { ProofOfWorkSheetProps } from './ProofOfWorkSheet';
export { SkillBadgeCard } from './SkillBadgeCard';
export type { SkillBadgeCardProps } from './SkillBadgeCard';
export { SkillBadgeRow } from './SkillBadgeRow';
export type { SkillBadgeRowProps } from './SkillBadgeRow';
export { SkillProgressBar } from './SkillProgressBar';
export type { SkillProgressBarProps } from './SkillProgressBar';
export { DEFAULT_SKILL_ICON, formatPoints, formatScore, SKILL_CATEGORY_LABELS, skillIconName } from './skill-format';
export type { ProofTask, SkillBadge, SkillCategory, SkillProof, SkillSummary } from './skill-badge.types';
