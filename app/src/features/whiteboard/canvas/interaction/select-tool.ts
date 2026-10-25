import {
  dragArrowEndpoint,
  hitTestHandle,
  hitTestTopmost,
  moveElements,
  moveLineEndpoint,
  resizeBox,
  resizeGroup,
  rotateElement,
  screenToWorld,
  type PatchMap,
  type Vec2,
  type WhiteboardElement,
} from '../../engine';
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_PX,
  HANDLE_HIT_PX,
  ROTATE_HANDLE_PX,
  TOUCH_PX,
} from './interaction.constants';
import type { DragSession, Interaction, InteractionEnv } from './interaction.types';
import { createMarqueeSession, createPatchSession } from './patch-session';
import { selectionGeometry, type SelectionGeometry } from './selection-geometry';

const CORNERS = ['nw', 'ne', 'se', 'sw'];
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Bắt tay nắm của khung chọn hiện tại (nếu con trỏ đang ở tay nắm) → phiên đổi cỡ/xoay/kéo đầu mút; không trúng tay nắm nào → `null`. */
function beginOnHandle(
  env: InteractionEnv,
  world: Vec2,
  selected: readonly WhiteboardElement[],
  geo: SelectionGeometry,
): DragSession | null {
  const zoom = env.camera().zoom;
  const radius = HANDLE_HIT_PX / zoom;
  const first = selected[0];
  if (!first) return null;

  if (geo.kind === 'line') {
    const which = dist(world, geo.start) <= radius ? 'start' : dist(world, geo.end) <= radius ? 'end' : null;
    if (!which) return null;
    return createPatchSession(env, (p): PatchMap => {
      const patch =
        first.type === 'arrow'
          ? dragArrowEndpoint(env.elements(), first, which, p, TOUCH_PX / zoom)
          : moveLineEndpoint(first, which, p);
      return new Map([[first.id, patch]]);
    });
  }

  const handle = hitTestHandle(geo.box, geo.rotation, world, radius, ROTATE_HANDLE_PX / zoom);
  if (!handle) return null;
  if (geo.kind === 'group') {
    if (handle === 'rotate') return null; // nhóm không có tay nắm xoay
    const box = geo.box;
    return createPatchSession(env, (p) =>
      resizeGroup(selected, box, handle, p, { keepAspect: CORNERS.includes(handle) }),
    );
  }
  return createPatchSession(env, (p) => {
    if (handle === 'rotate') return new Map([[first.id, rotateElement(first, p)]]);
    const keepAspect = CORNERS.includes(handle) && (first.type === 'freehand' || first.type === 'text');
    return new Map([[first.id, resizeBox(first, handle, p, { keepAspect })]]);
  });
}

/**
 * Công cụ "Chọn" (README §3): chạm chọn phần tử trên cùng (chạm đúp chữ/giấy nhớ → sửa chữ), nhấn giữ chọn, kéo trên TAY NẮM khung chọn → đổi cỡ/xoay/kéo
 * đầu mút, kéo trên phần tử → di chuyển (chưa chọn thì chọn nó trước), kéo trên nền trống → khung chọn nhiều. Tất cả đi qua hàm thuần của engine.
 */
export function createSelectTool(env: InteractionEnv): Pick<Interaction, 'begin' | 'longPress' | 'tap'> {
  let lastTap: { id: string; screen: Vec2; time: number } | null = null;
  const selected = (): WhiteboardElement[] => {
    const ids = new Set(env.selection());
    return env.elements().filter((el) => ids.has(el.id));
  };
  const topmostAt = (screen: Vec2) => {
    const cam = env.camera();
    return hitTestTopmost(env.elements(), screenToWorld(cam, screen), { tolerance: TOUCH_PX / cam.zoom });
  };

  return {
    begin: (screen) => {
      const world = screenToWorld(env.camera(), screen);
      const current = selected();
      const geo = selectionGeometry(current);
      const onHandle = geo ? beginOnHandle(env, world, current, geo) : null;
      if (onHandle) return onHandle;
      const hit = topmostAt(screen);
      if (!hit) return createMarqueeSession(env, world);
      let movers = current;
      if (!env.selection().includes(hit.id)) {
        env.setSelection([hit.id]);
        movers = [hit];
      }
      return createPatchSession(env, (p) => moveElements(movers, p.x - world.x, p.y - world.y));
    },
    longPress: (screen) => {
      const hit = topmostAt(screen);
      if (hit && !env.selection().includes(hit.id)) env.setSelection([hit.id]);
    },
    tap: (screen) => {
      const hit = topmostAt(screen);
      const time = env.now();
      if (!hit) {
        lastTap = null;
        env.setSelection([]);
        return;
      }
      const again =
        lastTap !== null &&
        lastTap.id === hit.id &&
        time - lastTap.time <= DOUBLE_TAP_MS &&
        dist(screen, lastTap.screen) <= DOUBLE_TAP_PX;
      lastTap = { id: hit.id, screen, time };
      if (again && (hit.type === 'text' || hit.type === 'sticky')) {
        env.requestTextEdit({ id: hit.id, mode: 'edit' });
        return;
      }
      env.setSelection([hit.id]);
    },
  };
}
