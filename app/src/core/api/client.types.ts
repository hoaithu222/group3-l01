import 'axios';

/**
 * Cờ riêng của dự án gắn thêm vào config của axios.
 *
 * Dùng **module augmentation** thay vì một interface `RequestConfig` riêng như
 * base web: nhờ vậy `apiClient.get(url, { skipErrorToast: true })` được TypeScript
 * chấp nhận ở mọi chỗ gọi, không phải ép kiểu. Ép kiểu ở nơi gọi là chỗ dễ lọt
 * nhất — mất một chữ `skip` cũng không ai biết.
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * Bỏ qua toast lỗi mặc định — nơi gọi tự hiển thị thông điệp riêng.
     * Dùng khi lỗi là một phần của luồng nghiệp vụ (vd kiểm tra mã đã tồn tại
     * chưa), chứ không phải sự cố cần báo động.
     */
    skipErrorToast?: boolean;

    /**
     * Bỏ qua việc interceptor tự reject khi HTTP 2xx nhưng body báo lỗi nghiệp
     * vụ (`status: false` / `success: false`). Dùng cho API mà nơi gọi TỰ xử lý
     * `status: false` trong `onSuccess`, để không bị reject và toast hai lần.
     */
    skipBusinessErrorHandling?: boolean;

    /**
     * Bỏ qua luồng làm mới token khi gặp 401.
     * ⛔ BẮT BUỘC bật cho chính lời gọi đăng nhập và lời gọi refresh — nếu
     * không, một lượt đăng nhập sai mật khẩu (401) sẽ kích hoạt refresh, và
     * refresh hỏng lại kích hoạt tiếp: đệ quy.
     */
    skipAuthRefresh?: boolean;

    /** Nội bộ: mốc thời gian bắt đầu, để interceptor tính thời lượng cho log. */
    __startedAt?: number;

    /** Nội bộ: đánh dấu request đã được phát lại sau khi refresh. */
    __retried?: boolean;
  }
}

/**
 * Lớp bọc phản hồi kiểu .NET mà các backend nội bộ hay dùng.
 * Không phải backend nào cũng bọc — xem `unwrapData` ở `unwrap.ts`.
 */
export interface ApiEnvelope<T = unknown> {
  status?: boolean;
  success?: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
  parameters?: unknown;
}

/** Hình dạng lỗi backend có thể trả về — mọi biến thể đã gặp. */
export interface ApiErrorBody {
  /** `{ error: { code, message, details } }` */
  error?: { code?: string; message?: string; details?: unknown };
  /** `.NET` viết hoa chữ đầu */
  Message?: string;
  message?: string;
  /** `{ status: false, errorCode: 'X' }` — gateway .NET trả kèm HTTP 2xx */
  errorCode?: string;
  ErrorCode?: string;
  /** ASP.NET ProblemDetails */
  title?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

/** Lỗi đã được interceptor toast rồi — nơi gọi đọc cờ này để không toast trùng. */
export interface ToastMarkedError {
  __toastShown?: boolean;
}

/** Dạng phân trang chuẩn của base. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
