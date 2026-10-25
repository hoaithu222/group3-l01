import { act, renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';

import { makeMessage } from '../cache/apply-socket-event.fixtures';
import type { ChatRow } from '../components/list/buildRows';
import { useJumpToMessage } from '../components/useJumpToMessage';

/**
 * Nhảy tới tin (thanh ghim, trích dẫn, `?m=`). Ca đáng chốt: tin CHƯA tải (tin ghim cũ) — `reanchor` chỉ đổi mốc tải, còn
 * `MessageList` bắt đầu ở ĐÁY lô `around` nên phải cuộn + tô nổi SAU khi hàng của tin xuất hiện; bản cũ dừng ở `reanchor`.
 */
const bubble = (id: string): ChatRow => ({ type: 'bubble', key: id, grouped: false, item: { kind: 'sent', message: makeMessage({ id }) } });

async function setup(initialRows: ChatRow[], initialMessageId?: string) {
  const scrollToItem = jest.fn();
  const listRef = { current: { scrollToItem } } as unknown as RefObject<never>;
  const reanchor = jest.fn();
  const hook = await renderHook(
    (props: { rows: ChatRow[] }) => useJumpToMessage({ rows: props.rows, listRef, reanchor, initialMessageId }),
    { initialProps: { rows: initialRows } },
  );
  return { ...hook, scrollToItem, reanchor };
}

/** Xả hẹn giờ "chờ bố cục ổn định" của `useOpenAtMessage` (200 ms) TRONG act. */
const settle = () => act(async () => jest.advanceTimersByTime(250));

describe('useJumpToMessage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tin ĐÃ có trong danh sách: cuộn giữa màn + tô nổi ngay, không mở lô around', async () => {
    const { result, scrollToItem, reanchor } = await setup([bubble('msg-1'), bubble('msg-2')]);

    await act(async () => result.current.jumpTo('msg-2'));

    expect(scrollToItem).toHaveBeenCalledWith(expect.objectContaining({ animated: true, viewPosition: 0.5 }));
    expect(reanchor).not.toHaveBeenCalled();
    expect(result.current.highlightId).toBe('msg-2');
    await act(async () => jest.advanceTimersByTime(2100));
    expect(result.current.highlightId).toBeUndefined();
  });

  it('tin CHƯA tải: mở lô around, rồi cuộn + tô nổi khi hàng của nó xuất hiện (không cuộn trước đó)', async () => {
    const { result, rerender, scrollToItem, reanchor } = await setup([bubble('msg-1')]);

    await act(async () => result.current.jumpTo('msg-cu'));
    expect(reanchor).toHaveBeenCalledWith('msg-cu');
    expect(scrollToItem).not.toHaveBeenCalled();

    // Lô around về: hàng của tin xuất hiện → chờ bố cục ổn định rồi mới cuộn.
    await rerender({ rows: [bubble('msg-cu'), bubble('msg-1')] });
    expect(scrollToItem).not.toHaveBeenCalled();
    await settle();
    expect(scrollToItem).toHaveBeenCalledTimes(1);
    expect(result.current.highlightId).toBe('msg-cu');
  });

  it('nhảy lại đúng tin đó sau khi đã rời lô around (về tin mới nhất) vẫn cuộn — mục tiêu cũ không chặn', async () => {
    const { result, rerender, scrollToItem, reanchor } = await setup([bubble('msg-1')]);

    await act(async () => result.current.jumpTo('msg-cu'));
    await rerender({ rows: [bubble('msg-cu')] });
    await settle();
    expect(scrollToItem).toHaveBeenCalledTimes(1);

    await rerender({ rows: [bubble('msg-1')] }); // về "mới nhất": msg-cu lại chưa tải
    await act(async () => result.current.jumpTo('msg-cu'));
    expect(reanchor).toHaveBeenCalledTimes(2);
    await rerender({ rows: [bubble('msg-cu')] });
    await settle();
    expect(scrollToItem).toHaveBeenCalledTimes(2);
  });

  it('`?m=` (initialMessageId) đã tải: tự cuộn tới đúng MỘT lần', async () => {
    const { scrollToItem } = await setup([bubble('msg-1'), bubble('msg-2')], 'msg-2');

    await settle();
    expect(scrollToItem).toHaveBeenCalledTimes(1);
    await settle();
    expect(scrollToItem).toHaveBeenCalledTimes(1);
  });
});
