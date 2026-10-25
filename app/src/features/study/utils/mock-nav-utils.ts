import type { MockAnswerInput, MockQuestionPublic } from '../api/mock-attempts.types';

/** Trạng thái làm bài của MỘT ô trên lưới: đã trả lời hay còn bỏ trống. "Đang xem" và "đánh dấu" là hai trục riêng. */
export type NavCellState = 'answered' | 'blank';

export function navCellState(done: boolean): NavCellState {
  return done ? 'answered' : 'blank';
}

/**
 * Nhãn trợ năng của một ô: "Câu 7, đã trả lời, đánh dấu xem lại, chưa đồng bộ". Trạng thái "đang xem" đi qua
 * `accessibilityState.selected` chứ không nằm trong nhãn — nhãn phải giữ nguyên qua từng lần chuyển câu để trình đọc
 * màn hình không xướng lại một chuỗi khác cho cùng một ô.
 */
export function describeNavCell(
  number: number,
  info: { done: boolean; flagged: boolean; pending: boolean },
): string {
  return [
    `Câu ${number}`,
    info.done ? 'đã trả lời' : 'chưa trả lời',
    info.flagged ? 'đánh dấu xem lại' : null,
    info.pending ? 'chưa đồng bộ' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export interface NavSummary {
  answered: number;
  blank: number;
  flagged: number;
  pending: number;
}

/** Tổng hợp cho chú giải lưới + thanh tiến độ. Đếm theo ĐỀ (không theo đáp án lẻ loi ngoài đề). */
export function navSummary(
  questions: readonly Pick<MockQuestionPublic, 'itemId'>[],
  answered: ReadonlySet<string>,
  flagged: ReadonlySet<string> | undefined,
  pending: ReadonlySet<string> | undefined,
): NavSummary {
  let done = 0;
  let flags = 0;
  let waiting = 0;
  for (const q of questions) {
    if (answered.has(q.itemId)) done += 1;
    if (flagged?.has(q.itemId)) flags += 1;
    if (pending?.has(q.itemId)) waiting += 1;
  }
  return { answered: done, blank: questions.length - done, flagged: flags, pending: waiting };
}

/** Số đáp án đã chọn của một câu nhiều lựa chọn — hiện cạnh gợi ý "Chọn tất cả đáp án đúng". */
export function selectedCount(answer: MockAnswerInput | undefined): number {
  return answer?.optionIds?.length ?? 0;
}

/** Dòng mô tả của hộp thoại "Nộp bài?": còn bao nhiêu câu bỏ trống, và (nếu có) bao nhiêu câu còn đánh dấu xem lại. */
export function describeSubmit(unanswered: number, flagged: number): string {
  const base =
    unanswered > 0 ? `Còn ${unanswered} câu chưa trả lời.` : 'Bạn đã trả lời hết các câu.';
  return flagged > 0 ? `${base} Có ${flagged} câu đang đánh dấu xem lại.` : base;
}
