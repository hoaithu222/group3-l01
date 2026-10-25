import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/shared/ui';

import { RouteErrorBoundary } from './components';
import { DisplayUrlSync } from './DisplayUrlSync';
import { DocumentTitleSync } from './DocumentTitleSync';
import { routes } from './routes';

/**
 * Thực thể router của app.
 *
 * `DocumentTitleSync` và `DisplayUrlSync` đứng CẠNH `AppShell` (không lồng
 * trong) để phủ cả những route nằm NGOÀI `AuthGuard` — trang đăng nhập, 404,
 * 403. Đặt trong layout thì tên tab ở màn đăng nhập giữ nguyên tên cũ, và
 * `?display=tv` chỉ ăn sau khi đã đăng nhập.
 */
export const router = createBrowserRouter([
  {
    element: (
      <>
        <DocumentTitleSync />
        <DisplayUrlSync />
        <AppShell />
      </>
    ),
    // Phủ MỌI nhánh — kể cả lỗi render ở guard/layout/header, vốn đứng ngoài
    // ranh giới lỗi của `<LazyLoad>`.
    errorElement: <RouteErrorBoundary />,
    children: routes,
  },
]);
