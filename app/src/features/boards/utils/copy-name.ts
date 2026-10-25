import { FALLBACK_BOARD_LIMITS } from '../constants/kanban.constants';
import { FALLBACK_TASK_LIMITS } from '../constants/task-detail.constants';

const COPY_SUFFIX = ' (bản sao)';

/**
 * "<tên> (bản sao)" — cắt phần tên gốc để TỔNG không vượt trần, cùng công thức `copyBoardName`/`copyTitle` của BE (đếm theo ký tự
 * Unicode chứ không theo đơn vị UTF-16, nên tên có emoji vẫn đúng độ dài BE tính).
 *
 * Dùng để ĐIỀN SẴN ô tên trong tấm sao chép; người dùng sửa được. Nơi gửi luôn truyền tên đã trim (không tin chuỗi này ở BE nhận).
 */
function withCopySuffix(text: string, max: number): string {
  return `${[...text].slice(0, Math.max(0, max - COPY_SUFFIX.length)).join('')}${COPY_SUFFIX}`;
}

export function copyTaskTitle(title: string): string {
  return withCopySuffix(title, FALLBACK_TASK_LIMITS.titleMax);
}

/** `max` = `limits.nameMax` của `capabilities` (thiếu thì trần cứng của BE). */
export function copyBoardName(name: string, max: number = FALLBACK_BOARD_LIMITS.nameMax): string {
  return withCopySuffix(name, max);
}
