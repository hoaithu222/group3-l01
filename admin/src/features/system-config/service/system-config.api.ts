/** Đường dẫn endpoint `/admin/system-config` — khớp `system-config.routes.ts` phía BE. */
export const systemConfigApi = {
  /** GET — mọi khoá + metadata registry (label, fields, floor/ceil, effective, version). */
  list: '/admin/system-config',
  /** GET · PUT `{ value, expectedVersion, reason }`. */
  detail: (key: string) => `/admin/system-config/${key}`,
  /** POST `{ expectedVersion, reason }` — xoá override, về mặc định. */
  reset: (key: string) => `/admin/system-config/${key}/reset`,
} as const;
