import { AxiosError, type AxiosResponse } from 'axios';
import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { PATHS } from '@/shell/config';

import type { WorkspaceDetail } from '../api';
import { useWorkspaceScope } from '../hooks/useWorkspaceScope';
import { useWorkspace } from '../queries/workspaces.queries';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspace: jest.fn() }));

const mockedUseWorkspace = jest.mocked(useWorkspace);

function axiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('lỗi');
  if (status !== undefined) error.response = { status } as AxiosResponse;
  return error;
}

function mockQuery(state: { data?: WorkspaceDetail; error?: unknown; isLoading?: boolean }): void {
  mockedUseWorkspace.mockReturnValue({
    data: state.data,
    error: state.error ?? null,
    isLoading: state.isLoading ?? false,
  } as ReturnType<typeof useWorkspace>);
}

const WORKSPACE = {
  id: 'ws-1',
  status: 'ACTIVE',
  myRole: 'ADMIN',
  myPermissions: { canEdit: true, canInvite: true },
} as WorkspaceDetail;

describe('useWorkspaceScope', () => {
  beforeEach(() => {
    jest.mocked(router.replace).mockClear();
  });

  it('trả wsId + vai trò + quyền của CHÍNH MÌNH từ chi tiết nhóm (không tự suy từ role)', async () => {
    mockQuery({ data: WORKSPACE });
    const { result } = await renderHook(() => useWorkspaceScope('ws-1'));

    expect(result.current).toMatchObject({
      wsId: 'ws-1',
      myRole: 'ADMIN',
      status: 'ACTIVE',
      isArchived: false,
      myPermissions: { canEdit: true, canInvite: true },
    });
  });

  it('nhóm ARCHIVED ⇒ isArchived (màn con khoá nút ghi theo cờ này)', async () => {
    mockQuery({ data: { ...WORKSPACE, status: 'ARCHIVED' } });
    const { result } = await renderHook(() => useWorkspaceScope('ws-1'));
    expect(result.current.isArchived).toBe(true);
  });

  it('redirectWhenGone + 404 (mở deep link nhóm không phải thành viên) ⇒ về /workspaces', async () => {
    mockQuery({ error: axiosError(404) });
    await renderHook(() => useWorkspaceScope('ws-1', { redirectWhenGone: true }));
    expect(router.replace).toHaveBeenCalledWith(PATHS.WORKSPACES);
  });

  it('KHÔNG bật redirectWhenGone (màn con) ⇒ không điều hướng — mỗi màn tự đá ra một lần là sai', async () => {
    mockQuery({ error: axiosError(404) });
    await renderHook(() => useWorkspaceScope('ws-1'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('mất sóng / 500 ⇒ KHÔNG điều hướng (⛔ không đá người dùng ra chỉ vì một nhịp mất mạng)', async () => {
    mockQuery({ error: axiosError(undefined) });
    await renderHook(() => useWorkspaceScope('ws-1', { redirectWhenGone: true }));
    mockQuery({ error: axiosError(500) });
    await renderHook(() => useWorkspaceScope('ws-1', { redirectWhenGone: true }));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
