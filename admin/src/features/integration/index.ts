/**
 * Public API của phân hệ `integration` (p5-03) cho code NGOÀI phân hệ (cùng mẫu `@/features/audit-log`): chỉ phần tab "Tích hợp" của workspace
 * cần (query kết nối theo workspace + nhãn nhà cung cấp/trạng thái). CHỈ phần nhẹ — trang/tab của chính phân hệ nạp lười qua
 * `integration.routes.tsx`, không re-export ở đây.
 */
export {
  CONNECTION_STATUS_META,
  INTEGRATION_PROVIDER_LABELS,
  statusReasonLabel,
} from './constants/integration.labels';
export { useWorkspaceIntegrations } from './service/integration.queries';
export type { AdminWorkspaceConnection, IntegrationTarget } from './types/integration.types';
