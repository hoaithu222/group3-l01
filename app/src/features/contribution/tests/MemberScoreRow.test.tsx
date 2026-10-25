import { fireEvent, render, screen } from '@testing-library/react-native';

import { FORMULA, makeMember, makePointsOnlyMember } from './fixtures';
import { MemberScoreRow } from '../components/MemberScoreRow';
import { MemberScoreTable } from '../components/MemberScoreTable';

const WEIGHTS = FORMULA.weights;

describe('MemberScoreRow — số gốc cạnh phần trăm (app.md §7)', () => {
  it('điểm "91,0", "58,7% nhóm", và MỖI thành phần có số gốc đi kèm % ngay cạnh', async () => {
    await render(<MemberScoreRow member={makeMember()} weights={WEIGHTS} onPress={jest.fn()} />);

    expect(screen.getByText('Nguyễn Văn A')).toBeOnTheScreen();
    expect(screen.getByText('91,0')).toBeOnTheScreen();
    expect(screen.getByText('58,7% nhóm')).toBeOnTheScreen();
    expect(screen.getByText('8 điểm thẻ · 100%')).toBeOnTheScreen();
    expect(screen.getByText('3/4 đúng hạn · 75%')).toBeOnTheScreen();
    expect(screen.getByText('chấm 8,0 (5 lượt) · 80%')).toBeOnTheScreen();
    // Đủ dữ liệu → không có câu chia lại.
    expect(screen.queryByText(/được chia lại/)).toBeNull();
  });

  it('thành phần null: chữ "Chưa có dữ liệu" (không phải 0%) và câu chia lại trọng số', async () => {
    await render(<MemberScoreRow member={makePointsOnlyMember()} weights={WEIGHTS} onPress={jest.fn()} />);

    expect(screen.getAllByText('Chưa có dữ liệu')).toHaveLength(2);
    expect(screen.getByText('20 % đúng hạn và 20 % điểm chấm được chia lại cho thành phần còn lại')).toBeOnTheScreen();
    expect(screen.getByText('4 điểm thẻ · 50%')).toBeOnTheScreen();
    expect(screen.queryByText(/ · 0%/)).toBeNull();
  });

  it('người đã rời nhóm vẫn hiện (không ẩn khỏi kỳ họ có đóng góp), kèm nhãn CHỮ "Đã rời nhóm"', async () => {
    const left = makeMember({ user: { avatarUrl: null, id: 'u9', membership: 'LEFT', name: 'Lê Văn C' } });
    await render(<MemberScoreRow member={left} weights={WEIGHTS} onPress={jest.fn()} />);

    expect(screen.getByText('Lê Văn C')).toBeOnTheScreen();
    expect(screen.getByText('Đã rời nhóm')).toBeOnTheScreen();
  });

  it('người đang trong nhóm thì không có nhãn "Đã rời nhóm"', async () => {
    await render(<MemberScoreRow member={makeMember()} weights={WEIGHTS} onPress={jest.fn()} />);

    expect(screen.queryByText('Đã rời nhóm')).toBeNull();
  });

  it('chạm hàng gọi onPress với thành viên đó; KHÔNG có nút sửa điểm/% ở bất kỳ đâu', async () => {
    const onPress = jest.fn();
    const member = makeMember();
    await render(<MemberScoreRow member={member} weights={WEIGHTS} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledWith(member);
    expect(screen.queryByText(/Sửa|Chỉnh|Đổi điểm/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('MemberScoreTable — máy tính bảng', () => {
  it('đủ cột Thành viên · Điểm thẻ · Thẻ xong · Trễ hạn · Đúng hạn · Điểm chấm · Điểm · % nhóm', async () => {
    await render(<MemberScoreTable members={[makeMember()]} selectedId={null} onSelect={jest.fn()} />);

    for (const header of ['Thành viên', 'Điểm thẻ', 'Thẻ xong', 'Trễ hạn', 'Đúng hạn', 'Điểm chấm', 'Điểm', '% nhóm']) {
      expect(screen.getByText(header)).toBeOnTheScreen();
    }
    expect(screen.getByText('3/4')).toBeOnTheScreen();
    expect(screen.getByText('8,0 (5)')).toBeOnTheScreen();
    expect(screen.getByText('91,0')).toBeOnTheScreen();
    expect(screen.getByText('58,7%')).toBeOnTheScreen();
  });

  it('thành phần chưa có dữ liệu là gạch ngang (không phải 0); chạm hàng chọn thành viên', async () => {
    const onSelect = jest.fn();
    const member = makePointsOnlyMember();
    await render(<MemberScoreTable members={[member]} selectedId={member.user.id} onSelect={onSelect} />);

    expect(screen.getAllByText('—')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { selected: true }));
    expect(onSelect).toHaveBeenCalledWith(member);
  });
});
