/**
 * Vỏ bọc phản hồi API dùng chung.
 *
 * ⚠️ `data` là BẮT BUỘC, không phải optional — và đó là chủ đích. Response
 * interceptor (`axios.config.ts`) đã reject mọi phản hồi báo lỗi trước khi nó
 * tới tầng service, kể cả lỗi nghiệp vụ trả kèm HTTP 2xx. Nên bất cứ giá trị
 * `ApiResponse` nào chạy tới chỗ gọi đều là phản hồi THÀNH CÔNG và chắc chắn có
 * payload. Để `data?: T` chỉ khiến mọi chỗ gọi phải `?.` hoặc `!` cho một
 * trường hợp không bao giờ xảy ra.
 *
 * Các trường còn lại optional vì mỗi BE trả một tập khác nhau (`success` kiểu
 * Node/Nest, `status` kiểu .NET…).
 */
export interface ApiResponse<T = unknown> {
  data: T;
  /** Quy ước kiểu Node/Nest. */
  success?: boolean;
  /** Quy ước kiểu .NET gateway. */
  status?: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: PaginationMeta;
  timestamp?: string;
  requestId?: string;
}

/** Thông tin phân trang đi kèm danh sách. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Phân trang CURSOR (audit log, inbox…) — `meta` đi kèm danh sách. Khác
 * `PaginationMeta`: không có `page`/`total`, chỉ biết còn trang sau hay không.
 */
export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Danh sách đã phân trang. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

/** Cặp định danh + tên — dùng cho dropdown, tham chiếu rút gọn. */
export interface IdName {
  id: string | number;
  name: string;
}

/** Trợ giúp nullable */
export type Maybe<T> = T | null | undefined;
export type Nullable<T> = T | null;
