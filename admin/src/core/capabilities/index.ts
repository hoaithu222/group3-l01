/**
 * Capabilities — cờ tính năng BE công bố (`GET /capabilities`).
 *
 * Service THUẦN ở đây (không đụng store) — hook `useCapabilities()`/`useFeature()`
 * đọc `useAuthStore` nên đặt ở `@/app/capabilities` theo quy tắc base: chỉ
 * `core/api/session.ts` được chạm store trong `src/core`.
 */
export { capabilitiesApi } from './capabilities.api';
export { capabilitiesService } from './capabilities.service';
export type { Capabilities, CapabilityFeature } from './capabilities.types';
