import { Text, View } from 'react-native';

import type { ChatScopeType } from '../../api/chat.types';
import { CharCount } from './CharCount';
import { RateLimitCountdown } from './RateLimitCountdown';

export interface ComposerNoticesProps {
  overLimitLength: number | undefined;
  /** Tên chip bị server từ chối (`MSG_008`) — `undefined` = không có chip lỗi. */
  invalidMentionLabel: string | undefined;
  scopeType: ChatScopeType;
  /** "Sẽ thông báo cho khoảng N người" khi tin có chip `@role` (p3-04) — nhắc nhẹ, KHÔNG chặn gửi. `undefined` = không có chip vai trò. */
  roleAudienceNotice?: string;
  retryAfterAt: number | undefined;
  onRateLimitExpire: () => void;
}

/** Các dòng cảnh báo DƯỚI ô nhập: quá 4.000 ký tự · chip nhắc tên bị từ chối · nhắc vai trò báo cho khoảng N người · đang bị giới hạn tốc độ. */
export function ComposerNotices({
  overLimitLength,
  invalidMentionLabel,
  roleAudienceNotice,
  scopeType,
  retryAfterAt,
  onRateLimitExpire,
}: ComposerNoticesProps) {
  return (
    <>
      {overLimitLength !== undefined ? (
        <View className="px-md pb-2xs">
          <CharCount length={overLimitLength} />
        </View>
      ) : null}
      {invalidMentionLabel !== undefined ? (
        // Chip đã tô đỏ — dòng chữ này để màu KHÔNG là tín hiệu duy nhất (nháp giữ nguyên, app.md p1-06 §3).
        <Text accessibilityLiveRegion="polite" className="px-md pb-2xs text-caption-sm text-error">
          {invalidMentionLabel} không còn trong{' '}
          {scopeType === 'CHANNEL' ? 'kênh' : 'cuộc trò chuyện'} — xoá nhắc tên để gửi
        </Text>
      ) : null}
      {roleAudienceNotice !== undefined ? (
        <Text accessibilityLiveRegion="polite" className="px-md pb-2xs text-caption-sm text-fg-2">
          {roleAudienceNotice}
        </Text>
      ) : null}
      {retryAfterAt !== undefined ? (
        <View className="px-md pb-2xs">
          <RateLimitCountdown retryAfterAt={retryAfterAt} onExpire={onRateLimitExpire} />
        </View>
      ) : null}
    </>
  );
}
