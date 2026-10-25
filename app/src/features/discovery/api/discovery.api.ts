import type { DiscoveryScope } from './discovery.types';

/**
 * Đường dẫn endpoint của `discovery` (p1-09 be.md §4) — nối sau `appConfig.apiBaseUrl`. Luôn dùng dạng TỔNG QUÁT
 * `/scopes/:scopeType/:scopeId/…` (cùng cách `chat.service.ts`), không dùng alias `/channels/:id/…` dành cho curl/test.
 */
export const DISCOVERY_ENDPOINTS = {
  SAVED: '/me/saved',
  /** `GET /workspaces` — nguồn chip lọc theo nhóm ở trang "Đã lưu". Gọi thẳng, không import feature `workspaces`. */
  WORKSPACES: '/workspaces',
} as const;

export function scopePinsPath(scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>): string {
  return `/scopes/${scope.scopeType}/${scope.scopeId}/pins`;
}

export function scopeSearchPath(scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>): string {
  return `/scopes/${scope.scopeType}/${scope.scopeId}/search`;
}

/** Gỡ ghim là endpoint của p1-04 (`DELETE /messages/:id/pin`) — gọi thẳng, không import `chat`. */
export function messagePinPath(messageId: string): string {
  return `/messages/${messageId}/pin`;
}

/**
 * Danh bạ người gửi cho bộ lọc: kênh — `GET /channels/:id/members` (phân trang `page/limit`, có `q`);
 * hội thoại — `GET /conversations/:id/members` (cursor). Gọi thẳng, không import `channels`/`conversations`.
 */
export function scopeMembersPath(scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>): string {
  return scope.scopeType === 'CHANNEL'
    ? `/channels/${scope.scopeId}/members`
    : `/conversations/${scope.scopeId}/members`;
}
