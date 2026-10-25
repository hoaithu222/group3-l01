import { armedStep, edgeScrollStep } from '../components/kanban/drag/auto-scroll';
import { isSamePlace } from '../components/kanban/drag/drop-target';

describe('isSamePlace', () => {
  it('thả về đúng khe cũ trong cùng cột ⇒ true (không gọi server)', () => {
    const target = { afterTaskId: 'a', beforeTaskId: 'c', columnId: 'c1', index: 1 };
    expect(isSamePlace('c1', ['a', 'b', 'c'], 'b', target)).toBe(true);
  });

  it('khác khe hoặc khác cột ⇒ false', () => {
    const target = { afterTaskId: 'b', beforeTaskId: null, columnId: 'c1', index: 2 };
    expect(isSamePlace('c1', ['a', 'b', 'c'], 'a', target)).toBe(false);
    expect(isSamePlace('c0', ['a', 'b', 'c'], 'b', { ...target, index: 1 })).toBe(false);
  });
});

describe('edgeScrollStep', () => {
  it('giữa vùng ⇒ 0', () => {
    expect(edgeScrollStep(300, 0, 600, 56, 14)).toBe(0);
  });

  it('sát mép trên ⇒ âm, càng sát càng nhanh, chặn ở maxStep', () => {
    expect(edgeScrollStep(28, 0, 600, 56, 14)).toBe(-7);
    expect(edgeScrollStep(0, 0, 600, 56, 14)).toBe(-14);
    expect(edgeScrollStep(-200, 0, 600, 56, 14)).toBe(-14);
  });

  it('sát mép dưới ⇒ dương', () => {
    expect(edgeScrollStep(572, 0, 600, 56, 14)).toBe(7);
    expect(edgeScrollStep(9999, 0, 600, 56, 14)).toBe(14);
  });

  it('vùng suy biến (edge ≤ 0 hoặc max ≤ min) ⇒ 0, không NaN', () => {
    expect(edgeScrollStep(0, 0, 600, 0, 14)).toBe(0);
    expect(edgeScrollStep(0, 100, 100, 56, 14)).toBe(0);
  });
});

describe('armedStep — mép chỉ tự cuộn khi ngón tay đã dịch VỀ PHÍA nó từ điểm nhấc', () => {
  // Điện thoại 375 dp: mép trái thẻ ở x = 24, vùng mép trái là x < 56.
  const leftStep = edgeScrollStep(30, 0, 375, 56, 14);

  it('nhấc thẻ nằm SẴN trong vùng mép, ngón tay đứng yên ⇒ không cuộn', () => {
    expect(leftStep).toBeLessThan(0);
    expect(armedStep(leftStep, 0, 16)).toBe(0);
    expect(armedStep(leftStep, -10, 16)).toBe(0);
  });

  it('kéo về phía mép đủ xa ⇒ cuộn đúng như `edgeScrollStep`', () => {
    expect(armedStep(leftStep, -16, 16)).toBe(leftStep);
    expect(armedStep(14, 40, 16)).toBe(14);
  });

  it('đang ở vùng mép trái nhưng kéo sang PHẢI ⇒ không lật về cột trước', () => {
    expect(armedStep(leftStep, 20, 16)).toBe(0);
    expect(armedStep(9, -30, 16)).toBe(0);
  });

  it('giữa vùng (step 0) ⇒ 0', () => {
    expect(armedStep(0, 100, 16)).toBe(0);
  });
});
