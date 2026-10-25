import type { SkillCategory } from '../types/skill.types';

/** Nhãn nhóm kỹ năng (enum `SkillCategory` BE). */
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  MOBILE: 'Di động',
  DATA: 'Dữ liệu',
  DESIGN: 'Thiết kế',
  DEVOPS: 'DevOps',
  QA: 'Kiểm thử',
  SOFT: 'Kỹ năng mềm',
};

export const SKILL_CATEGORY_OPTIONS = Object.entries(SKILL_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Icon kỹ năng = TÊN trong bộ icon hệ thống của APP (`app/src/shared/ui/icon`) — app vẽ `<Icon name>`, thiếu → icon mặc định. Chỉ cho chọn
 * trong danh sách này để khỏi gõ tên không tồn tại.
 */
export const SKILL_ICON_OPTIONS = [
  { value: 'keyboard', label: 'Bàn phím (lập trình)' },
  { value: 'phone', label: 'Điện thoại (di động)' },
  { value: 'service', label: 'Dịch vụ (backend)' },
  { value: 'document-2', label: 'Tài liệu (dữ liệu)' },
  { value: 'magic-wand-01', label: 'Đũa phép (thiết kế)' },
  { value: 'checkmark-circle', label: 'Dấu tích (kiểm thử)' },
  { value: 'wrench-01', label: 'Cờ lê (DevOps)' },
  { value: 'setting', label: 'Bánh răng' },
  { value: 'analytics-02', label: 'Biểu đồ (phân tích)' },
  { value: 'book', label: 'Sách (tài liệu)' },
  { value: 'add-team', label: 'Nhóm (lãnh đạo)' },
  { value: 'language-skill', label: 'Ngôn ngữ' },
  { value: 'star', label: 'Ngôi sao' },
];

/** `LIMITS.skill` BE. */
export const SKILL_LIMITS = {
  codeMax: 40,
  nameMax: 60,
  descriptionMax: 300,
  labelMax: 40,
  labelMatchMax: 10,
  requiredTasksDoneMax: 500,
  minStoryPointsMax: 5000,
  peerScoreMax: 10,
  orderMax: 1000,
} as const;

export const SKILLS_PAGE_SIZE = 20;

/** Debounce gọi xem trước khi đổi tiêu chí (admin.md §2.2). */
export const PREVIEW_DEBOUNCE_MS = 800;
