import { renderHook } from '@testing-library/react-native';

import { conversationsService } from '../api/conversations.service';
import { useConversationForwardTargets } from '../hooks/useConversationForwardTargets';

jest.mock('../api/conversations.service', () => ({ conversationsService: { list: jest.fn() } }));
const mockedList = jest.mocked(conversationsService.list);

const PAGE = {
  data: [
    {
      id: 'c-1',
      kind: 'GROUP',
      status: 'ACTIVE',
      title: 'Nhóm A',
      peer: null,
      readOnly: false,
    },
  ],
  meta: { nextCursor: null, hasMore: false, limit: 20 },
} as unknown as Awaited<ReturnType<typeof conversationsService.list>>;

describe('useConversationForwardTargets', () => {
  beforeEach(() => mockedList.mockReset());

  it('q rỗng ⇒ BỎ tham số q (BE `q` min(1) — gửi chuỗi rỗng là 400), chỉ lấy NHÓM (đích người do ForwardSheet tự tìm)', async () => {
    mockedList.mockResolvedValue(PAGE);
    const { result } = await renderHook(() => useConversationForwardTargets());

    const targets = await result.current('   ');

    expect(mockedList).toHaveBeenCalledWith({ filter: 'group', q: undefined, limit: 20 });
    expect(targets).toEqual([{ scopeType: 'CONVERSATION', scopeId: 'c-1', label: 'Nhóm A' }]);
  });

  it('có q ⇒ tìm phía server với q đã trim', async () => {
    mockedList.mockResolvedValue(PAGE);
    const { result } = await renderHook(() => useConversationForwardTargets());

    await result.current('  do an ');

    expect(mockedList).toHaveBeenCalledWith({ filter: 'group', q: 'do an', limit: 20 });
  });

  it('callback ỔN ĐỊNH qua các lần render — ForwardSheet chạy lại effect theo tham chiếu, đổi là bắn request lại', async () => {
    const { result, rerender } = await renderHook(() => useConversationForwardTargets());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
