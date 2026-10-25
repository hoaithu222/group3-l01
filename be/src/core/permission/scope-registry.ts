import type { ScopeType, ScopeResolver } from "./scope.types";

const registry = new Map<ScopeType, ScopeResolver>();

/**
 * Module Phase 1+ gọi khi import routes để đăng ký cách kiểm quyền cho 1
 * loại scope (vd p1-03 đăng ký CHANNEL). Gọi lại với cùng `type` sẽ GHI ĐÈ —
 * hữu ích cho test dùng fake resolver, tự chịu trách nhiệm không đăng ký
 * trùng ngoài ý muốn ở runtime thật.
 */
export function registerScopeResolver(resolver: ScopeResolver): void {
  registry.set(resolver.type, resolver);
}

/** Lấy resolver đã đăng ký cho 1 loại scope — `undefined` nếu module chưa đăng ký (Phase 0). */
export function getResolver(type: ScopeType): ScopeResolver | undefined {
  return registry.get(type);
}

/** Chỉ dùng trong test để cô lập giữa các case (giống `clearRoomGuards`). */
export function clearScopeRegistry(): void {
  registry.clear();
}
