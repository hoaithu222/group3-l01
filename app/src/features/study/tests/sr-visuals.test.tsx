import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SrSummary } from '../api/sr.types';
import { FlashcardSummary } from '../components/flashcard/FlashcardSummary';
import { SrCaughtUp } from '../components/sr/SrCaughtUp';
import { SrFeedbackButtons } from '../components/sr/SrFeedbackButtons';
import { SrSessionSummary } from '../components/sr/SrSessionSummary';
import { SrWeekStrip } from '../components/sr/SrWeekStrip';

/**
 * Phần nhìn của Ôn theo lịch + tổng kết Học thẻ, kiểm bằng HÀNH VI và nhãn trợ năng (NativeWind không biên dịch trong Jest nên màu/khoảng
 * cách phải nhìn bằng mắt trên máy): nút chấm gọi đúng mức, gợi ý "lần ôn kế" chỉ hiện khi có dữ liệu, nhãn đọc lên đủ nghĩa.
 */
const DAYS: SrSummary['dueNext7Days'] = [
  { count: 5, date: '2026-09-26' },
  { count: 0, date: '2026-09-27' },
  { count: 12, date: '2026-09-28' },
  { count: 0, date: '2026-09-29' },
  { count: 1, date: '2026-09-30' },
  { count: 0, date: '2026-10-01' },
  { count: 3, date: '2026-10-02' },
];
const SUMMARY: SrSummary = {
  dueNext7Days: DAYS,
  dueToday: 0,
  newToday: 0,
  reviewStreakDays: 3,
  reviewedToday: 2,
  serverNow: '2026-09-25T02:00:00.000Z',
};

