import { Text, View } from 'react-native';

import { scopeKeyOf, useConnectionState } from '@/core/socket';
import { Icon } from '@/shared/ui/icon';

import type { ChatScopeRef, MentionRange, MessageView, ResolveChatAuthor } from '../../api/chat.types';
import { parseMentions } from '../../mentions/mention-markup';
import { useComposerStore, type ComposerTarget } from '../../store/composer.store';
import { getDraft } from '../../store/drafts.store';
import { ComposerBody } from './ComposerBody';

export interface ComposerCapabilities {
  canWrite: boolean;
  readOnlyReason?: string;
  /**
   * Màn cha TỰ vẽ thanh chỉ-đọc riêng (lý do cụ thể, nút "Bỏ chặn"…) ngay dưới `ChatRoom` ⇒ `Composer` KHÔNG vẽ thêm thanh
   * chung "Bạn không thể gửi tin ở đây." — bản cũ vẽ cả hai nên phòng chỉ-đọc có HAI thanh khoá xếp chồng, câu chung chung
   * nằm ngay trên câu có lý do. Mặc định `false`: màn không có thanh riêng (luồng, khung chat phòng họp) vẫn nhận thanh chung.
   */
  hideReadOnlyNotice?: boolean;
}

export interface ComposerProps {
  scope: ChatScopeRef;
  capabilities: ComposerCapabilities;
  resolveAuthor?: ResolveChatAuthor;
  findMessage: (id: string) => MessageView | undefined;
  /** Tăng lên để ép remount + nạp lại nháp (vd "Sửa" một bản gửi FAILED — `useChatRoomState.ts`). */
  draftRestoreNonce?: number;
}

/**
 * Chữ + chip nạp lần đầu. Sửa tin: `content` gốc còn marker `@{u:…}` nên PHẢI parse ngược
 * (không thì marker hiện thô trong ô nhập). Soạn mới: nháp đã lưu sẵn dạng chữ hiển thị + range.
 */
function initialStateFor(
  target: ComposerTarget | undefined,
  scopeKey: string,
): { text: string; ranges: MentionRange[] } {
  if (target?.type === 'edit') return parseMentions(target.content, target.mentions ?? []);
  const draft = getDraft(scopeKey);
  return { text: draft.text, ranges: draft.mentionRanges };
}

/**
 * Khoá viết (`canWrite=false`)/mất mạng — thanh thay Composer, KHÔNG qua
 * `ConnectionBanner` toàn app (xem chú thích trong `ComposerBody.tsx` cũ,
 * chuyển sang đây cùng lượt tách file). Chế độ Sửa cần NẠP LẠI `text` từ nội
 * dung tin — dùng `key` đổi theo `target` để `ComposerBody` REMOUNT và tự
 * `useState(initialText)` seed một lần, không `useEffect` (app/AGENTS.md).
 */
export function Composer({ scope, capabilities, resolveAuthor, findMessage, draftRestoreNonce = 0 }: ComposerProps) {
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const target = useComposerStore((s) => s.byScope[scopeKey]);
  const setTarget = useComposerStore((s) => s.setTarget);
  const connection = useConnectionState();

  if (!capabilities.canWrite) {
    if (capabilities.hideReadOnlyNotice) return null;
    return (
      <View className="flex-row items-center gap-2xs border-t border-divider-1 bg-bg-1 px-md py-sm">
        {/* `fg-2` (≥ 3:1): icon lý do là tín hiệu, `fg-3` (2.96:1) gần như vô hình trên nền thanh soạn tin. */}
        <Icon color="fg-2" name="lock" size={16} />
        <Text className="flex-1 text-caption-sm text-fg-2">Bạn không thể gửi tin ở đây.</Text>
      </View>
    );
  }

  if (connection !== 'connected') {
    return (
      // `offline` (máy mất mạng, NetInfo xác nhận) khác `connecting` (còn mạng nhưng socket đang nối lại — vừa rớt, server/Redis
      // khởi động lại…): hai câu khác nhau để người dùng biết CHỜ hay phải TỰ bật mạng. Cả hai đều nhắc nháp còn nguyên — bản cũ chỉ
      // nói "Kết nối lại để gửi." nên ô soạn biến mất đột ngột trông như mất chữ đang gõ (thật ra nháp vẫn lưu, nạp lại khi nối xong).
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2xs border-t border-divider-1 bg-bg-1 px-md py-sm"
      >
        <Icon color="fg-2" name="flash-off" size={16} />
        <Text className="flex-1 text-caption-sm text-fg-2">
          {connection === 'offline'
            ? 'Không có mạng — kết nối lại để gửi. Nháp của bạn vẫn được giữ.'
            : 'Đang kết nối lại… Nháp của bạn vẫn được giữ, gửi được ngay khi nối xong.'}
        </Text>
      </View>
    );
  }

  const initial = initialStateFor(target, scopeKey);

  return (
    <ComposerBody
      key={`${target?.type === 'edit' ? `edit-${target.messageId}` : 'compose'}-${draftRestoreNonce}`}
      findMessage={findMessage}
      initialRanges={initial.ranges}
      initialText={initial.text}
      resolveAuthor={resolveAuthor}
      scope={scope}
      target={target}
      onChangeTarget={(next) => setTarget(scopeKey, next)}
    />
  );
}
