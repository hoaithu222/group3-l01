import { useEffect, useMemo, useReducer, useState } from 'react';

import type { StudyItemDto } from '../api/study.types';
import { correctHaptic, wrongHaptic } from '../utils/quick-quiz-haptics';
import {
  countChoices,
  defaultConfig,
  pickRun,
  type QuizConfig,
  type QuizCount,
} from '../utils/quick-quiz-items';
import {
  advance,
  canCheck,
  check,
  currentId,
  isFinished,
  pick,
  startRun,
  tally,
  typeText,
  type QuizRun,
} from '../utils/quick-quiz-session';

type Action =
  | { type: 'check'; item: StudyItemDto }
  | { type: 'next' }
  | { type: 'pick'; multi: boolean; optionId: string }
  | { type: 'start'; ids: string[] }
  | { type: 'text'; text: string };

function reduce(run: QuizRun | null, action: Action): QuizRun | null {
  if (action.type === 'start') return startRun(action.ids);
  if (!run) return run;
  switch (action.type) {
    case 'check':
      return check(run, action.item);
    case 'next':
      return advance(run);
    case 'pick':
      return pick(run, action.optionId, action.multi);
    case 'text':
      return typeText(run, action.text);
  }
}

/**
 * Một phiên Quiz nhanh trên danh sách câu chấm được (`pool`, đã lọc bởi `quizItems`): thiết lập (số câu + trộn) → lượt làm bài → tổng kết. `run === null`
 * nghĩa là đang ở thiết lập. Chạy hoàn toàn TRÊN MÁY — không có lời gọi mạng nào, kết quả không được lưu.
 *
 * ⚠️ Trộn câu dùng `Math.random` nên CHỈ chạy trong `start`/`retryWrong` (handler bấm nút), ⛔ không trong lúc render hay trong reducer: reducer phải
 * thuần (React chạy nó hai lần ở chế độ dev) và câu không được đổi chỗ mỗi lần vẽ lại.
 */
export function useQuickQuiz(pool: readonly StudyItemDto[]) {
  const byId = useMemo(() => new Map(pool.map((item) => [item.id, item])), [pool]);
  const [config, setConfig] = useState<QuizConfig>(() => defaultConfig(pool.length));
  const [run, dispatch] = useReducer(reduce, null);

  const id = run ? currentId(run) : undefined;
  const current = id === undefined ? undefined : byId.get(id);
  const summary = run ? tally(run) : null;
  const checked = run?.checked ?? null;

  // Rung theo kết quả NGAY khi câu được chấm (`checked` đổi từ null sang có giá trị); sang câu kế thì `checked` về null và không rung.
  useEffect(() => {
    if (!checked) return;
    if (checked.correct) correctHaptic();
    else wrongHaptic();
  }, [checked]);

  return {
    byId,
    canCheck: run && current ? canCheck(run, current) : false,
    check: () => {
      if (current) dispatch({ item: current, type: 'check' });
    },
    choices: countChoices(pool.length),
    config,
    current,
    finished: run ? isFinished(run) : false,
    inProgress: run !== null && !isFinished(run),
    next: () => dispatch({ type: 'next' }),
    pick: (optionId: string, multi: boolean) => dispatch({ multi, optionId, type: 'pick' }),
    /** "Luyện lại câu sai": lượt mới chỉ gồm các câu sai của lượt vừa xong (trộn lại nếu đang bật "Trộn câu"). */
    retryWrong: () => {
      if (!summary) return;
      const ids = pickRun(summary.wrongIds, { count: 'all', shuffle: config.shuffle });
      dispatch({ ids, type: 'start' });
    },
    run,
    setCount: (count: QuizCount) => setConfig((prev) => ({ ...prev, count })),
    setShuffle: (shuffle: boolean) => setConfig((prev) => ({ ...prev, shuffle })),
    /** Bắt đầu / "Chơi lại": chọn lại câu theo thiết lập hiện tại (trộn lại thì ra thứ tự khác). */
    start: () => {
      const ids = pickRun(
        pool.map((item) => item.id),
        config,
      );
      dispatch({ ids, type: 'start' });
    },
    summary,
    text: (text: string) => dispatch({ text, type: 'text' }),
    total: pool.length,
  };
}
