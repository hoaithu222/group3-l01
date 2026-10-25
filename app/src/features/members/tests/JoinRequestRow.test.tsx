import { fireEvent, render, screen } from '@testing-library/react-native';

import type { JoinRequestRow as JoinRequestData } from '../api';
import { JoinRequestRow } from '../components/JoinRequestRow';

/**
 * `JoinRequestRow` — lời nhắn xin vào nhóm (`requestMessage` ≤ 500 ký tự do người xin gõ) phải ĐỌC ĐƯỢC HẾT trước khi duyệt:
 * ngắn hiện thẳng, dài gập 4 dòng có "Xem thêm"/"Thu gọn", không có thì không vẽ khối lời nhắn.
 */
function request(requestMessage: string | null): JoinRequestData {
  return {
    requestMessage,
    requestedAt: new Date().toISOString(),
    user: { avatarUrl: null, id: 'u5', name: 'Nga' },
    via: 'INVITE_LINK',
  };
}

const noop = jest.fn();

describe('JoinRequestRow — requestMessage', () => {
  it('lời nhắn ngắn: hiện đủ, không có "Xem thêm"', async () => {
    await render(<JoinRequestRow request={request('Em là học sinh lớp 12A')} onApprove={noop} onReject={noop} />);

    expect(screen.getByText('Em là học sinh lớp 12A')).toBeOnTheScreen();
    expect(screen.queryByText('Xem thêm')).toBeNull();
  });

  it('lời nhắn null: không vẽ khối lời nhắn', async () => {
    await render(<JoinRequestRow request={request(null)} onApprove={noop} onReject={noop} />);

    expect(screen.queryByLabelText(/^Lời nhắn của/)).toBeNull();
    expect(screen.queryByText('Xem thêm')).toBeNull();
  });

  it('lời nhắn dài (500 ký tự): gập 4 dòng, "Xem thêm" mở hết, "Thu gọn" gập lại', async () => {
    const long = 'Em muốn vào nhóm để học cùng các bạn. '.repeat(13).trim().slice(0, 500);
    await render(<JoinRequestRow request={request(long)} onApprove={noop} onReject={noop} />);

    expect(screen.getByText(long).props.numberOfLines).toBe(4);

    await fireEvent.press(screen.getByText('Xem thêm'));
    expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Thu gọn')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thu gọn'));
    expect(screen.getByText(long).props.numberOfLines).toBe(4);
  });

  it('nhiều dòng xuống dòng (ngắn ký tự nhưng > 4 dòng) cũng gập', async () => {
    await render(<JoinRequestRow request={request('a\nb\nc\nd\ne')} onApprove={noop} onReject={noop} />);

    expect(screen.getByText('Xem thêm')).toBeOnTheScreen();
  });

  it('nhãn trợ năng của lời nhắn nói rõ ai viết', async () => {
    await render(<JoinRequestRow request={request('Cho em vào với ạ')} onApprove={noop} onReject={noop} />);

    expect(screen.getByLabelText('Lời nhắn của Nga: Cho em vào với ạ')).toBeOnTheScreen();
  });
});
