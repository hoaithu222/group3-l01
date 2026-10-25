/**
 * Bảng route cấp cao nhất.
 *
 * ⛔ KHÔNG khai component nào trong file này (kể cả một dòng redirect nhỏ).
 * `routes` là hằng số; đặt component cạnh nó làm vỡ Fast Refresh và bị ESLint
 * `react-refresh/only-export-components` chặn. Cần redirect thì viết JSX thẳng
 * vào `element` như bên dưới. Xem `docs/rules/clean-code-standards.md §5`.
 *
 * ⚠️ Mọi giá trị trong `PATHS` PHẢI có route ở đây (trừ `NOT_FOUND`/`FORBIDDEN`
 * là đích redirect). Khai path mà quên mount route thì link tới nó rơi vào
 * catch-all `*` và ra trang 404 — lỗi im lặng, không ai thấy tới lúc người dùng
 * bấm phải.
 */

import { Navigate, type RouteObject } from 'react-router-dom';

import { PATHS } from '@/app/config';
import ForbiddenPage from '@/app/pages/ForbiddenPage';
import NotFoundPage from '@/app/pages/NotFoundPage';

import { LazyLoad } from './components';
import { AuthGuard, GuestGuard } from './guards';
import { AppShellLayout, AuthLayout } from './layouts';
import { buildModuleRoutes } from './modules';
import { FeatureGate } from './modules/FeatureGate';
import {
  ChangePasswordPage,
  ForgotPasswordPage,
  HomePage,
  LoginPage,
  ProfilePage,
  RecruiterSignupPage,
  RegisterPage,
  ResetPasswordPage,
  SettingsPage,
} from './lazy-pages';

export const routes: RouteObject[] = [
  // ── Khách: chưa đăng nhập ────────────────────────────────────────────────
  {
    element: <GuestGuard />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: PATHS.LOGIN, element: <LazyLoad component={LoginPage} /> },
          { path: PATHS.REGISTER, element: <LazyLoad component={RegisterPage} /> },
          { path: PATHS.FORGOT_PASSWORD, element: <LazyLoad component={ForgotPasswordPage} /> },
          { path: PATHS.RESET_PASSWORD, element: <LazyLoad component={ResetPasswordPage} /> },
        ],
      },
    ],
  },

  // ── Đã đăng nhập ─────────────────────────────────────────────────────────
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShellLayout />,
        children: [
          { path: PATHS.HOME, element: <LazyLoad component={HomePage} /> },
          { path: PATHS.PROFILE, element: <LazyLoad component={ProfilePage} /> },
          { path: PATHS.SETTINGS, element: <LazyLoad component={SettingsPage} /> },
          // Đích của link trong email "đăng nhập từ thiết bị mới": chưa đăng nhập thì `AuthGuard` đưa
          // qua /login rồi quay lại đây.
          { path: PATHS.CHANGE_PASSWORD, element: <LazyLoad component={ChangePasswordPage} /> },
          // Phân hệ dựng tự động từ MODULE_REGISTRY (kèm PermissionGuard).
          ...buildModuleRoutes(),
        ],
      },
    ],
  },

  // ── Đăng ký nhà tuyển dụng (p6-08) ───────────────────────────────────────
  // Route ĐỘC LẬP ngoài registry: cần đăng nhập nhưng KHÔNG cần quyền quản trị — người đăng ký là tài khoản `user` thường (chưa có quyền nào cho tới khi doanh nghiệp được tạo)
  // nên `AuthGuard` phải cho qua (`allowNoAdminAccess`); khung `AuthLayout` (không Dock/menu vì họ chưa có phân hệ nào). Cờ `career` tắt → trang "Chưa bật".
  {
    element: <AuthGuard allowNoAdminAccess />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: PATHS.RECRUITER_SIGNUP,
            element: (
              <FeatureGate flag="career">
                <LazyLoad component={RecruiterSignupPage} />
              </FeatureGate>
            ),
          },
        ],
      },
    ],
  },

  // ── Dự phòng ─────────────────────────────────────────────────────────────
  { path: PATHS.FORBIDDEN, element: <ForbiddenPage /> },
  { path: PATHS.NOT_FOUND, element: <NotFoundPage /> },
  { path: '*', element: <Navigate replace to={PATHS.NOT_FOUND} /> },
];
