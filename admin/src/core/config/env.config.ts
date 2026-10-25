/**
 * Cấu hình ứng dụng đọc từ biến môi trường.
 *
 * Vite chỉ phơi ra biến có tiền tố `VITE_` (`import.meta.env`). Mọi thứ khác
 * KHÔNG tới được trình duyệt — nên đừng bao giờ đặt secret ở đây: bất cứ giá
 * trị nào trong `appConfig` đều nằm trong bundle và ai mở DevTools cũng đọc được.
 *
 * Đây là base project: chỉ giữ những khoá TỐI THIỂU mọi ứng dụng đều cần.
 * Khoá nghiệp vụ (map, OCR, TTS, push, …) thêm ở dự án dẫn xuất.
 */
const env = typeof import.meta !== 'undefined' ? import.meta.env : ({} as ImportMetaEnv);

const getStr = (key: string, fallback = ''): string => {
  const v = env[key as keyof ImportMetaEnv] as string | undefined;
  return v ?? fallback;
};

const getBool = (key: string, fallback = false): boolean => {
  const v = getStr(key);
  if (!v) return fallback;
  return v === 'true' || v === '1';
};

const getNum = (key: string, fallback = 0): number => {
  const v = getStr(key);
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const appConfig = {
  /** Tên hiển thị của app — dùng cho tiêu đề tab, header, email… */
  appName: getStr('VITE_APP_NAME', 'Base App'),

  /** Môi trường chạy: development | staging | production */
  env: getStr('VITE_ENV', 'development'),

  /** Gốc API (KHÔNG kèm dấu `/` cuối). */
  apiBaseUrl: getStr('VITE_API_BASE_URL', ''),

  /** Thời gian chờ tối đa mỗi request (ms). */
  apiTimeout: getNum('VITE_API_TIMEOUT', 30_000),

  /**
   * Bật toast lỗi tập trung ở response interceptor.
   * Tắt khi muốn từng màn tự xử lý lỗi (hiếm) — mặc định BẬT.
   */
  enableErrorToast: getBool('VITE_ENABLE_ERROR_TOAST', true),

  /** Log request/response ra console. Chỉ nên bật ở máy dev. */
  enableApiLogging: getBool('VITE_ENABLE_API_LOGGING', false),

  /**
   * Bật kiểm đăng nhập trên router.
   *
   * ⛔ MẶC ĐỊNH `false` trong base — mọi trang vào thẳng được, không cần backend.
   *    Base xuất xưởng KHÔNG kèm máy chủ nào, nên để mặc định bật thì lần chạy
   *    `npm run dev` đầu tiên rơi vào màn đăng nhập và người thử không xem được
   *    gì cả — `AuthGuard` chờ một lượt gọi `refresh` không bao giờ có ai trả lời.
   *
   * ⛔ DỰ ÁN THẬT PHẢI ĐẶT `VITE_AUTH_ENABLED=true`. Để `false` khi lên máy chủ
   *    nghĩa là mọi route đều mở cho người chưa đăng nhập.
   *
   * Toàn bộ mã xác thực (store, interceptor 401, guard, 4 trang) vẫn nguyên vẹn
   * — cờ này chỉ quyết định guard có chặn hay không, nên bật lại là xong, không
   *   phải dựng lại thứ gì.
   */
  authEnabled: getBool('VITE_AUTH_ENABLED', false),

  /** Đường Socket.IO — cùng origin; đổi khi BE đặt path khác. */
  socketPath: getStr('VITE_SOCKET_PATH', '/socket.io'),

  /** Token Mapbox công khai — Phase 5 (module o2o). Trống = ẩn bản đồ. */
  mapboxToken: getStr('VITE_MAPBOX_TOKEN', ''),

  /**
   * Sentry (p0-11). DSN trống/thiếu ⇒ KHÔNG nạp và KHÔNG khởi tạo SDK (no-op tuyệt đối).
   * DSN không phải bí mật (nằm trong bundle) nhưng riêng theo môi trường — CI điền qua `VITE_SENTRY_DSN`.
   */
  sentryDsn: getStr('VITE_SENTRY_DSN', ''),

  /** Mã phát hành (CI đặt = git sha) — phải trùng release của source map đã upload (`vite.config.ts`). */
  release: getStr('VITE_RELEASE', ''),

  /** Tỉ lệ lấy mẫu hiệu năng Sentry (0..1). Mặc định 0 = chỉ theo dõi LỖI, không đo hiệu năng trang. */
  sentryTracesSampleRate: Math.min(1, Math.max(0, Number.parseFloat(getStr('VITE_SENTRY_TRACES_SAMPLE_RATE', '0')) || 0)),
} as const;

export type AppConfig = typeof appConfig;
