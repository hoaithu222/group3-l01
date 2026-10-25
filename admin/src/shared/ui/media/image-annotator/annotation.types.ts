/**
 * Kiểu dữ liệu cho editor chú thích ảnh (khoanh đỏ + ghi chữ).
 *
 * MỌI toạ độ/kích thước lưu theo hệ **pixel của ảnh gốc** (natural), KHÔNG phải pixel hiển thị.
 * Canvas vẽ ở tỉ lệ `scale` = displayWidth / naturalWidth; pointer event chia cho `scale` để
 * quy về hệ ảnh. Nhờ vậy flatten ở kích thước gốc luôn khớp cái người dùng nhìn thấy, và ảnh
 * 4000px không bị nét vẽ mảnh như sợi tóc.
 */

/**
 * Chỉ có công cụ VẼ — không có chế độ "Chọn" riêng.
 * Chọn / di chuyển / đổi cỡ làm qua thẻ kéo và handle gắn ngay trên từng object, nên hai
 * việc đó dùng được ở bất kỳ tool nào mà không phải chuyển qua lại.
 */
export type Tool = 'ellipse' | 'text';

export interface Point {
  x: number;
  y: number;
}

interface BaseShape {
  id: string;
  color: string;
}

/** Ellipse viền (không tô nền) — dùng để khoanh vùng vi phạm. */
export interface EllipseShape extends BaseShape {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  lineWidth: number;
}

/** Chữ chú thích. `x`/`y` là góc trên-trái của dòng đầu. */
export interface TextShape extends BaseShape {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Shape = EllipseShape | TextShape;

/** Hộp bao của một shape trong hệ toạ độ ảnh — dùng cho hit-test và khung chọn. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Màu bút — đỏ đứng đầu vì khoanh vi phạm là ca dùng chính. Trùng preset của ColorPickerField. */
export const ANNOTATION_COLORS = [
  '#F43F5E',
  '#F59E0B',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#FFFFFF',
] as const;

export const DEFAULT_COLOR = ANNOTATION_COLORS[0];

/** Hệ số nhân quanh giá trị mặc định — 3 nấc mảnh / vừa / dày cho cả nét vẽ lẫn cỡ chữ. */
export const SIZE_STEPS = [0.6, 1, 1.6] as const;
export const DEFAULT_SIZE_STEP = 1;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Độ dày nét mặc định co theo bề ngang ảnh — ảnh càng lớn nét càng phải dày mới thấy. */
export const baseLineWidth = (naturalWidth: number) => clamp(naturalWidth / 300, 3, 24);

/** Cỡ chữ mặc định co theo bề ngang ảnh. */
export const baseFontSize = (naturalWidth: number) => clamp(naturalWidth / 28, 16, 96);

export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Khoảng cách dòng của TextShape — nhân với fontSize. */
export const LINE_HEIGHT_RATIO = 1.25;
