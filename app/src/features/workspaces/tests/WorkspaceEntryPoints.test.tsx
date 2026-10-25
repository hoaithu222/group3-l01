import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import type { WorkspaceRole, WorkspaceStatus } from '../api';
import { WorkspaceAdminLinksCard } from '../components/WorkspaceAdminLinksCard';
import { WorkspaceHeaderActions } from '../components/WorkspaceHeaderActions';

/**
 * Lối vào của p5-04 trong `workspaces`: kính lúp "Tìm trong nhóm" ở đầu trang nhóm (cờ phụ `workspaceSearch`) và thẻ "Mẫu nhóm" ở cài đặt
 * nhóm (cờ phụ `workspaceTemplates`, CHỈ chủ nhóm/quản trị viên, nhóm chưa lưu trữ). Cờ chưa biết (`undefined`) = ẩn: không chớp rồi biến.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

/** Bật đúng các cờ được nêu, tắt phần còn lại. */
function enable(...flags: string[]) {
  jest.mocked(useFeature).mockImplementation((flag: string) => flags.includes(flag));
}

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceHeaderActions', () => {
  it('cờ `workspaceSearch` bật: có kính lúp "Tìm trong nhóm" cạnh "Cài đặt nhóm"; bấm mở màn tìm của nhóm', async () => {
    enable('workspaceSearch');
    await render(<WorkspaceHeaderActions wsId="ws-1" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tìm trong nhóm' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/search',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Cài đặt nhóm' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/settings',
    });
  });

  it('cờ TẮT hoặc CHƯA biết: ẩn kính lúp, "Cài đặt nhóm" vẫn còn', async () => {
    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      const view = await render(<WorkspaceHeaderActions wsId="ws-1" />);

      expect(screen.queryByRole('button', { name: 'Tìm trong nhóm' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Cài đặt nhóm' })).toBeOnTheScreen();
      await view.unmount();
    }
    expect(jest.mocked(useFeature)).toHaveBeenCalledWith('workspaceSearch');
  });
});

describe('WorkspaceAdminLinksCard — dòng "Áp mẫu cho nhóm"', () => {
  const workspace = (myRole: WorkspaceRole, status: WorkspaceStatus = 'ACTIVE') => ({
    id: 'ws-1',
    myRole,
    status,
  });

  it('CHỦ NHÓM và QUẢN TRỊ VIÊN (cờ bật, nhóm hoạt động): có lối "Áp mẫu cho nhóm" mở màn áp mẫu', async () => {
    enable('workspaceTemplates');
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const view = await render(<WorkspaceAdminLinksCard workspace={workspace(role)} />);

      await fireEvent.press(screen.getByText('Áp mẫu cho nhóm'));
      expect(router.push).toHaveBeenLastCalledWith({
        params: { wsId: 'ws-1' },
        pathname: '/workspaces/[wsId]/settings/templates',
      });
      await view.unmount();
    }
  });

  it('thành viên và khách KHÔNG thấy (BE cũng 403)', async () => {
    enable('workspaceTemplates');
    for (const role of ['MEMBER', 'GUEST'] as const) {
      const view = await render(<WorkspaceAdminLinksCard workspace={workspace(role)} />);
      expect(screen.queryByText('Áp mẫu cho nhóm')).toBeNull();
      await view.unmount();
    }
  });

  it('chỉ CHỦ NHÓM thấy "Cách vào nhóm và mời khách"; quản trị viên chỉ thấy mẫu; thành viên không thấy khối nào', async () => {
    enable('workspaceTemplates');

    const owner = await render(<WorkspaceAdminLinksCard workspace={workspace('OWNER')} />);
    await fireEvent.press(screen.getByText('Cách vào nhóm và mời khách'));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/settings/access',
    });
    await owner.unmount();

    const admin = await render(<WorkspaceAdminLinksCard workspace={workspace('ADMIN')} />);
    expect(screen.queryByText('Cách vào nhóm và mời khách')).toBeNull();
    expect(screen.getByText('Áp mẫu cho nhóm')).toBeOnTheScreen();
    await admin.unmount();

    await render(<WorkspaceAdminLinksCard workspace={workspace('MEMBER')} />);
    expect(screen.queryByText('Quản trị')).toBeNull();
    expect(screen.queryByText('Cách vào nhóm và mời khách')).toBeNull();
  });

  it('chủ nhóm mà cờ mẫu TẮT: vẫn có dòng quyền truy cập, không có dòng mẫu', async () => {
    enable();
    await render(<WorkspaceAdminLinksCard workspace={workspace('OWNER')} />);

    expect(screen.getByText('Cách vào nhóm và mời khách')).toBeOnTheScreen();
    expect(screen.queryByText('Áp mẫu cho nhóm')).toBeNull();
  });

  it('cờ `workspaceTemplates` tắt/chưa biết, hoặc nhóm ĐÃ LƯU TRỮ (TPL_002): ẩn', async () => {
    enable();
    const off = await render(<WorkspaceAdminLinksCard workspace={workspace('ADMIN')} />);
    expect(screen.queryByText('Áp mẫu cho nhóm')).toBeNull();
    await off.unmount();

    jest.mocked(useFeature).mockReturnValue(undefined);
    const unknown = await render(<WorkspaceAdminLinksCard workspace={workspace('ADMIN')} />);
    expect(screen.queryByText('Áp mẫu cho nhóm')).toBeNull();
    await unknown.unmount();

    enable('workspaceTemplates');
    await render(<WorkspaceAdminLinksCard workspace={workspace('OWNER', 'ARCHIVED')} />);
    expect(screen.queryByText('Áp mẫu cho nhóm')).toBeNull();
  });
});
