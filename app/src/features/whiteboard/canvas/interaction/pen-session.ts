import {
  addElement,
  createElement,
  flattenPoints,
  strokeToFreehandFields,
  type Vec2,
} from '../../engine';
import { STROKE_SIMPLIFY_PX, STROKE_STEP_PX } from './interaction.constants';
import type { DragSession, InteractionEnv } from './interaction.types';

const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * Bút tự do (README §3 "1 ngón kéo (tool vẽ)"): nét đang vẽ chỉ hiện CỤC BỘ trên lớp nháp — KHÔNG phát cho người khác (khoá awareness `draft` bị
 * collab cấm, quyết định chốt) — rồi khi NHẢ TAY được làm mượt (Ramer–Douglas–Peucker, dung sai `1,5 px / zoom`, ≤ 500 điểm) và ghi vào Y.Doc bằng
 * MỘT transaction ⇒ một bước undo, một bản cập nhật CRDT. Chạm không kéo (`start` rồi `end`) ra một chấm. Chạm trần phần tử → `reportLimit`.
 */
export function createPenSession(env: InteractionEnv, start: Vec2): DragSession {
  const zoom = env.camera().zoom;
  const points: Vec2[] = [start];
  const style = env.style();
  const ctx = env.write();

  const show = (): void => {
    // Nháp dùng toạ độ TUYỆT ĐỐI (x = y = 0) nên vẽ thẳng, không cần làm mượt mỗi lần rê.
    const draft = createElement(
      'freehand',
      { points: flattenPoints(points), strokeColor: style.stroke, strokeWidth: style.width },
      { userId: ctx.userId },
    );
    env.setDraft({ active: true, elements: [draft], hiddenIds: NO_HIDDEN, marquee: null });
  };
  show();

  return {
    cancel: () => env.setDraft(null),
    end: () => {
      const fields = strokeToFreehandFields(points, { epsilon: STROKE_SIMPLIFY_PX / zoom });
      const el = createElement(
        'freehand',
        { ...fields, strokeColor: style.stroke, strokeWidth: style.width },
        { userId: ctx.userId },
      );
      const result = addElement(env.doc, el, ctx);
      env.setDraft(null);
      if (!result.ok && result.reason === 'limit') env.reportLimit();
    },
    move: (world) => {
      const last = points[points.length - 1];
      if (last && Math.hypot(world.x - last.x, world.y - last.y) < STROKE_STEP_PX / zoom) return;
      points.push(world);
      show();
    },
  };
}
