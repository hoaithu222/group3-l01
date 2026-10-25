/**
 * Hằng số của engine bảng trắng (p6-02). Nguồn: `p6-02-whiteboard/README.md` §7 và `be.md` §2.1.
 *
 * ⚠️ Ranh giới thật (trần phần tử, độ dài chữ, số điểm nét) do BE/`contracts/whiteboard-elements.schema.json`
 * kiểm lần cuối; ở đây là bản của client để CHẶN SỚM và làm sạch dữ liệu từ máy khác. Đổi một con số ở
 * một phía mà không đổi phía kia thì phía chặt hơn sẽ âm thầm cắt/từ chối dữ liệu của phía lỏng hơn.
 *
 * ⛔ File này (và cả thư mục `engine/`) là TypeScript thuần: không import React, React Native, Skia, Expo —
 * để chạy được trong Jest môi trường node và để BE dùng lại cùng thuật toán khi xuất PNG (be.md §7).
 */

/** Loại phần tử. `image`/`frame` là P1 nhưng đã có trong schema nên engine chấp nhận sẵn. */
export const ELEMENT_TYPES = [
  'rect',
  'ellipse',
  'line',
  'arrow',
  'text',
  'sticky',
  'freehand',
  'image',
  'frame',
] as const;

/** Nền canvas lưu ở `meta.background`. */
export const BACKGROUNDS = ['grid', 'dots', 'plain'] as const;

/** Loại phần tử mà đầu mũi tên được phép "dính" vào (không gồm đường/nét/khung nhóm). */
export const BINDABLE_TYPES = ['rect', 'ellipse', 'text', 'sticky', 'image'] as const;

export const WB_LIMITS = {
  /** Trần phần tử mỗi bảng. App ưu tiên số của `capabilities.limits.whiteboard.elementsMax` nếu có. */
  elementsMax: 5000,
  textMax: 2000,
  /** Tính bằng SỐ (x,y xen kẽ) chứ không phải số điểm: 1000 số = 500 điểm/nét. */
  pointsMax: 1000,
  strokeWidthMin: 1,
  strokeWidthMax: 12,
  fontSizeMin: 12,
  fontSizeMax: 96,
} as const;

/**
 * Định dạng khớp `contracts/whiteboard-elements.schema.json` (`$defs`): id phần tử, id token màu, ObjectId
 * Mongo (`assetId`, `createdBy`, `updatedBy`). `tests/contract.test.ts` đọc thẳng file schema để bắt lệch.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const COLOR_TOKEN_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;
export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Cạnh nhỏ nhất khi người dùng KÉO đổi kích thước — chặn lật ngược và thu về 0 (mất tay nắm). */
export const MIN_SIZE = 8;

/** Màu là id token (be.md §2.1) để đổi sáng/tối không vỡ tương phản; engine không biết mã màu thật. */
export const DEFAULT_STROKE_COLOR = 'ink';
export const DEFAULT_STICKY_FILL = 'yellow';
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_FONT_SIZE = 20;
