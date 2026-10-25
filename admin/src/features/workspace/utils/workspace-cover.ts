/**
 * Nền bìa của nhóm khi CHƯA có ảnh bìa — phải trùng với app mobile: cùng danh sách khoá, cùng THỨ TỰ, cùng hàm chọn
 * ổn định theo id. Khoá khớp `WORKSPACE_COVER_PRESETS` phía BE (`be/src/modules/workspaces/entities/workspace.interface.ts`).
 */
import type { WorkspaceCoverPreset } from '../types/workspace.types';

/** ⛔ Đừng đổi thứ tự: `coverPresetFor` chọn theo CHỈ SỐ — đổi là admin và app vẽ hai màu khác nhau cho cùng một nhóm. */
export const WORKSPACE_COVER_PRESETS = [
  'violet',
  'amber',
  'ocean',
  'forest',
  'sunset',
  'rose',
  'slate',
] as const satisfies readonly WorkspaceCoverPreset[];

/** Mẫu bìa của nhóm: `coverPreset` BE trả; `null` ⇒ chọn ổn định theo id (băm ×31, không dấu 32-bit — CÙNG thuật toán app). */
export function coverPresetFor(
  id: string,
  preset: WorkspaceCoverPreset | null,
): WorkspaceCoverPreset {
  if (preset) return preset;
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WORKSPACE_COVER_PRESETS[h % WORKSPACE_COVER_PRESETS.length];
}

/**
 * Gradient (`bg-gradient-to-*`) của từng mẫu — CHỈ token có trong `colors-theme.json`, không hex. Các bậc dùng ở đây có
 * cùng giá trị ở hai theme nên bìa giữ nguyên màu khi đổi sáng/tối, như một tấm ảnh.
 */
export const WORKSPACE_COVER_GRADIENT: Readonly<Record<WorkspaceCoverPreset, string>> = {
  // Họ `purple-*` (không phải `primary-*`): thang `primary` của theme sáng đã dời về bậc 500 nên KHÁC
  // theme tối — dùng nó là bìa đổi màu khi đổi theme. `purple-*` giống hệt nhau ở hai theme.
  violet: 'from-purple-3 via-purple-5 to-purple-8',
  amber: 'from-accent-3 via-accent-5 to-accent-7',
  ocean: 'from-sky-4 via-sky-6 to-blue-8',
  forest: 'from-success-4 via-success-6 to-emerald-9',
  sunset: 'from-warning-3 via-warning-5 to-warning-7',
  rose: 'from-pink-4 via-error-5 to-error-7',
  slate: 'from-gray-4 via-gray-6 to-gray-8',
};
