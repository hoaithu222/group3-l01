import { useMemo, useReducer } from 'react';

import type { StudyItemDto } from '../api/study.types';
import {
  currentKey,
  flip,
  isFinished,
  mark,
  next,
  previous,
  restart,
  retryUnknown,
  startSession,
  type SessionState,
} from '../utils/flashcard-session';

type Action =
  | { type: 'flip' }
  | { type: 'mark'; known: boolean }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'restart'; keys: string[]; shuffled: boolean }
  | { type: 'retry-unknown' };

function reduce(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'flip':
      return flip(state);
    case 'mark':
      return mark(state, action.known);
    case 'next':
      return next(state);
    case 'previous':
      return previous(state);
    case 'restart':
      return restart(action.keys, action.shuffled);
    case 'retry-unknown':
      return retryUnknown(state);
  }
}

/** Trạng thái phiên học thẻ trên danh sách mục đã tải; mọi loại mục đều học lật được (`item-summary.backText`). */
export function useFlashcardSession(items: readonly StudyItemDto[]) {
  const keys = useMemo(
    () => [...items].sort((a, b) => a.order - b.order).map((item) => item.id),
    [items],
  );
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [state, dispatch] = useReducer(reduce, keys, (initial) => startSession(initial));

  const key = currentKey(state);
  return {
    card: key ? byId.get(key) : undefined,
    dispatch,
    finished: isFinished(state),
    flip: () => dispatch({ type: 'flip' }),
    markKnown: (known: boolean) => dispatch({ known, type: 'mark' }),
    next: () => dispatch({ type: 'next' }),
    previous: () => dispatch({ type: 'previous' }),
    restartAll: (shuffled: boolean) => dispatch({ keys, shuffled, type: 'restart' }),
    retryUnknown: () => dispatch({ type: 'retry-unknown' }),
    state,
    total: state.order.length,
  };
}
