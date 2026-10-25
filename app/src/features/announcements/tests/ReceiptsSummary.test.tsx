import { render, screen } from '@testing-library/react-native';

import { ReceiptsSummary } from '../components/ReceiptsSummary';

/**
 * Thẻ tổng quan "Xác nhận đã đọc": số đếm bằng CHỮ ("12/40 đã xác nhận") là thông tin chính, vòng tiến độ + phần trăm chỉ minh hoạ;
 * chưa có số liệu thì là khung xương (không bịa "0/0").
 */
describe('ReceiptsSummary', () => {
  it('có số liệu: chữ đếm + phần trăm trong vòng + hạn', async () => {
    await render(
      <ReceiptsSummary
        counts={{ audience: 40, confirmed: 12 }}
        deadlineAt="2026-10-01T10:00:00.000Z"
      />,
    );

    expect(screen.getByText('12/40 đã xác nhận')).toBeOnTheScreen();
    expect(screen.getByText('30%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tiến độ xác nhận đã đọc')).toBeOnTheScreen();
    expect(screen.getByText(/^Hạn /)).toBeOnTheScreen();
  });

  it('đủ người: 100%; không có hạn thì không có dòng hạn', async () => {
    await render(<ReceiptsSummary counts={{ audience: 5, confirmed: 5 }} deadlineAt={null} />);

    expect(screen.getByText('100%')).toBeOnTheScreen();
    expect(screen.queryByText(/^Hạn /)).toBeNull();
  });

  it('chưa có số liệu: không có chữ đếm lẫn phần trăm (khung xương giữ chỗ)', async () => {
    await render(<ReceiptsSummary counts={null} deadlineAt={undefined} />);

    expect(screen.queryByText(/đã xác nhận$/)).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});
