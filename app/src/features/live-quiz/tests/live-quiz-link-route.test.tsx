import { render } from '@testing-library/react-native';

import LiveQuizLinkRoute from '../../../../app/live/[pin]';

/**
 * p5-01 app.md §1: `superapp://live/{pin}` → route `app/live/[pin].tsx` chỉ CHUYỂN TIẾP sang `/study/live/join?pin=`
 * (cùng mẫu `app/s/[setId].tsx`). Mã hỏng vẫn vào màn tham gia (điền phần chữ số), không rơi vào 404.
 */

const mockParams: { current: { pin?: string } } = { current: {} };
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: unknown }) => {
    mockRedirect(props.href);
    return null;
  },
  useLocalSearchParams: () => mockParams.current,
}));

beforeEach(() => jest.clearAllMocks());

it('PIN hợp lệ ⇒ Redirect tới màn tham gia kèm ?pin', async () => {
  mockParams.current = { pin: '123456' };
  await render(<LiveQuizLinkRoute />);

  expect(mockRedirect).toHaveBeenCalledWith({
    params: { pin: '123456' },
    pathname: '/study/live/join',
  });
});

it('PIN lẫn ký tự lạ ⇒ chỉ giữ chữ số', async () => {
  mockParams.current = { pin: '12ab3456' };
  await render(<LiveQuizLinkRoute />);

  expect(mockRedirect).toHaveBeenCalledWith({
    params: { pin: '123456' },
    pathname: '/study/live/join',
  });
});

it('PIN rỗng ⇒ vào màn tham gia không tham số', async () => {
  mockParams.current = { pin: 'abc' };
  await render(<LiveQuizLinkRoute />);

  expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/study/live/join' });
});
