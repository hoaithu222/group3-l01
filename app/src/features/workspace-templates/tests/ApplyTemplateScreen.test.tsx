import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useConnectionState } from '@/core/socket';

import { ApplyTemplateScreen } from '../screens/ApplyTemplateScreen';
import {
  applyButton,
  mockedApply,
  mockedHead,
  mockedList,
  mockedNames,
  pickTemplate,
  resetApplyMocks,
  waitForIdle,
} from './apply-harness';
import { renderWithProviders } from './fixtures';

/**
 * Màn "Áp mẫu cho nhóm" (app.md p5-04 §3/§8): chỉ chủ nhóm/quản trị viên · chọn mẫu ⇒ tick sẵn theo defaultSelected · báo trước kênh
 * có thể bị bỏ qua · áp mẫu gửi `channelKeys` + `Idempotency-Key` · kết quả đã tạo/bỏ qua. Lỗi `TPL_*` và khoá idempotency:
 * `ApplyTemplateScreen.errors.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn(() => true) }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-templates.service', () => ({
  workspaceTemplatesService: {
    apply: jest.fn(),
    getWorkspaceHead: jest.fn(),
    list: jest.fn(),
    listChannelNames: jest.fn(),
  },
}));

beforeEach(resetApplyMocks);

describe('ApplyTemplateScreen — quyền và trạng thái', () => {
  it('CHỦ NHÓM và QUẢN TRỊ VIÊN thấy danh sách mẫu (không có "Không dùng mẫu"); thành viên/khách chỉ thấy thông báo', async () => {
    const owner = await renderWithProviders(<ApplyTemplateScreen />);
    expect(await screen.findByText('Nhóm môn học')).toBeOnTheScreen();
    expect(screen.queryByText('Không dùng mẫu')).toBeNull();
    await owner.unmount();

    mockedHead.mockResolvedValue({ myRole: 'ADMIN', status: 'ACTIVE' });
    const admin = await renderWithProviders(<ApplyTemplateScreen />);
    expect(await screen.findByText('Nhóm môn học')).toBeOnTheScreen();
    await admin.unmount();

    for (const myRole of ['MEMBER', 'GUEST'] as const) {
      mockedHead.mockResolvedValue({ myRole, status: 'ACTIVE' });
      const view = await renderWithProviders(<ApplyTemplateScreen />);
      expect(await screen.findByText('Bạn không áp được mẫu')).toBeOnTheScreen();
      expect(screen.getByText('Chỉ chủ nhóm và quản trị viên áp được mẫu.')).toBeOnTheScreen();
      expect(screen.queryByText('Nhóm môn học')).toBeNull();
      await view.unmount();
    }
  });

  it('chưa chọn mẫu hoặc bỏ tick hết kênh: nút "Áp mẫu" bị khoá', async () => {
    await renderWithProviders(<ApplyTemplateScreen />);
    await screen.findByText('Nhóm tự học');
    expect(applyButton()).toBeDisabled();

    await pickTemplate('Nhóm tự học');
    expect(applyButton()).toBeEnabled();

    await fireEvent.press(screen.getByRole('checkbox', { name: /Kênh Ghi chú/ }));
    expect(applyButton()).toBeDisabled();
  });

  it('nhóm ĐÃ LƯU TRỮ hoặc MẤT MẠNG: nút khoá kèm lý do bằng chữ, không gọi API', async () => {
    mockedHead.mockResolvedValue({ myRole: 'OWNER', status: 'ARCHIVED' });
    const archived = await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');
    expect(screen.getByText('Nhóm đã lưu trữ nên không áp được mẫu.')).toBeOnTheScreen();
    expect(applyButton()).toBeDisabled();
    await waitForIdle(archived.queryClient);
    await archived.unmount();

    mockedHead.mockResolvedValue({ myRole: 'OWNER', status: 'ACTIVE' });
    jest.mocked(useConnectionState).mockReturnValue('offline');
    const offline = await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');
    expect(screen.getByText('Cần kết nối để áp mẫu.')).toBeOnTheScreen();
    expect(applyButton()).toBeDisabled();
    expect(mockedApply).not.toHaveBeenCalled();
    await waitForIdle(offline.queryClient);
  });

  it('báo TRƯỚC kênh có thể bị bỏ qua vì trùng tên (không phân biệt dấu) — chỉ là dự đoán, vẫn tick được', async () => {
    mockedNames.mockResolvedValue(['thao luan', 'Kênh khác']);
    await renderWithProviders(<ApplyTemplateScreen />);

    await pickTemplate('Nhóm môn học');

    expect(await screen.findByText('Có thể bị bỏ qua — đã có kênh trùng tên')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: /Kênh Thảo luận/ })).toBeChecked();
    expect(mockedNames).toHaveBeenCalledWith('ws-1');
  });

  it('tải mẫu lỗi: "Không tải được" + "Thử lại" tải lại cả hai nguồn', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    await renderWithProviders(<ApplyTemplateScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Chưa có mẫu nhóm nào đang bật.')).toBeOnTheScreen();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});

describe('ApplyTemplateScreen — áp mẫu', () => {
  it('gửi ĐÚNG channelKeys đang tick + Idempotency-Key; xong hiện kênh ĐÃ TẠO và ĐÃ BỎ QUA kèm lý do', async () => {
    const { queryClient } = await renderWithProviders(<ApplyTemplateScreen />);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await pickTemplate('Nhóm môn học');
    await fireEvent.press(screen.getByRole('checkbox', { name: /Kênh Phòng học/ }));

    await fireEvent.press(applyButton());

    await waitFor(() => expect(mockedApply).toHaveBeenCalledTimes(1));
    expect(mockedApply).toHaveBeenCalledWith('ws-1', {
      channelKeys: ['thong-bao', 'thao-luan', 'phong-hoc'],
      code: 'course',
      idempotencyKey: expect.stringMatching(/^tpl-apply-.{8,}/),
    });
    expect(await screen.findByText('Đã tạo 1 kênh theo mẫu · bỏ qua 1 kênh.')).toBeOnTheScreen();
    expect(screen.getByText('Đã tạo (1)')).toBeOnTheScreen();
    expect(screen.getByText('#Thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Đã bỏ qua (1)')).toBeOnTheScreen();
    // BE chỉ trả KHOÁ kênh bị bỏ qua — màn đổi sang tên trong mẫu và lý do bằng chữ.
    expect(screen.getByText('#Thảo luận')).toBeOnTheScreen();
    expect(screen.getByText('đã có kênh trùng tên')).toBeOnTheScreen();
    // Kênh mới phải hiện ở danh sách kênh của nhóm NGAY (hợp đồng cache của `channels`).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channels', 'ws-1'] });
  });

  it('từ kết quả: "Xem danh sách kênh" mở danh sách kênh của nhóm; "Xong" quay lại', async () => {
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');
    await fireEvent.press(applyButton());
    await screen.findByText('Đã tạo (1)');

    await fireEvent.press(screen.getByRole('button', { name: 'Xem danh sách kênh' }));
    expect(router.replace).toHaveBeenCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Xong' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('lượt áp đang chạy: nút ở trạng thái đang gửi và bấm thêm KHÔNG gửi lần hai', async () => {
    mockedApply.mockReturnValue(new Promise(() => undefined));
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');

    await fireEvent.press(applyButton());
    await fireEvent.press(applyButton());

    await waitFor(() => expect(applyButton()).toBeBusy());
    expect(mockedApply).toHaveBeenCalledTimes(1);
  });
});
