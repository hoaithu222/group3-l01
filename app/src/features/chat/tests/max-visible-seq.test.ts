import type { MessageView } from '../api/chat.types';
import type { ChatRow } from '../components/list/buildRows';
import { maxVisibleSeq } from '../components/list/max-visible-seq';

function bubble(seq: number): ChatRow {
  return {
    grouped: false,
    item: { kind: 'sent', message: { id: `m${String(seq)}`, seq } as MessageView },
    key: `m${String(seq)}`,
    type: 'bubble',
  };
}

describe('maxVisibleSeq — nguồn duy nhất của "đã đọc" (viewability)', () => {
  it('lấy seq lớn nhất trong các tin ĐÃ GỬI đang hiển thị', () => {
    expect(maxVisibleSeq([{ item: bubble(4) }, { item: bubble(9) }, { item: bubble(7) }])).toBe(9);
  });

  it('bỏ qua bản tạm (chưa có seq), dòng ngày, "Tin chưa đọc" và token trống', () => {
    const rows: { item: ChatRow | undefined }[] = [
      { item: { key: 'date-1', label: '2026-09-21', type: 'date' } },
      { item: { key: 'unread-divider', type: 'unread' } },
      {
        item: {
          grouped: false,
          item: { kind: 'pending', pending: {} as never },
          key: 'pending-1',
          type: 'bubble',
        },
      },
      { item: undefined },
    ];
    expect(maxVisibleSeq(rows)).toBe(0);
    expect(maxVisibleSeq([])).toBe(0);
  });
});
