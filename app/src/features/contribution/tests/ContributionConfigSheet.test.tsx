import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { contributionService } from '../api/contribution.service';
import { ContributionConfigSheet } from '../components/ContributionConfigSheet';
import { contributionKeys } from '../queries/contribution.keys';
import { BOARD, makeConfig } from './fixtures';
import { httpError, renderWithClient } from './harness';

/**
 * Tấm "Đổi trọng số" (app.md §3, §8): tổng ≠ 100 báo lỗi TẠI DÒNG TỔNG và không gửi; hợp lệ → `PUT` kèm `expectedVersion`; `RES_003` giữ form và cho "Tải lại";
 * `CONTRIB_002` từ server hiện ở dòng tổng như lỗi client. Mock ở tầng service (không mạng).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/contribution.service', () => ({
  ...jest.requireActual('../api/contribution.service'),
  contributionService: { config: jest.fn(), putConfig: jest.fn() },
}));

const mockedConfig = contributionService.config as jest.Mock;
const mockedPut = contributionService.putConfig as jest.Mock;
const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedConfig.mockResolvedValue(makeConfig());
  mockedPut.mockResolvedValue(makeConfig({ version: 4 }));
});

/** Như màn thật: `onClose` lật `visible` về false — công thức chỉ được tải khi tấm MỞ. */
function SheetHost() {
  const [visible, setVisible] = useState(true);
  return (
    <ContributionConfigSheet
      boardId={BOARD}
      visible={visible}
      onClose={() => {
        onClose();
        setVisible(false);
      }}
    />
  );
}

async function openSheet() {
  const rendered = await renderWithClient(<SheetHost />);
  await screen.findByLabelText('Điểm thẻ (%)');
  return rendered;
}

const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const save = () => fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));

describe('ContributionConfigSheet', () => {
  it('hiện công thức hiện hành 60/20/20, dòng tổng "100/100" và cảnh báo minh bạch (đổi = tính lại toàn bộ, mọi người thấy thời điểm đổi)', async () => {
    await openSheet();

    expect(screen.getByLabelText('Điểm thẻ (%)').props.value).toBe('60');
    expect(screen.getByLabelText('Đúng hạn (%)').props.value).toBe('20');
    expect(screen.getByLabelText('Điểm chấm (%)').props.value).toBe('20');
    expect(screen.getByText('100/100')).toBeOnTheScreen();
    expect(screen.getByText(/Toàn bộ báo cáo sẽ được tính lại và mọi thành viên thấy thời điểm đổi/)).toBeOnTheScreen();
    expect(screen.queryByText(/Tổng trọng số phải bằng 100/)).toBeNull();
  });

  it('tổng 110 → lỗi tại dòng tổng NGAY khi gõ, bấm Lưu KHÔNG gửi', async () => {
    await openSheet();

    await type('Điểm chấm (%)', '30');

    expect(screen.getByText('110/100')).toBeOnTheScreen();
    expect(screen.getByText('Tổng trọng số phải bằng 100 (hiện là 110).')).toBeOnTheScreen();
    await save();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('sửa lại về đúng 100 → lỗi biến mất ngay', async () => {
    await openSheet();

    await type('Điểm chấm (%)', '30');
    await type('Điểm chấm (%)', '20');

    expect(screen.queryByText(/Tổng trọng số phải bằng 100/)).toBeNull();
    expect(screen.getByText('100/100')).toBeOnTheScreen();
  });

  it('hợp lệ → PUT kèm expectedVersion (đổi sang số), toast, đóng tấm và xoá bản công thức đã tải', async () => {
    const { client } = await openSheet();

    await type('Điểm thẻ (%)', '50');
    await type('Đúng hạn (%)', '30');
    await type('Cho phép trễ (giờ)', '24');
    await type('Điểm cho thẻ chưa gán story points', '0,5');
    await save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedPut).toHaveBeenCalledWith(BOARD, {
      expectedVersion: 3,
      onTimeGraceHours: 24,
      unestimatedPoints: 0.5,
      weights: { onTime: 30, peer: 20, points: 50 },
    });
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu, báo cáo đang được tính lại');
    // Lần mở sau phải tải lại từ đầu — `expectedVersion` không được dựa trên bản cũ.
    expect(client.getQueryData(contributionKeys.config(BOARD))).toBeUndefined();
  });

  it('điểm thẻ chưa gán 0,3 (không phải bội của 0,5) → không gửi', async () => {
    await openSheet();

    await type('Điểm cho thẻ chưa gán story points', '0,3');
    await save();

    expect(await screen.findByText('Điểm phải là bội của 0,5')).toBeOnTheScreen();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('RES_003 (người khác vừa đổi): banner, GIỮ giá trị đang gõ, "Tải lại" nhận version mới rồi lưu tiếp với version đó', async () => {
    mockedPut.mockRejectedValueOnce(httpError(409, 'RES_003', 'Xung đột phiên bản', { currentVersion: 4 }));
    await openSheet();
    await type('Điểm thẻ (%)', '50');
    await type('Đúng hạn (%)', '30');

    await save();
    expect(await screen.findByText('Công thức vừa được người khác thay đổi')).toBeOnTheScreen();
    expect(screen.getByLabelText('Điểm thẻ (%)').props.value).toBe('50');

    mockedConfig.mockResolvedValueOnce(makeConfig({ version: 4, weights: { onTime: 25, peer: 25, points: 50 } }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(screen.queryByText('Công thức vừa được người khác thay đổi')).toBeNull());
    // Giá trị đang gõ KHÔNG bị bản mới ghi đè.
    expect(screen.getByLabelText('Đúng hạn (%)').props.value).toBe('30');

    await save();
    await waitFor(() => expect(mockedPut).toHaveBeenCalledTimes(2));
    expect(mockedPut.mock.calls[1]?.[1]).toMatchObject({ expectedVersion: 4 });
  });

  it('CONTRIB_002 từ server (tổng ≠ 100 lọt qua client) hiện ở dòng tổng', async () => {
    mockedPut.mockRejectedValueOnce(httpError(400, 'CONTRIB_002', 'Tổng trọng số phải bằng 100', { total: 90 }));
    await openSheet();

    await save();

    expect(await screen.findByText('Tổng trọng số phải bằng 100.')).toBeOnTheScreen();
    expect(screen.getByText('100/100')).toBeOnTheScreen();
  });

  it('lỗi khác của lần lưu (mất mạng…) hiện TRONG tấm, không toast, tấm vẫn mở', async () => {
    mockedPut.mockRejectedValueOnce(httpError(503, 'FOO_999', 'Máy chủ đang bận, thử lại sau'));
    await openSheet();

    await save();

    expect(await screen.findByText('Máy chủ đang bận, thử lại sau')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('không tải được công thức → báo lỗi có "Thử lại", bấm là tải lại thành công', async () => {
    mockedConfig.mockRejectedValueOnce(httpError(500, 'SYS_500', 'Lỗi hệ thống'));
    await renderWithClient(<SheetHost />);

    expect(await screen.findByText('Không tải được công thức')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByLabelText('Điểm thẻ (%)')).toBeOnTheScreen();
  });

  it('Huỷ đóng tấm mà không gửi gì', async () => {
    await openSheet();

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedPut).not.toHaveBeenCalled();
  });
});
