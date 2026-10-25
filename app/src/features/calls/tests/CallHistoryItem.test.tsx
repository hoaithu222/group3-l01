import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CallHistoryItem as HistoryItem } from '../api/calls.types';
import { CallHistoryItem } from '../components/CallHistoryItem';

/**
 * Một dòng lịch sử cuộc gọi: cuộc gọi NHÓM hiện hàng avatar người tham gia (dữ liệu `participantsPreview` đã có sẵn trong dòng,
 * trước đây không vẽ); cuộc gọi 1-1 thì không (avatar của dòng đã là người kia). Chỉ kiểm HÀNH VI/nhãn — style không có trong Jest.
 */
const PEOPLE = [
  { avatarUrl: null, id: 'u-1', name: 'An' },
  { avatarUrl: null, id: 'u-2', name: 'Bình' },
  { avatarUrl: null, id: 'u-3', name: 'Chi' },
];

function makeItem(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    callId: 'call-1',
    direction: 'INCOMING',
    durationSec: 65,
    mediaKind: 'AUDIO',
    mode: 'RING',
    outcome: 'COMPLETED',
    participantsPreview: PEOPLE,
    scope: { avatarUrl: null, kind: 'GROUP', title: 'Đồ án' },
    scopeId: 'c-1',
    scopeType: 'CONVERSATION',
    startedAt: '2026-09-20T08:00:00.000Z',
    ...over,
  };
}

describe('CallHistoryItem', () => {
  it('cuộc gọi nhóm: có hàng avatar người tham gia (đọc thành một câu tên)', async () => {
    await render(<CallHistoryItem item={makeItem()} onCallBack={jest.fn()} onOpen={jest.fn()} />);

    expect(screen.getByLabelText('An, Bình và Chi')).toBeOnTheScreen();
  });

  it('cuộc gọi 1-1: KHÔNG vẽ hàng avatar người tham gia', async () => {
    const item = makeItem({ scope: { avatarUrl: null, kind: 'DIRECT', title: 'An' } });
    await render(<CallHistoryItem item={item} onCallBack={jest.fn()} onOpen={jest.fn()} />);

    expect(screen.queryByLabelText('An, Bình và Chi')).toBeNull();
  });

  it('nhỡ: kết quả nói bằng CHỮ; chạm dòng mở hội thoại, nút bên phải gọi lại', async () => {
    const onOpen = jest.fn();
    const onCallBack = jest.fn();
    const item = makeItem({ outcome: 'MISSED' });
    await render(<CallHistoryItem item={item} onCallBack={onCallBack} onOpen={onOpen} />);

    expect(screen.getByText('Cuộc gọi nhỡ')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Đồ án\. Cuộc gọi nhỡ/ }));
    await fireEvent.press(screen.getByLabelText('Gọi lại Đồ án'));
    expect(onOpen).toHaveBeenCalledWith(item);
    expect(onCallBack).toHaveBeenCalledWith(item);
  });
});
