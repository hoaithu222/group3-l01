/**
 * Đường dẫn admin tích hợp — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/integrations/admin-integrations.routes.ts`:
 * mọi route cần cờ `integration`; xem `integration:view`, ghi `integration:update` (lý do 10–500 ký tự + audit).
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const integrationApi = {
  /** GET `?page&limit&provider&status&workspaceId&from&to` — chỉ metadata, KHÔNG payload. */
  events: '/admin/integrations/events',
  /** GET → chi tiết + payload ĐÃ CHE. */
  event: (id: string) => `/admin/integrations/events/${seg(id)}`,
  /** POST `{ reason }` → 202 (chỉ sự kiện FAILED/IGNORED; `INT_006` quá thời gian lưu). */
  eventReplay: (id: string) => `/admin/integrations/events/${seg(id)}/replay`,
  /** GET → bốn nhà cung cấp (configured/enabled/số kết nối/sự kiện 24 giờ/lỗi gần nhất). */
  providers: '/admin/integrations/providers',
  /** PUT `{ enabled, reason }` — `INT_001` khi bật nhà cung cấp chưa cấu hình khoá. */
  provider: (provider: string) => `/admin/integrations/providers/${seg(provider)}`,
  /** GET `?status=ERROR,REVOKED&provider&page&limit` — kết nối lỗi (chỉ đọc). */
  connections: '/admin/integrations',
  /** GET (`integration:view`) — kết nối của MỘT workspace (tab "Tích hợp" trong chi tiết workspace, chỉ đọc); kênh riêng tư không lộ tên. */
  workspaceConnections: (workspaceId: string) => `/admin/workspaces/${seg(workspaceId)}/integrations`,
} as const;
