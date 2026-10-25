/**
 * Mã lỗi thi thử / ôn theo lịch (p4-02 be.md §8) → câu tiếng Việt, đồng bộ `be/src/core/utils/error.codes.ts`.
 *
 * ⚠️ Để ở feature (không trải vào `shared/constants/error-codes.ts`): bảng chung đã ở trần dòng của
 * `file-size-manifest.json` và chính nó ghi "mã nghiệp vụ để ở feature tương ứng". Tra qua
 * `studyErrorMessage()` (`utils/error-info.ts`) — mọi request MOCK/SR ghi đều `skipErrorToast`
 * hoặc toast ở màn, nên không cần interceptor biết bảng này.
 */
export const STUDY_ERROR_MESSAGES: Record<string, string> = {
  MOCK_001: 'Bộ học chưa có câu hỏi chấm điểm được để thi thử',
  MOCK_002: 'Bạn đang có bài thi dở của bộ học này',
  MOCK_003: 'Đã hết thời gian làm bài',
  MOCK_004: 'Bài thi đã được nộp',
  MOCK_005: 'Câu trả lời không thuộc đề thi',
  MOCK_006: 'Bạn đã thi thử bộ học này quá số lần cho phép hôm nay',
  SR_001: 'Thẻ này đang tạm ngừng ôn tập',
  SR_002: 'Bộ học chưa có mục nào để ôn tập',
  SR_003: 'Bạn đã ôn quá số thẻ cho phép trong ngày',
};
