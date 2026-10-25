import { appConfig } from '@/core/config/env.config';

/**
 * Tên ứng dụng. Nguồn duy nhất là biến môi trường `VITE_APP_NAME` — đừng
 * hardcode tên ở đây, mỗi dự án dẫn xuất chỉ cần đổi `.env` là xong.
 */
export const APP_NAME = appConfig.appName;

// Layout primitives live in `./layout.ts` — re-export for convenience.
export * from './layout';

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  MANAGER: 'manager',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const DEFAULT_PAGE_SIZE = 12;
export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
