import { ANSWER_IDENTITIES } from '../constants/live-quiz-visuals';
import {
  answerColumns,
  answerLook,
  chunkRows,
  LONG_ANSWER_CHARS,
  MAX_ROW_TILES,
  ROW_ANSWER_CHARS,
} from '../utils/answer-identity';

/**
 * Bộ nhận diện đáp án: chữ cái + hình khối + màu đi CÙNG chỉ số (màu không phải kênh duy nhất — người mù màu vẫn phân biệt
 * được), và cách xếp lưới theo nội dung.
 */

describe('answerLook', () => {
  it('A–D đều có chữ cái, hình khối và màu RIÊNG (không ô nào trùng ô nào ở bất kỳ kênh nào)', () => {
    const looks = [0, 1, 2, 3].map(answerLook);

    expect(looks.map((look) => look.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(looks.map((look) => look.shape)).size).toBe(4);
    expect(new Set(looks.map((look) => look.fill)).size).toBe(4);
  });

  it('cả 6 lựa chọn (BE cho tối đa 6) đều có hình khối khác nhau', () => {
    const shapes = ANSWER_IDENTITIES.map((identity) => identity.shape);

    expect(shapes).toHaveLength(6);
    expect(new Set(shapes).size).toBe(6);
  });

  it('⛔ A–D không dùng xanh lá/đỏ — hai màu dành cho ĐÚNG/SAI ở màn công bố', () => {
    const fills = [0, 1, 2, 3].map((index) => answerLook(index).fill).join(' ');

    expect(fills).not.toMatch(/success|error/);
  });

  it('chữ trên nền là `*-fg` CÙNG CẶP (ghép chéo là mất phần tương phản đã đo)', () => {
    for (const identity of ANSWER_IDENTITIES) {
      // Họ màu = mẩu cuối của `bg-action-<họ>` (thương hiệu là `base` nhưng chữ đi cùng là `action-fg` trơn).
      const family = identity.fill.split('-').at(-1);
      expect(identity.ink).toBe(
        family === 'base' ? 'text-action-fg' : `text-action-${String(family)}-fg`,
      );
    }
  });

  it('quá 6 lựa chọn ⇒ xoay vòng, không bao giờ `undefined`', () => {
    expect(answerLook(6).shape).toBe(answerLook(0).shape);
    expect(answerLook(6).letter).toBe('7');
  });
});

describe('answerColumns', () => {
  const short = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'];

  it('điện thoại: bốn đáp án ngắn ⇒ lưới 2 cột (2×2)', () => {
    expect(answerColumns(short, false)).toBe(2);
  });

  it('có đáp án dài ⇒ MỘT cột, dù máy rộng', () => {
    const long = [...short, 'x'.repeat(LONG_ANSWER_CHARS + 1)];

    expect(answerColumns(long, false)).toBe(1);
    expect(answerColumns(long, true)).toBe(1);
  });

  it('máy tính bảng rộng + đáp án ngắn ⇒ một HÀNG (số cột = số đáp án)', () => {
    expect(answerColumns(short, true)).toBe(4);
    expect(answerColumns(['Đúng', 'Sai'], true)).toBe(2);
  });

  it('máy rộng nhưng đáp án vừa dài, hoặc nhiều hơn 4 lựa chọn ⇒ quay về 2 cột', () => {
    expect(answerColumns(['x'.repeat(ROW_ANSWER_CHARS + 1), 'ngắn'], true)).toBe(2);
    expect(
      answerColumns(
        Array.from({ length: MAX_ROW_TILES + 1 }, () => 'a'),
        true,
      ),
    ).toBe(2);
  });

  it('một đáp án ⇒ một cột', () => {
    expect(answerColumns(['Duy nhất'], true)).toBe(1);
  });
});

describe('chunkRows', () => {
  it('cắt theo số cột; hàng cuối có thể ngắn hơn (ô lẻ được kéo giãn ở giao diện)', () => {
    expect(chunkRows([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunkRows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunkRows([1, 2, 3, 4], 4)).toEqual([[1, 2, 3, 4]]);
  });

  it('số cột không hợp lệ (0, âm) ⇒ ít nhất một cột, không lặp vô hạn', () => {
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunkRows([], 2)).toEqual([]);
  });
});
