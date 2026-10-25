import { memo, useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { Button } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { toSafeLog } from '@/shared/utils/error-log.utils';
import { PATHS } from '@/app/config';
import { captureException } from '@/core/monitoring';

/**
 * Màn lỗi cuối cùng của cây route.
 *
 * `LazyErrorBoundary` chỉ bọc BÊN TRONG từng `<LazyLoad>`, nên nó không phủ
 * được lỗi render ở `AuthGuard`, các layout, header hay dock — những chỗ đứng
 * NGOÀI mọi ranh giới lỗi. Khi đó React Router rơi về màn mặc định của nó:
 * "Unexpected Application Error!" bằng tiếng Anh giữa một app tiếng Việt, và
 * không có lối thoát nào ngoài gõ tay lại địa chỉ.
 *
 * Đặt ở route gốc (xem `create-router.tsx`) nên phủ mọi nhánh, kể cả trang
 * đăng nhập và 404.
 */
const RouteErrorBoundary = memo(function RouteErrorBoundary() {
  const error = useRouteError();

  // `errorElement` của router KHÔNG tự ghi log (khác màn mặc định của nó) — không ghi thì lỗi biến mất
  // không dấu vết. `toSafeLog`: lỗi axios mang theo `config.data` (mật khẩu) và `Authorization` (token).
  useEffect(() => {
    console.error('[RouteError]', toSafeLog(error));
    // p0-11: báo lỗi thật lên Sentry (đã lọc). Lỗi do router ném (404 không khớp route…) là chuyện bình thường, không báo.
    if (!isRouteErrorResponse(error)) captureException(error);
  }, [error]);

  // Lỗi do chính router ném (404 không khớp route, loader trả Response lỗi…)
  // khác hẳn lỗi lập trình — tách ra để câu chữ nói đúng chuyện đang xảy ra.
  // ⛔ KHÔNG in `error.message` / `statusText`: đó là chuỗi tiếng Anh kỹ thuật của thư viện ("Cannot read
  // properties of undefined…", "Not Found") — sai ngôn ngữ giữa app tiếng Việt và lộ chi tiết nội bộ.
  // Chi tiết đã có ở console.
  const isResponse = isRouteErrorResponse(error);
  const title = isResponse ? `Lỗi ${error.status}` : 'Có lỗi xảy ra';
  const detail = isResponse
    ? 'Không mở được trang này.'
    : 'Đã xảy ra lỗi không mong muốn. Hãy tải lại trang; nếu lỗi lặp lại, liên hệ quản trị hệ thống.';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-md border border-border-1 bg-bg-1 p-6 text-center shadow-[0_4px_20px_var(--color-popup-shadow)]">
        <div aria-hidden className="mb-4 flex justify-center text-error">
          <SystemIcon name="triangle-exclamation-bold" size={40} />
        </div>
        <h2 className="text-body-16-medium mb-2 text-fg-1">{title}</h2>
        <p className="text-body-14 mb-6 text-fg-3">{detail}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="md" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
          {/*
            Điều hướng CỨNG chứ không `useNavigate`: cây route vừa ném lỗi nên
            không thể tin là nó còn dựng lại được bằng điều hướng phía client.
          */}
          <Button
            size="md"
            skin="neutral"
            variant="stroke"
            onClick={() => window.location.assign(PATHS.HOME)}
          >
            Về trang chủ
          </Button>
        </div>
      </div>
    </div>
  );
});

export default RouteErrorBoundary;
