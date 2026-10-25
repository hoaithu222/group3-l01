import { queryClient } from '@/core/config/query-client';
import type { PermissionRevokedPayload } from '@/core/socket';
import { resetDraftRegistry } from '@/shared/stores/draft-registry';

import { handlePermissionRevoked } from '../permission-revoked.handler';
import { resetScopeRegistry } from '../scope-registry';
import type { CurrentRoute } from '../scope-registry';
import { matchesScope } from '../scope';

/**
 * ACL-07 phía App (app.md §3 của p0-02): `cascade: true` với WORKSPACE xoá
 * mọi query CHỨA workspaceId (channels, conversations GROUP, meetings — danh
 * sách CẤP WORKSPACE, không lồng `scopeType` vào key), không đụng workspace
 * khác.
 */
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const NOWHERE: CurrentRoute = { params: {}, pathname: '/workspaces' };

const WORKSPACE_REVOKED: PermissionRevokedPayload = {
  v: 1,
  scopeType: 'WORKSPACE',
  scopeId: 'ws-1',
  version: 3,
  reason: 'LEFT',
  cascade: true,
};

beforeEach(() => {
  queryClient.clear();
  resetScopeRegistry();
  resetDraftRegistry();
});

// Xem chú thích ở `permission-revoked.handler.test.ts` — huỷ timer `gcTime`
// còn treo sau test CUỐI, không chỉ trước test đầu.
afterAll(() => {
  queryClient.clear();
});

describe('matchesScope — quy ước danh sách cấp WORKSPACE', () => {
  it('cascade:true ⇒ khớp mọi query [domain, workspaceId, …]', () => {
    expect(matchesScope(['channels', 'ws-1'], WORKSPACE_REVOKED)).toBe(true);
    expect(matchesScope(['conversations', 'ws-1', 'GROUP'], WORKSPACE_REVOKED)).toBe(true);
    expect(matchesScope(['meetings', 'ws-1'], WORKSPACE_REVOKED)).toBe(true);
  });

  it('workspace KHÁC ⇒ không khớp', () => {
    expect(matchesScope(['channels', 'ws-2'], WORKSPACE_REVOKED)).toBe(false);
  });

  it('cascade:false ⇒ KHÔNG áp quy ước danh sách workspace (chỉ khớp scope chính xác)', () => {
    const noCascade = { ...WORKSPACE_REVOKED, cascade: false };
    expect(matchesScope(['channels', 'ws-1'], noCascade)).toBe(false);
  });

  it('vẫn khớp query scope CHÍNH XÁC [domain, scopeType, scopeId] bất kể cascade', () => {
    const noCascade = { ...WORKSPACE_REVOKED, cascade: false };
    expect(matchesScope(['workspace-detail', 'WORKSPACE', 'ws-1'], noCascade)).toBe(true);
  });
});

describe('handlePermissionRevoked — cascade WORKSPACE', () => {
  it('xoá mọi query chứa workspaceId (channels, conversations GROUP, meetings), GIỮ workspace khác', () => {
    queryClient.setQueryData(['channels', 'ws-1'], ['ch-1']);
    queryClient.setQueryData(['conversations', 'ws-1', 'GROUP'], ['conv-1']);
    queryClient.setQueryData(['meetings', 'ws-1'], ['m-1']);
    queryClient.setQueryData(['channels', 'ws-2'], ['ch-2']);

    handlePermissionRevoked(WORKSPACE_REVOKED, NOWHERE);

    expect(queryClient.getQueryData(['channels', 'ws-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['conversations', 'ws-1', 'GROUP'])).toBeUndefined();
    expect(queryClient.getQueryData(['meetings', 'ws-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['channels', 'ws-2'])).toEqual(['ch-2']);
  });

  it('cascade:false ⇒ CHỈ xoá query scope WORKSPACE chính xác, giữ danh sách con', () => {
    queryClient.setQueryData(['workspace-detail', 'WORKSPACE', 'ws-1'], { name: 'Team A' });
    queryClient.setQueryData(['channels', 'ws-1'], ['ch-1']);

    handlePermissionRevoked({ ...WORKSPACE_REVOKED, cascade: false }, NOWHERE);

    expect(queryClient.getQueryData(['workspace-detail', 'WORKSPACE', 'ws-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['channels', 'ws-1'])).toEqual(['ch-1']);
  });
});
