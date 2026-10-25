import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import type { PersonOption } from '../api/conversations.types';
import { SharedContentSection } from '../components/InfoSections/SharedContentSection';
import { PeoplePickerList } from '../components/PeoplePickerList';

/**
 * Hai khối dùng chung của màn Thông tin / chọn người sau đợt làm mới giao diện — kiểm HÀNH VI (điều hướng, vai trợ năng, rung),
 * không kiểm style (NativeWind không biên dịch trong Jest).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const AN: PersonOption = {
  avatarUrl: null,
  name: 'An',
  presence: 'ONLINE',
  sharedWorkspaceIds: ['ws-1', 'ws-2'],
  userId: 'u-1',
};

beforeEach(() => jest.clearAllMocks());

describe('SharedContentSection', () => {
  it('ba lối vào mở ĐÚNG tab của thư viện (`kind`)', async () => {
    await render(<SharedContentSection conversationId="c-1" />);

    expect(screen.getByRole('header', { name: 'Nội dung đã chia sẻ' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tệp' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Liên kết' }));

    expect(router.push).toHaveBeenNthCalledWith(1, {
      params: { conversationId: 'c-1', kind: 'FILE' },
      pathname: '/messages/[conversationId]/media',
    });
    expect(router.push).toHaveBeenNthCalledWith(2, {
      params: { conversationId: 'c-1', kind: 'LINK' },
      pathname: '/messages/[conversationId]/media',
    });
  });
});

describe('PeoplePickerList', () => {
  it('chọn nhiều: hàng là hộp kiểm có trạng thái, chạm thì rung "đổi lựa chọn" rồi mới gọi onSelect', async () => {
    const onSelect = jest.fn();
    await render(
      <PeoplePickerList people={[AN]} selectedIds={new Set(['u-1'])} onSelect={onSelect} />,
    );

    const row = screen.getByRole('checkbox', { name: 'An, 2 nhóm chung' });
    expect(row).toBeChecked();
    await fireEvent.press(row);

    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(AN);
  });

  it('chạm-là-mở (không có `selectedIds`): là nút thường và KHÔNG rung — đó là điều hướng, không phải chọn', async () => {
    const onSelect = jest.fn();
    await render(
      <PeoplePickerList people={[{ ...AN, directConversationId: 'c-9' }]} onSelect={onSelect} />,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'An, 2 nhóm chung, đã có cuộc trò chuyện' }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Đã có cuộc trò chuyện')).toBeOnTheScreen();
  });
});
