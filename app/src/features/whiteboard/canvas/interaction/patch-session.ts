import {
  applyPatch,
  elementsInRect,
  normalizeRect,
  updateElements,
  withArrowRebinding,
  type PatchMap,
  type Vec2,
  type WhiteboardElement,
} from '../../engine';
import type { DragSession, InteractionEnv } from './interaction.types';

const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * Phiên kéo SỬA phần tử có sẵn (di chuyển, đổi cỡ, xoay, kéo đầu mút): `compute(world)` là một hàm THUẦN của engine trả `PatchMap` từ vị trí con trỏ.
 * Mỗi lần rê chỉ dựng bản nháp (`applyPatch` lên bản sao, gốc bị ẩn khỏi cảnh); NHẢ TAY mới `updateElements` MỘT transaction — mũi tên dính hình
 * cũng được vá trong cùng transaction (`withArrowRebinding`) nên người khác không bao giờ thấy mũi tên lệch hình ở nhịp giữa chừng. Rê xong mà
 * không đổi gì (bản vá rỗng) thì không ghi gì — không sinh bản cập nhật rỗng.
 */
export function createPatchSession(
  env: InteractionEnv,
  compute: (world: Vec2) => PatchMap,
): DragSession {
  const all = env.elements();
  let latest: PatchMap = new Map();

  return {
    cancel: () => env.setDraft(null),
    end: () => {
      env.setDraft(null);
      if (latest.size > 0) updateElements(env.doc, latest, env.write());
    },
    move: (world) => {
      latest = withArrowRebinding(all, compute(world));
      const byId = new Map(all.map((el) => [el.id, el]));
      const patched: WhiteboardElement[] = [];
      for (const [id, patch] of latest) {
        const el = byId.get(id);
        if (el) patched.push(applyPatch(el, patch));
      }
      env.setDraft({
        active: true,
        elements: patched,
        hiddenIds: new Set(latest.keys()),
        marquee: null,
      });
    },
  };
}

/** Khung chọn nhiều: kéo trên nền trống → hình chữ nhật (nháp); nhả tay chọn mọi phần tử GIAO khung (như FigJam). */
export function createMarqueeSession(env: InteractionEnv, start: Vec2): DragSession {
  let rect = normalizeRect({ h: 0, w: 0, x: start.x, y: start.y });
  return {
    cancel: () => env.setDraft(null),
    end: () => {
      env.setDraft(null);
      const inside = elementsInRect(env.elements(), rect, 'intersect');
      env.setSelection(inside.map((el) => el.id));
    },
    move: (world) => {
      rect = normalizeRect({ h: world.y - start.y, w: world.x - start.x, x: start.x, y: start.y });
      env.setDraft({ active: true, elements: [], hiddenIds: NO_HIDDEN, marquee: rect });
    },
  };
}
