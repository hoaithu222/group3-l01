import { render } from '@testing-library/react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';

import ShortLinkRoute from '../../../../app/m/[id]';

/**
 * `/m/<x>` phân loại theo HÌNH DẠNG (D-29): mã họp `abc-defg-hjk` (bảng 23 ký tự BỎ i, l, o) ⇒ màn giải mã họp; mọi thứ khác (ObjectId 24 hex của hội thoại) ⇒
 * chuyển thẳng sang hội thoại như trước. Route chỉ lắp ráp — hai màn đích được thay bằng bản giả.
 */
jest.mock('expo-router', () => ({ Redirect: jest.fn(() => null), useLocalSearchParams: jest.fn() }));
jest.mock('@/features/meetings/screens/MeetingCodeLinkScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { MeetingCodeLinkScreen: ({ code }: { code: string }) => <Text>{`Giải mã họp ${code}`}</Text> };
});

const CONVERSATION_ID = '507f1f77bcf86cd799439011';

beforeEach(() => jest.clearAllMocks());

describe('app/m/[id] — link ngắn dùng chung', () => {
  it('mã họp ⇒ màn giải mã họp (không chuyển sang hội thoại)', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'abc-defg-hjk' });
    const screen = await render(<ShortLinkRoute />);

    expect(screen.getByText('Giải mã họp abc-defg-hjk')).toBeOnTheScreen();
    expect(Redirect).not.toHaveBeenCalled();
  });

  it('mã họp viết HOA/có khoảng trắng vẫn nhận ra (người dùng dán tay)', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: ' ABC-DEFG-HJK ' });
    const screen = await render(<ShortLinkRoute />);

    expect(screen.getByText('Giải mã họp abc-defg-hjk')).toBeOnTheScreen();
  });

  it('ObjectId hội thoại ⇒ giữ hành vi cũ: chuyển thẳng sang /messages/<id>', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: CONVERSATION_ID });
    await render(<ShortLinkRoute />);

    expect(Redirect).toHaveBeenCalledWith(
      { href: { pathname: '/messages/[conversationId]', params: { conversationId: CONVERSATION_ID } } },
      undefined,
    );
  });

  it('ký tự ngoài bảng mã họp (i, l, o) hoặc sai hình dạng ⇒ không phải mã họp, đi nhánh hội thoại', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'abi-defg-hij' });
    await render(<ShortLinkRoute />);

    expect(Redirect).toHaveBeenCalledWith(
      { href: { pathname: '/messages/[conversationId]', params: { conversationId: 'abi-defg-hij' } } },
      undefined,
    );
  });
});
