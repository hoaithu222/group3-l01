import type { ShapeTool } from '../../constants/tools';
import {
  addElement,
  applyPatch,
  createElement,
  findBindingTarget,
  lineEndpoints,
  resolveArrow,
  type Vec2,
  type WhiteboardElement,
} from '../../engine';
import { TINY_DRAG_PX, TOUCH_PX } from './interaction.constants';
import type { DragSession, InteractionEnv } from './interaction.types';

const NO_HIDDEN: ReadonlySet<string> = new Set();

interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** Hộp của hình đang kéo: hình chữ nhật/elip chuẩn hoá về w,h ≥ 0; đường/mũi tên giữ dấu (đầu = điểm chạm xuống, cuối = ngón tay) — quy ước của engine. */
function boxFor(tool: ShapeTool, from: Vec2, to: Vec2): Box {
  if (tool === 'line' || tool === 'arrow') return { h: to.y - from.y, w: to.x - from.x, x: from.x, y: from.y };
  return {
    h: Math.abs(to.y - from.y),
    w: Math.abs(to.x - from.x),
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
  };
}

/** Chạm không kéo: hình mặc định 160×100 đặt GIỮA điểm chạm; đường/mũi tên 120 px sang phải từ điểm chạm. */
function defaultBox(tool: ShapeTool, at: Vec2): Box {
  if (tool === 'line' || tool === 'arrow') return { h: 0, w: 120, x: at.x, y: at.y };
  return { h: 100, w: 160, x: at.x - 80, y: at.y - 50 };
}

/**
 * Mũi tên MỚI dính hình: đầu nào rơi trong một hình dính được thì gắn `startBinding`/`endBinding` rồi để `resolveArrow` đưa đầu mút ra viền hình.
 * Hai đầu cùng rơi vào MỘT hình (kéo ngắn trong hình) thì bỏ dính hết — mũi tên tự trỏ vào chính nó là vô nghĩa.
 */
export function bindNewArrow(
  elements: readonly WhiteboardElement[],
  arrow: WhiteboardElement,
  tolerance: number,
): WhiteboardElement {
  const { end, start } = lineEndpoints(arrow);
  const from = findBindingTarget(elements, start, { tolerance });
  const to = findBindingTarget(elements, end, { tolerance });
  if ((!from && !to) || from?.id === to?.id) return arrow;
  const bound: WhiteboardElement = {
    ...arrow,
    ...(from ? { startBinding: { elementId: from.id } } : {}),
    ...(to ? { endBinding: { elementId: to.id } } : {}),
  };
  const patch = resolveArrow(bound, new Map(elements.map((el) => [el.id, el])));
  return patch ? applyPatch(bound, patch) : bound;
}

/**
 * Vẽ hình/đường/mũi tên bằng KÉO (chữ nhật, elip, đường, mũi tên): nháp chỉ hiện cục bộ, nhả tay ghi MỘT transaction. Xong thì chuyển về công cụ
 * "Chọn" và chọn hình vừa tạo — người dùng thường muốn chỉnh ngay (đổi cỡ, gõ chữ vào), và không vô tình vẽ thêm hình khi định kéo màn hình.
 */
export function createShapeSession(env: InteractionEnv, tool: ShapeTool, start: Vec2): DragSession {
  const cam = env.camera();
  const style = env.style();
  const ctx = env.write();
  let current = start;

  const build = (box: Box): WhiteboardElement =>
    createElement(
      tool,
      {
        ...box,
        fillColor: tool === 'rect' || tool === 'ellipse' ? style.fill : null,
        strokeColor: style.stroke,
        strokeWidth: style.width,
      },
      { userId: ctx.userId },
    );

  const show = (): void =>
    env.setDraft({
      active: true,
      elements: [build(boxFor(tool, start, current))],
      hiddenIds: NO_HIDDEN,
      marquee: null,
    });
  show();

  return {
    cancel: () => env.setDraft(null),
    end: () => {
      const tiny = Math.hypot(current.x - start.x, current.y - start.y) * cam.zoom < TINY_DRAG_PX;
      let el = build(tiny ? defaultBox(tool, start) : boxFor(tool, start, current));
      if (tool === 'arrow') el = bindNewArrow(env.elements(), el, TOUCH_PX / cam.zoom);
      const result = addElement(env.doc, el, ctx);
      env.setDraft(null);
      if (result.ok) {
        env.setTool('select');
        env.setSelection([el.id]);
      } else if (result.reason === 'limit') env.reportLimit();
    },
    move: (world) => {
      current = world;
      show();
    },
  };
}
