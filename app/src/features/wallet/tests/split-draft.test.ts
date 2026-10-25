import {
  createSplitDraft,
  distributeEvenly,
  draftFromParticipants,
  draftToParticipants,
  evenPercent,
  toggleParticipant,
} from '../domain/split-draft';

describe('SplitDraft', () => {
  it('EQUAL KHÔNG kèm amount/bps (BE `refineSplitShape` từ chối), CUSTOM/PERCENT kèm đủ mọi người', () => {
    const draft = {
      ...createSplitDraft(['A', 'B']),
      custom: { A: 10, B: null },
      percent: { A: 6000, B: 4000 },
    };
    expect(draftToParticipants({ ...draft, splitType: 'EQUAL' })).toEqual([
      { userId: 'A' },
      { userId: 'B' },
    ]);
    // ô trống (null) đi ra là 0 — tổng sai sẽ do `previewSplit` báo trước khi tới BE
    expect(draftToParticipants({ ...draft, splitType: 'CUSTOM' })).toEqual([
      { amount: 10, userId: 'A' },
      { amount: 0, userId: 'B' },
    ]);
    expect(draftToParticipants({ ...draft, splitType: 'PERCENT' })).toEqual([
      { bps: 6000, userId: 'A' },
      { bps: 4000, userId: 'B' },
    ]);
  });

  it('bỏ chọn một người thì số đã gõ của họ KHÔNG đi vào payload', () => {
    const draft = toggleParticipant(
      { ...createSplitDraft(['A', 'B']), custom: { A: 1, B: 2 }, splitType: 'CUSTOM' },
      'B',
    );
    expect(draftToParticipants(draft)).toEqual([{ amount: 1, userId: 'A' }]);
  });

  it('"Chia đều" luôn cho TỔNG đúng: dư rải +1 từ đầu danh sách', () => {
    expect(distributeEvenly(100, ['A', 'B', 'C'])).toEqual({ A: 34, B: 33, C: 33 });
    expect(Object.values(evenPercent(['A', 'B', 'C'])).reduce((sum, bps) => sum + bps, 0)).toBe(
      10000,
    );
    expect(distributeEvenly(5, [])).toEqual({});
  });

  it('dựng lại nháp từ khoản chi có sẵn (màn Sửa/Điều chỉnh)', () => {
    const draft = draftFromParticipants('CUSTOM', [
      { amount: 60000, bps: null, userId: 'B' },
      { amount: 30000, bps: null, userId: 'A' },
    ]);
    expect(draft.selected).toEqual(['B', 'A']);
    expect(draft.custom).toEqual({ A: 30000, B: 60000 });
  });
});
