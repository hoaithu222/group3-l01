import { useState } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

import type { Mentionable } from '../api/task-detail.types';
import { useMentionables } from '../queries/task-comments.queries';
import { findMentionTrigger, insertMention, type MentionPick } from '../utils/mention-compose';
import { useDebouncedValue } from './useDebouncedValue';

export interface MentionInputState {
  picks: MentionPick[];
  text: string;
}

interface Options {
  boardId: string;
  /** Tắt (không quyền bình luận/offline) thì không mở gợi ý và không gọi mạng. */
  enabled: boolean;
  state: MentionInputState;
  onChange: (state: MentionInputState) => void;
}

/**
 * Ô nhập có gợi ý `@` (bản tối thiểu của p3-03, xem `mention-compose.ts`): theo dõi con trỏ, suy ra
 * "đang gõ @từ-khoá" từ `(text, caret)`, gọi `GET /boards/:id/mentionables?q=` (debounce 200 ms) và
 * chèn `@Tên ` khi chọn. Hook KHÔNG giữ text — nơi gọi giữ (nháp trong store, hoặc state cục bộ của
 * sheet sửa), nên dùng chung cho cả soạn mới lẫn sửa bình luận.
 *
 * ⚠️ Sau khi chèn, `forcedSelection` ÉP con trỏ về cuối `@Tên ` MỘT nhịp (xoá ở lần
 * `onSelectionChange` kế) — đặt `text` từ mã thì native có thể đẩy con trỏ về cuối cả đoạn.
 */
export function useMentionInput({ boardId, enabled, state, onChange }: Options) {
  const [caret, setCaret] = useState(state.text.length);
  const [forcedSelection, setForcedSelection] = useState<{ end: number; start: number }>();

  const trigger = enabled ? findMentionTrigger(state.text, caret, state.picks) : null;
  const query = useDebouncedValue(trigger?.query.trim() ?? '', 200);
  const mentionables = useMentionables(boardId, query, Boolean(trigger));

  const pick = (user: Mentionable) => {
    if (!trigger) return;
    const next = insertMention(state.text, trigger, caret, user, state.picks);
    onChange({ picks: next.picks, text: next.text });
    setCaret(next.cursor);
    setForcedSelection({ end: next.cursor, start: next.cursor });
  };

  return {
    forcedSelection,
    loading: Boolean(trigger) && mentionables.isFetching,
    pick,
    suggestions: trigger ? (mentionables.data ?? []) : [],
    triggerOpen: trigger !== null,
    changeText: (text: string) => onChange({ picks: state.picks, text }),
    onSelectionChange: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCaret(event.nativeEvent.selection.end);
      setForcedSelection(undefined);
    },
  };
}
