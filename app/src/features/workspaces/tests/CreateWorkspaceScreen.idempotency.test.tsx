import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { CreateWorkspaceScreen } from '../screens/CreateWorkspaceScreen';
import {
  apiError,
  bodyOf,
  CREATED,
  fillName,
  keyOf,
  lastStep,
  mockedCreate,
  networkError,
  renderStep,
  submit,
} from './create-harness';
import { renderWithProviders } from './test-utils';

/**
 * Form TẠO NHÓM — `TPL_001`/`CFG_005` và vòng đời `Idempotency-Key` (app.md p5-04 §3/§4). ⚠️ BE `idempotency.ts` lưu MỌI phản hồi có mã
 * < 500 (kể cả 4xx) 24 giờ theo khoá và KHÔNG so sánh body: gửi lại CÙNG khoá sau một 4xx là nhận lại đúng câu lỗi cũ dù người dùng đã
 * sửa; đổi body mà giữ khoá là nhận kết quả của body cũ. Mất mạng/5xx thì BE không lưu gì — giữ khoá để thử lại an toàn.
 * Luồng chính: `CreateWorkspaceScreen.template.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/workspaces.service', () => ({ workspacesService: { create: jest.fn() } }));

const NOTICE = /Mẫu vừa bị tắt hoặc không còn — đã chuyển về “Không dùng mẫu”/;

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreate.mockReset().mockResolvedValue(CREATED);
  lastStep.props = undefined;
});

async function openWithTemplate(): Promise<void> {
  await renderWithProviders(<CreateWorkspaceScreen renderTemplateStep={renderStep} />);
  await fillName('Nhóm A');
  await fireEvent.press(screen.getByRole('button', { name: 'Chọn mẫu môn học' }));
}

describe('CreateWorkspaceScreen — BE từ chối mẫu', () => {
  it.each(['TPL_001', 'CFG_005'])(
    '%s (mẫu vừa tắt/cờ vừa tắt): về "Không dùng mẫu" + thông báo + làm mới danh sách mẫu; tạo lại KHÔNG gửi mẫu, khoá MỚI',
    async (code) => {
      mockedCreate.mockRejectedValueOnce(apiError(404, code)).mockResolvedValueOnce(CREATED);
      await openWithTemplate();

      await submit();

      expect(await screen.findByText(NOTICE)).toBeOnTheScreen();
      expect(screen.getByText('Mẫu: không')).toBeOnTheScreen();
      expect(lastStep.props?.refreshToken).toBe(1);
      // Câu lỗi chung của BE KHÔNG hiện chồng lên thông báo riêng.
      expect(screen.queryByText('Mẫu nhóm không tồn tại hoặc đã tắt')).toBeNull();

      await submit();

      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
      expect(bodyOf(1)).toEqual({ description: undefined, name: 'Nhóm A' });
      expect(bodyOf(1)).not.toHaveProperty('templateCode');
      expect(keyOf(1)).not.toBe(keyOf(0));
    },
  );

  it('chọn lại một mẫu sau khi bị từ chối: thông báo cũ biến mất', async () => {
    mockedCreate.mockRejectedValueOnce(apiError(404, 'TPL_001'));
    await openWithTemplate();
    await submit();
    await screen.findByText(NOTICE);

    await fireEvent.press(screen.getByRole('button', { name: 'Chọn mẫu môn học' }));

    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText('Mẫu: course[thong-bao,thao-luan]')).toBeOnTheScreen();
  });
});

describe('CreateWorkspaceScreen — Idempotency-Key', () => {
  it('mất mạng rồi thử lại CÙNG body: CÙNG khoá (BE không lưu gì; lượt đầu lỡ chạy thì nhận đúng kết quả của nó)', async () => {
    mockedCreate.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(CREATED);
    await openWithTemplate();

    await submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('4xx dứt khoát (WS_006): hiện câu lỗi; lần sau dùng khoá MỚI vì BE đã lưu câu 409 dưới khoá cũ', async () => {
    mockedCreate.mockRejectedValueOnce(apiError(409, 'WS_006')).mockResolvedValueOnce(CREATED);
    await openWithTemplate();

    await submit();
    expect(await screen.findByText('Bạn đã tham gia số nhóm tối đa')).toBeOnTheScreen();
    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('RES_004 (lượt trước còn đang chạy ở server): GIỮ khoá — đổi khoá là mở đường cho tạo trùng', async () => {
    mockedCreate.mockRejectedValueOnce(apiError(409, 'RES_004')).mockResolvedValueOnce(CREATED);
    await openWithTemplate();

    await submit();
    await screen.findByText('Yêu cầu trùng đang được xử lý');
    await submit();

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('đổi tên nhóm hoặc tập kênh giữa hai lượt: khoá MỚI (BE không so sánh body)', async () => {
    mockedCreate.mockRejectedValue(networkError());
    await openWithTemplate();
    await submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));

    await fillName('Nhóm B');
    await submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));

    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chọn mẫu' }));
    await submit();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(1));
    expect(bodyOf(2)).not.toHaveProperty('templateCode');
  });
});
