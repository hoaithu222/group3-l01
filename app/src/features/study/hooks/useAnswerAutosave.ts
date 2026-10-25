import { useEffect, useState } from 'react';

import { useConnectionState } from '@/core/socket';

import { useSaveMockAnswers } from '../queries/mock-attempts.queries';
import { createAnswerAutosaver } from '../utils/answer-autosaver';

/**
 * Nối `createAnswerAutosaver` (logic thuần, bền qua `mock-player.store`) vào React: lấy `PUT answers` từ mutation
 * (gộp `myAnswers` vào cache `detail`), đọc trạng thái mạng, tự đẩy lại phần đang chờ khi MỞ LẠI lượt dở hoặc khi mạng
 * `connected` trở lại. `onTerminal` (`MOCK_003/004`) để màn chuyển sang kết quả.
 */
export function useAnswerAutosave(attemptId: string, onTerminal?: (code: string) => void) {
  const { mutateAsync } = useSaveMockAnswers(attemptId);
  const online = useConnectionState() !== 'offline';
  const [saver] = useState(() => createAnswerAutosaver(attemptId));

  // Cấp lại phụ thuộc mỗi lần vẽ (KHÔNG dùng ref: đọc ref lúc render bị chặn) — khai TRƯỚC hai effect bên dưới.
  useEffect(() => {
    saver.configure({ isOnline: () => online, onTerminal, save: mutateAsync });
  });

  useEffect(() => {
    saver.start();
    return () => saver.stop();
  }, [saver]);

  // Lần đầu (đáp án khôi phục từ đĩa) và mỗi lần mạng trở lại: đẩy phần chưa lên server.
  useEffect(() => {
    if (online) void saver.flush();
  }, [online, saver]);

  return saver;
}
