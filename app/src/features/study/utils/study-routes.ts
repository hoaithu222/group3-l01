import type { Href } from 'expo-router';

/** Đường dẫn typed của phân hệ Học — một chỗ để đổi cây route mà không sửa từng nơi gọi. */
export const STUDY_HOME: Href = '/study';

export function setHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]' };
}

export function setEditHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/edit' };
}

export function setInfoHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/info' };
}

export function flashcardsHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/flashcards' };
}

/** Quiz nhanh — luyện từng câu chấm được của bộ, biết đúng/sai ngay (chỉ phía app, không ghi điểm lên server). */
export function quizHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/quiz' };
}

/** Tạo bộ mới; `workspaceId` (từ hub nhóm) mở sẵn phạm vi "Trong nhóm". */
export function newSetHref(workspaceId?: string): Href {
  return workspaceId
    ? { params: { workspaceId }, pathname: '/study/new' }
    : { pathname: '/study/new' };
}

export function workspaceStudyHref(wsId: string): Href {
  return { params: { wsId }, pathname: '/workspaces/[wsId]/study' };
}

/** Ôn theo lịch SM-2 (p4-02); không `setId` ⇒ mọi bộ đã đăng ký. */
export function srReviewHref(setId?: string): Href {
  return setId ? { params: { setId }, pathname: '/study/sr' } : { pathname: '/study/sr' };
}

export function mockSetupHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/mock' };
}

export function mockAttemptHref(attemptId: string): Href {
  return { params: { attemptId }, pathname: '/study/attempts/[attemptId]' };
}

export function mockResultHref(attemptId: string): Href {
  return { params: { attemptId }, pathname: '/study/results/[attemptId]' };
}

/** Xem lại đáp án của một lượt đã kết thúc (`results/[attemptId]/review`). */
export function mockReviewHref(attemptId: string): Href {
  return { params: { attemptId }, pathname: '/study/results/[attemptId]/review' };
}

/** Lịch sử thi; có `setId` ⇒ chỉ các lượt của bộ đó. */
export function mockHistoryHref(setId?: string): Href {
  return setId ? { params: { setId }, pathname: '/study/history' } : { pathname: '/study/history' };
}
