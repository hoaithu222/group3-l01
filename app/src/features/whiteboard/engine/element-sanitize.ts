import {
  COLOR_TOKEN_PATTERN,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
  ELEMENT_TYPES,
  ID_PATTERN,
  OBJECT_ID_PATTERN,
  WB_LIMITS,
} from './element.constants';
import type { Binding, ElementPatch, ElementType, WhiteboardElement } from './element.types';
import { normalizeAngle } from './geometry';

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function cleanPoints(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const nums = v.filter(isNum).slice(0, WB_LIMITS.pointsMax);
  // Số lẻ thì bỏ số cuối: cặp (x,y) cụt vẽ ra điểm rác ở gốc.
  return nums.length % 2 === 0 ? nums : nums.slice(0, -1);
}

function cleanBinding(v: unknown): Binding | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const id = (v as Record<string, unknown>).elementId;
  return isStr(id) && ID_PATTERN.test(id) ? { elementId: id } : undefined;
}

/**
 * Làm sạch MỘT bản vá trước khi ghi vào Y.Doc: kẹp `strokeWidth`/`fontSize`, cắt `text`/`points`, chuẩn hoá
 * `rotation`, và BỎ trường sai kiểu hoặc không hữu hạn (NaN/Infinity vào CRDT là vào vĩnh viễn — mọi máy sau đó
 * đọc phải Infinity). `undefined` giữ nguyên vì nó nghĩa là "xoá trường" (xem `ElementPatch`).
 */
export function sanitizePatch(patch: ElementPatch): ElementPatch {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) out[key] = undefined;
    else if (key === 'x' || key === 'y' || key === 'w' || key === 'h') {
      if (isNum(value)) out[key] = value;
    } else if (key === 'rotation') {
      if (isNum(value)) out[key] = normalizeAngle(value);
    } else if (key === 'strokeWidth') {
      if (isNum(value)) out[key] = clamp(value, WB_LIMITS.strokeWidthMin, WB_LIMITS.strokeWidthMax);
    } else if (key === 'fontSize') {
      if (isNum(value)) out[key] = clamp(value, WB_LIMITS.fontSizeMin, WB_LIMITS.fontSizeMax);
    } else if (key === 'text') {
      if (isStr(value)) out[key] = value.slice(0, WB_LIMITS.textMax);
    } else if (key === 'points') {
      const pts = cleanPoints(value);
      if (pts) out[key] = pts;
    } else if (key === 'startBinding' || key === 'endBinding') {
      const b = cleanBinding(value);
      if (b) out[key] = b;
    } else if (key === 'fillColor') {
      if (value === null || (isStr(value) && COLOR_TOKEN_PATTERN.test(value))) out[key] = value;
    } else if (key === 'locked') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (key === 'strokeColor') {
      if (isStr(value) && COLOR_TOKEN_PATTERN.test(value)) out[key] = value;
    } else if (key === 'assetId') {
      if (isStr(value) && OBJECT_ID_PATTERN.test(value)) out[key] = value;
    }
    // Khoá khác (kể cả `id`/`type`/`createdBy`/`updatedBy`/`updatedAt`) bị bỏ: bất biến hoặc do adapter đóng dấu.
  }
  return out as ElementPatch;
}

/**
 * Dữ liệu THÔ (từ `Y.Map.toJSON()`) → phần tử hợp lệ, hoặc `null` nếu hỏng không cứu được. Dữ liệu tới từ máy
 * khác nên coi là KHÔNG tin cậy: một máy cũ/độc hại ghi `w: "abc"` không được làm sập bộ vẽ của mọi người.
 * Phần tử `null` bị bỏ qua khi vẽ nhưng VẪN tính vào trần 5000 (trần đếm theo `elements.size`, khớp inspector BE).
 */
export function parseElement(raw: unknown): WhiteboardElement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { id, type } = r;
  if (!isStr(id) || !ID_PATTERN.test(id)) return null;
  if (!isStr(type) || !(ELEMENT_TYPES as readonly string[]).includes(type)) return null;
  if (!isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) return null;

  const patch = sanitizePatch({
    rotation: isNum(r.rotation) ? r.rotation : 0,
    strokeWidth: isNum(r.strokeWidth) ? r.strokeWidth : DEFAULT_STROKE_WIDTH,
    text: r.text as string,
    fontSize: r.fontSize as number,
    points: r.points as number[],
    startBinding: r.startBinding as Binding,
    endBinding: r.endBinding as Binding,
    locked: r.locked as boolean,
    strokeColor: r.strokeColor as string,
    fillColor: r.fillColor as string | null,
    assetId: r.assetId as string,
  });
  if (type === 'freehand' && !patch.points) return null;

  const el: WhiteboardElement = {
    id,
    type: type as ElementType,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    rotation: patch.rotation ?? 0,
    strokeColor: patch.strokeColor ?? DEFAULT_STROKE_COLOR,
    fillColor: patch.fillColor ?? null,
    strokeWidth: patch.strokeWidth ?? DEFAULT_STROKE_WIDTH,
    createdBy: isStr(r.createdBy) ? r.createdBy : '',
    updatedBy: isStr(r.updatedBy) ? r.updatedBy : '',
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : 0,
  };
  if (patch.text !== undefined) el.text = patch.text;
  if (patch.fontSize !== undefined) el.fontSize = patch.fontSize;
  if (patch.points) el.points = patch.points;
  if (patch.startBinding) el.startBinding = patch.startBinding;
  if (patch.endBinding) el.endBinding = patch.endBinding;
  if (patch.assetId) el.assetId = patch.assetId;
  if (patch.locked) el.locked = true;
  return el;
}
