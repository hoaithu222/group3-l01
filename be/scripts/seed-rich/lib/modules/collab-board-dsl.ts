/**
 * Dựng trạng thái Yjs của BẢNG TRẮNG: `elements` = Y.Map<id, Y.Map>, `order` = Y.Array<id>, `meta` = Y.Map { background } — đúng hợp đồng
 * `contracts/whiteboard-elements.schema.json` (app ghi phần tử bằng `new Y.Map(Object.entries(el))`). Màu là ID TOKEN (ink, red, yellow, green, blue, purple).
 * Mũi tên "dính" (startBinding/endBinding) được tính sẵn hai đầu nằm đúng trên viền hình, giống `bindingPoint` của engine app.
 */
import * as Y from "yjs";

export type Tone = "ink" | "red" | "yellow" | "green" | "blue" | "purple";
export type Background = "grid" | "dots" | "plain";

export interface BoardElement {
  id: string;
  type: "rect" | "ellipse" | "line" | "arrow" | "text" | "sticky";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  strokeColor: Tone;
  fillColor: Tone | null;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  startBinding?: { elementId: string };
  endBinding?: { elementId: string };
  createdBy: string;
  updatedBy: string;
  updatedAt: number;
}

interface Opts {
  stroke?: Tone;
  fill?: Tone | null;
  sw?: number;
  size?: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Ước lượng kích thước chữ như `estimateTextSize` của engine (0,6 × cỡ chữ mỗi ký tự, 1,25 × cỡ chữ mỗi dòng). */
export function textSize(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0);
  return { w: Math.max(fontSize, longest * fontSize * 0.6), h: lines.length * fontSize * 1.25 };
}

/** Điểm trên viền `t` mà tia từ tâm `t` hướng tới `toward` cắt qua (ellipse theo công thức chuẩn hoá, còn lại coi là chữ nhật). */
function borderPoint(t: BoardElement, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const hw = t.w / 2;
  const hh = t.h / 2;
  if ((dx === 0 && dy === 0) || hw <= 0 || hh <= 0) return { x: cx, y: cy };
  const k = t.type === "ellipse" ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2) : Math.min(hw / Math.abs(dx), hh / Math.abs(dy));
  return { x: cx + dx * k, y: cy + dy * k };
}

/** Bộ dựng bảng: gọi các hàm vẽ theo thứ tự (phần tử sau nằm trên), rồi `elements`. `authors` luân phiên làm người vẽ để bảng có nhiều dấu vết cộng tác. */
export class BoardBuilder {
  private readonly list: BoardElement[] = [];
  private readonly byId = new Map<string, BoardElement>();

  constructor(
    private readonly authors: readonly string[],
    private readonly from: number,
    private readonly to: number
  ) {}

  get elements(): readonly BoardElement[] {
    return this.list;
  }

  private add(el: Omit<BoardElement, "rotation" | "createdBy" | "updatedBy" | "updatedAt"> & { by?: string }): string {
    if (this.byId.has(el.id)) throw new Error(`Bảng trắng: id phần tử trùng "${el.id}"`);
    const n = this.list.length;
    const by = el.by ?? this.authors[n % this.authors.length];
    const { by: _by, ...rest } = el;
    void _by;
    const at = Math.round(this.from + ((this.to - this.from) * (n + 1)) / (n + 8));
    const full: BoardElement = { ...rest, rotation: 0, createdBy: by, updatedBy: by, updatedAt: at };
    this.list.push(full);
    this.byId.set(full.id, full);
    return full.id;
  }

  rect(id: string, x: number, y: number, w: number, h: number, o: Opts = {}): string {
    return this.add({ id, type: "rect", x, y, w, h, strokeColor: o.stroke ?? "ink", fillColor: o.fill ?? null, strokeWidth: o.sw ?? 2 });
  }

  ellipse(id: string, x: number, y: number, w: number, h: number, o: Opts = {}): string {
    return this.add({ id, type: "ellipse", x, y, w, h, strokeColor: o.stroke ?? "ink", fillColor: o.fill ?? null, strokeWidth: o.sw ?? 2 });
  }

  /** Chữ tự do, góc trên trái tại (x, y). */
  text(id: string, x: number, y: number, text: string, o: Opts = {}): string {
    const size = o.size ?? 20;
    const s = textSize(text, size);
    return this.add({ id, type: "text", x, y, w: round2(s.w), h: round2(s.h), strokeColor: o.stroke ?? "ink", fillColor: null, strokeWidth: 1, text, fontSize: size });
  }

  /** Chữ nằm giữa hình `boxId` (canh theo kích thước ước lượng). */
  label(id: string, boxId: string, text: string, o: Opts & { dy?: number } = {}): string {
    const box = this.byId.get(boxId);
    if (!box) throw new Error(`label "${id}": không có hình "${boxId}"`);
    const size = o.size ?? 18;
    const s = textSize(text, size);
    return this.text(id, round2(box.x + (box.w - s.w) / 2), round2(box.y + (box.h - s.h) / 2 + (o.dy ?? 0)), text, { ...o, size });
  }

