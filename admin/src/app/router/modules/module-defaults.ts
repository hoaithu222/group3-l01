/**
 * Helper dùng chung cho các file `*.routes.tsx` của phân hệ.
 *
 * `placeholderPage` — lazy loader trỏ về `PlaceholderPage` (page chung).
 * Khi feature thật ra mắt → trong file module tương ứng, đổi `page.lazy`
 * sang import của page thật. KHÔNG xóa entry trong registry.
 */

import type { ComponentType } from 'react';

export const placeholderPage = () =>
  import('@/app/pages/PlaceholderPage') as Promise<{
    default: ComponentType<unknown>;
  }>;
