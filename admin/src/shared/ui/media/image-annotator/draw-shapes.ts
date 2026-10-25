/**
 * Vẽ shape lên canvas 2D — hàm THUẦN, không React, không DOM ngoài `ctx`.
 * Dùng chung cho canvas hiển thị (đã `ctx.scale(scale, scale)`) và canvas flatten (scale = 1),
 * nên mọi số liệu ở đây đều là pixel ảnh gốc.
 */
import {
  FONT_FAMILY,
  LINE_HEIGHT_RATIO,
  type Bounds,
  type Shape,
  type TextShape,
} from './annotation.types';

/** Tách chữ thành dòng — TextShape hỗ trợ xuống dòng thủ công. */
export const textLines = (shape: TextShape): string[] => shape.text.split('\n');

/**
 * Hộp bao của shape trong hệ toạ độ ảnh.
 * Text cần `ctx` để đo bề rộng thật (`measureText`) — font phải set trước khi đo.
 */
export const shapeBounds = (ctx: CanvasRenderingContext2D, shape: Shape): Bounds => {
  if (shape.kind === 'ellipse') {
    return {
      x: shape.cx - shape.rx,
      y: shape.cy - shape.ry,
      width: shape.rx * 2,
      height: shape.ry * 2,
    };
  }

  ctx.save();
  ctx.font = `600 ${shape.fontSize}px ${FONT_FAMILY}`;
  const lines = textLines(shape);
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
  ctx.restore();

  const lineHeight = shape.fontSize * LINE_HEIGHT_RATIO;
  return { x: shape.x, y: shape.y, width, height: lineHeight * lines.length };
};

const drawEllipse = (ctx: CanvasRenderingContext2D, shape: Extract<Shape, { kind: 'ellipse' }>) => {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(shape.cx, shape.cy, Math.max(shape.rx, 1), Math.max(shape.ry, 1), 0, 0, Math.PI * 2);
  // Viền trắng mờ phía dưới → nét đỏ vẫn đọc được khi ảnh nền cũng đỏ/tối.
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = shape.lineWidth * 1.9;
  ctx.stroke();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.lineWidth;
  ctx.stroke();
  ctx.restore();
};

