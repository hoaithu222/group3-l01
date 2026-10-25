import type { StudyLimits } from '../constants/study.constants';
import type { DraftItem } from './editor-draft';

export interface ItemProblem {
  /** Đường dẫn trường (`prompt`, `answerText`, `options`, `options.2.text`, `correct`, `acceptedAnswers`). */
  field: string;
  message: string;
}

/**
 * Kiểm CỤC BỘ một mục theo cùng luật với BE (`study-item.validator`) — để "Cần sửa" hiện ngay khi gõ và không phải
 * chờ một vòng `PUT` mới biết. BE vẫn là hàng rào cuối cùng (`STUDY_001` gắn lại theo `clientItemKey`).
 * Độ dài đếm theo KÝ TỰ (BE đếm grapheme; lệch chỉ ở emoji ghép — BE báo lỗi thật nếu có).
 */
export function validateDraftItem(item: DraftItem, limits: StudyLimits): ItemProblem[] {
  const problems: ItemProblem[] = [];
  const prompt = item.prompt.trim();
  if (!prompt) problems.push({ field: 'prompt', message: 'Nhập nội dung câu hỏi / thuật ngữ' });
  else if (prompt.length > limits.promptMax) {
    problems.push({ field: 'prompt', message: `Tối đa ${limits.promptMax} ký tự` });
  }
  if (item.explanation.length > limits.explanationMax) {
    problems.push({
      field: 'explanation',
      message: `Giải thích tối đa ${limits.explanationMax} ký tự`,
    });
  }

  switch (item.type) {
    case 'FLASHCARD': {
      const answer = item.answerText.trim();
      if (!answer) problems.push({ field: 'answerText', message: 'Nhập định nghĩa / đáp án' });
      else if (answer.length > limits.promptMax) {
        problems.push({ field: 'answerText', message: `Tối đa ${limits.promptMax} ký tự` });
      }
      break;
    }
    case 'MULTIPLE_CHOICE':
    case 'MULTI_SELECT': {
      if (item.options.length < limits.optionsMin || item.options.length > limits.optionsMax) {
        problems.push({
          field: 'options',
          message: `Cần ${limits.optionsMin}–${limits.optionsMax} lựa chọn`,
        });
      }
      item.options.forEach((option, index) => {
        const text = option.text.trim();
        if (!text)
          problems.push({ field: `options.${index}.text`, message: 'Nhập nội dung lựa chọn' });
        else if (text.length > limits.optionTextMax) {
          problems.push({
            field: `options.${index}.text`,
            message: `Tối đa ${limits.optionTextMax} ký tự`,
          });
        }
      });
      const correct = item.correctKeys.length;
      if (item.type === 'MULTIPLE_CHOICE' && correct !== 1) {
        problems.push({ field: 'correct', message: 'Chọn đúng một đáp án đúng' });
      } else if (item.type === 'MULTI_SELECT' && correct < 1) {
        problems.push({ field: 'correct', message: 'Chọn ít nhất một đáp án đúng' });
      }
      break;
    }
    case 'FILL_BLANK': {
      const answers = item.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean);
      if (answers.length < 1)
        problems.push({ field: 'acceptedAnswers', message: 'Nhập ít nhất một đáp án chấp nhận' });
      else if (answers.length > limits.acceptedAnswersMax) {
        problems.push({
          field: 'acceptedAnswers',
          message: `Tối đa ${limits.acceptedAnswersMax} đáp án`,
        });
      } else if (answers.some((answer) => answer.length > limits.acceptedAnswerMax)) {
        problems.push({
          field: 'acceptedAnswers',
          message: `Mỗi đáp án tối đa ${limits.acceptedAnswerMax} ký tự`,
        });
      }
      break;
    }
    default:
      break;
  }
  return problems;
}
