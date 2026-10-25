/**
 * Lớp căn lề dùng chung cho ô header và ô body của bảng.
 *
 * Tách khỏi `table-parts.tsx` vì file đó export component: để hằng số nằm cùng
 * làm vỡ Fast Refresh (`react-refresh/only-export-components`).
 */
export const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;
