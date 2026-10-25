import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeetingCard } from '../components/card/MeetingCard';
import { makeActions, makeListItem } from './fixtures';

/**
 * Thẻ agenda theo trạng thái: đang diễn ra ⇒ nút vào họp vẫn đúng nhãn/hành vi (điểm nhấn là hình thức — NativeWind không có
 * trong Jest nên chỉ kiểm HÀNH VI + chữ); còn ≤ 10 phút ⇒ thêm dòng "Sắp bắt đầu" bằng CHỮ (không chỉ viền màu) mà badge vẫn
 * giữ "Sắp tới".
 */
const MINUTE = 60 * 1000;

function startingIn(minutes: number) {
  const start = Date.now() + minutes * MINUTE;
  return {
    endAt: new Date(start + 60 * MINUTE).toISOString(),
    startAt: new Date(start).toISOString(),
  };
}

describe('MeetingCard', () => {
  it('đang diễn ra: badge chữ "Đang diễn ra", nút vào họp gọi onJoin với đúng cuộc họp', async () => {
    const onJoin = jest.fn();
    const item = makeListItem({ myActions: makeActions({ canJoin: true }), status: 'LIVE' });
    await render(<MeetingCard item={item} onJoin={onJoin} onPress={jest.fn()} />);

    expect(screen.getByText('Đang diễn ra')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(/: Họp giao ban$/));
    expect(onJoin).toHaveBeenCalledWith(item);
  });

  it('còn ≤ 10 phút: dòng "Sắp bắt đầu" + nhãn thẻ có "Sắp bắt đầu", badge vẫn "Sắp tới"', async () => {
    const item = makeListItem({ ...startingIn(5) });
    await render(<MeetingCard item={item} onJoin={jest.fn()} onPress={jest.fn()} />);

    expect(screen.getByText('Sắp bắt đầu')).toBeOnTheScreen();
    expect(screen.getByText('Sắp tới')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Sắp tới\. Sắp bắt đầu/)).toBeOnTheScreen();
  });

  it('còn hơn 10 phút, hoặc đã quá giờ bắt đầu: KHÔNG có "Sắp bắt đầu"', async () => {
    const later = makeListItem({ ...startingIn(30), id: 'later', title: 'Họp chiều' });
    const late = makeListItem({ ...startingIn(-5), id: 'late', title: 'Họp trễ' });
    await render(<MeetingCard item={later} onJoin={jest.fn()} onPress={jest.fn()} />);
    expect(screen.queryByText('Sắp bắt đầu')).toBeNull();

    await render(<MeetingCard item={late} onJoin={jest.fn()} onPress={jest.fn()} />);
    expect(screen.queryByText('Sắp bắt đầu')).toBeNull();
  });

  it('bấm thân thẻ mở chi tiết; thẻ không được vào họp thì không có nút vào họp', async () => {
    const onPress = jest.fn();
    const item = makeListItem();
    await render(<MeetingCard item={item} onJoin={jest.fn()} onPress={onPress} />);

    expect(screen.queryByLabelText(/: Họp giao ban$/)).toBeNull();
    await fireEvent.press(screen.getByText('Họp giao ban'));
    expect(onPress).toHaveBeenCalledWith(item);
  });
});
