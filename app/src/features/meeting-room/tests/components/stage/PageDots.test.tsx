import { render, screen } from '@testing-library/react-native';

import { PageDots } from '../../../components/stage/PageDots';

/** Chỉ báo trang (app.md §3.2 `PageDots`): một trang thì không vẽ; nhiều trang thì có CHỮ "Trang 2/3" và nhãn trợ năng "Trang 2 trên 3". */
describe('PageDots', () => {
  it.each([0, 1])('%i trang → không vẽ gì (một chấm đơn độc trông như lỗi)', async (count) => {
    const view = await render(<PageDots activeIndex={0} count={count} />);

    expect(view.toJSON()).toBeNull();
  });

  it('nhiều trang → chữ "Trang 2/3" và một ô trợ năng "Trang 2 trên 3"', async () => {
    await render(<PageDots activeIndex={1} count={3} />);

    expect(screen.getByText('Trang 2/3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Trang 2 trên 3')).toBeOnTheScreen();
  });

  it('trang ngoài khoảng bị kẹp về trang đầu/cuối (số trang giảm giữa lúc đang xem)', async () => {
    const high = await render(<PageDots activeIndex={9} count={3} />);
    expect(screen.getByText('Trang 3/3')).toBeOnTheScreen();
    await high.unmount();

    await render(<PageDots activeIndex={-4} count={3} />);
    expect(screen.getByText('Trang 1/3')).toBeOnTheScreen();
  });
});
