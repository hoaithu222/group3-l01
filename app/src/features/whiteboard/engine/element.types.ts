import type { BACKGROUNDS, ELEMENT_TYPES } from './element.constants';

export type ElementType = (typeof ELEMENT_TYPES)[number];
export type BackgroundKind = (typeof BACKGROUNDS)[number];

/** Id token màu (`ink`, `blue`, `yellow`…), KHÔNG phải mã hex — xem `element.constants.ts`. */
export type ColorId = string;

export interface Vec2 {
  x: number;
  y: number;
}

/** Hình chữ nhật trục-song-song. Ở đây `w`,`h` luôn >= 0 (chuẩn hoá bằng `normalizeRect`). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Đầu mũi tên dính vào phần tử khác (be.md §2.1 `startBinding`/`endBinding`). */
export interface Binding {
  elementId: string;
}

/**
 * Một phần tử trên bảng — bản ĐỌC RA từ `Y.Map` (mỗi trường là một khoá riêng trong `Y.Map` để hai người sửa
 * hai trường khác nhau của cùng phần tử đều được giữ — WB-01).
 *
 * Quy ước hình học (⚠️ do engine chọn, kế hoạch không nêu — đối chiếu với schema BE):
 *  · Hộp `(x, y, w, h)` là hộp CHƯA XOAY, `rotation` (độ, chiều kim đồng hồ trên màn) xoay quanh TÂM hộp.
 *  · `line`/`arrow`: đầu = `(x, y)`, cuối = `(x + w, y + h)`; `w`,`h` CÓ THỂ ÂM (đường chéo ngược).
 *  · `freehand`: `points` là dãy phẳng `[x0,y0,x1,y1,…]` TƯƠNG ĐỐI theo `(x, y)`; `(x,y,w,h)` là hộp bao của nét.
 *    Nhờ vậy kéo cả nét chỉ đổi `x,y` (không ghi lại 1000 số vào CRDT).
 */
export interface WhiteboardElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  strokeColor: ColorId;
  fillColor: ColorId | null;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  points?: number[];
  startBinding?: Binding;
  endBinding?: Binding;
  assetId?: string;
  locked?: boolean;
  createdBy: string;
  updatedBy: string;
  /** Mili-giây epoch. */
  updatedAt: number;
}

/**
 * Bản vá một phần tử. Khoá có giá trị `undefined` nghĩa là XOÁ trường đó (vd `startBinding: undefined` = gỡ
 * dính). `id`/`type`/`createdBy` bất biến nên không vá được; `updatedBy/updatedAt` do adapter tự đóng dấu.
 */
export type ElementPatch = Partial<Omit<WhiteboardElement, 'id' | 'type' | 'createdBy'>>;
export type PatchMap = Map<string, ElementPatch>;

/**
 * Ngữ cảnh ghi vào Y.Doc. `userId` vừa là `updatedBy` VỪA là `origin` của transaction — chính nó là thứ
 * `Y.UndoManager` (`trackedOrigins`) dùng để chỉ hoàn tác thao tác của mình (WB-03).
 * ⚠️ Schema hợp đồng đòi `createdBy`/`updatedBy` là ObjectId 24 hex — `userId` thật của app đúng dạng đó; engine KHÔNG
 * từ chối id khác dạng (test dùng 'alice'), nhưng BE sẽ cảnh báo phần tử như vậy.
 */
export interface WriteContext {
  userId: string;
  /** Mặc định `Date.now()`; test truyền cứng cho ổn định. */
  now?: number;
  /** Mặc định `WB_LIMITS.elementsMax`; app truyền số của `capabilities.limits.whiteboard`. */
  elementsMax?: number;
}

export type WriteFailure =
  | { ok: false; reason: 'limit'; max: number }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'exists' };

export type AddResult = { ok: true } | WriteFailure;
export type DuplicateResult = { ok: true; ids: string[] } | WriteFailure;
