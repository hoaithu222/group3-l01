import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

export default defineConfig(({ mode }) => {
  /**
   * Nạp .env thủ công.
   *
   * Vite chỉ tự đưa biến `VITE_*` vào `import.meta.env` của CLIENT. File config
   * này chạy ở Node, `process.env` chỉ thấy biến của shell — nên khai
   * `VITE_API_PROXY_TARGET` trong `.env` mà đọc bằng `process.env` thì luôn
   * ra undefined và proxy âm thầm trỏ vào cổng mặc định.
   */
  const env = loadEnv(mode, process.cwd(), '');

  /**
   * Upload source map lên Sentry (p0-11 admin.md §2) — CHỈ khi CI có `SENTRY_AUTH_TOKEN`. Không có token (dev, `npm run build` ở ci.yml) thì plugin không
   * được nạp và build giữ nguyên hành vi cũ (production không sinh `.map`). Có token: sinh map dạng 'hidden' (bundle không mang `sourceMappingURL`), plugin upload rồi
   * XOÁ mọi file `.map` trong `dist` — ảnh nginx của admin không bao giờ chứa map. `release` phải trùng `VITE_RELEASE` (`appConfig.release`) lúc chạy.
   */
  const uploadSourceMaps = Boolean(env.SENTRY_AUTH_TOKEN);

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              authToken: env.SENTRY_AUTH_TOKEN,
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              url: env.SENTRY_URL || undefined,
              release: { name: env.VITE_RELEASE || undefined },
              sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        '@tests': path.resolve(import.meta.dirname, './tests'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      /**
       * Gốc của trang trong jsdom. Mặc định jsdom dùng `http://localhost:3000` — ĐÚNG cổng BE dev (`be/.env` PORT=3000): mọi request tương đối
       * (`VITE_API_BASE_URL=/api/v1`) và websocket `io('/')` của bài kiểm nào KHÔNG có handler MSW/socket giả sẽ đập vào BE THẬT khi máy đang chạy
       * nó — BE trả 401 cho token giả → luồng refresh/đăng xuất đá bài kiểm về `/login` (đỏ chập chờn, tuỳ tốc độ máy). Trỏ tới cổng KHÔNG ai
       * nghe (`127.0.0.1:9`) thì mọi request lọt handler đều thất bại NGAY như "BE không chạy" — bài kiểm hết phụ thuộc máy có BE hay không.
       * Bài kiểm cần một origin/URL riêng thì tự khai (vd MSW `http://...` tuyệt đối); `localStorage` vẫn hoạt động (origin hợp lệ).
       */
      environmentOptions: { jsdom: { url: 'http://127.0.0.1:9/' } },
      setupFiles: ['./tests/setup.ts'],
      css: false,
      include: ['tests/**/*.{test,spec}.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'tests/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/shared/**/*.{ts,tsx}'],
        exclude: ['**/index.ts', '**/*.types.ts', '**/*.generated.ts'],
        reportsDirectory: './coverage',
      },
    },
    server: {
      host: true,
      open: true,
      proxy: {
        // Đường API duy nhất — BE Super App mount tại /api (health) và /api/v1/* (nghiệp vụ),
        // mặc định cổng 3000 (`be/.env` PORT). Dev trỏ same-origin `/api/*` để cookie HttpOnly
        // refresh-token không bị coi là third-party (Safari chặn hẳn loại này).
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        // Socket.IO: cùng origin để cookie/CORS không vướng; `ws: true` bắt buộc
        // cho websocket upgrade (xem `src/core/socket/socket.client.ts`).
        '/socket.io': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: { host: true },
    build: {
      outDir: 'dist',
      sourcemap: uploadSourceMaps ? 'hidden' : mode !== 'production',
      rollupOptions: {
        output: {
          /**
           * Chỉ gom THƯ VIỆN NGOÀI, theo vòng đời thay đổi.
           *
           * Code trong `src/` cố ý KHÔNG gom tay: `sideEffects` trong
           * package.json đã bật rung cây, nên Rolldown tự tách kit2 thành các
           * chunk nhỏ theo component và mỗi trang chỉ tải phần nó dùng.
           *
           * ⛔ ĐỪNG thêm lại luật kiểu `if (id.includes('/src/…')) return 'x'`.
           * Chunk thủ công KHÔNG bị rung cây: bản trước gom cả `src/shared/ui/`
           * vào một chunk 696 kB mà mọi trang đều tải, mang theo `Tree`,
           * `Splitter`, `Upload`… dù không màn hình nào dùng.
           */
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id))
                return 'vendor';
              if (id.includes('@radix-ui')) return 'radix';
              if (id.includes('@tanstack')) return 'query';
              if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod'))
                return 'form';
              if (id.includes('recharts') || id.includes('d3-')) return 'charts';
              if (id.includes('react-arborist')) return 'tree';
              if (id.includes('@dnd-kit')) return 'dnd';
              if (id.includes('socket.io-client') || id.includes('engine.io-client'))
                return 'socket';
              // Sentry (p0-11) nạp LƯỜI qua dynamic import (`core/monitoring/sentry.ts`) — chunk riêng, không vào bundle chính.
              if (id.includes('@sentry')) return 'sentry';
              return 'deps';
            }
            // Code trong `src/` → để Rolldown tự quyết (xem chú thích trên).
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 500,
    },
  };
});
