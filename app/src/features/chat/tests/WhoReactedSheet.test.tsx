import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ReactorEntry } from '../api/chat.types';
import { WhoReactedSheet } from '../components/actions/WhoReactedSheet';

// `BottomSheet` đọc vùng an toàn (`SheetSurface`) và né bàn phím — cùng cách dựng với `forward-dm.test.tsx`.
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const AN: ReactorEntry = { createdAt: '2026-09-30T00:00:00.000Z', emoji: '🎉', userId: 'u-an' };

type Page = { cursor: string | null; data: ReactorEntry[] };

function reactors() {
  return jest.fn<Promise<Page>, [string, string?]>();
}

async function renderSheet(listReactors: ReturnType<typeof reactors>) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <WhoReactedSheet
        emoji="🎉"
        listReactors={listReactors}
        resolveAuthor={(userId) =>
          userId === 'u-an' ? { avatarUrl: null, name: 'An' } : undefined
        }
        visible
        onClose={jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

/** Các trạng thái của tấm "Đã thả …": có người · rỗng · lỗi trang đầu (kèm "Thử lại") — không còn tấm trắng trơn. */
describe('WhoReactedSheet', () => {
  it('liệt kê người đã thả, tên lấy từ danh bạ màn cha', async () => {
    const listReactors = reactors().mockResolvedValue({ cursor: null, data: [AN] });
    await renderSheet(listReactors);

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(listReactors).toHaveBeenCalledWith('🎉');
  });

  it('chưa có ai ⇒ trạng thái rỗng nói rõ', async () => {
    await renderSheet(reactors().mockResolvedValue({ cursor: null, data: [] }));

    expect(await screen.findByText('Chưa có ai thả cảm xúc này.')).toBeOnTheScreen();
  });

  it('lỗi trang đầu ⇒ báo lỗi + "Thử lại" tải lại đúng emoji', async () => {
    const listReactors = reactors()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ cursor: null, data: [AN] });
    await renderSheet(listReactors);

    expect(await screen.findByText('Không tải được danh sách')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(listReactors).toHaveBeenCalledTimes(2);
    expect(listReactors).toHaveBeenLastCalledWith('🎉');
  });
});
