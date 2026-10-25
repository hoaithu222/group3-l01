import { ANSWER_IDENTITIES, type AnswerIdentity } from '../constants/live-quiz-visuals';
import { choiceLabel } from './clock';

export interface AnswerLook extends AnswerIdentity {
  /** A, B, C… — kênh nhận biết thứ nhất (chữ), độc lập với màu. */
  letter: string;
}

/**
 * Bộ nhận diện của đáp án thứ `index`: chữ cái + hình khối + màu. Quá 6 lựa chọn thì xoay vòng (BE giới hạn tối đa 6,
 * nên nhánh này chỉ để không bao giờ trả `undefined`). Chữ cái và hình khối LUÔN đi cùng chỉ số ⇒ "ô hình thoi" là B ở
 * mọi màn (chọn, chờ, công bố), người mù màu vẫn dò lại được đáp án mình vừa chọn.
 */
export function answerLook(index: number): AnswerLook {
  const identity = ANSWER_IDENTITIES[index % ANSWER_IDENTITIES.length] ?? ANSWER_IDENTITIES[0];
  return { ...identity, letter: choiceLabel(index) };
}

/** Đáp án dài hơn ngần này ký tự ⇒ xếp MỘT cột (ô hẹp sẽ ngắt thành 5–6 dòng, khó đọc). */
export const LONG_ANSWER_CHARS = 48;
/** Đáp án ngắn hơn ngần này ký tự và máy tính bảng rộng ⇒ xếp cả bộ thành MỘT hàng. */
export const ROW_ANSWER_CHARS = 28;
/** Số lựa chọn tối đa còn xếp được thành một hàng — nhiều hơn thì mỗi ô quá hẹp. */
export const MAX_ROW_TILES = 4;

/**
 * Số cột của lưới đáp án. Điện thoại: 2 cột (2×2), trừ khi có đáp án dài ⇒ 1 cột. Máy tính bảng RỘNG (`roomy`) với đáp án
 * ngắn ⇒ một hàng ngang. Tính từ nội dung chứ không từ bề rộng cứng: cùng bộ câu hỏi, câu ngắn ra lưới, câu dài ra danh sách.
 */
export function answerColumns(texts: readonly string[], roomy: boolean): number {
  if (texts.length <= 1) return 1;
  const longest = texts.reduce((max, text) => Math.max(max, text.length), 0);
  if (longest > LONG_ANSWER_CHARS) return 1;
  if (roomy && texts.length <= MAX_ROW_TILES && longest <= ROW_ANSWER_CHARS) return texts.length;
  return 2;
}

/** Cắt danh sách thành các hàng `columns` phần tử; hàng cuối có thể ngắn hơn (ô lẻ được kéo giãn cho đủ hàng). */
export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    rows.push(items.slice(start, start + size));
  return rows;
}
