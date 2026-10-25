/**
 * Khai báo `React.lazy` cho các trang mount thẳng ở `routes.tsx`.
 *
 * Tách khỏi `routes.tsx` vì file đó export hằng số `routes` (không phải
 * component). Để hai loại export chung một file làm vỡ Fast Refresh và bị
 * `react-refresh/only-export-components` chặn cứng — xem
 * `docs/rules/clean-code-standards.md §5`.
 *
 * Trang thuộc phân hệ KHÔNG khai ở đây: chúng đi qua `MODULE_REGISTRY` và được
 * `build-routes.tsx` lazy-hoá kèm cache theo loader.
 */

import { lazy } from 'react';

// ── Khách ────────────────────────────────────────────────────────────────────
export const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
export const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
export const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
export const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));

// ── Đã đăng nhập ─────────────────────────────────────────────────────────────
export const HomePage = lazy(() => import('@/app/pages/HomePage'));
export const ProfilePage = lazy(() => import('@/app/pages/ProfilePage'));
export const SettingsPage = lazy(() => import('@/app/pages/SettingsPage'));
export const ChangePasswordPage = lazy(() => import('@/features/auth/pages/ChangePasswordPage'));
// Đăng ký nhà tuyển dụng (p6-08): route ngoài registry, xem `routes.tsx`.
export const RecruiterSignupPage = lazy(
  () => import('@/features/recruiter-portal/pages/RecruiterSignupPage'),
);
