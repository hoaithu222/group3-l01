import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STICKY_FILL,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
} from './element.constants';
import type { ElementPatch, ElementType, WhiteboardElement } from './element.types';

/**
 * Id phần tử: thời gian (base36) + 8 ký tự ngẫu nhiên. Sinh ở CLIENT nên không thể dùng bộ đếm chung — hai
 * máy cùng vẽ một lúc phải không đụng id. `rand` tiêm vào để test xác định; mặc định `Math.random` là đủ vì id
 * không phải bí mật, chỉ cần không trùng (~41 bit ngẫu nhiên + dấu thời gian).
 */
export function newElementId(rand: () => number = Math.random, now: number = Date.now()): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += Math.floor(rand() * 36).toString(36);
  return `${now.toString(36)}${suffix}`;
}

/**
 * Ước lượng kích thước chữ khi chưa đo được. ⚠️ ĐÂY LÀ SUY ĐOÁN (rộng ≈ 0.6 × cỡ chữ mỗi ký tự, cao ≈ 1.25 ×
 * cỡ chữ mỗi dòng): engine thuần không có font để đo. Canvas Skia đo bằng `Paragraph`/`Font.measureText` rồi
 * ghi đè `w`,`h` thật; con số này chỉ để hộp chọn có kích thước hợp lý lúc vừa tạo.
 */
export function estimateTextSize(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return { w: Math.max(fontSize, longest * fontSize * 0.6), h: lines.length * fontSize * 1.25 };
}

interface TypeDefaults {
  w: number;
  h: number;
  fillColor: string | null;
  strokeWidth: number;
}

const TYPE_DEFAULTS: Record<ElementType, TypeDefaults> = {
  rect: { w: 160, h: 100, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
  ellipse: { w: 160, h: 100, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
  line: { w: 120, h: 0, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
  arrow: { w: 120, h: 0, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
  text: { w: 0, h: 0, fillColor: null, strokeWidth: 1 },
  sticky: { w: 160, h: 160, fillColor: DEFAULT_STICKY_FILL, strokeWidth: 1 },
  freehand: { w: 0, h: 0, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
  image: { w: 240, h: 160, fillColor: null, strokeWidth: 1 },
  frame: { w: 480, h: 320, fillColor: null, strokeWidth: DEFAULT_STROKE_WIDTH },
};

export type CreateInit = Partial<
  Omit<WhiteboardElement, 'createdBy' | 'id' | 'type' | 'updatedAt' | 'updatedBy'>
> & { id?: string };

/**
 * Dựng phần tử với mặc định theo loại. `text`/`sticky` chưa có kích thước thì ước lượng theo chữ.
 * Hàm THUẦN: không chạm Y.Doc. `createdBy`/`updatedBy`/`updatedAt` sẽ được `addElements` đóng dấu lại theo
 * `WriteContext` — không tin giá trị caller đưa vào (không cho giả người tạo).
 */
export function createElement(
  type: ElementType,
  init: CreateInit,
  ctx: { userId: string; now?: number },
): WhiteboardElement {
  const d = TYPE_DEFAULTS[type];
  const text = init.text ?? (type === 'text' || type === 'sticky' ? '' : undefined);
  const fontSize = init.fontSize ?? (text !== undefined ? DEFAULT_FONT_SIZE : undefined);
  const est =
    text !== undefined && fontSize !== undefined ? estimateTextSize(text, fontSize) : null;
  const needsEstimate = type === 'text' && est !== null;
  const el: WhiteboardElement = {
    id: init.id ?? newElementId(),
    type,
    x: init.x ?? 0,
    y: init.y ?? 0,
    w: init.w ?? (needsEstimate ? est.w : d.w),
    h: init.h ?? (needsEstimate ? est.h : d.h),
    rotation: init.rotation ?? 0,
    strokeColor: init.strokeColor ?? DEFAULT_STROKE_COLOR,
    fillColor: init.fillColor === undefined ? d.fillColor : init.fillColor,
    strokeWidth: init.strokeWidth ?? d.strokeWidth,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
    updatedAt: ctx.now ?? Date.now(),
  };
  if (text !== undefined) el.text = text;
  if (fontSize !== undefined) el.fontSize = fontSize;
  if (type === 'freehand') el.points = init.points ?? [];
  else if (init.points) el.points = init.points;
  if (init.startBinding) el.startBinding = init.startBinding;
  if (init.endBinding) el.endBinding = init.endBinding;
  if (init.assetId) el.assetId = init.assetId;
  if (init.locked) el.locked = true;
  return el;
}

/**
 * Áp bản vá lên một phần tử, trả BẢN SAO. Khoá `undefined` trong bản vá XOÁ trường (cùng nghĩa với lúc ghi vào
 * Y.Map). Dùng để vẽ bản nháp lúc đang kéo mà chưa ghi vào CRDT.
 */
export function applyPatch(el: WhiteboardElement, patch: ElementPatch): WhiteboardElement {
  const next: Record<string, unknown> = { ...el };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as unknown as WhiteboardElement;
}
