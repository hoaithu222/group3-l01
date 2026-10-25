import { useCallback, useState } from 'react';

import { scopeKeyOf } from '@/core/socket';

import type { ChatScopeRef } from '../api/chat.types';
import { parseMentions } from '../mentions/mention-markup';
import { markInvalidRanges } from '../mentions/mention-range-helpers';
import { useDraftsStore } from '../store/drafts.store';
import { useResendFailedMessage } from './useResendFailedMessage';

/**
 * "Sửa" một bản gửi FAILED → trả nội dung về ô soạn (app.md §4.3). Nội dung outbox là
 * `content` ĐÃ serialize (còn marker `@{u:…}`), nên parse ngược về chữ + chip trước khi
 * nạp; chip server từ chối (`MSG_008`) được tô đỏ để người dùng thấy cần xoá cái nào.
 *
 * `draftRestoreNonce` tăng để ép `Composer` remount + nạp lại nháp — cùng cơ chế `key` mà
 * `app/AGENTS.md` yêu cầu thay cho `useEffect` nạp giá trị từ nguồn ngoài React.
 */
export function useComposerRestore(scope: ChatScopeRef) {
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const confirmFailedNotSent = useResendFailedMessage(scope);
  const [draftRestoreNonce, setDraftRestoreNonce] = useState(0);

  const editPending = useCallback(
    (clientMessageId: string) => {
      void confirmFailedNotSent(clientMessageId)
        .then((restored) => {
          if (!restored) return; // đã có trên server — outbox đã tự xoá, không cần nạp gì thêm.
          const { text, ranges } = parseMentions(restored.content ?? '', restored.mentions ?? []);
          useDraftsStore.getState().setDraft(scopeKey, {
            text,
            mentionRanges: markInvalidRanges(ranges, restored.failInvalidMentionUserIds ?? []),
          });
          setDraftRestoreNonce((n) => n + 1);
        })
        // ⛔ Bước xác nhận "server chưa nhận" gọi API — mất mạng thì reject. Không bắt là Promise reject vô chủ (bản dev hiện thanh
        // LogBox đỏ đè lên thanh tab). Bắt xong thì bản FAILED vẫn nằm nguyên trong outbox (chỉ xoá SAU khi xác nhận xong), nên
        // người dùng bấm "Sửa"/"Thử lại" lại được khi có mạng; toast lỗi mạng do interceptor axios lo.
        .catch(() => undefined);
    },
    [confirmFailedNotSent, scopeKey],
  );

  return { editPending, draftRestoreNonce };
}
