import { fireEvent, screen } from '@testing-library/react-native';

import { accessibleGroupsHidingButtons } from '../../../../tests/helpers/a11y-groups';
import { SavedItemRow } from '../components/SavedItemRow';
import { makeSavedItem, makeUnavailable, renderWithProviders } from './fixtures';

/**
 * Mục "Đã lưu" KHÔNG khả dụng (tin bị thu hồi / mất quyền): thẻ mờ + đúng một nút "Bỏ lưu".
 *
 * Trước đây khối gốc là `View accessible` ⇒ nút "Bỏ lưu" nằm BÊN TRONG một ô trợ năng và không tới được bằng trình đọc
 * màn hình — người dùng khiếm thị không có cách nào gỡ một mục đã hỏng khỏi danh sách.
 */
describe('SavedItemRow — mục không khả dụng', () => {
  it('nút "Bỏ lưu" không bị nuốt vào ô `accessible` bao ngoài', async () => {
    const view = await renderWithProviders(
      <SavedItemRow item={makeUnavailable()} unsaving={false} onOpen={jest.fn()} onUnsave={jest.fn()} />,
    );

    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual([]);
  });

  it('bấm "Bỏ lưu" gọi onUnsave với đúng mục; khối chữ vẫn có nhãn mô tả', async () => {
    const item = makeUnavailable('msg-1');
    const onUnsave = jest.fn();
    await renderWithProviders(
      <SavedItemRow item={item} unsaving={false} onOpen={jest.fn()} onUnsave={onUnsave} />,
    );

    expect(screen.getByLabelText(/^Tin nhắn không còn khả dụng\. Đã lưu/)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Bỏ lưu tin nhắn không còn khả dụng' }),
    );

    expect(onUnsave).toHaveBeenCalledWith(item);
  });

  it('mục khả dụng: hai nút (mở tin, bỏ lưu) đều là ô rời', async () => {
    const view = await renderWithProviders(
      <SavedItemRow item={makeSavedItem()} unsaving={false} onOpen={jest.fn()} onUnsave={jest.fn()} />,
    );

    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual([]);
    expect(screen.getByRole('button', { name: 'Bỏ lưu tin nhắn' })).toBeOnTheScreen();
  });
});
