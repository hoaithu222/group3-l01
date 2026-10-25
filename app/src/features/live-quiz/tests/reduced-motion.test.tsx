import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  useReducedMotion,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnswerTile } from '../components/AnswerTile';
import { CountdownBar } from '../components/CountdownBar';
import { GrowBar } from '../components/GrowBar';
import { PodiumTop3 } from '../components/PodiumTop3';
import { PulseHalo } from '../components/PulseHalo';

/**
 * "Giảm chuyển động" của hệ điều hành (app.md p5-01 §7): mọi hiệu ứng của chế độ thi đấu (thanh chạy, bục mọc, quầng chờ, nhấp nháy
 * chữ số, ô đáp án nảy) PHẢI tắt — nội dung vẫn đủ và ở trạng thái CUỐI ngay. Jest mặc định `useReducedMotion() = false` nên nhánh này
 * không bao giờ chạy nếu không ép nó ở đây; các `with*` được bọc để đếm số lần gọi.
 */
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(),
    withRepeat: jest.fn(actual.withRepeat),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  };
});

const ENTRIES = [1, 2, 3].map((rank) => ({
  name: `Người ${String(rank)}`,
  rank,
  score: 1000 - rank * 100,
  userId: `u${String(rank)}`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useReducedMotion).mockReturnValue(true);
});

describe('giảm chuyển động BẬT', () => {
  it('thanh tỉ lệ nhảy thẳng tới mức đích: không có `withTiming`', async () => {
    await render(<GrowBar fillClassName="bg-action-success" percent={60} />);

    expect(withTiming).not.toHaveBeenCalled();
  });

  it('bục nhận giải đứng sẵn ở chiều cao cuối, đủ ba cột, không animation', async () => {
    await render(<PodiumTop3 entries={ENTRIES} />);

    expect(screen.getByLabelText('Hạng 1, Người 1, 900 điểm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạng 3, Người 3, 700 điểm')).toBeOnTheScreen();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('quầng chờ không chạy nhưng nội dung bên trong vẫn hiện', async () => {
    await render(
      <PulseHalo>
        <Text>Đang chờ</Text>
      </PulseHalo>,
    );

    expect(screen.getByText('Đang chờ')).toBeOnTheScreen();
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it('ô đáp án đã chọn không nảy (không `withSpring`) nhưng vẫn báo đã chọn cho trình đọc màn hình', async () => {
    await render(<AnswerTile index={1} selected text="Huế" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'B. Huế' })).toBeSelected();
    expect(withSpring).not.toHaveBeenCalled();
  });

  it('đồng hồ: thanh không trượt, chữ số không nhấp nháy — số giây vẫn đúng', async () => {
    await render(<CountdownBar deadlineAt={Date.now() + 4_000} offsetMs={0} totalSeconds={20} />);

    expect(screen.getByLabelText(/^Còn \d giây$/)).toBeOnTheScreen();
    expect(withTiming).not.toHaveBeenCalled();
    expect(withRepeat).not.toHaveBeenCalled();
  });
});

describe('đối chứng: giảm chuyển động TẮT thì hiệu ứng có chạy', () => {
  beforeEach(() => jest.mocked(useReducedMotion).mockReturnValue(false));

  it('thanh tỉ lệ trượt bằng `withTiming`', async () => {
    await render(<GrowBar fillClassName="bg-action-success" percent={60} />);

    expect(withTiming).toHaveBeenCalled();
  });

  it('quầng chờ lặp bằng `withRepeat`', async () => {
    await render(
      <PulseHalo>
        <Text>Đang chờ</Text>
      </PulseHalo>,
    );

    expect(withRepeat).toHaveBeenCalled();
  });

  it('ô đáp án đã chọn nảy bằng `withSpring`', async () => {
    await render(<AnswerTile index={1} selected text="Huế" onPress={jest.fn()} />);

    expect(withSpring).toHaveBeenCalled();
  });
});
