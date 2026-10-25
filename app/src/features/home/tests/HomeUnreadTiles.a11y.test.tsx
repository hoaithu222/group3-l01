import { render, screen } from '@testing-library/react-native';

import { HomeUnreadTiles } from '../components/HomeUnreadTiles';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

/** `Skeleton` chạy hoạt ảnh lặp vô hạn — Jest không bao giờ kết thúc (xem `Skeleton.tsx`): thay bằng chữ để kiểm. */
jest.mock('@/shared/ui/skeleton', () => {
  const { Text } = jest.requireActual('react-native');
  return { Skeleton: () => <Text>khung xương</Text> };
});

/**
 * Con số chưa đọc đứng MỘT MÌNH trong ô trợ năng thì trình đọc màn hình đọc "ba" — không biết ba cái gì (tiêu đề của thẻ
 * là một ô khác). Nhãn phải nói đủ nghĩa: "3 hội thoại chưa đọc". Và "–" (chưa có số liệu) không được đọc thành "gạch ngang".
 */
describe('HomeUnreadTiles — nhãn đọc của con số', () => {
  it('số chưa đọc đọc kèm đơn vị', async () => {
    await render(
      <HomeUnreadTiles
        summary={{ activity: { unread: 7 }, conversations: { unreadConversations: 3 } }}
      />,
    );

    expect(screen.getByLabelText('3 hội thoại chưa đọc')).toBeOnTheScreen();
    expect(screen.getByLabelText('7 hoạt động chưa đọc')).toBeOnTheScreen();
  });

  it('chưa có số liệu ⇒ "Chưa có số …" chứ không bịa số 0 và không đọc "gạch ngang"', async () => {
    await render(<HomeUnreadTiles summary={undefined} />);

    expect(screen.getByLabelText('Chưa có số hội thoại chưa đọc')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chưa có số hoạt động chưa đọc')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^0 /)).not.toBeOnTheScreen();
  });
});
