/**
 * Auth store — những điều dễ làm sai nhất ngoài "token không nằm trong localStorage"
 * (đã có ở `tests/shared/auth-store.test.ts`):
 *
 *  - hồ sơ từ BE / từ localStorage KHÔNG được tin: thiếu `roles`/`permissions` là màn trắng;
 *  - chỉ đúng các trường của `AuthUser` được lưu xuống đĩa (không rò `status`, `privacy`…);
 *  - `endReason` (lý do phiên kết thúc) chỉ sống trong bộ nhớ;
 *  - cổng vào trang quản trị (`hasAdminAccess`).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { hasAdminAccess, normalizeAuthUser, useAuthStore } from '@/app/store';
import { AUTH_STORAGE_KEY } from '@/core/config/auth.config';

const USER = {
  id: 'u1',
  email: 'an@congty.vn',
  name: 'An',
  roles: ['manager'],
  permissions: ['user:view'],
};

describe('normalizeAuthUser', () => {
  it.each([null, undefined, 'chuỗi', 42, [], {}, { id: '' }, { id: 5 }])(
    'không phải hồ sơ hợp lệ (%j) ⇒ null',
    (raw) => {
      expect(normalizeAuthUser(raw)).toBeNull();
    },
  );

  it('thiếu mảng `roles`/`permissions` ⇒ mảng rỗng (không để `.includes` ném lỗi lúc render)', () => {
    expect(normalizeAuthUser({ id: 'u1' })).toEqual({
      id: 'u1',
      email: '',
      name: '',
      avatar: null,
      roles: [],
      permissions: [],
    });
  });

  it('hợp đồng cũ chỉ có `role` đơn ⇒ quy về `roles`', () => {
    expect(normalizeAuthUser({ id: 'u1', role: 'manager' })?.roles).toEqual(['manager']);
    // `roles` đã có thì `role` không được chen thêm.
    expect(normalizeAuthUser({ id: 'u1', role: 'user', roles: ['admin'] })?.roles).toEqual(['admin']);
  });

  it('lọc phần tử không phải chuỗi khỏi mảng', () => {
    const user = normalizeAuthUser({ id: 'u1', roles: ['admin', 5, null], permissions: ['a:b', {}] });
    expect(user?.roles).toEqual(['admin']);
    expect(user?.permissions).toEqual(['a:b']);
  });

  it('chỉ giữ đúng các trường của `AuthUser` (DTO BE còn `status`, `privacy`… không có chỗ trong store)', () => {
    const user = normalizeAuthUser({
      ...USER,
      avatar: 'https://cdn/x.png',
      status: 'ACTIVE',
      privacy: { readReceipts: true },
      deletionGraceUntil: null,
      emailVerified: true,
    });
    expect(Object.keys(user ?? {}).sort()).toEqual(
      ['avatar', 'email', 'id', 'name', 'permissions', 'roles'],
    );
  });
});

describe('hasAdminAccess', () => {
  it('chưa đăng nhập ⇒ không', () => {
    expect(hasAdminAccess(null)).toBe(false);
  });

  it('⛔ tài khoản `user` thường, không quyền nào ⇒ không', () => {
    expect(hasAdminAccess({ ...USER, roles: ['user'], permissions: [] })).toBe(false);
  });

  it('vai `admin` ⇒ có, dù không liệt kê quyền chi tiết', () => {
    expect(hasAdminAccess({ ...USER, roles: ['admin'], permissions: [] })).toBe(true);
  });

  it('có ít nhất một quyền (vai `manager`, hoặc quyền theo dữ liệu như `recruiter:view`) ⇒ có', () => {
    expect(hasAdminAccess(USER)).toBe(true);
    expect(hasAdminAccess({ ...USER, roles: ['user'], permissions: ['recruiter:view'] })).toBe(true);
  });
});

describe('auth store — phiên và lưu trữ', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null, status: 'idle', endReason: null });
  });

  it('`setAuth` chuẩn hoá hồ sơ và chỉ lưu các trường được phép xuống localStorage', () => {
    useAuthStore.getState().setAuth({
      user: { ...USER, status: 'ACTIVE', privacy: { readReceipts: true } } as never,
      token: 'access-token-bi-mat',
    });

    const stored = localStorage.getItem(AUTH_STORAGE_KEY) ?? '';
    expect(stored).toContain('an@congty.vn');
    expect(stored).not.toContain('access-token-bi-mat');
    expect(stored).not.toContain('privacy');
    expect(stored).not.toContain('ACTIVE');
    expect(stored).not.toContain('endReason');
    expect(stored).not.toContain('authenticated');
  });

  it('⛔ hồ sơ trong localStorage thiếu `roles`/`permissions` ⇒ đọc lại vẫn không sập', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ state: { user: { id: 'u1', email: 'a@b.vn', name: 'A' } }, version: 0 }),
    );

    await useAuthStore.persist.rehydrate();

    const state = useAuthStore.getState();
    expect(state.user).toMatchObject({ id: 'u1', roles: [], permissions: [] });
    expect(() => state.hasPermission('user', 'view')).not.toThrow();
    expect(state.hasPermission('user', 'view')).toBe(false);
    expect(state.hasRole('admin')).toBe(false);
  });

  it.each([
    ['hồ sơ là chuỗi', { user: 'khong-phai-ho-so' }],
    ['không có id', { user: { email: 'a@b.vn' } }],
    ['không có state', null],
  ])('localStorage hỏng (%s) ⇒ coi như chưa từng đăng nhập', async (_label, state) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ state, version: 0 }));

    await useAuthStore.persist.rehydrate();

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('đọc lại từ localStorage KHÔNG khôi phục token, trạng thái hay lý do kết thúc', async () => {
    // `setState` ghi đè localStorage (persist) — phải đặt trạng thái TRƯỚC khi gieo bản lưu giả.
    useAuthStore.setState({ status: 'idle', token: null, endReason: null });
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: { user: USER, token: 'gia-mao', status: 'authenticated', endReason: 'locked' },
        version: 0,
      }),
    );

    await useAuthStore.persist.rehydrate();

    const state = useAuthStore.getState();
    expect(state.user?.id).toBe('u1');
    expect(state.token).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.endReason).toBeNull();
  });

  it('`clearAuth(lý do)` ghi lại vì sao; `clearAuth()` (tự thoát) thì không có lý do', () => {
    useAuthStore.getState().setAuth({ user: USER, token: 't' });

    useAuthStore.getState().clearAuth('expired');
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null, token: null, endReason: 'expired' });

    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().endReason).toBeNull();
  });

  it('đăng nhập lại (`setAuth` có token) xoá lý do cũ; `dismissEndReason` cũng xoá', () => {
    useAuthStore.getState().clearAuth('revoked');
    useAuthStore.getState().setAuth({ user: USER, token: 't' });
    expect(useAuthStore.getState().endReason).toBeNull();

    useAuthStore.getState().clearAuth('locked');
    useAuthStore.getState().dismissEndReason();
    expect(useAuthStore.getState().endReason).toBeNull();
  });

  it('⛔ `setAuth` không có token ⇒ `anonymous`, KHÔNG kẹt ở `restoring` (bản cũ quay spinner vĩnh viễn)', () => {
    useAuthStore.getState().setStatus('restoring');
    useAuthStore.getState().setAuth({ user: USER });
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
