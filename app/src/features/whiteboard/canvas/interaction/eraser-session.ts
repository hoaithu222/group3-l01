import { hitTestTopmost, removeElements, type Vec2, type WhiteboardElement } from '../../engine';
import { TOUCH_PX } from './interaction.constants';
import type { DragSession, InteractionEnv } from './interaction.types';

/**
 * Tẩy: rê qua phần tử nào thì phần tử đó bị ẩn NGAY (nháp, `hiddenIds`) và nhớ lại; NHẢ TAY mới xoá tất cả trong MỘT transaction (một bước undo cho cả
 * nét tẩy). Rê nhanh có thể nhảy qua nét mảnh nên nội suy các điểm cách nhau ≤ nửa bán kính chạm giữa hai lần báo vị trí.
 * Xoá phần tử cũng gỡ dính của mũi tên trỏ vào nó (engine `removeElements` lo).
 */
export function createEraserSession(env: InteractionEnv, start: Vec2): DragSession {
  const zoom = env.camera().zoom;
  const tolerance = TOUCH_PX / zoom;
  const doomed = new Set<string>();
  let last = start;

  const visit = (world: Vec2): void => {
    const candidates: readonly WhiteboardElement[] = env.elements().filter((el) => !doomed.has(el.id));
    const hit = hitTestTopmost(candidates, world, { tolerance });
    if (hit) doomed.add(hit.id);
  };
  const show = (): void =>
    env.setDraft({ active: true, elements: [], hiddenIds: new Set(doomed), marquee: null });

  const scan = (to: Vec2): void => {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - last.x, to.y - last.y) / (tolerance / 2)));
    const before = doomed.size;
    for (let i = 1; i <= steps; i++) {
      visit({ x: last.x + ((to.x - last.x) * i) / steps, y: last.y + ((to.y - last.y) * i) / steps });
    }
    last = to;
    if (doomed.size !== before) show();
  };

  visit(start);
  show();

  return {
    cancel: () => env.setDraft(null),
    end: () => {
      env.setDraft(null);
      if (doomed.size > 0) removeElements(env.doc, [...doomed], env.write());
      env.setSelection(env.selection().filter((id) => !doomed.has(id)));
    },
    move: scan,
  };
}
