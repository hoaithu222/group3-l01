import { fireEvent, screen } from '@testing-library/react-native';

import {
  ConsentRequestSheet,
  type ConsentRequestSheetProps,
} from '../../../components/recording/ConsentRequestSheet';
import { renderWithInsets } from '../controls/controls-helpers';

/**
 * Tấm "Ghi hình" của chủ trì (p2-06 app.md §3): nút chính của MỌI trạng thái ở chân tấm, trạng thái là hàng nhãn–giá trị (chỉ SỐ, không tên).
 * Tách khỏi `RecordingUi.test.tsx` (trần 200 dòng). ⚠️ Không kiểm style (NativeWind không chạy trong Jest) — chỉ hành vi + nhãn.
 */

const sheetProps = (over: Partial<ConsentRequestSheetProps> = {}): ConsentRequestSheetProps => ({
  busy: null,
  error: null,
  nowMs: Date.parse('2026-10-01T09:00:00.000Z'),
  recording: null,
  visible: true,
  onClose: jest.fn(),
  onRequest: jest.fn(),
  onStart: jest.fn(),
  onStop: jest.fn(),
  ...over,
});
const asking = (counts: { accepted: number; declined: number; pending: number }) => ({
  consentRequired: false,
  counts,
  expiresAt: '2026-10-01T09:02:00.000Z',
  requestId: 'r1',
  status: 'CONSENT_REQUESTED' as const,
});

describe('ConsentRequestSheet (chủ trì)', () => {
  it('chưa hỏi → giải thích luật đồng ý + "Gửi yêu cầu đồng ý"', async () => {
    const props = sheetProps();
    await renderWithInsets(<ConsentRequestSheet {...props} />);
    expect(
      screen.getByText(/Chỉ bắt đầu ghi được khi tất cả đồng ý\. Bản ghi lưu 90 ngày/),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Gửi yêu cầu đồng ý'));
    expect(props.onRequest).toHaveBeenCalled();
  });

  it('đang hỏi: tiến độ chỉ SỐ + đếm ngược; "Bắt đầu ghi" TẮT khi còn người chưa trả lời/từ chối, BẬT khi mọi người đồng ý', async () => {
    const waiting = sheetProps({ recording: asking({ accepted: 5, declined: 1, pending: 1 }) });
    await renderWithInsets(<ConsentRequestSheet {...waiting} />);
    // Hàng nhãn–giá trị đọc liền một câu ("Đã đồng ý: 5/7") — chỉ số, không tên người.
    expect(screen.getByLabelText('Đã đồng ý: 5/7')).toBeOnTheScreen();
    expect(screen.getByLabelText('Từ chối: 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hết hạn sau: 120 giây')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bắt đầu ghi' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Nhắc lại' }));
    expect(waiting.onRequest).toHaveBeenCalledTimes(1);

    const ready = sheetProps({ recording: asking({ accepted: 7, declined: 0, pending: 0 }) });
    await renderWithInsets(<ConsentRequestSheet {...ready} />);
    expect(screen.queryByLabelText(/^Từ chối/)).toBeNull();
    await fireEvent.press(screen.getByText('Bắt đầu ghi'));
    expect(ready.onStart).toHaveBeenCalled();
  });

  it('yêu cầu hết hạn: báo rõ trạng thái, "Bắt đầu ghi" khoá dù mọi người đã đồng ý, "Nhắc lại" vẫn bấm được', async () => {
    const expired = sheetProps({
      nowMs: Date.parse('2026-10-01T09:03:00.000Z'),
      recording: asking({ accepted: 7, declined: 0, pending: 0 }),
    });
    await renderWithInsets(<ConsentRequestSheet {...expired} />);

    expect(screen.getByText('Đã hết hạn')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bắt đầu ghi' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Nhắc lại' }));
    expect(expired.onRequest).toHaveBeenCalledTimes(1);
    expect(expired.onStart).not.toHaveBeenCalled();
  });

  it('đang ghi → đồng hồ + "Dừng ghi"', async () => {
    const props = sheetProps({
      recording: {
        consentRequired: false,
        recordingId: 'rec1',
        startedAt: '2026-10-01T08:59:00.000Z',
        status: 'RECORDING',
      },
    });
    await renderWithInsets(<ConsentRequestSheet {...props} />);
    expect(screen.getByLabelText('Đang ghi hình: 01:00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Dừng ghi'));
    expect(props.onStop).toHaveBeenCalled();
  });

  it('lỗi của lần thao tác gần nhất hiện ở khối cảnh báo của tấm', async () => {
    await renderWithInsets(
      <ConsentRequestSheet {...sheetProps({ error: 'Còn 2 người chưa đồng ý.' })} />,
    );
    expect(screen.getByText('Còn 2 người chưa đồng ý.')).toBeOnTheScreen();
  });
});
