import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { CreateWorkspaceScreen } from '../screens/CreateWorkspaceScreen';
import {
  bodyOf,
  CREATED,
  fillName,
  keyOf,
  lastStep,
  mockedCreate,
  renderStep,
  submit,
} from './create-harness';
import { renderWithProviders } from './test-utils';

/**
 * Form TẠO NHÓM có BƯỚC MẪU (app.md p5-04 §3/§8): không chọn mẫu ⇒ body như cũ · chọn mẫu ⇒ gửi `templateCode` + `channelKeys` cùng
 * `Idempotency-Key` · tạo xong tóm tắt gọn `data.template` (đã tạo/bỏ qua/lỗi) rồi vào nhóm. `TPL_001` và vòng đời khoá:
 * `CreateWorkspaceScreen.idempotency.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/workspaces.service', () => ({ workspacesService: { create: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreate.mockReset().mockResolvedValue(CREATED);
  lastStep.props = undefined;
});

describe('CreateWorkspaceScreen — không dùng mẫu', () => {
  it('không có bước mẫu (hoặc không chọn): body chỉ tên + mô tả, KHÔNG có templateCode/channelKeys; xong vào nhóm', async () => {
    await renderWithProviders(<CreateWorkspaceScreen />);
    await fillName('Nhóm A');

    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({ description: undefined, name: 'Nhóm A' });
    expect(bodyOf(0)).not.toHaveProperty('templateCode');
    expect(bodyOf(0)).not.toHaveProperty('channelKeys');
    expect(keyOf(0)).toMatch(/^ws-create-.{8,}/);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { wsId: 'ws-new' },
        pathname: '/workspaces/[wsId]',
      }),
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it('có bước mẫu nhưng để "Không dùng mẫu": vẫn không gửi trường mẫu nào', async () => {
    await renderWithProviders(<CreateWorkspaceScreen renderTemplateStep={renderStep} />);
    expect(screen.getByText('Mẫu: không')).toBeOnTheScreen();
    await fillName('Nhóm A');

    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).not.toHaveProperty('templateCode');
  });
});

describe('CreateWorkspaceScreen — dùng mẫu', () => {
  it('chọn mẫu: body có templateCode + channelKeys (kênh đang tick) cùng Idempotency-Key', async () => {
    await renderWithProviders(<CreateWorkspaceScreen renderTemplateStep={renderStep} />);
    await fillName('Nhóm môn Toán');
    await fireEvent.press(screen.getByRole('button', { name: 'Chọn mẫu môn học' }));
    expect(screen.getByText('Mẫu: course[thong-bao,thao-luan]')).toBeOnTheScreen();

    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({
      channelKeys: ['thong-bao', 'thao-luan'],
      description: undefined,
      name: 'Nhóm môn Toán',
      templateCode: 'course',
    });
    expect(keyOf(0)).toMatch(/^ws-create-.{8,}/);
  });

  it('bước mẫu bị KHOÁ trong lúc gửi (disabled) — không đổi mẫu giữa chừng', async () => {
    mockedCreate.mockReturnValue(new Promise(() => undefined));
    await renderWithProviders(<CreateWorkspaceScreen renderTemplateStep={renderStep} />);
    await fillName('Nhóm A');
    expect(lastStep.props?.disabled).toBe(false);

    await submit();

    await waitFor(() => expect(lastStep.props?.disabled).toBe(true));
  });

  it('tạo xong: toast GỌN theo data.template — đã tạo (success) · có bỏ qua (info) · áp mẫu lỗi (warning kèm hướng xử lý)', async () => {
    const cases = [
      [
        {
          createdChannels: [
            { id: '1', key: 'a', name: 'A' },
            { id: '2', key: 'b', name: 'B' },
          ],
          skipped: [],
        },
        'success',
        'Đã tạo 2 kênh theo mẫu.',
      ],
      [
        {
          createdChannels: [{ id: '1', key: 'a', name: 'A' }],
          skipped: [{ key: 'b', reason: 'NAME_EXISTS' }],
        },
        'info',
        'Đã tạo 1 kênh theo mẫu · bỏ qua 1 kênh.',
      ],
      [
        { createdChannels: [], failed: true, skipped: [] },
        'warning',
        'Đã tạo nhóm nhưng chưa tạo được kênh theo mẫu. Bạn có thể áp lại mẫu trong Cài đặt nhóm.',
      ],
    ] as const;
    for (const [template, tone, message] of cases) {
      jest.clearAllMocks();
      mockedCreate.mockReset().mockResolvedValue({ ...(CREATED as object), template } as never);
      await renderWithProviders(<CreateWorkspaceScreen renderTemplateStep={renderStep} />);
      await fillName('Nhóm A');
      await fireEvent.press(screen.getByRole('button', { name: 'Chọn mẫu môn học' }));

      await submit();

      await waitFor(() => expect(showToast).toHaveBeenCalledWith(tone, message));
      expect(router.replace).toHaveBeenCalledTimes(1);
      await screen.unmount();
    }
  });
});
