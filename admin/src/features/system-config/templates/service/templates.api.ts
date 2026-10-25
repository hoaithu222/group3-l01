/** Đường dẫn endpoint mẫu workspace — khớp `workspace-templates.routes.ts` phía BE (mount `/api/v1`). */
export const ADMIN_TEMPLATES = '/admin/workspace-templates';

export const templatesApi = {
  /** GET — mọi mẫu (cả đã tắt), sắp theo `order`. */
  list: ADMIN_TEMPLATES,
  /** PUT `{ name?, description?, isActive?, order?, channels?, expectedVersion, reason }`. */
  detail: (code: string) => `${ADMIN_TEMPLATES}/${code}`,
} as const;
