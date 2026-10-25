import { apiClient, unwrapData } from '@/core/api';

import { CAPABILITIES_ENDPOINTS } from './capabilities.api';
import type { Capabilities } from './capabilities.types';

/** Kết quả một lượt hỏi có điều kiện (`If-None-Match`). `notModified` → giữ bản đang có, không có `data`. */
export type CapabilitiesFetchResult =
  | { data: Capabilities; etag: string | null; notModified: false }
  | { notModified: true };

/** `304 Not Modified` không phải lỗi: nhận cả 2xx lẫn 304, còn lại vẫn qua interceptor lỗi như thường. */
const acceptNotModified = (status: number) => (status >= 200 && status < 300) || status === 304;

/**
 * Tầng gọi API capabilities.
 *
 * Endpoint không có tham số — backend đọc thẳng từ `req.user` (đã qua `authenticateToken`) và từ cấu hình cờ phân hệ.
 * p0-07: BE trả `ETag` (băm `configVersion`); làm mới khi foreground/`config:updated` gửi `If-None-Match` để 304 rẻ.
 */
export const capabilitiesService = {
  /** Tải không điều kiện (luôn 200). Giữ nguyên chữ ký cũ cho nơi chỉ cần dữ liệu. */
  async get(): Promise<Capabilities> {
    const response = await apiClient.get<Capabilities>(CAPABILITIES_ENDPOINTS.GET);
    return unwrapData<Capabilities>(response);
  },

  /**
   * Tải CÓ điều kiện. `etag` là giá trị đã lưu cùng bản đang giữ — chỉ truyền khi thực sự còn bản đó trong bộ nhớ, không
   * thì 304 sẽ không có gì để trả (nơi gọi phải tải lại không điều kiện).
   */
  async fetch(etag?: string | null): Promise<CapabilitiesFetchResult> {
    const response = await apiClient.get<Capabilities>(CAPABILITIES_ENDPOINTS.GET, {
      headers: etag ? { 'If-None-Match': etag } : undefined,
      validateStatus: acceptNotModified,
    });
    if (response.status === 304) return { notModified: true };
    const header: unknown = response.headers?.etag;
    return {
      data: unwrapData<Capabilities>(response),
      etag: typeof header === 'string' && header.length > 0 ? header : null,
      notModified: false,
    };
  },
};
