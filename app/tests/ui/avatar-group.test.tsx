import { render } from '@testing-library/react-native';

import { AvatarGroup, describeAvatarGroup, type AvatarGroupUser } from '@/shared/ui/avatar-group';

/**
 * `AvatarGroup` (p0-12): nhóm avatar chồng + "+k"; cả nhóm là MỘT phần tử trợ năng đọc một câu ("Nguyễn An, Trần Bình và 2 người
 * khác"). Chỉ test HÀNH VI; `render()` của RNTL 14 phải `await`.
 */
const NAMES = ['Nguyễn An', 'Trần Bình', 'Lê Chi', 'Phạm Dũng', 'Vũ Em'];
const users = (count: number): AvatarGroupUser[] =>
  NAMES.slice(0, count).map((name, index) => ({ id: `u${String(index)}`, name }));

describe('describeAvatarGroup', () => {
  it.each([
    [1, 3, 'Nguyễn An'],
    [2, 3, 'Nguyễn An và Trần Bình'],
    [3, 3, 'Nguyễn An, Trần Bình và Lê Chi'],
    [5, 2, 'Nguyễn An, Trần Bình và 3 người khác'],
    [3, 0, '3 người khác'],
  ])('%d người, hiện %d ⇒ "%s"', (total, shown, expected) => {
    expect(describeAvatarGroup(users(total), shown)).toBe(expected);
  });
});

describe('AvatarGroup', () => {
  it('nhiều hơn `max` ⇒ hiện `max` avatar + "+k", nhãn nói tên những người đang hiện và số còn lại', async () => {
    const screen = await render(<AvatarGroup max={2} users={users(5)} />);

    expect(screen.getByText('+3', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Nguyễn An, Trần Bình và 3 người khác')).toBeOnTheScreen();
  });

  it('mặc định max=3', async () => {
    const screen = await render(<AvatarGroup users={users(5)} />);

    expect(screen.getByText('+2', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Nguyễn An, Trần Bình, Lê Chi và 2 người khác')).toBeOnTheScreen();
  });

  it('không vượt `max` ⇒ không có "+k"', async () => {
    const screen = await render(<AvatarGroup users={users(3)} />);

    // Phần tử "+k" nằm trong khối ẨN khỏi trình đọc màn hình — phải `includeHiddenElements` mới thật sự kiểm được sự vắng mặt.
    expect(screen.queryByText(/^\+/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Nguyễn An, Trần Bình và Lê Chi')).toBeOnTheScreen();
  });

  it('thừa đúng MỘT người thì hiện luôn avatar của họ, KHÔNG ô "+1" (ô đó chiếm chỗ mà chẳng nói được gì)', async () => {
    const screen = await render(<AvatarGroup users={users(4)} />);

    expect(screen.queryByText('+1', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Nguyễn An, Trần Bình, Lê Chi và Phạm Dũng')).toBeOnTheScreen();
  });

  it('avatar con bị ẨN khỏi trình đọc màn hình — chỉ còn nhãn của cả nhóm (không đọc trùng tên)', async () => {
    const screen = await render(<AvatarGroup users={users(3)} />);

    expect(screen.queryByLabelText('Nguyễn An')).toBeNull();
    expect(screen.getAllByLabelText(/Nguyễn An/)).toHaveLength(1);
  });

  it('"+k" chỉ hiện tối đa hai chữ số (con số thật nằm ở nhãn)', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `u${String(i)}`,
      name: `Người ${String(i)}`,
    }));
    const screen = await render(<AvatarGroup users={many} />);

    expect(screen.getByText('+99', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText(/và 147 người khác$/)).toBeOnTheScreen();
  });

  it('danh sách rỗng ⇒ không vẽ gì', async () => {
    const screen = await render(<AvatarGroup users={[]} />);

    expect(screen.toJSON()).toBeNull();
  });
});
