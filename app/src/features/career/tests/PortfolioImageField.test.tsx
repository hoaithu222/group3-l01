import { fireEvent, screen } from '@testing-library/react-native';

import { pickImages } from '@/core/media/pick-media';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { PickedFile, UploadItem } from '@/core/uploads/upload.types';

import { PortfolioImageField } from '../components/portfolio/PortfolioImageField';
import { renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §6: ảnh đại diện riêng / ảnh bìa dự án — chọn từ thư viện → tải lên (`useUpload('AVATAR')`) → ghi `assetId` vào form CHA (chưa lưu gì); ảnh vừa chọn hiện ngay từ URI cục bộ; tải hỏng có
 * "Thử lại"; "Dùng ảnh tài khoản" gỡ ảnh và KHÔNG để asset cũ trong hàng đợi ghi lại vào form.
 */
const mockUpload = { enqueue: jest.fn(), items: [] as UploadItem[], retry: jest.fn() };
jest.mock('@/core/media/pick-media', () => ({ pickImages: jest.fn() }));
jest.mock('@/core/uploads/use-upload', () => ({ useUpload: () => mockUpload }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: (id?: string) => ({ data: id ? { url: `https://cdn/${id}.webp` } : undefined }),
}));

const FILE: PickedFile = {
  kind: 'IMAGE',
  mime: 'image/jpeg',
  name: 'anh.jpg',
  size: 1000,
  uri: 'file:///anh.jpg',
};
const item = (over: Partial<UploadItem>): UploadItem => ({
  kind: 'IMAGE',
  localId: 'up-1',
  mime: 'image/jpeg',
  name: 'anh.jpg',
  progress: 0,
  scope: 'AVATAR',
  size: 1000,
  status: 'queued',
  uri: 'file:///anh.jpg',
  ...over,
});
const onChange = jest.fn();

const field = (assetId: string | null) => (
  <PortfolioImageField
    assetId={assetId}
    clearLabel="Dùng ảnh tài khoản"
    hint="Gợi ý"
    label="Ảnh đại diện"
    variant="avatar"
    onChange={onChange}
  />
);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.items = [];
  useUploadStore.getState().clear();
});

describe('PortfolioImageField', () => {
  it('chọn ảnh ⇒ mở thư viện MỘT ảnh và xếp vào hàng đợi tải lên; chưa gọi onChange', async () => {
    (pickImages as jest.Mock).mockResolvedValue([FILE]);
    await renderPortfolio(field(null));
    expect(screen.queryByRole('button', { name: 'Dùng ảnh tài khoản' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Chọn ảnh' }));
    expect(pickImages).toHaveBeenCalledWith({ allowsMultipleSelection: false, selectionLimit: 1 });
    expect(mockUpload.enqueue).toHaveBeenCalledWith([FILE]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tải xong (ready + assetId) ⇒ ghi assetId vào form cha; nút đổi thành "Đổi ảnh"', async () => {
    mockUpload.items = [item({ assetId: 'as-1', status: 'ready' })];
    await renderPortfolio(field(null));
    expect(onChange).toHaveBeenCalledWith('as-1');
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeOnTheScreen();
  });

  it('đang tải ⇒ nút hiện trạng thái BẬN và không cho gỡ ảnh', async () => {
    mockUpload.items = [item({ status: 'uploading' })];
    await renderPortfolio(field(null));
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Dùng ảnh tài khoản' })).toBeDisabled();
  });

  it('đã có assetId khớp với mục đã tải xong ⇒ KHÔNG báo lại (tránh vòng ghi lặp mỗi lần vẽ)', async () => {
    mockUpload.items = [item({ assetId: 'as-1', status: 'ready' })];
    await renderPortfolio(field('as-1'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tải hỏng ⇒ Alert + "Thử lại" gọi retry đúng mục', async () => {
    mockUpload.items = [item({ status: 'failed' })];
    await renderPortfolio(field(null));
    expect(screen.getByText('Tải ảnh lên chưa thành công.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mockUpload.retry).toHaveBeenCalledWith('up-1');
  });

  it('"Dùng ảnh tài khoản" ⇒ onChange(null) và GỠ mục khỏi hàng đợi cục bộ (không huỷ asset trên server)', async () => {
    useUploadStore.getState().addItem(item({ assetId: 'as-1', status: 'ready' }));
    mockUpload.items = [item({ assetId: 'as-1', status: 'ready' })];
    await renderPortfolio(field('as-1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dùng ảnh tài khoản' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(useUploadStore.getState().items['up-1']).toBeUndefined();
  });

  it('ảnh đã lưu ở server ⇒ hiện nút gỡ và "Đổi ảnh"', async () => {
    await renderPortfolio(field('as-9'));
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dùng ảnh tài khoản' })).toBeOnTheScreen();
  });
});