const drawText = (ctx: CanvasRenderingContext2D, shape: TextShape) => {
  ctx.save();
  ctx.font = `600 ${shape.fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  const lineHeight = shape.fontSize * LINE_HEIGHT_RATIO;
  textLines(shape).forEach((line, idx) => {
    const y = shape.y + idx * lineHeight;
    // 2 lớp: viền trắng dày rồi mới tô màu → đọc được trên nền ảnh bất kỳ.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(shape.fontSize / 6, 2);
    ctx.strokeText(line, shape.x, y);
    ctx.fillStyle = shape.color;
    ctx.fillText(line, shape.x, y);
  });
  ctx.restore();
};

/** Khung chọn nét đứt quanh shape đang chọn. `scale` để nét khung luôn ~1px trên màn hình. */
const drawSelection = (ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) => {
  const pad = 6 / scale;
  ctx.save();
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = '#38BDF8';
  ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
  ctx.restore();
};

/** Toạ độ 4 handle góc của khung chọn (theo hệ ảnh) — kéo để đổi cỡ, dùng cho cả ellipse lẫn chữ. */
export const cornerHandles = (bounds: Bounds) => [
  { key: 'nw' as const, x: bounds.x, y: bounds.y },
  { key: 'ne' as const, x: bounds.x + bounds.width, y: bounds.y },
  { key: 'sw' as const, x: bounds.x, y: bounds.y + bounds.height },
  { key: 'se' as const, x: bounds.x + bounds.width, y: bounds.y + bounds.height },
];

export type HandleKey = ReturnType<typeof cornerHandles>[number]['key'];

const drawHandles = (ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) => {
  const size = 9 / scale;
  ctx.save();
  ctx.fillStyle = '#38BDF8';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5 / scale;
  cornerHandles(bounds).forEach(({ x, y }) => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  });
  ctx.restore();
};

// ── Thẻ kéo di chuyển ─────────────────────────────────────────────────────────
// Kích thước tính bằng px MÀN HÌNH (chia `scale`) để thẻ không phình ra khi phóng to.

const MOVE_TAG_W = 22;
const MOVE_TAG_H = 15;
const MOVE_TAG_GAP = 7;

/**
 * Vùng thẻ kéo của một shape — nằm ngay dưới mép TRÁI hộp bao, tách khỏi thân shape.
 * Di chuyển CHỈ qua thẻ này (kéo trên thân shape không làm gì) nên bấm nhầm không xê dịch nét vẽ.
 *
 * `imageHeight` để kẹp lại khi shape nằm sát đáy ảnh — thẻ rơi ra ngoài canvas là không bấm được.
 */
export const moveHandleRect = (bounds: Bounds, scale: number, imageHeight: number): Bounds => {
  const width = MOVE_TAG_W / scale;
  const height = MOVE_TAG_H / scale;
  const below = bounds.y + bounds.height + MOVE_TAG_GAP / scale;
  return {
    x: bounds.x,
    y: imageHeight > 0 ? Math.min(below, Math.max(imageHeight - height, 0)) : below,
    width,
    height,
  };
};

/** Thẻ nền tối + lưới 2×3 chấm trắng — ký hiệu "nắm để kéo" quen thuộc. */
const drawMoveTag = (
  ctx: CanvasRenderingContext2D,
  rect: Bounds,
  scale: number,
  active: boolean,
) => {
  ctx.save();
  ctx.fillStyle = active ? '#38BDF8' : 'rgba(15,23,42,0.9)';
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 1.5 / scale;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  ctx.fillStyle = '#FFFFFF';
  const dot = 1.5 / scale;
  for (let col = 1; col <= 2; col += 1) {
    for (let row = 1; row <= 3; row += 1) {
      ctx.beginPath();
      ctx.arc(
        rect.x + (rect.width / 3) * col,
        rect.y + (rect.height / 4) * row,
        dot,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
};

export interface DrawOptions {
  /** Id shape đang chọn — vẽ thêm khung + handle. Bỏ qua khi flatten. */
  selectedId?: string | null;
  /** Tỉ lệ hiển thị, để nét trang trí không dày lên khi zoom. Flatten dùng 1. */
  scale?: number;
  /**
   * Ellipse đang kéo dở. Tách khỏi `shapes` vì nó chưa phải object thật: vẽ preview thì có,
   * nhưng KHÔNG gắn thẻ kéo (chưa tồn tại thì chưa có gì để di chuyển).
   */
  draft?: Shape | null;
  /** Vẽ thẻ kéo cho mọi shape. Flatten luôn tắt để thẻ không bị nung vào ảnh. */
  showMoveHandles?: boolean;
  /** Chiều cao ảnh gốc — để kẹp thẻ kéo của shape sát đáy. */
  imageHeight?: number;
}

/** Vẽ toàn bộ shape theo thứ tự mảng (phần tử sau nằm trên). */
export const drawShapes = (
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  {
    selectedId = null,
    scale = 1,
    draft = null,
    showMoveHandles = false,
    imageHeight = 0,
  }: DrawOptions = {},
) => {
  const paint = (shape: Shape) => {
    if (shape.kind === 'ellipse') drawEllipse(ctx, shape);
    else drawText(ctx, shape);
  };
  shapes.forEach(paint);
  if (draft) paint(draft);

  const selected = selectedId ? shapes.find((s) => s.id === selectedId) : undefined;
  if (selected) {
    const bounds = shapeBounds(ctx, selected);
    drawSelection(ctx, bounds, scale);
    drawHandles(ctx, bounds, scale);
  }

  // Thẻ kéo vẽ SAU CÙNG để nét vẽ của shape khác không đè lên.
  if (!showMoveHandles) return;
  shapes.forEach((shape) => {
    const rect = moveHandleRect(shapeBounds(ctx, shape), scale, imageHeight);
    drawMoveTag(ctx, rect, scale, shape.id === selectedId);
  });
};
