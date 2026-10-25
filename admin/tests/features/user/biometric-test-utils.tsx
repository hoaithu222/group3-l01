/**
 * Đồ dùng chung cho 3 bài kiểm tab Phiên · đăng nhập sinh trắc học (p0-13):
 * fixture theo ĐÚNG shape BE thật, "BE giả" dựng bằng MSW (mock ở tầng HTTP —
 * không mock service/queries), và hàm render kèm router + React Query.
 *
 * Shape lấy từ `be/src/core/auth/biometric-credential-revoker.ts`
 * (`AdminBiometricCredentialDto`) và `be/src/modules/users/services/user.service.ts`
 * (`UserSessionSummary`) — không phải từ plan: BE trả `deviceIdMasked` (không phải
 * `deviceId`) cho credential, `revokeReason` (không phải `revokedReason`). Với PHIÊN: quản trị viên
 * xem hộ người khác nhận `deviceIdMasked` + `expiresAt`; `deviceId` đầy đủ chỉ có khi xem phiên của
 * CHÍNH MÌNH; BE không trả `revokedAt` (chỉ liệt kê phiên còn hiệu lực).
 *
 * `makeSession` mặc định BỎ `expiresAt`/`deviceIdMasked` để các bài kiểm cũ vẫn giữ đường "BE cũ /
 * dữ liệu thiếu" — bài kiểm về hợp đồng mới truyền chúng tường minh.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useAuthStore } from '@/app/store';

import LocationProbe from './LocationProbe';

export const USER_ID = '665f1c2a9b1e8a0012345678';

export interface BackendCredential extends Record<string, unknown> {
  id: string;
  status: 'ACTIVE' | 'REVOKED';
  revokedAt: string | null;
  revokeReason: string | null;
}

export function makeCredential(overrides: Partial<BackendCredential> = {}): BackendCredential {
  return {
    id: 'cred-1',
    deviceName: 'Pixel 8 của An',
    deviceIdMasked: '••••a1b2c3',
    platform: 'ANDROID',
    biometryKind: 'FINGERPRINT',
    status: 'ACTIVE',
    createdAt: '2026-05-12T06:00:00.000Z',
    lastUsedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    expiresAt: '2026-08-10T06:00:00.000Z',
    revokedAt: null,
    revokeReason: null,
    ...overrides,
  };
}

export function makeSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sess-1',
    userAgent: 'Chrome 126 / Windows',
    ipAddress: '10.0.0.5',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastUsedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    isCurrent: false,
    authMethod: 'PASSWORD',
    ...overrides,
  };
}

export interface FakeBackend {
  credentials: BackendCredential[];
  sessions: Record<string, unknown>[];
  /** `?status=` của từng lần gọi liệt kê credential, theo thứ tự. */
  listStatuses: string[];
  /** Mỗi lần gọi thu hồi: đường dẫn + body. */
  revokeCalls: { path: string; body: unknown }[];
}

/**
 * "BE" giả có trạng thái: thu hồi thành công đổi credential sang REVOKED thật,
 * nên lần liệt kê lại sau `invalidateQueries` phản ánh đúng kết quả.
 * Credential không tồn tại ⇒ 404 `RES_001` đúng dạng lỗi của BE.
 */
export function createFakeBackend(init: {
  credentials?: BackendCredential[];
  sessions?: Record<string, unknown>[];
}) {
  const state: FakeBackend = {
    credentials: init.credentials ?? [],
    sessions: init.sessions ?? [],
    listStatuses: [],
    revokeCalls: [],
  };

  const handlers = [
    http.get('*/users/:id/sessions', () =>
      HttpResponse.json({ success: true, data: state.sessions }),
    ),
    http.get('*/admin/users/:id/biometric-credentials', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status') ?? 'ACTIVE';
      state.listStatuses.push(status);
      const rows = state.credentials.filter((c) => status === 'ALL' || c.status === status);
      return HttpResponse.json({ success: true, data: rows });
    }),
    http.post(
      '*/admin/users/:id/biometric-credentials/:credentialId/revoke',
      async ({ request, params }) => {
        state.revokeCalls.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        const target = state.credentials.find((c) => c.id === params.credentialId);
        if (!target) {
          return HttpResponse.json(
            {
              success: false,
              error: { code: 'RES_001', message: 'Không tìm thấy đăng nhập sinh trắc học' },
            },
            { status: 404 },
          );
        }
        target.status = 'REVOKED';
        target.revokedAt = new Date().toISOString();
        target.revokeReason = 'ADMIN';
        return HttpResponse.json({ success: true, data: { revoked: true } });
      },
    ),
  ];

  return { state, handlers };
}

/** Đăng nhập giả với vai + quyền chi tiết cho `useAuthStore.hasPermission`. */
export function signIn(role: 'admin' | 'manager', permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: `${role}@congty.vn`,
      name: role === 'admin' ? 'Admin' : 'Quản lý',
      roles: [role],
      permissions,
    },
    token: 'test-token',
  });
}

export function renderWithProviders(ui: ReactElement, route = `/user?id=${USER_ID}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}
