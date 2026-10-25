import { fireEvent, render, screen } from '@testing-library/react-native';

import { MemberFilterBar } from '../components/MemberFilterBar';

/**
 * Dải lọc của màn Thành viên: MỘT dải chip chọn-một (Tất cả · Chủ nhóm · Quản trị viên · Thành viên · Bị chặn), thay cho
 * dải tab "Bị chặn" + dải chip vai trò xếp chồng. "Bị chặn" chỉ hiện với người quản lý (BE trả PERM_001 cho người khác).
 */

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

function setup(props: Partial<React.ComponentProps<typeof MemberFilterBar>> = {}) {
  const handlers = { onQueryChange: jest.fn(), onRoleChange: jest.fn(), onStatusChange: jest.fn() };
  const view = render(
    <MemberFilterBar canSeeBanned={false} role={undefined} status="ACTIVE" {...handlers} {...props} />,
  );
  return { handlers, view };
}

describe('MemberFilterBar', () => {
  it('thành viên thường KHÔNG thấy chip "Bị chặn"; người quản lý thấy', async () => {
    await setup({ canSeeBanned: false }).view;
    expect(screen.getByText('Tất cả')).toBeOnTheScreen();
    expect(screen.queryByText('Bị chặn')).toBeNull();
  });

  it('người quản lý có chip "Bị chặn"; chọn thì chuyển sang trạng thái BANNED', async () => {
    const { handlers, view } = setup({ canSeeBanned: true });
    await view;

    await fireEvent.press(screen.getByText('Bị chặn'));

    expect(handlers.onStatusChange).toHaveBeenCalledWith('BANNED');
    expect(handlers.onRoleChange).not.toHaveBeenCalled();
  });

  it('đang ở "Bị chặn" mà chọn một vai trò → về ACTIVE rồi đặt vai trò', async () => {
    const { handlers, view } = setup({ canSeeBanned: true, status: 'BANNED' });
    await view;

    await fireEvent.press(screen.getByText('Quản trị viên'));

    expect(handlers.onStatusChange).toHaveBeenCalledWith('ACTIVE');
    expect(handlers.onRoleChange).toHaveBeenCalledWith('ADMIN');
  });

  it('đang ở ACTIVE: chọn vai trò chỉ đổi vai trò, "Tất cả" bỏ lọc vai trò', async () => {
    const { handlers, view } = setup({ role: 'MEMBER' });
    await view;

    await fireEvent.press(screen.getByText('Chủ nhóm'));
    expect(handlers.onRoleChange).toHaveBeenLastCalledWith('OWNER');
    await fireEvent.press(screen.getByText('Tất cả'));
    expect(handlers.onRoleChange).toHaveBeenLastCalledWith(undefined);
    expect(handlers.onStatusChange).not.toHaveBeenCalled();
  });

  it('chỉ MỘT chip được đánh dấu đang chọn (trợ năng)', async () => {
    await setup({ canSeeBanned: true, role: 'ADMIN' }).view;

    expect(screen.getByRole('radio', { name: 'Quản trị viên', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Tất cả', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Bị chặn', checked: false })).toBeOnTheScreen();
  });
});
