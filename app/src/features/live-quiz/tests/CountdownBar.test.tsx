import { act, render, screen } from '@testing-library/react-native';

import { CountdownBar } from '../components/CountdownBar';

/**
 * app.md p5-01 §8: `CountdownBar` tính đúng với offset ÂM/DƯƠNG (mock `Date.now`) — LQ-09: máy lệch 2 phút vẫn hiển thị đúng
 * theo server; những giây cuối đổi sắc thái bằng CHỮ + icon (không chỉ màu) và đọc ở các mốc.
 */

const CLIENT_START = 1_800_000_000_000;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: CLIENT_START });
});

afterEach(() => {
  jest.useRealTimers();
});

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe.each([
  ['máy CHẬM 2 phút (offset dương)', 120_000],
  ['máy NHANH 90 giây (offset âm)', -90_000],
  ['đồng hồ khớp server', 0],
])('%s', (_name, offset) => {
  it('hiện đúng số giây còn lại theo giờ server và đếm ngược', async () => {
    const serverNow = CLIENT_START + offset;
    await render(<CountdownBar deadlineAt={serverNow + 10_000} offsetMs={offset} />);

    expect(screen.getByText('10s')).toBeOnTheScreen();
    expect(screen.getByLabelText('Còn 10 giây')).toBeOnTheScreen();

    await advance(3_000);
    expect(screen.getByText('7s')).toBeOnTheScreen();
  });

  it('hết hạn ⇒ "Hết giờ"', async () => {
    const serverNow = CLIENT_START + offset;
    await render(<CountdownBar deadlineAt={serverNow + 2_000} offsetMs={offset} />);

    await advance(2_500);

    expect(screen.getByText('Hết giờ')).toBeOnTheScreen();
  });
});

it('đọc cho trình đọc màn hình ở các MỐC (10 · 5 · 3 · hết giờ) chứ không mỗi giây', async () => {
  await render(<CountdownBar deadlineAt={CLIENT_START + 12_000} offsetMs={0} />);
  const region = (label: string) => screen.getByLabelText(label).props.accessibilityLiveRegion;
  // Mở câu (12 s) không đọc — không chen ngang lúc người dùng đang nghe đề.
  expect(region('Còn 12 giây')).toBe('none');

  await advance(2_000); // còn 10 s — mốc đầu
  expect(region('Còn 10 giây')).toBe('polite');

  await advance(1_000); // còn 9 s — không đọc
  expect(region('Còn 9 giây')).toBe('none');

  await advance(4_000); // còn 5 s — mốc
  expect(region('Còn 5 giây')).toBe('polite');

  await advance(1_000); // còn 4 s — không đọc (khỏi chen ngang từng giây)
  expect(region('Còn 4 giây')).toBe('none');

  await advance(1_000); // còn 3 s — mốc
  expect(region('Còn 3 giây')).toBe('polite');
});

it('hết giờ ⇒ nhãn đọc "Hết giờ" (live region polite) và thanh báo đã khoá đáp án', async () => {
  await render(<CountdownBar deadlineAt={CLIENT_START + 3_000} offsetMs={0} />);

  await advance(3_500);

  const digits = screen.getByLabelText('Hết giờ');
  expect(digits.props.accessibilityLiveRegion).toBe('polite');
  expect(screen.getByText('Đã khoá đáp án')).toBeOnTheScreen();
});

it('sắp hết giờ ⇒ có CHỮ nhắc (không chỉ đổi màu): "Sắp hết giờ" rồi "Nhanh lên!"', async () => {
  await render(<CountdownBar deadlineAt={CLIENT_START + 20_000} offsetMs={0} totalSeconds={20} />);
  expect(screen.getByText('Thời gian')).toBeOnTheScreen();

  await advance(10_000); // còn 10 s ≤ ½ câu
  expect(screen.getByText('Sắp hết giờ')).toBeOnTheScreen();

  await advance(5_000); // còn 5 s ≤ ¼ câu
  expect(screen.getByText('Nhanh lên!')).toBeOnTheScreen();
});
