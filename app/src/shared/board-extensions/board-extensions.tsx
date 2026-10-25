import { Fragment, type ReactNode } from 'react';

/**
 * ĐIỂM NỐI lối vào của feature khác vào màn bảng (Kanban) và thẻ bảng trong danh sách MÀ KHÔNG để `features/boards` import feature
 * đó (`feature-structure.md` cấm import chéo). Cùng mẫu `@/shared/profile` và `@/shared/calls`: feature nguồn (p4-06 `contribution`)
 * đăng ký renderer ở nơi lắp ráp — import `@/features/contribution/register` (side-effect) trong layout route `boards/_layout.tsx` —
 * còn `boards` chỉ vẽ `<BoardHeaderActionsSlot … />` / `<BoardCardActionsSlot … />` / `<BoardListActionsSlot … />` (khe cấp NHÓM ở đầu danh sách bảng).
 *
 * Renderer là HÀM trả `ReactNode` chứ không phải component: tra một component từ registry ngay lúc render bị `react-hooks/static-components`
 * chặn (mỗi lần vẽ là một kiểu component mới, state con bị reset). Đăng ký cùng `id` chỉ ghi đè nên an toàn với Fast Refresh; chưa đăng ký
 * (cờ tắt, test) ⇒ khe không vẽ gì và màn giữ nguyên hình dạng cũ.
 */
export interface BoardExtensionContext {
  boardId: string;
  wsId: string;
}

export type BoardExtensionRenderer = (context: BoardExtensionContext) => ReactNode;

/** Khe cấp NHÓM ở màn danh sách bảng — không gắn với bảng nào nên chỉ có `wsId` (vd "Hoạt động của nhóm" p4-06). */
export interface BoardListExtensionContext {
  wsId: string;
}

export type BoardListExtensionRenderer = (context: BoardListExtensionContext) => ReactNode;

const headerActions = new Map<string, BoardExtensionRenderer>();
const cardActions = new Map<string, BoardExtensionRenderer>();
const listActions = new Map<string, BoardListExtensionRenderer>();

/** Nút icon ở thanh tiêu đề của màn Kanban (cạnh "Dòng thời gian", "Cài đặt bảng"). Renderer trả `null` khi không áp dụng. */
export function registerBoardHeaderAction(id: string, renderer: BoardExtensionRenderer | null): void {
  if (renderer) headerActions.set(id, renderer);
  else headerActions.delete(id);
}

/** Lối vào dưới thẻ bảng trong danh sách bảng của nhóm. Renderer trả `null` khi không áp dụng. */
export function registerBoardCardAction(id: string, renderer: BoardExtensionRenderer | null): void {
  if (renderer) cardActions.set(id, renderer);
  else cardActions.delete(id);
}

/** Lối vào cấp NHÓM ở màn danh sách bảng (dưới banner, trên các tab). Renderer trả `null` khi không áp dụng. */
export function registerBoardListAction(id: string, renderer: BoardListExtensionRenderer | null): void {
  if (renderer) listActions.set(id, renderer);
  else listActions.delete(id);
}

function renderAll<Context>(registry: ReadonlyMap<string, (context: Context) => ReactNode>, context: Context): ReactNode {
  if (registry.size === 0) return null;
  return (
    <>
      {[...registry.entries()].map(([id, render]) => (
        <Fragment key={id}>{render(context)}</Fragment>
      ))}
    </>
  );
}

export function BoardHeaderActionsSlot(context: BoardExtensionContext): ReactNode {
  return renderAll(headerActions, context);
}

export function BoardCardActionsSlot(context: BoardExtensionContext): ReactNode {
  return renderAll(cardActions, context);
}

export function BoardListActionsSlot(context: BoardListExtensionContext): ReactNode {
  return renderAll(listActions, context);
}

/** Chỉ cho test — trả khe về trạng thái chưa đăng ký. */
export function resetBoardExtensions(): void {
  headerActions.clear();
  cardActions.clear();
  listActions.clear();
}
