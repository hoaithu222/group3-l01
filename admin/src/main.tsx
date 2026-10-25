import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import { configureZodLocale } from '@/core/config/zod.config';
import { AppProvider } from '@/app/providers';
import { initMonitoring } from '@/core/monitoring';
import { AppRouter } from '@/app/router';
import { Spinner } from '@/shared/ui';

// Đặt thông báo lỗi Zod sang tiếng Việt MỘT LẦN, trước khi bất kỳ schema nào
// được dựng — schema khai ở module-scope đọc locale ngay lúc import.
configureZodLocale();

// Sentry (p0-11): thiếu VITE_SENTRY_DSN thì no-op tuyệt đối (không nạp SDK). Gọi TRƯỚC render để bắt cả lỗi ở lần vẽ đầu.
initMonitoring();

createRoot(document.getElementById('root')!).render(
  <Suspense
    fallback={
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <Spinner size="lg" />
      </div>
    }
  >
    <AppProvider>
      <AppRouter />
    </AppProvider>
  </Suspense>,
);
