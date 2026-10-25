/**
 * Kiểu dữ liệu `/admin/system-config` — khớp `SystemConfigDto` phía BE
 * (`be/src/modules/system-config/services/system-config.service.ts`).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi
 * p0-09 xong.
 */

/** `json`/`string[]` cần trình sửa riêng — form chung chưa hỗ trợ, bị bỏ qua. */
export type ConfigFieldKind = 'int' | 'bool' | 'string[]' | 'bytes' | 'enum' | 'json';

/** Đơn vị hiển thị hậu tố ô nhập. `bytes` hiện MB, gửi byte. */
export type ConfigFieldUnit = 's' | 'ms' | 'bytes' | 'count' | 'min' | 'days';

export type ConfigTabId =
  'limits' | 'features' | 'auth' | 'storage' | 'notifications' | 'media' | 'jobs' | 'pm';

export interface ConfigFieldMeta {
  /** Đường dẫn trong `value` của khoá (vd `maxChars`, `appLock.enabled`). */
  path: string;
  label: string;
  kind: ConfigFieldKind;
  default: unknown;
  floor?: number;
  ceil?: number;
  unit?: ConfigFieldUnit;
  /** Chỉ kind `enum` — giá trị hợp lệ theo thứ tự hiển thị. */
  options?: readonly string[];
}

export interface SystemConfigItem {
  key: string;
  tab: ConfigTabId;
  label: string;
  fields: ConfigFieldMeta[];
  /** Override thô đang lưu (`{}` khi chưa từng ghi/đã reset). */
  stored: Record<string, unknown>;
  /** Giá trị hiệu lực (mặc định ⊕ override, đã clamp). */
  effective: Record<string, unknown>;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UpdateSystemConfigPayload {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

export interface ResetSystemConfigPayload {
  expectedVersion: number;
  reason: string;
}
