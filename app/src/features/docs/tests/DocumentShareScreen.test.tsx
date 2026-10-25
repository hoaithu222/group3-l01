import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';
import { docsCollabService } from '../api/docs-collab.service';
import { docsService } from '../api/docs.service';
import type { Collaborator } from '../api/docs.types';
import { DocumentShareScreen } from '../screens/DocumentShareScreen';
import { apiError, DOC_ID, makeDoc, renderWithProviders, WS_ID } from './docs.harness';

/**
 * app.md p6-01 §3 dòng "Chia sẻ", §6 (ma trận quyền), §8: đổi chế độ hiển thị (PRIVATE → WORKSPACE cần xác nhận + `confirmPublic`; chỉ người tạo về riêng tư),
 * danh sách cộng tác viên + vai bằng CHỮ, thêm nhiều người (chọn từ thành viên nhóm), đổi vai/gỡ; không có quyền quản lý thì chỉ đọc.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/docs.service', () => ({
  docsService: { detail: jest.fn(), memberOptions: jest.fn(), update: jest.fn() },
}));
jest.mock('../api/docs-collab.service', () => ({
  docsCollabService: {
    addCollaborators: jest.fn(),
    collaborators: jest.fn(),
    removeCollaborator: jest.fn(),
  },
}));

const service = jest.mocked(docsService);
const collab = jest.mocked(docsCollabService);
const person = (
  userId: string,
  name: string,
  role: Collaborator['role'] = 'EDITOR',
): Collaborator => ({
  addedAt: '2026-09-27T00:00:00.000Z',
  name,
  role,
  userId,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ docId: DOC_ID, wsId: WS_ID });
  service.detail.mockResolvedValue(makeDoc({ visibility: 'PRIVATE' }));
  service.memberOptions.mockResolvedValue([
    { name: 'Lê Bình', role: 'MEMBER', userId: 'u2' },
    { name: 'Phạm Chi', role: 'MEMBER', userId: 'u3' },
    { name: 'Đỗ Dũng', role: 'ADMIN', userId: 'u4' },
  ]);
  collab.collaborators.mockResolvedValue([person('u2', 'Lê Bình')]);
});

describe('hiển thị theo quyền', () => {
  it('quản lý được: có "Thêm người", cộng tác viên kèm vai bằng chữ', async () => {
    await renderWithProviders(<DocumentShareScreen />);
    expect(await screen.findByText('Lê Bình')).toBeOnTheScreen();
    expect(screen.getByText('Được sửa')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm người' })).toBeOnTheScreen();
  });

  it('PRIVATE chưa mời ai → "Chỉ bạn"', async () => {
    collab.collaborators.mockResolvedValue([]);
    await renderWithProviders(<DocumentShareScreen />);
    expect(await screen.findByText('Chỉ bạn')).toBeOnTheScreen();
  });

  it('không có quyền manage → chỉ đọc: không "Thêm người", hàng không bấm được', async () => {
    service.detail.mockResolvedValue(
      makeDoc({ myPermissions: { edit: true, manage: false, restore: false, snapshot: true } }),
    );
    await renderWithProviders(<DocumentShareScreen />);
    await screen.findByText('Lê Bình');
    expect(screen.queryByRole('button', { name: 'Thêm người' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lê Bình/ })).toBeNull();
  });

  it('tài liệu đã lưu trữ → thông báo và không chỉnh được', async () => {
    service.detail.mockResolvedValue(makeDoc({ status: 'ARCHIVED' }));
    await renderWithProviders(<DocumentShareScreen />);
    expect(await screen.findByText(/không thay đổi chia sẻ được/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thêm người' })).toBeNull();
  });
});

describe('chế độ hiển thị', () => {
  it('PRIVATE → WORKSPACE: xác nhận rồi gửi confirmPublic + expectedVersion; Huỷ thì không gửi', async () => {
    service.update.mockResolvedValue(makeDoc());
    await renderWithProviders(<DocumentShareScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Mọi người trong nhóm' }));
    expect(await screen.findByText('Chia sẻ cho cả nhóm?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(service.update).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Mọi người trong nhóm' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith(DOC_ID, {
        confirmPublic: true,
        expectedVersion: 3,
        visibility: 'WORKSPACE',
      }),
    );
  });

  it('WORKSPACE → PRIVATE chỉ người tạo được (thành viên thường: nút khoá)', async () => {
    service.detail.mockResolvedValue(makeDoc({ myRole: 'MEMBER', visibility: 'WORKSPACE' }));
    const view = await renderWithProviders(<DocumentShareScreen />);
    expect(await screen.findByText(/Chỉ người tạo mới chuyển được về riêng tư/)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Chỉ người được mời' })).toBeDisabled();
    await view.unmount();

    service.detail.mockResolvedValue(makeDoc({ myRole: 'CREATOR', visibility: 'WORKSPACE' }));
    service.update.mockResolvedValue(makeDoc());
    await renderWithProviders(<DocumentShareScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Chỉ người được mời' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xác nhận' }));
    await waitFor(() =>
      expect(service.update).toHaveBeenCalledWith(DOC_ID, {
        expectedVersion: 3,
        visibility: 'PRIVATE',
      }),
    );
  });
});

describe('cộng tác viên', () => {
  it('thêm nhiều người với vai "Chỉ xem": không liệt kê người đã có, gửi đúng userIds + role', async () => {
    collab.addCollaborators.mockResolvedValue([]);
    await renderWithProviders(<DocumentShareScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Thêm người' }));
    await screen.findByText('Phạm Chi');
    expect(screen.getAllByText('Lê Bình')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('radio', { name: 'Chỉ xem' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Phạm Chi' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Đỗ Dũng' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm 2 người' }));
    await waitFor(() =>
      expect(collab.addCollaborators).toHaveBeenCalledWith(DOC_ID, ['u3', 'u4'], 'VIEWER'),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', 'Đã thêm người cộng tác'),
    );
  });

  it('DOC_004 (đủ người) hiện trong tấm thêm người', async () => {
    collab.addCollaborators.mockRejectedValue(apiError(409, 'DOC_004'));
    await renderWithProviders(<DocumentShareScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Thêm người' }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Phạm Chi' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm 1 người' }));
    expect(await screen.findByText(/số người cộng tác tối đa/)).toBeOnTheScreen();
  });

  it('chạm một người → đổi vai (upsert) hoặc gỡ khỏi tài liệu', async () => {
    collab.addCollaborators.mockResolvedValue([person('u2', 'Lê Bình', 'VIEWER')]);
    collab.removeCollaborator.mockResolvedValue(undefined);
    await renderWithProviders(<DocumentShareScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Lê Bình/ }));
    await fireEvent.press(await screen.findByText('Đổi thành “Chỉ xem”'));
    await waitFor(() =>
      expect(collab.addCollaborators).toHaveBeenCalledWith(DOC_ID, ['u2'], 'VIEWER'),
    );

    await fireEvent.press(await screen.findByRole('button', { name: /^Lê Bình/ }));
    await fireEvent.press(await screen.findByText('Gỡ khỏi tài liệu'));
    await waitFor(() => expect(collab.removeCollaborator).toHaveBeenCalledWith(DOC_ID, 'u2'));
  });
});
