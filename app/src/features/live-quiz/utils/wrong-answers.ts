import { choiceLabel } from './clock';
import type { StoredAnswer, StoredQuestion, StoredReveal } from '../store/live-quiz.store';

/** Một câu tôi làm sai (hoặc bỏ trống) — đủ chữ để đọc lại không cần mạng. */
export interface WrongAnswer {
  correctText: string;
  explanation: string | null;
  index: number;
  /** "B. Đáp án đã chọn" hoặc `null` khi không trả lời. */
  myText: string | null;
  prompt: string;
}

interface WrongAnswerSource {
  answers: Record<number, StoredAnswer>;
  questions: Record<number, StoredQuestion>;
  reveals: Record<number, StoredReveal>;
  sessionId: string | null;
}

const optionText = (question: StoredQuestion, choice: number): string =>
  `${choiceLabel(choice)}. ${question.options[choice] ?? ''}`;

/**
 * Các câu sai của phiên `sessionId` từ những gì máy này ĐÃ THẤY (app.md p5-01 §3 "Ôn lại câu sai"): có câu hỏi + đáp án
 * công bố, và lựa chọn của tôi khác đáp án đúng (không chọn = sai). Câu thiếu đáp án (không nhận được `quiz:reveal`) bị bỏ
 * chứ không đoán. Kết quả theo thứ tự câu.
 */
export function wrongAnswersOf(source: WrongAnswerSource, sessionId: string): WrongAnswer[] {
  if (source.sessionId !== sessionId) return [];
  return Object.keys(source.reveals)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const reveal = source.reveals[index];
      const question = source.questions[index];
      if (!reveal || !question || reveal.correct === null) return [];
      const mine = source.answers[index]?.choice;
      if (mine === reveal.correct) return [];
      return [
        {
          correctText: optionText(question, reveal.correct),
          explanation: reveal.explanation,
          index,
          myText: mine === undefined ? null : optionText(question, mine),
          prompt: question.prompt,
        },
      ];
    });
}