describe('SrFeedbackButtons', () => {
  const progress = { easiness: 2.5, interval: 6, repetition: 2 };

  it('bốn mức đúng thứ tự Quên · Khó · Vừa · Dễ, mỗi ô gọi ĐÚNG mức của nó', async () => {
    const onRate = jest.fn();
    await render(<SrFeedbackButtons progress={progress} onRate={onRate} />);

    for (const [label, rating] of [
      ['Quên', 'AGAIN'],
      ['Khó', 'HARD'],
      ['Vừa', 'GOOD'],
      ['Dễ', 'EASY'],
    ] as const) {
      await fireEvent.press(screen.getByLabelText(new RegExp(`^Đánh giá: ${label}`)));
      expect(onRate).toHaveBeenLastCalledWith(rating);
    }
    expect(onRate).toHaveBeenCalledTimes(4);
  });

  it('có `progress` ⇒ dưới mỗi ô là khoảng ôn dự kiến thật (Quên luôn về 1 ngày), nhãn đọc lên cả khoảng đó', async () => {
    await render(<SrFeedbackButtons progress={progress} onRate={jest.fn()} />);

    expect(screen.getByLabelText('Đánh giá: Quên, ôn lại sau 1 ngày')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đánh giá: Vừa, ôn lại sau 15 ngày')).toBeOnTheScreen();
    expect(screen.getByText('Bạn nhớ thẻ này thế nào?')).toBeOnTheScreen();
    expect(screen.getAllByText('15 ngày')).toHaveLength(3);
  });

  it('KHÔNG có `progress` ⇒ không bịa khoảng ôn: chỉ nhãn mức, không dòng "… ngày"', async () => {
    await render(<SrFeedbackButtons onRate={jest.fn()} />);

    expect(screen.getByLabelText('Đánh giá: Dễ')).toBeOnTheScreen();
    expect(screen.queryByText(/ngày/)).toBeNull();
    expect(screen.queryByLabelText(/ôn lại sau/)).toBeNull();
  });

  it('`disabled` chặn mọi ô', async () => {
    const onRate = jest.fn();
    await render(<SrFeedbackButtons disabled onRate={onRate} />);

    await fireEvent.press(screen.getByLabelText('Đánh giá: Vừa'));
    expect(onRate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Đánh giá: Vừa')).toBeDisabled();
  });
});

describe('SrWeekStrip', () => {
  it('7 cột, mỗi cột đọc "ngày: N thẻ"; cột ĐẦU là ngày mai và được gọi là "Mai"', async () => {
    await render(<SrWeekStrip days={DAYS} />);

    expect(screen.getByLabelText('Lịch ôn 7 ngày tới')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mai, T7 26/09: 5 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('T2 28/09: 12 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('T6 02/10: 3 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('Mai')).toBeOnTheScreen();
    // Ngày 0 thẻ vẫn có cột + số "0" (không phải khoảng trống khó hiểu).
    expect(screen.getByLabelText('CN 27/09: 0 thẻ')).toBeOnTheScreen();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });
});

describe('SrSessionSummary', () => {
  it('vòng "nhớ được" = thẻ không chọn Quên; bốn ô đọc đúng số; có "Mai ôn" từ lịch thật', async () => {
    await render(
      <SrSessionSummary
        remainingToday={0}
        stats={{ AGAIN: 1, EASY: 2, GOOD: 1, HARD: 0 }}
        summary={SUMMARY}
        onContinue={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    expect(screen.getByText('Hoàn thành phiên ôn')).toBeOnTheScreen();
    expect(screen.getByText('Bạn đã ôn 4 thẻ. Mai ôn 5 thẻ.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nhớ được 3 trên 4 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('75%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quên: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Khó: 0 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dễ: 2 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lịch ôn 7 ngày tới')).toBeOnTheScreen();
    expect(screen.queryByText(/Ôn tiếp/)).toBeNull();
  });

  it('chưa có lịch (`summary` chưa tải) ⇒ bỏ "Mai ôn" và lịch, KHÔNG chặn tóm tắt; còn thẻ hôm nay ⇒ "Ôn tiếp N thẻ"', async () => {
    const onContinue = jest.fn();
    const onDone = jest.fn();
    await render(
      <SrSessionSummary
        remainingToday={7}
        stats={{ AGAIN: 0, EASY: 0, GOOD: 2, HARD: 0 }}
        onContinue={onContinue}
        onDone={onDone}
      />,
    );

    expect(screen.getByText('Bạn đã ôn 2 thẻ.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Lịch ôn 7 ngày tới')).toBeNull();
    expect(screen.getByLabelText('Nhớ được 2 trên 2 thẻ')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Ôn tiếp 7 thẻ'));
    await fireEvent.press(screen.getByText('Xong'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('SrCaughtUp', () => {
  it('"Đã ôn xong" + "Mai ôn N thẻ" từ ngày đầu của lịch + lịch 7 ngày', async () => {
    await render(<SrCaughtUp summary={SUMMARY} />);

    expect(screen.getByText('Đã ôn xong')).toBeOnTheScreen();
    expect(screen.getByText('Hôm nay không còn thẻ cần ôn. Mai ôn 5 thẻ.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lịch ôn 7 ngày tới')).toBeOnTheScreen();
  });

  it('lịch chưa tải ⇒ chỉ thông báo chính, không bịa số', async () => {
    await render(<SrCaughtUp />);

    expect(screen.getByText('Hôm nay không còn thẻ cần ôn.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Lịch ôn 7 ngày tới')).toBeNull();
  });
});

describe('FlashcardSummary', () => {
  it('có thẻ chưa thuộc ⇒ nút "Học lại N thẻ chưa thuộc"; ô "Bỏ qua" chỉ hiện khi có thẻ bỏ qua', async () => {
    const onRetry = jest.fn();
    await render(
      <FlashcardSummary
        known={2}
        total={4}
        unknown={1}
        onBack={jest.fn()}
        onRestart={jest.fn()}
        onRetryUnknown={onRetry}
      />,
    );

    expect(screen.getByLabelText('Đã thuộc 2 trên 4 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bỏ qua: 1 thẻ')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Học lại 1 thẻ chưa thuộc'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('thuộc hết ⇒ không có nút học lại thẻ chưa thuộc, không có ô "Bỏ qua", lời nhắn nói thuộc hết', async () => {
    await render(
      <FlashcardSummary
        known={3}
        total={3}
        unknown={0}
        onBack={jest.fn()}
        onRestart={jest.fn()}
        onRetryUnknown={jest.fn()}
      />,
    );

    expect(screen.getByText('100%')).toBeOnTheScreen();
    expect(screen.getByText('Bạn đã thuộc hết 3 thẻ.')).toBeOnTheScreen();
    expect(screen.queryByText(/thẻ chưa thuộc$/)).toBeNull();
    expect(screen.queryByLabelText(/^Bỏ qua/)).toBeNull();
    expect(screen.getByText('Học lại từ đầu')).toBeOnTheScreen();
  });
});
