import { screen } from '@testing-library/react-native';

import { QuestionView } from '../components/mock/QuestionView';
import { ReviewQuestionCard } from '../components/mock/ReviewQuestionCard';
import { makeQuestion, makeResultQuestion } from './mock-fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Ảnh của đề + đáp án ở THI THỬ (p4-02): BE trả `frontMediaAssetId` / `option.mediaAssetId` — màn làm bài và màn xem lại phải
 * vẽ đúng ảnh đó, có mô tả cho trình đọc màn hình (ảnh học tập mang nghĩa); câu/đáp án không có ảnh thì không có ô ảnh nào.
 */
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({
    data: { url: 'https://cdn.example/x.jpg' },
    isPending: false,
    refetch: jest.fn(),
  }),
}));

const OPTIONS_WITH_IMAGE = [
  { id: 'o_aaaaaa', mediaAssetId: 'img-a', text: 'Đáp án A1' },
  { id: 'o_bbbbbb', mediaAssetId: null, text: 'Đáp án B1' },
];

async function renderQuestion(question = makeQuestion(0)) {
  await renderWithProviders(
    <QuestionView
      answer={undefined}
      flagged={false}
      question={question}
      total={2}
      onChange={jest.fn()}
      onFlag={jest.fn()}
    />,
  );
}

describe('QuestionView — ảnh đề và ảnh đáp án', () => {
  it('có ảnh ⇒ hiện ảnh đề + ảnh của ĐÚNG đáp án có ảnh; tên đọc của lựa chọn giữ nguyên', async () => {
    await renderQuestion(
      makeQuestion(0, { frontMediaAssetId: 'img-q', options: OPTIONS_WITH_IMAGE }),
    );

    expect(screen.getByLabelText('Ảnh của câu hỏi')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ảnh của đáp án A')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ảnh của đáp án B')).toBeNull();
    expect(screen.getByRole('radio', { name: 'A. Đáp án A1' })).toBeOnTheScreen();
  });

  it('câu chỉ có chữ ⇒ không có ô ảnh nào', async () => {
    await renderQuestion();

    expect(screen.getByText('Câu hỏi số 1?')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Ảnh của/)).toBeNull();
  });
});

describe('ReviewQuestionCard — ảnh khi xem lại', () => {
  it('xem lại thấy đúng ảnh đã thấy lúc làm bài; nhãn trạng thái đáp án không đổi', async () => {
    await renderWithProviders(
      <ReviewQuestionCard
        question={makeResultQuestion(0, {
          frontMediaAssetId: 'img-q',
          options: OPTIONS_WITH_IMAGE,
        })}
      />,
    );

    expect(screen.getByLabelText('Ảnh của câu hỏi')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ảnh của đáp án A')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đáp án A1. Bạn chọn · Đúng')).toBeOnTheScreen();
  });
});
