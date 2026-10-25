import { router } from 'expo-router';

import { queryClient } from '@/core/config/query-client';
import type { PermissionRevokedPayload } from '@/core/socket';
import { registerDraftCleanup, resetDraftRegistry } from '@/shared/stores/draft-registry';
import { showToast } from '@/shared/utils/toast.utils';

import { PATHS } from '@/shell/config';
import { handlePermissionRevoked } from '../permission-revoked.handler';
import type { CurrentRoute } from '../scope-registry';
import { registerScopeCleanup, resetScopeRegistry } from '../scope-registry';

/**
 * ACL-10 (app.md §8 của p0-02): đang ở màn khớp scope bị thu hồi ⇒
 * `router.replace` + toast trung tính; không khớp ⇒ chỉ dọn cache, không
 * toast; query khớp scope bị xoá, query khác GIỮ NGUYÊN.
 *
 * `handlePermissionRevoked` nhận sẵn `currentRoute` (thay vì tự gọi
 * `usePathname()`/`useLocalSearchParams()`) đúng để test được KHÔNG cần dựng
 * cây component/router thật.
 */
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedReplace = router.replace as jest.MockedFunction<typeof router.replace>;
const mockedToast = showToast as jest.MockedFunction<typeof showToast>;

const NOWHERE: CurrentRoute = { params: {}, pathname: '/workspaces' };

function revokedPayload(overrides: Partial<PermissionRevokedPayload> = {}): PermissionRevokedPayload {
  return {
    v: 1,
    scopeType: 'CONVERSATION',
    scopeId: 'conv-1',
    version: 2,
    reason: 'REMOVED',
    cascade: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  resetScopeRegistry();
  resetDraftRegistry();
});

// `queryClient.clear()` huỷ TIMER dọn rác (`gcTime`) của các query còn cache —
// chạy lại SAU test cuối, không chỉ trước test đầu, để không để lại timer
// sống khi suite kết thúc (Jest báo "worker process has failed to exit").
afterAll(() => {
  queryClient.clear();
});

describe('handlePermissionRevoked', () => {
  it('xoá query KHỚP scope bị thu hồi, GIỮ NGUYÊN query của scope khác', () => {
    queryClient.setQueryData(['messages', 'CONVERSATION', 'conv-1'], { count: 1 });
    queryClient.setQueryData(['messages', 'CONVERSATION', 'conv-2'], { count: 2 });

    handlePermissionRevoked(revokedPayload(), NOWHERE);

    expect(queryClient.getQueryData(['messages', 'CONVERSATION', 'conv-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['messages', 'CONVERSATION', 'conv-2'])).toEqual({ count: 2 });
  });

  it('KHÔNG đứng ở màn thuộc scope ⇒ không điều hướng, không toast', () => {
    registerScopeCleanup('CONVERSATION', {
      routeMatcher: (route, scopeId) =>
        route.params.conversationId === scopeId ? PATHS.WORKSPACES : null,
    });

    handlePermissionRevoked(revokedPayload(), NOWHERE);

    expect(mockedReplace).not.toHaveBeenCalled();
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('ĐANG đứng đúng màn thuộc scope ⇒ router.replace(fallback) + toast trung tính', () => {
    registerScopeCleanup('CONVERSATION', {
      routeMatcher: (route, scopeId) =>
        route.params.conversationId === scopeId ? PATHS.WORKSPACES : null,
    });
    const onScopeRoute: CurrentRoute = {
      params: { conversationId: 'conv-1' },
      pathname: '/messages/conv-1',
    };

    handlePermissionRevoked(revokedPayload(), onScopeRoute);

    expect(mockedReplace).toHaveBeenCalledWith(PATHS.WORKSPACES);
    expect(mockedToast).toHaveBeenCalledWith('info', 'Bạn không còn quyền truy cập nội dung này');
    // Toast trung tính — KHÔNG được nêu tên kênh/nhóm/id (app.md §7).
    expect(mockedToast.mock.calls[0]?.[1]).not.toMatch(/conv-1/);
  });

  it('xoá nháp của scope qua draftRegistry.clearScope', () => {
    const cleanup = jest.fn();
    registerDraftCleanup('CONVERSATION', 'conv-1', cleanup);
    const otherScopeCleanup = jest.fn();
    registerDraftCleanup('CONVERSATION', 'conv-2', otherScopeCleanup);

    handlePermissionRevoked(revokedPayload(), NOWHERE);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(otherScopeCleanup).not.toHaveBeenCalled();
  });

  it('feature đăng ký queryKeyPrefixes ⇒ xoá thêm query đó (ngoài quy ước mặc định)', () => {
    queryClient.setQueryData(['chat-drafts-index', 'conv-1'], ['bản nháp']);
    registerScopeCleanup('CONVERSATION', {
      queryKeyPrefixes: (scopeId) => [['chat-drafts-index', scopeId]],
    });

    handlePermissionRevoked(revokedPayload(), NOWHERE);

    expect(queryClient.getQueryData(['chat-drafts-index', 'conv-1'])).toBeUndefined();
  });

  it('gọi onRevoked của MỌI registration khớp đúng scopeType, kèm scopeId', () => {
    const onRevoked = jest.fn();
    registerScopeCleanup('CONVERSATION', { onRevoked });
    const onRevokedOtherType = jest.fn();
    registerScopeCleanup('WORKSPACE', { onRevoked: onRevokedOtherType });

    handlePermissionRevoked(revokedPayload(), NOWHERE);

    expect(onRevoked).toHaveBeenCalledWith('conv-1');
    expect(onRevokedOtherType).not.toHaveBeenCalled();
  });
});
