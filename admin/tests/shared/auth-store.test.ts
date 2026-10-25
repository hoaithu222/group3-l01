/**
 * Auth store — kiểm đúng hai điều dễ làm sai nhất khi dựng lại cho JWT:
 *  1. token KHÔNG được rơi vào localStorage
 *  2. `admin` vượt mọi kiểm quyền chi tiết
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store/slices/auth';

const USER = {
  id: 'u1',
  email: 'a@b.vn',
  name: 'A',
  roles: ['editor'],
  permissions: ['user:view', 'user:create'],
};

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    localStorage.clear();
  });

  it('KHÔNG persist access token xuống localStorage', () => {
    useAuthStore.getState().setAuth({ user: USER, token: 'secret-token' });
    expect(JSON.stringify(localStorage)).not.toContain('secret-token');
  });

  it('kiểm quyền theo chuỗi resource:action', () => {
    useAuthStore.getState().setAuth({ user: USER, token: 't' });
    const { hasPermission } = useAuthStore.getState();
    expect(hasPermission('user', 'view')).toBe(true);
    expect(hasPermission('user', 'delete')).toBe(false);
  });

  it('vai trò admin vượt mọi kiểm quyền chi tiết', () => {
    useAuthStore.getState().setAuth({ user: { ...USER, roles: ['admin'] }, token: 't' });
    expect(useAuthStore.getState().hasPermission('bất-kỳ', 'delete')).toBe(true);
  });

  it('clearAuth đưa trạng thái về anonymous', () => {
    useAuthStore.getState().setAuth({ user: USER, token: 't' });
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
