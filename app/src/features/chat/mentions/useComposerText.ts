import { useRef, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { ChatScopeRef, MentionRange } from '../api/chat.types';
import { CHAT_LIMITS } from '../chat.constants';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMentionables } from '../hooks/useMentionables';
import { serializeMentions } from './mention-markup';
import { countDistinctMentions } from './mention-range-helpers';
import { mentionTargetKey } from './mention-role';
import {
  applyTextChange,
  insertMention,
  type MentionPick,
  type RangesState,
} from './mention-ranges';
import { commonPrefixLength, replaceSelection } from './mention-selection';
import { findMentionTrigger } from './mention-trigger';
import { useComposerSelection } from './useComposerSelection';

export interface UseComposerTextOptions {
  scope: ChatScopeRef;
  initialText: string;
  initialRanges: MentionRange[];
  /** Sau mỗi lần text/ranges đổi — `ComposerBody` ghi nháp + phát "đang gõ". */
  onChange: (text: string, ranges: MentionRange[]) => void;
}

/** Debounce gợi ý — app.md p1-06 §3.2 (200 ms). */
const PICKER_DEBOUNCE_MS = 200;

/**
 * State của ô soạn: chữ hiển thị + các cụm nhắc tên + picker `@`.
 *
 * ⚠️ IME (Telex/VNI): `changeText` chỉ nhận chữ từ `TextInput` rồi ghi lại ĐÚNG chữ đó
 * (`applyTextChange` chỉ đổi `text` ở ca Backspace-ngay-sau-chip), nên vòng
 * `onChangeText → setState → value` vẫn đồng bộ như trước khi có mention — không có
 * lời ghi trễ nào đè giữa lúc bộ gõ đang ghép dấu. `selection` chỉ được ÉP một nhịp
 * ngay sau khi chọn gợi ý (con trỏ phải ra sau chip); còn lại để native tự giữ.
 */
export function useComposerText({
  scope,
  initialText,
  initialRanges,
  onChange,
}: UseComposerTextOptions) {
  const [state, setState] = useState<RangesState>({ text: initialText, ranges: initialRanges });
  /** Bản MỚI NHẤT đồng bộ — hai `onChangeText` liên tiếp có thể tới trước lần render kế. */
  const latest = useRef(state);
  const { selection, forcedSelection, changeSelection, forceCursor, resetCursor } = useComposerSelection(
    initialText.length,
  );

  const trigger =
    selection.start === selection.end
      ? findMentionTrigger(state.text, selection.end, state.ranges)
      : null;
  const debouncedQuery = useDebouncedValue(trigger?.query ?? '', PICKER_DEBOUNCE_MS);
  // Chỉ gọi server khi từ khoá đã ỔN ĐỊNH (debounce đuổi kịp chữ đang gõ): không có điều kiện này, lần đầu
  // gõ `@mi` liền một hơi sẽ bắn một request cho từ khoá CŨ (`''`) rồi mới tới `mi` — tốn và hiện sai danh sách.
  const settled = trigger !== null && debouncedQuery.trim() === trigger.query.trim();
  const mentionables = useMentionables(scope, debouncedQuery, settled);

  const commit = (next: RangesState) => {
    latest.current = next;
    setState(next);
    onChange(next.text, next.ranges);
  };

  const changeText = (nextText: string) => {
    const prev = latest.current;
    const next = applyTextChange(prev.text, nextText, prev.ranges);
    commit(next);
    // ⚠️ Backspace xoá nguyên chip: `text` KHÁC chữ native vừa báo ⇒ `value` ghi đè cả chuỗi lên `EditText` và Android đẩy con trỏ
    // về CUỐI chữ (đang sửa giữa câu là nhảy xuống cuối). Ép về đúng chỗ chip vừa đứng = phần đầu chung của chữ cũ và mới.
    if (next.text !== nextText) forceCursor(commonPrefixLength(prev.text, next.text));
  };

  const pick = (mention: MentionPick) => {
    if (!trigger) return;
    const { text, ranges } = latest.current;
    const isNewTarget = !ranges.some((r) => mentionTargetKey(r) === mentionTargetKey(mention));
    if (isNewTarget && countDistinctMentions(ranges) >= CHAT_LIMITS.mentionsMax) {
      showToast('error', `Mỗi tin chỉ nhắc tối đa ${CHAT_LIMITS.mentionsMax} người`);
      return;
    }
    const inserted = insertMention(
      text,
      ranges,
      { start: trigger.start, end: selection.end },
      mention,
    );
    commit(inserted);
    forceCursor(inserted.cursor);
  };

  /**
   * Chèn chữ (emoji) tại con trỏ, thay cả vùng bôi đen. Bảng emoji mở thì ô đã mất focus nhưng `selection` (lần cuối native báo) vẫn còn.
   * ⚠️ Phải ÉP con trỏ ra sau đoạn chèn: JS đổi `value` mà native không có sự kiện nào ⇒ con trỏ đứng nguyên TRƯỚC emoji, chạm hai emoji ra thứ tự ngược.
   */
  const insertText = (chunk: string) => {
    const { text, ranges } = latest.current;
    const inserted = replaceSelection(text, ranges, selection, chunk);
    commit(inserted);
    forceCursor(inserted.cursor);
  };

  const reset = () => {
    latest.current = { text: '', ranges: [] };
    setState(latest.current);
    resetCursor();
  };

  return {
    text: state.text,
    ranges: state.ranges,
    serialized: serializeMentions(state.text, state.ranges),
    changeText,
    changeSelection,
    /** `undefined` ở mọi lúc trừ một nhịp sau khi chọn gợi ý / chèn emoji / xoá nguyên chip. */
    forcedSelection,
    insertText,
    reset,
    picker: {
      /** Chữ đang gõ sau `@` — `MentionPickerSheet` lọc nhóm "Vai trò" theo nó. */
      query: trigger?.query ?? '',
      open: trigger !== null && !mentionables.isError,
      loading: !mentionables.data && (mentionables.isFetching || (trigger !== null && !settled)),
      result: mentionables.data,
      pick,
    },
  };
}
