import { fireEvent, render, screen } from '@testing-library/react-native';

import type { WorkspaceDetail } from '../api';
import { WorkspaceDangerZoneCard } from '../components/WorkspaceDangerZoneCard';

/**
 * Khối "Nguy hiểm" của Cài đặt nhóm: mỗi việc là MỘT hàng (không còn bốn nút viền đầy bề ngang), hiện theo quyền BE trả
 * (`myPermissions`), và không còn hàng nào thì không vẽ cả khối. Hộp xác nhận nằm ở `WorkspaceSettingsSheets` (test riêng).
 */

type Perms = Partial<WorkspaceDetail['myPermissions']>;

function workspace(perms: Perms, patch: Partial<WorkspaceDetail> = {}): WorkspaceDetail {
  return {
    archivedReason: null,
    myPermissions: {
      canArchive: false,
      canCreateChannel: true,
      canEdit: false,
      canInvite: false,
      canLeave: false,
      canTransfer: false,
      ...perms,
    },
    status: 'ACTIVE',
    ...patch,
  } as WorkspaceDetail;
}

function handlers() {
  return { onArchive: jest.fn(), onLeave: jest.fn(), onRestore: jest.fn(), onTransfer: jest.fn() };
}

describe('WorkspaceDangerZoneCard', () => {
  it('chủ nhóm: chuyển quyền + lưu trữ (không có "Rời nhóm"); bấm hàng gọi đúng hành động', async () => {
    const on = handlers();
    await render(
      <WorkspaceDangerZoneCard
        restoreLoading={false}
        workspace={workspace({ canArchive: true, canTransfer: true })}
        {...on}
      />,
    );

    expect(screen.queryByText('Rời nhóm')).toBeNull();
    await fireEvent.press(screen.getByText('Chuyển quyền sở hữu'));
    await fireEvent.press(screen.getByText('Lưu trữ nhóm'));

    expect(on.onTransfer).toHaveBeenCalledTimes(1);
    expect(on.onArchive).toHaveBeenCalledTimes(1);
    expect(on.onLeave).not.toHaveBeenCalled();
  });

  it('thành viên thường chỉ có "Rời nhóm"', async () => {
    const on = handlers();
    await render(
      <WorkspaceDangerZoneCard restoreLoading={false} workspace={workspace({ canLeave: true })} {...on} />,
    );

    expect(screen.queryByText('Chuyển quyền sở hữu')).toBeNull();
    expect(screen.queryByText('Lưu trữ nhóm')).toBeNull();
    await fireEvent.press(screen.getByText('Rời nhóm'));
    expect(on.onLeave).toHaveBeenCalledTimes(1);
  });

  it('nhóm đã lưu trữ do chủ tự làm: có "Khôi phục nhóm" thay cho "Lưu trữ"; do quản trị nền tảng thì KHÔNG có', async () => {
    const on = handlers();
    const manual = await render(
      <WorkspaceDangerZoneCard
        restoreLoading={false}
        workspace={workspace({ canArchive: true }, { archivedReason: 'MANUAL', status: 'ARCHIVED' })}
        {...on}
      />,
    );
    expect(screen.queryByText('Lưu trữ nhóm')).toBeNull();
    await fireEvent.press(screen.getByText('Khôi phục nhóm'));
    expect(on.onRestore).toHaveBeenCalledTimes(1);
    await manual.unmount();

    await render(
      <WorkspaceDangerZoneCard
        restoreLoading={false}
        workspace={workspace({ canArchive: true }, { archivedReason: 'PLATFORM', status: 'ARCHIVED' })}
        {...on}
      />,
    );
    expect(screen.queryByText('Khôi phục nhóm')).toBeNull();
    expect(screen.queryByText('Vùng nguy hiểm')).toBeNull();
  });

  it('đang khôi phục: hàng bị khoá (bấm không gọi lại)', async () => {
    const on = handlers();
    await render(
      <WorkspaceDangerZoneCard
        restoreLoading
        workspace={workspace({ canArchive: true }, { archivedReason: 'MANUAL', status: 'ARCHIVED' })}
        {...on}
      />,
    );

    await fireEvent.press(screen.getByText('Khôi phục nhóm'));
    expect(on.onRestore).not.toHaveBeenCalled();
  });

  it('không có quyền nào: không vẽ khối "Vùng nguy hiểm"', async () => {
    await render(<WorkspaceDangerZoneCard restoreLoading={false} workspace={workspace({})} {...handlers()} />);

    expect(screen.queryByText('Vùng nguy hiểm')).toBeNull();
  });

  it('có ít nhất một việc: khối mang tiêu đề "Vùng nguy hiểm"', async () => {
    await render(
      <WorkspaceDangerZoneCard restoreLoading={false} workspace={workspace({ canLeave: true })} {...handlers()} />,
    );

    expect(screen.getByText('Vùng nguy hiểm')).toBeOnTheScreen();
  });
});
