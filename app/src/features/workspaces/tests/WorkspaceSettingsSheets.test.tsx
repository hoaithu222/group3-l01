import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { WorkspaceSettingsSheets, type WorkspaceSettingsSheetsProps } from '../components/WorkspaceSettingsSheets';

/**
 * Chốt lỗi p1-01 điểm mở #2: `WorkspaceSettingsSheets` từng truyền `members={[]}`
 * CỨNG cho `TransferOwnerSheet` nên "chuyển quyền chủ sở hữu" không dùng được.
 * Nay danh sách đi từ props (`transferCandidates`) xuống sheet.
 */

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function baseProps(overrides: Partial<WorkspaceSettingsSheetsProps> = {}): WorkspaceSettingsSheetsProps {
  return {
    archiveLoading: false,
    archiveSheetOpen: false,
    leaveDialogOpen: false,
    leaveLoading: false,
    notifyMode: 'INHERIT',
    notifyOptions: [],
    notifySheetOpen: false,
    transferCandidates: {
      members: [{ id: 'u-1', name: 'Nguyễn Văn An' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      setQuery: jest.fn(),
    },
    transferLoading: false,
    transferSheetOpen: true,
    onArchiveClose: jest.fn(),
    onArchiveConfirm: jest.fn(),
    onLeaveClose: jest.fn(),
    onLeaveConfirm: jest.fn(),
    onNotifyChange: jest.fn(),
    onNotifyClose: jest.fn(),
    onTransferClose: jest.fn(),
    onTransferConfirm: jest.fn(),
    ...overrides,
  };
}

async function renderSheets(props: WorkspaceSettingsSheetsProps) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <WorkspaceSettingsSheets {...props} />
    </SafeAreaProvider>,
  );
}

describe('WorkspaceSettingsSheets — rời nhóm (ConfirmSheet)', () => {
  it('xác nhận "Rời nhóm" gọi đúng hành động; "Huỷ" chỉ đóng', async () => {
    const props = baseProps({ leaveDialogOpen: true, transferSheetOpen: false });
    await renderSheets(props);

    expect(screen.getByText('Rời nhóm này?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Rời nhóm' }));
    expect(props.onLeaveConfirm).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(props.onLeaveClose).toHaveBeenCalled();
  });

  it('đang rời nhóm: "Huỷ" bị khoá (đóng tấm giữa lúc yêu cầu đang bay là việc vẫn xảy ra)', async () => {
    await renderSheets(baseProps({ leaveDialogOpen: true, leaveLoading: true, transferSheetOpen: false }));

    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });
});

describe('WorkspaceSettingsSheets — chuyển quyền chủ sở hữu', () => {
  it('thành viên thật từ transferCandidates hiện trong sheet (không còn danh sách cứng rỗng)', async () => {
    await renderSheets(baseProps());
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
    expect(screen.queryByText('Chưa có ai để chọn')).toBeNull();
  });

  it('đang tải danh sách ⇒ không báo "chưa có ai" (đó là hai ca khác nhau)', async () => {
    await renderSheets(
      baseProps({ transferCandidates: { members: [], isLoading: true, isError: false, refetch: jest.fn(), setQuery: jest.fn() } }),
    );
    expect(screen.queryByText('Chưa có ai để chọn')).toBeNull();
  });
});
