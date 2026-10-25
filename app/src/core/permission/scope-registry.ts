import type { Href } from 'expo-router';

import type { ScopeType } from './scope';

/** Route hiện tại (`usePathname()` + `useLocalSearchParams()`) — truyền cho `routeMatcher`. */
export interface CurrentRoute {
  params: Record<string, string | string[]>;
  pathname: string;
}

export interface ScopeCleanupOptions {
  /**
   * Trả về danh sách query key CHÍNH XÁC cần xoá thêm cho scope này —
   * `removeQueries({queryKey})` tự khớp THEO TIỀN TỐ. Bổ sung cho quy ước
   * `matchesScope()` (`scope.ts`) khi query key của feature không theo đúng
   * khuôn `[domain, scopeType, scopeId]`.
   */
  queryKeyPrefixes?: (scopeId: string) => unknown[][];
  /** Side-effect khác ngoài cache/route/nháp (vd đóng modal riêng của feature). */
  onRevoked?: (scopeId: string) => void;
  /**
   * Đang đứng ở màn hình thuộc scope này? Trả `Href` để `router.replace` về
   * (app.md §3: mặc định danh sách cấp trên), `null`/`undefined` nếu route
   * hiện tại không liên quan — khi đó KHÔNG điều hướng, KHÔNG toast.
   */
  routeMatcher?: (route: CurrentRoute, scopeId: string) => Href | null | undefined;
}

/**
 * Registry THUẦN (không React, không Zustand) — module Phase 1+ gọi
 * `registerScopeCleanup()` lúc feature được nạp (`src/features/<x>/index.ts`),
 * giống mô hình `registerScopeResolver` phía BE.
 *
 * ⛔ `core/permission` KHÔNG bao giờ tự import feature nào để tự đăng ký —
 * đúng luật 3 tầng (`app.md` §2): registry chỉ GIỮ, không biết trước nội dung.
 */
const registry = new Map<ScopeType, ScopeCleanupOptions[]>();

/** Đăng ký cách dọn cache/route cho MỘT loại scope. Trả về hàm huỷ đăng ký. */
export function registerScopeCleanup(type: ScopeType, options: ScopeCleanupOptions): () => void {
  const list = registry.get(type) ?? [];
  list.push(options);
  registry.set(type, list);

  return () => {
    const current = registry.get(type);
    if (!current) return;
    const next = current.filter((entry) => entry !== options);
    if (next.length > 0) registry.set(type, next);
    else registry.delete(type);
  };
}

/** Mọi đăng ký cho 1 loại scope — `permission-revoked.handler.ts` lặp qua khi xử lý sự kiện. */
export function getScopeCleanups(type: ScopeType): readonly ScopeCleanupOptions[] {
  return registry.get(type) ?? [];
}

/** CHỈ dùng trong test: xoá sạch registry giữa các case, tránh case sau ăn đăng ký của case trước. */
export function resetScopeRegistry(): void {
  registry.clear();
}
