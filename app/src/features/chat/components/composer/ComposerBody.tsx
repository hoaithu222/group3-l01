import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext, useState } from 'react';
import { View } from 'react-native';

import { pickDocuments, pickImages, takePhoto } from '@/core/media/pick-media';
import { scopeKeyOf, useTypingEmitter } from '@/core/socket';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { PickedFile } from '@/core/uploads/upload.types';
import { useUpload } from '@/core/uploads/use-upload';
import { AttachmentTray } from '@/shared/ui/attachment';

import type { ChatScopeRef, MentionRange, MessageView, ResolveChatAuthor } from '../../api/chat.types';
import { CHAT_LIMITS } from '../../chat.constants';
import { useMessageActions } from '../../hooks/useMessageActions';
import { useSendMessage } from '../../hooks/useSendMessage';
import { ALL_LABEL } from '../../mentions/mention-markup';
import { MentionAllConfirmDialog } from '../../mentions/MentionAllConfirmDialog';
import { roleAudienceNotice } from '../../mentions/mention-role';
import { useComposerText } from '../../mentions/useComposerText';
import type { ComposerTarget } from '../../store/composer.store';
import { useDraftsStore } from '../../store/drafts.store';
import { rememberLocalPreviews } from '../../store/local-previews';
import { useOutboxStore } from '../../store/outbox.store';
import { graphemeLength } from '../../utils/grapheme';
import { AttachMenuSheet } from './AttachMenuSheet';
import { ComposerAttachExtras } from './ComposerAttachExtras';
import { ComposerKeyboardLift } from './ComposerKeyboardLift';
import { ComposerMentionPicker } from './ComposerMentionPicker';
import { prepareAndValidate } from './attachment-intake';
import { toDraftSnapshot } from './draft-snapshot';
import { ComposerNotices } from './ComposerNotices';
import { ComposerRow } from './ComposerRow';
import { EditStrip } from './EditStrip';
import { EmojiPanel } from './EmojiPanel';
import { ReplyStrip } from './ReplyStrip';
import { useEmojiPanel } from './useEmojiPanel';
import { voiceResultToPickedFile } from './voice-attachment';

export interface ComposerBodyProps {
  scope: ChatScopeRef;
  resolveAuthor?: ResolveChatAuthor;
  /** Tra nội dung tin đang TRẢ LỜI (đã tải trong `useMessages`) cho `ReplyStrip`. */
  findMessage: (id: string) => MessageView | undefined;
  target: ComposerTarget | undefined;
  onChangeTarget: (target: ComposerTarget | undefined) => void;
  /** Seed MỘT LẦN lúc mount — `Composer.tsx` đổi `key` (không dùng `useEffect`
   * nạp lại nội dung khi vào chế độ Sửa, đúng luật "seed từ prop → `useState(prop)`
   * trực tiếp, remount bằng `key`" của `app/AGENTS.md`). */
  initialText: string;
  /** Cụm nhắc tên trong `initialText` (nháp giữ nguyên chip; tin đang sửa được parse từ marker). */
  initialRanges: MentionRange[];
}