  /** Hình có chữ ở giữa: id của hình là `id`, chữ là `id-t`. */
  node(id: string, x: number, y: number, w: number, h: number, text: string, o: Opts & { shape?: "rect" | "ellipse" } = {}): string {
    if (o.shape === "ellipse") this.ellipse(id, x, y, w, h, o);
    else this.rect(id, x, y, w, h, o);
    this.label(`${id}-t`, id, text, { size: o.size ?? 18 });
    return id;
  }

  sticky(id: string, x: number, y: number, text: string, fill: Tone = "yellow", o: { w?: number; h?: number; size?: number } = {}): string {
    return this.add({ id, type: "sticky", x, y, w: o.w ?? 170, h: o.h ?? 150, strokeColor: "ink", fillColor: fill, strokeWidth: 1, text, fontSize: o.size ?? 16 });
  }

  line(id: string, x1: number, y1: number, x2: number, y2: number, o: Opts = {}): string {
    return this.add({ id, type: "line", x: x1, y: y1, w: round2(x2 - x1), h: round2(y2 - y1), strokeColor: o.stroke ?? "ink", fillColor: null, strokeWidth: o.sw ?? 2 });
  }

  /** Mũi tên giữa hai hình (dính vào viền, có startBinding/endBinding) hoặc tới/từ một điểm tự do. */
  arrow(id: string, from: string | readonly [number, number], to: string | readonly [number, number], o: Opts = {}): string {
    const a = typeof from === "string" ? this.mustGet(from) : null;
    const b = typeof to === "string" ? this.mustGet(to) : null;
    const centerA = a ? { x: a.x + a.w / 2, y: a.y + a.h / 2 } : { x: (from as readonly [number, number])[0], y: (from as readonly [number, number])[1] };
    const centerB = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: (to as readonly [number, number])[0], y: (to as readonly [number, number])[1] };
    const start = a ? borderPoint(a, centerB) : centerA;
    const end = b ? borderPoint(b, centerA) : centerB;
    return this.add({
      id,
      type: "arrow",
      x: round2(start.x),
      y: round2(start.y),
      w: round2(end.x - start.x),
      h: round2(end.y - start.y),
      strokeColor: o.stroke ?? "ink",
      fillColor: null,
      strokeWidth: o.sw ?? 2,
      ...(a ? { startBinding: { elementId: a.id } } : {}),
      ...(b ? { endBinding: { elementId: b.id } } : {}),
    });
  }

  /** Chữ nhỏ đặt cạnh điểm giữa mũi tên/đường `lineId` (dịch thêm dx, dy) — nhãn "Có"/"Không", "1"/"N", trọng số cạnh. */
  tag(id: string, lineId: string, text: string, o: Opts & { dx?: number; dy?: number; at?: number } = {}): string {
    const l = this.mustGet(lineId);
    const size = o.size ?? 16;
    const s = textSize(text, size);
    const t = o.at ?? 0.5;
    return this.text(id, round2(l.x + l.w * t - s.w / 2 + (o.dx ?? 0)), round2(l.y + l.h * t - s.h / 2 + (o.dy ?? 0)), text, { ...o, size });
  }

  private mustGet(id: string): BoardElement {
    const el = this.byId.get(id);
    if (!el) throw new Error(`Bảng trắng: chưa có phần tử "${id}" (vẽ hình trước khi nối mũi tên)`);
    return el;
  }
}

/** Mã hoá thành trạng thái Yjs. `take` = chỉ lấy `take` phần tử đầu (bản lưu cũ của bảng). */
export function encodeBoard(elements: readonly BoardElement[], background: Background, clientId: number, take = elements.length): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  const map = doc.getMap<Y.Map<unknown>>("elements");
  const order = doc.getArray<string>("order");
  const meta = doc.getMap<unknown>("meta");
  const used = elements.slice(0, take);
  doc.transact(() => {
    meta.set("background", background);
    for (const el of used) map.set(el.id, new Y.Map<unknown>(Object.entries(el)));
    order.push(used.map((e) => e.id));
  });
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/** Thực thể ERD: khung chữ nhật (id) + dải tiêu đề tô màu + danh sách trường. Trả `id` của khung để nối mũi tên. Cao = 54 + 20 × số trường. */
export function drawEntity(b: BoardBuilder, id: string, x: number, y: number, title: string, fields: readonly string[], tone: Tone, w = 240): string {
  b.rect(id, x, y, w, 54 + fields.length * 20);
  b.rect(`${id}-h`, x, y, w, 34, { fill: tone });
  b.label(`${id}-ht`, `${id}-h`, title, { size: 18 });
  b.text(`${id}-f`, x + 14, y + 46, fields.join("\n"), { size: 16 });
  return id;
}
