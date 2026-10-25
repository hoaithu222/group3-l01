import {
  componentRaw,
  formatDecimal,
  formatPoints,
  formatScore,
  formatShare,
  formatWeights,
  formulaChangeText,
  memberSpokenLabel,
  NO_DATA_LABEL,
  redistributionNote,
  weightsUsedText,
} from '../utils/contribution-format';
import { FORMULA, makeMember, makePointsOnlyMember, TZ } from './fixtures';

describe('số kiểu Việt Nam (dấu phẩy) — ⛔ không Intl/toLocaleString', () => {
  it('điểm 91 → "91,0", tỉ lệ 58.7 → "58,7%"', () => {
    expect(formatScore(91)).toBe('91,0');
    expect(formatShare(58.7)).toBe('58,7%');
    expect(formatDecimal(8)).toBe('8,0');
    expect(formatDecimal(7.25, 2)).toBe('7,25');
  });

  it('điểm thẻ bỏ số 0 thừa: 8 → "8", 2.5 → "2,5", 0.333 → "0,33"', () => {
    expect(formatPoints(8)).toBe('8');
    expect(formatPoints(2.5)).toBe('2,5');
    expect(formatPoints(0.333)).toBe('0,33');
  });

  it('trọng số "60 / 20 / 20"', () => {
    expect(formatWeights({ onTime: 20, peer: 20, points: 60 })).toBe('60 / 20 / 20');
  });
});

describe('componentRaw — số gốc đi cạnh phần trăm', () => {
  const member = makeMember();

  it('"8 điểm thẻ" · "3/4 đúng hạn" · "chấm 8,0 (5 lượt)"', () => {
    expect(componentRaw('points', member)).toBe('8 điểm thẻ');
    expect(componentRaw('onTime', member)).toBe('3/4 đúng hạn');
    expect(componentRaw('peer', member)).toBe('chấm 8,0 (5 lượt)');
  });

  it('thành phần null → "Chưa có dữ liệu", KHÔNG bao giờ là 0', () => {
    const noData = makePointsOnlyMember();

    expect(componentRaw('onTime', noData)).toBe(NO_DATA_LABEL);
    expect(componentRaw('peer', noData)).toBe(NO_DATA_LABEL);
    expect(componentRaw('points', noData)).toBe('4 điểm thẻ');
  });
});

describe('redistributionNote — câu chia lại trọng số', () => {
  const weights = { onTime: 20, peer: 20, points: 60 };

  it('đủ ba thành phần → không có câu nào', () => {
    expect(redistributionNote(makeMember(), weights)).toBeNull();
  });

  it('thiếu MỘT thành phần → "20 % đúng hạn được chia lại cho hai thành phần còn lại"', () => {
    const member = makeMember({ components: { onTime: null, peer: 0.8, points: 1 } });

    expect(redistributionNote(member, weights)).toBe('20 % đúng hạn được chia lại cho hai thành phần còn lại');
  });

  it('thiếu HAI thành phần → nêu cả hai, chia lại cho thành phần còn lại', () => {
    expect(redistributionNote(makePointsOnlyMember(), weights)).toBe(
      '20 % đúng hạn và 20 % điểm chấm được chia lại cho thành phần còn lại',
    );
  });

  it('không có thành phần nào → "Chưa có dữ liệu nào để tính điểm."', () => {
    const empty = makeMember({ components: { onTime: null, peer: null, points: null } });

    expect(redistributionNote(empty, weights)).toBe('Chưa có dữ liệu nào để tính điểm.');
  });

  it('trọng số THẬT SỰ áp dụng chỉ liệt kê thành phần có dữ liệu ("điểm thẻ 100")', () => {
    expect(weightsUsedText(makePointsOnlyMember())).toBe('điểm thẻ 100');
    expect(weightsUsedText(makeMember())).toBe('điểm thẻ 60 · đúng hạn 20 · điểm chấm 20');
  });
});

describe('nhãn trợ năng và dòng minh bạch', () => {
  it('nhãn hàng đọc đủ điểm, tỉ lệ nhóm và số gốc từng thành phần', () => {
    expect(memberSpokenLabel(makeMember())).toBe(
      'Nguyễn Văn A, 91,0 điểm, 58,7% của nhóm. Điểm thẻ: 8 điểm thẻ. Đúng hạn: 3/4 đúng hạn. Điểm chấm: chấm 8,0 (5 lượt)',
    );
  });

  it('"Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60/20/20)" — giờ theo múi giờ của nhóm', () => {
    const changed = {
      ...FORMULA,
      changedAt: '2026-09-15T03:32:00.000Z',
      changedBy: { id: 'u1', name: 'Minh' },
      previousWeights: { onTime: 20, peer: 20, points: 60 },
      weights: { onTime: 30, peer: 20, points: 50 },
    };

    expect(formulaChangeText(changed, TZ)).toBe('Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60 / 20 / 20)');
  });

  it('công thức chưa từng đổi → không có dòng "đổi lúc"', () => {
    expect(formulaChangeText(FORMULA, TZ)).toBeNull();
  });
});
