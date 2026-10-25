import type { ResolvedAccess } from "./scope.types";
import type { Action } from "./actions";

/**
 * Chuyển `ResolvedAccess.actions` thành mảng để trả trong DTO chi tiết
 * (field `myPermissions: string[]`) — client dùng để ẩn/hiện nút mà không
 * phải tự suy vai trò (be.md §3). `subset` cho phép module chỉ lộ 1 tập con
 * action liên quan tới DTO đó (đỡ nặng response).
 */
export function buildMyPermissions(access: ResolvedAccess, subset?: readonly Action[]): Action[] {
  const all = [...access.actions];
  const filtered = subset ? all.filter((action) => subset.includes(action)) : all;
  return filtered.sort();
}