/** Ô soạn tin — text + nhắc tên + đính kèm + voice note (app.md §3, p1-06 §3.2). */
export function ComposerBody({ scope, resolveAuthor, findMessage, target, onChangeTarget, initialText, initialRanges }: ComposerBodyProps) {
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  /** Số người sẽ nhận `@Tất cả` đang chờ xác nhận (nhóm đông) — `undefined` = không có hộp thoại. */
  const [confirmAllCount, setConfirmAllCount] = useState<number>();
  /** `RateLimitCountdown` báo XONG đếm qua `onExpire` — render KHÔNG được tự gọi `Date.now()` (React Compiler `react-hooks/purity`), nên chỉ so sánh mốc đã hết với mốc ứng viên hiện tại. */
  const [dismissedRateLimitAt, setDismissedRateLimitAt] = useState<number>();
  const outboxItems = useOutboxStore((s) => s.byScope[scopeKey]) ?? [];
  const { items, enqueue, cancel, retry: retryUpload } = useUpload('MESSAGE', scopeKey);
  const { send } = useSendMessage(scope);
  const { editMessage } = useMessageActions(scope);
  const typing = useTypingEmitter(scope.scopeType, scope.scopeId, scope.threadId);
  const isEdit = target?.type === 'edit';
  const emoji = useEmojiPanel();
  // ⚠️ Ô soạn nằm TRÊN thanh tab dưới (`AppTabBar`) ở các màn chat trong `<Tabs>`; bàn phím phủ lên thanh tab (không đẩy nó), nên
  // `KeyboardStickyView` mặc định (nâng đúng bằng chiều cao bàn phím) để ô soạn lơ lửng CÁCH bàn phím đúng một thanh tab (~64dp + vạch
  // gạt) — dải trống lộ danh sách tin phía sau. Bù chiều cao thanh tab lúc bàn phím mở. Ngoài `<Tabs>` (tấm trượt) context vắng ⇒ 0 ⇒ như cũ.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const composer = useComposerText({
    scope,
    initialText,
    initialRanges,
    onChange: (nextText, nextRanges) => {
      // Đang SỬA thì KHÔNG ghi đè nháp thật — huỷ sửa phải trả lại đúng nháp cũ.
      if (!isEdit) useDraftsStore.getState().setDraft(scopeKey, { text: nextText, mentionRanges: nextRanges });
      if (nextText.length > 0) typing.onChangeText();
      else typing.stop();
    },
  });

  const rateLimitCandidate = [...outboxItems]
    .filter((m) => m.status === 'FAILED' && m.failCode === 'RATE_002' && m.retryAfterAt !== undefined)
    .sort((a, b) => (b.retryAfterAt ?? 0) - (a.retryAfterAt ?? 0))[0];
  const rateLimited = rateLimitCandidate && rateLimitCandidate.retryAfterAt !== dismissedRateLimitAt ? rateLimitCandidate : undefined;

  const readyAssets = items.filter((i) => i.status === 'ready' && i.assetId);
  const busyAttachments = items.some((i) => !['ready', 'failed', 'cancelled'].includes(i.status));
  /** BE đếm 4.000 trên chuỗi ĐÃ CÓ marker (`@{u:<24 hex>}`), không phải chữ hiển thị. */
  const sentLength = graphemeLength(composer.serialized.content);
  const overLimit = sentLength > CHAT_LIMITS.maxChars;
  const invalidMention = composer.ranges.find((r) => r.invalid);
  const hasContent = composer.text.trim().length > 0 || readyAssets.length > 0;
  const canSend = hasContent && !overLimit && !busyAttachments && !rateLimited && !invalidMention;

  const resetComposer = () => {
    typing.stop();
    onChangeTarget(undefined);
    readyAssets.forEach((a) => useUploadStore.getState().removeItem(a.localId));
    if (isEdit) return; // Sửa xong quay lại soạn tin mới — nháp thật (nếu có) và `text` do lượt remount tiếp theo (key đổi) tự nạp lại, KHÔNG đụng ở đây.
    composer.reset();
    useDraftsStore.getState().clearDraft(scopeKey);
  };

  const enqueueValid = (files: PickedFile[]) => void prepareAndValidate(files).then((valid) => valid.length > 0 && enqueue(valid));

  const handleSend = () => {
    if (!canSend) return;
    const { content, mentions } = composer.serialized;
    const previews = rememberLocalPreviews(readyAssets);
    if (target?.type === 'edit') void editMessage(target.messageId, content.trim(), target.expectedVersion, mentions);
    else
      send({
        content: content.trim() || undefined,
        mentions: mentions.length > 0 ? mentions : undefined,
        attachments: readyAssets.map((a) => ({ assetId: a.assetId as string, waveform: a.waveform })),
        previews,
        replyToId: target?.type === 'reply' ? target.messageId : undefined,
      });
    resetComposer();
  };

  const replyMessage = target?.type === 'reply' ? findMessage(target.messageId) : undefined;
  // p7-04: bản chụp nội dung đang soạn cho khe `attachRows` của menu "+" (Hẹn giờ gửi) — xem `draft-snapshot.ts`.
  const attachDraft = toDraftSnapshot({ canSend, consume: resetComposer, readyAssets, serialized: composer.serialized, target });

  return (
    <ComposerKeyboardLift tabBarHeight={tabBarHeight}>
      <View className="border-t border-divider-1 bg-bg-1">
        {replyMessage ? <ReplyStrip message={replyMessage} resolveAuthor={resolveAuthor} onCancel={() => onChangeTarget(undefined)} /> : null}
        {target?.type === 'edit' ? <EditStrip onCancel={() => onChangeTarget(undefined)} /> : null}

        {composer.picker.open ? <ComposerMentionPicker picker={composer.picker} onAskConfirmAll={setConfirmAllCount} /> : null}

        <AttachmentTray items={items} onCancel={cancel} onRemove={(id) => useUploadStore.getState().removeItem(id)} onRetry={retryUpload} />

        <ComposerRow
          canSend={canSend}
          emoji={{ open: emoji.open, onToggle: emoji.toggle }}
          hasContent={hasContent}
          input={{
            length: sentLength,
            ranges: composer.ranges,
            selection: composer.forcedSelection,
            value: composer.text,
            onChangeText: composer.changeText,
            onFocus: emoji.close,
            onSelectionChange: composer.changeSelection,
          }}
          inputRef={emoji.inputRef}
          onAttach={() => setAttachMenuOpen(true)}
          onRecorded={(result) => void voiceResultToPickedFile(result).then((file) => enqueueValid([file]))}
          onSend={handleSend}
        />

        <ComposerNotices
          invalidMentionLabel={invalidMention?.label}
          overLimitLength={overLimit ? sentLength : undefined}
          retryAfterAt={rateLimited?.retryAfterAt}
          roleAudienceNotice={roleAudienceNotice(composer.ranges)}
          scopeType={scope.scopeType}
          onRateLimitExpire={() => setDismissedRateLimitAt(rateLimited?.retryAfterAt)}
        />

        {emoji.open ? <EmojiPanel onSelect={composer.insertText} /> : null}
      </View>

      <MentionAllConfirmDialog
        count={confirmAllCount}
        onCancel={() => setConfirmAllCount(undefined)}
        onConfirm={() => {
          setConfirmAllCount(undefined);
          composer.picker.pick({ type: 'ALL', label: ALL_LABEL });
        }}
      />
      <AttachMenuSheet
        extraRows={<ComposerAttachExtras draft={attachDraft} onDone={() => setAttachMenuOpen(false)} />}
        visible={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        onPickDocuments={() => void pickDocuments().then(enqueueValid)}
        onPickImages={() => void pickImages().then(enqueueValid)}
        onTakePhoto={() => void takePhoto().then((file) => file && enqueueValid([file]))}
      />
    </ComposerKeyboardLift>
  );
}
