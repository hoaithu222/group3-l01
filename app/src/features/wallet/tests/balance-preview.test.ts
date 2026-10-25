import { MEMBER_BALANCE_PREVIEW, previewBalances } from '../domain/balance-preview';

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ userId: `u${i}` }));

describe('previewBalances — chặn số dòng "Số dư thành viên"', () => {
  it(`nhóm nhỏ (≤ ${MEMBER_BALANCE_PREVIEW + 1} người) ⇒ hiện đủ, không giấu ai`, () => {
    expect(previewBalances(rows(3), 'u0', false)).toEqual({ hidden: 0, rows: rows(3) });
    // 6 người: giấu đúng 1 rồi bắt bấm "Xem thêm 1 người" là tệ hơn cứ hiện.
    expect(previewBalances(rows(6), 'u0', false).hidden).toBe(0);
  });

  it('nhóm đông ⇒ chỉ top N, phần còn lại đếm ở `hidden`', () => {
    const shown = previewBalances(rows(12), 'u0', false);

    expect(shown.rows.map((r) => r.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
    expect(shown.hidden).toBe(7);
  });

  it('dòng của TÔI luôn có mặt dù nằm ngoài top', () => {
    const shown = previewBalances(rows(12), 'u9', false);

    expect(shown.rows.map((r) => r.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u9']);
    expect(shown.hidden).toBe(6);
  });

  it('bung ra ⇒ hiện đủ mọi người', () => {
    expect(previewBalances(rows(12), 'u9', true)).toEqual({ hidden: 0, rows: rows(12) });
  });

  it('chưa biết tôi là ai (meId undefined) ⇒ vẫn chặn theo top N', () => {
    expect(previewBalances(rows(10), undefined, false).rows).toHaveLength(MEMBER_BALANCE_PREVIEW);
  });
});
