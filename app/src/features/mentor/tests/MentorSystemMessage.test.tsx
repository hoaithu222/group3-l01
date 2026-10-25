import { render, screen } from '@testing-library/react-native';

import { MentorSystemMessage } from '../components/MentorSystemMessage';
import { mentorSystemText } from '../utils/mentor-system-text';

/**
 * Thẻ tin hệ thống của cố vấn trong nhóm chat (p6-03 be.md §5): `MENTOR_JOINED { mentorId, endsAt }` và
 * `MENTOR_LEFT { mentorId, reason: EXPIRED | LEFT | REMOVED }`. Tên lấy qua bộ tra của màn cha (như `MEMBER_JOINED`);
 * tra không ra ⇒ câu KHÔNG tên chứ không bịa "Thành viên".
 */
const ENDS_AT = '2026-10-30T10:00:00.000Z';

const resolveAuthor = (userId: string) => (userId === 'm1' ? { name: 'Trần Lan' } : undefined);

function message(systemType: string, systemPayload: Record<string, unknown> | null) {
  return { systemPayload, systemType };
}

describe('MentorSystemMessage — MENTOR_JOINED', () => {
  it('hiện "Cố vấn <tên> tham gia đến <ngày>" (dd/MM/yyyy) và có nhãn cho trình đọc màn hình', async () => {
    await render(
      <MentorSystemMessage
        message={message('MENTOR_JOINED', { endsAt: ENDS_AT, mentorId: 'm1' })}
        resolveAuthor={resolveAuthor}
      />,
    );

    expect(screen.getByText('Cố vấn Trần Lan tham gia đến 30/10/2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cố vấn Trần Lan tham gia đến 30/10/2026')).toBeOnTheScreen();
  });

  it('tra tên bằng ĐÚNG mentorId trong payload', async () => {
    const resolver = jest.fn(resolveAuthor);
    await render(
      <MentorSystemMessage
        message={message('MENTOR_JOINED', { endsAt: ENDS_AT, mentorId: 'm1' })}
        resolveAuthor={resolver}
      />,
    );

    expect(resolver).toHaveBeenCalledWith('m1');
  });

  it('không tra ra tên (hoặc không có bộ tra) ⇒ câu không tên, không bịa tên', async () => {
    await render(
      <MentorSystemMessage
        message={message('MENTOR_JOINED', { endsAt: ENDS_AT, mentorId: 'lạ' })}
        resolveAuthor={resolveAuthor}
      />,
    );
    expect(screen.getByText('Cố vấn tham gia đến 30/10/2026')).toBeOnTheScreen();
    expect(screen.queryByText(/Thành viên/)).toBeNull();
  });

  it('endsAt hỏng/thiếu ⇒ bỏ mệnh đề "đến …", không in "Invalid" hay ngày rỗng', async () => {
    await render(
      <MentorSystemMessage
        message={message('MENTOR_JOINED', { endsAt: 'không-phải-ngày', mentorId: 'm1' })}
        resolveAuthor={resolveAuthor}
      />,
    );
    expect(screen.getByText('Cố vấn Trần Lan đã tham gia')).toBeOnTheScreen();
    expect(screen.queryByText(/Invalid|đến/)).toBeNull();
  });
});

describe('MentorSystemMessage — MENTOR_LEFT', () => {
  it.each([
    ['EXPIRED', 'Đợt cố vấn của Trần Lan đã hết hạn'],
    ['LEFT', 'Cố vấn Trần Lan đã rời nhóm'],
    ['REMOVED', 'Đợt cố vấn của Trần Lan đã kết thúc'],
    ['LÝ_DO_MỚI', 'Đợt cố vấn của Trần Lan đã kết thúc'],
  ])('lý do %s ⇒ "%s"', async (reason, expected) => {
    await render(
      <MentorSystemMessage
        message={message('MENTOR_LEFT', { mentorId: 'm1', reason })}
        resolveAuthor={resolveAuthor}
      />,
    );

    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  it('cố vấn đã rời nhóm chat nên không tra được tên ⇒ "Đợt cố vấn đã kết thúc"', async () => {
    await render(<MentorSystemMessage message={message('MENTOR_LEFT', { mentorId: 'm1', reason: 'REMOVED' })} />);
    expect(screen.getByText('Đợt cố vấn đã kết thúc')).toBeOnTheScreen();
  });

  it('payload null ⇒ vẫn vẽ câu chung, không crash', async () => {
    await render(<MentorSystemMessage message={message('MENTOR_LEFT', null)} />);
    expect(screen.getByText('Đợt cố vấn đã kết thúc')).toBeOnTheScreen();
  });
});

describe('MentorSystemMessage — loại khác', () => {
  it('systemType không phải của mentor ⇒ không vẽ gì', async () => {
    await render(<MentorSystemMessage message={message('WALLET_REMINDER', { mentorId: 'm1' })} />);
    expect(screen.queryByText(/cố vấn/i)).toBeNull();
  });
});

describe('mentorSystemText', () => {
  it('tên toàn khoảng trắng coi như không có tên', () => {
    expect(mentorSystemText('MENTOR_LEFT', { reason: 'LEFT' }, '   ')).toBe('Cố vấn đã rời nhóm');
  });

  it('trả null cho loại lạ', () => {
    expect(mentorSystemText('MEMBER_JOINED', {})).toBeNull();
    expect(mentorSystemText(null, {})).toBeNull();
  });
});
