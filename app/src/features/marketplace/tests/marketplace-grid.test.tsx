import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Listing } from '../api/marketplace.types';
import { ListingPreview } from '../components/ListingPreview';
import { MarketplaceGridRow } from '../components/MarketplaceGridRow';
import { chunkRows } from '../utils/grid-rows';
import { formatCoins, formatSales } from '../utils/listing-format';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    contentType: 'STUDY_SET',
    createdAt: '2026-09-01T00:00:00Z',
    description: null,
    hiddenReason: null,
    id: 'listing-1',
    price: 1250,
    reportCount: 0,
    sales: 12,
    sellerId: 'seller-1',
    sellerName: 'Nguyễn An',
    status: 'ACTIVE',
    tags: [],
    title: 'Từ vựng TOEIC 600',
    updatedAt: '2026-09-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

/**
 * Lưới chợ tài liệu: giá xu định dạng kiểu Việt (không `toLocaleString`), chia hàng hai ô, thẻ bấm được theo TIÊU ĐỀ, xem trước ghi rõ loại câu.
 */
describe('marketplace — định dạng và lưới', () => {
  it('xu dùng dấu chấm hàng nghìn + đơn vị "xu"; lượt mua là câu đủ nghĩa', () => {
    expect(formatCoins(1250)).toBe('1.250 xu');
    expect(formatSales(12)).toBe('12 lượt mua');
    expect(formatSales(0)).toBe('Chưa có lượt mua');
  });

  it('chia danh sách thành hàng hai ô, hàng cuối có thể thiếu', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 2)).toEqual([]);
  });

  it('thẻ hiện tiêu đề (vai nút) · người bán · giá · lượt mua; bấm mở đúng tin', async () => {
    const onOpen = jest.fn();
    const listing = makeListing();
    await render(<MarketplaceGridRow listings={[listing]} onOpen={onOpen} />);
    expect(screen.getByText('Nguyễn An')).toBeOnTheScreen();
    expect(screen.getByText('1.250 xu')).toBeOnTheScreen();
    expect(screen.getByText('12 lượt mua')).toBeOnTheScreen();
    expect(screen.getByText('Bộ học')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Từ vựng TOEIC 600' }));
    expect(onOpen).toHaveBeenCalledWith(listing);
  });

  it('xem trước bộ học: mỗi mục đọc liền "loại: câu hỏi"; tài liệu (RESOURCE) không vẽ gì', async () => {
    const view = await render(
      <ListingPreview contentType="STUDY_SET" preview={[{ prompt: 'Apple nghĩa là gì?', type: 'FLASHCARD' }]} />,
    );
    expect(screen.getByLabelText('Thẻ ghi nhớ: Apple nghĩa là gì?')).toBeOnTheScreen();
    expect(screen.getByText('Xem trước')).toBeOnTheScreen();
    await view.rerender(<ListingPreview contentType="RESOURCE" preview={null} />);
    expect(screen.queryByText('Xem trước')).toBeNull();
  });
});
