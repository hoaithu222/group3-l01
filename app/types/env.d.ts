/**
 * Danh mục biến môi trường của dự án.
 *
 * Đây là phần MỞ RỘNG `NodeJS.ProcessEnv` của `@types/node` (khai lại cùng tên
 * namespace là TypeScript tự gộp). Nhờ vậy `process.env.EXPO_PUBLIC_API_BASE_URL`
 * được gợi ý và gõ sai tên thì biết ngay, thay vì lặng lẽ ra `undefined`.
 *
 * ⛔ Thêm biến `EXPO_PUBLIC_*` mới thì phải thêm MỘT DÒNG vào đây, và một dòng
 * nữa vào khối `RAW` trong `src/core/config/env.config.ts`. Hai chỗ, cố ý:
 * chỗ này để TypeScript biết, chỗ kia để Metro thay giá trị vào bundle.
 *
 * ⚠️ `@types/node` được nạp cho TOÀN dự án (xem `types` trong `tsconfig.json`),
 * nên TypeScript sẽ KHÔNG ngăn bạn dùng `Buffer`/`__dirname`/`fs` trong code
 * React Native — những thứ không tồn tại lúc chạy trên máy. Hàng rào đó nằm ở
 * ESLint (`no-restricted-globals` cho `app/**` và `src/**`).
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // ── Lúc chạy — Metro thay thẳng chuỗi vào bundle ────────────────────────
    readonly EXPO_PUBLIC_ENV?: string;
    readonly EXPO_PUBLIC_API_BASE_URL?: string;
    readonly EXPO_PUBLIC_API_TIMEOUT?: string;
    readonly EXPO_PUBLIC_ENABLE_ERROR_TOAST?: string;
    readonly EXPO_PUBLIC_ENABLE_API_LOGGING?: string;
    readonly EXPO_PUBLIC_API_LOG_PAYLOAD?: string;
    readonly EXPO_PUBLIC_ENABLE_REFRESH_TOKEN?: string;
    readonly EXPO_PUBLIC_AUTH_ENABLED?: string;
    /** Gốc Socket.IO — xem `src/core/socket/socket.client.ts`. */
    readonly EXPO_PUBLIC_SOCKET_URL?: string;
    readonly EXPO_PUBLIC_SOCKET_PATH?: string;
    /** Sentry DSN (p0-11) — trống = tắt giám sát lỗi. Xem `src/core/monitoring/`. */
    readonly EXPO_PUBLIC_SENTRY_DSN?: string;
    /** OAuth Web client ID của Firebase cho đăng nhập Google — trống = ẩn nút. Xem `src/core/auth/social/`. */
    readonly EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    /** Token Mapbox CÔNG KHAI `pk.…` (p6-05) — trống = bản đồ tắt, màn "Địa điểm" chỉ có danh sách. Xem `features/o2o/components/map/`. */
    readonly EXPO_PUBLIC_MAPBOX_TOKEN?: string;
    /** Gốc link portfolio công khai (p6-07), vd `https://superapp.vcijsc.com/p` — trống = suy từ `EXPO_PUBLIC_API_BASE_URL`. Xem `features/career/utils/portfolio-url.ts`. */
    readonly EXPO_PUBLIC_PORTFOLIO_BASE_URL?: string;

    // ── Lúc build — chỉ `app.config.ts` đọc, KHÔNG vào bundle ───────────────
    readonly APP_NAME?: string;
    readonly APP_SLUG?: string;
    readonly APP_SCHEME?: string;
    readonly ANDROID_PACKAGE?: string;
    readonly IOS_BUNDLE_ID?: string;
    readonly EAS_PROJECT_ID?: string;
    /** Domain app links/universal links (D-14) — đọc ở `app.config.ts`. */
    readonly APP_LINK_DOMAIN?: string;
    /** Bật `expo-updates` (OTA) — đọc ở `app.config.ts`. */
    readonly UPDATES_ENABLED?: string;
    /** Sentry (p0-11) — chỉ `app.config.ts` đọc để bật config plugin upload source map (thiếu `SENTRY_ORG` ⇒ không bật plugin). `SENTRY_AUTH_TOKEN` là secret EAS, chỉ công cụ build dùng. */
    readonly SENTRY_ORG?: string;
    readonly SENTRY_PROJECT?: string;
    readonly SENTRY_URL?: string;

    /**
     * Cho phép `process.env[key]` trong `app.config.ts`.
     *
     * ⚠️ Lối này CHỈ dùng được ở `app.config.ts` — file đó chạy trong Node nên
     * `process.env` là object thật. Trong `src/` thì KHÔNG: Metro thay chuỗi
     * tĩnh, tra bằng biến luôn ra `undefined`. Xem đầu `env.config.ts`.
     */
    readonly [key: string]: string | undefined;
  }
}
