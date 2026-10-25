import { isShapeTool } from '../../constants/tools';
import { hitTestTopmost, screenToWorld, type Vec2 } from '../../engine';
import { createEraserSession } from './eraser-session';
import { TOUCH_PX } from './interaction.constants';
import type { DragSession, Interaction, InteractionEnv } from './interaction.types';
import { createPenSession } from './pen-session';
import { createSelectTool } from './select-tool';
import { createShapeSession } from './shape-session';

/** Bọc phiên kéo để phát con trỏ lên awareness: mỗi lần rê một vị trí (đã throttle ở publisher), nhả tay thì báo "rời". */
function withPointer(env: InteractionEnv, session: DragSession, start: Vec2): DragSession {
  env.pointer(start);
  return {
    cancel: () => {
      session.cancel();
      env.pointer(null);
    },
    end: () => {
      session.end();
      env.pointer(null);
    },
    move: (world) => {
      env.pointer(world);
      session.move(world);
    },
  };
}

/**
 * Bộ xử lý tương tác của canvas — ánh xạ CỬ CHỈ → LỆNH ENGINE theo công cụ (README §3), THUẦN TS: nhận toạ độ màn, đọc/ghi Y.Doc và store qua
 * `InteractionEnv`. Dựng chỉ khi CÓ QUYỀN VẼ (viewer không có bộ này — chỉ pan/zoom, xem `useWhiteboardGestures`), nên không có đường nào
 * để viewer ghi vào Y.Doc từ UI. Chữ/giấy nhớ không kéo (`begin` → `null`): chạm mở tấm soạn chữ.
 */
export function createInteraction(env: InteractionEnv): Interaction {
  const select = createSelectTool(env);

  const begin = (screen: Vec2): DragSession | null => {
    const tool = env.tool();
    if (tool === 'select') return select.begin(screen);
    const world = screenToWorld(env.camera(), screen);
    let session: DragSession | null = null;
    if (tool === 'pen') session = createPenSession(env, world);
    else if (isShapeTool(tool)) session = createShapeSession(env, tool, world);
    else if (tool === 'eraser') session = createEraserSession(env, world);
    return session ? withPointer(env, session, world) : null;
  };

  const tapText = (screen: Vec2): void => {
    const cam = env.camera();
    const world = screenToWorld(cam, screen);
    const hit = hitTestTopmost(env.elements(), world, { tolerance: TOUCH_PX / cam.zoom });
    if (hit && (hit.type === 'text' || hit.type === 'sticky')) {
      env.requestTextEdit({ id: hit.id, mode: 'edit' });
      return;
    }
    env.requestTextEdit({ at: world, mode: 'create', type: env.tool() === 'sticky' ? 'sticky' : 'text' });
  };

  return {
    begin,
    longPress: (screen) => {
      if (env.tool() === 'select') select.longPress(screen);
    },
    tap: (screen) => {
      const tool = env.tool();
      if (tool === 'select') select.tap(screen);
      else if (tool === 'text' || tool === 'sticky') tapText(screen);
      else begin(screen)?.end(); // một chạm = phiên chỉ có một điểm: chấm (bút), hình mặc định, tẩy đúng chỗ chạm
    },
  };
}
