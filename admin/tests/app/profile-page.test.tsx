/**
 * `ProfilePage` — vai trò hiện bằng nhãn tiếng Việt như mọi màn khác ("Quản trị viên"), không phải mã thô
 * ("admin"). Vai lạ (BE thêm sau, chưa có nhãn) vẫn hiện nguyên mã để không mất thông tin.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import ProfilePage from '@/app/pages/ProfilePage';
import { useAuthStore } from '@/app/store';

beforeEach(() => {
  useAuthStore.getState().clearAuth();
});

function renderProfile(roles: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Nguyễn An', roles, permissions: ['user:view'] },
    token: 'test-token',
  });
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe('ProfilePage — vai trò', () => {
  it('vai đã biết → nhãn tiếng Việt, không lộ mã thô', () => {
    renderProfile(['admin', 'manager']);

    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByText('Quản lý')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.queryByText('manager')).not.toBeInTheDocument();
  });

  it('vai chưa có nhãn → hiện nguyên mã', () => {
    renderProfile(['auditor']);

    expect(screen.getByText('auditor')).toBeInTheDocument();
  });

  it('không có vai nào → câu giải thích, không để trống', () => {
    renderProfile([]);

    expect(screen.getByText('Chưa được gán vai trò nào')).toBeInTheDocument();
  });
});
