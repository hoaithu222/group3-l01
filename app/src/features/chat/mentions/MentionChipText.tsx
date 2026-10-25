import { Fragment } from 'react';
import { Text } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { MessageMention } from '../api/chat.types';
import { ALL_LABEL, splitMarkers, UNKNOWN_USER_LABEL } from './mention-markup';
import { useMentionRenderContext } from './mention-render.context';
import { roleMentionLabel } from './mention-role';

export interface MentionChipTextProps {
  /** Đoạn chữ thuần (đã tách khỏi đậm/nghiêng/link) có thể chứa marker `@{u:…}`/`@{all}`. */
  text: string;
  mentions: MessageMention[];
  tone: 'default' | 'onAction';
}

/**
 * Render marker nhắc tên thành chip INLINE (app.md p1-06 §3 `MentionChipText`, việc #8).
 *
 * Tên theo userId, KHÔNG theo chữ đã lưu: đổi tên người được nhắc thì tin cũ hiện tên mới
 * (TH-07) — miễn màn cha cấp `resolveName`; chưa có thì dùng `label` ảnh chụp lúc gửi,
 * chưa có nốt thì "người dùng" (tuyệt đối không in id — client cũ/marker lạ cũng vậy, README §10).
 * Marker `@{r:…}` (`@role`, p3-04) thành `@Quản trị viên`/`@Thành viên` theo nhãn ảnh chụp trên tin — không bao giờ lộ marker hay `ADMIN` thô.
 */
export function MentionChipText({ text, mentions, tone }: MentionChipTextProps) {
  const { resolveName, currentUserId, onPressMention } = useMentionRenderContext();
  if (!text.includes('@{')) return <>{text}</>;

  return (
    <>
      {splitMarkers(text).map((segment, index) => {
        if (segment.kind === 'text') return <Fragment key={index}>{segment.text}</Fragment>;

        const userId = segment.type === 'USER' ? segment.targetId : null;
        const name =
          segment.type === 'ALL'
            ? ALL_LABEL
            : segment.type === 'ROLE'
              ? roleMentionLabel(segment.targetId, mentions)
              : (userId && resolveName?.(userId)) ||
                mentions.find((m) => m.type === 'USER' && m.targetId === userId)?.label ||
                UNKNOWN_USER_LABEL;
        const isMe = userId !== null && userId === currentUserId;
        const pressable = userId !== null && onPressMention !== undefined;

        return (
          <Text
            key={index}
            accessibilityLabel={`nhắc tên ${name}`}
            accessibilityRole={pressable ? 'link' : undefined}
            className={cn(
              'font-semibold',
              tone === 'onAction' ? 'text-action-fg underline' : 'text-link',
              isMe && tone === 'default' && 'bg-action-tint',
            )}
            onPress={pressable ? () => onPressMention(userId) : undefined}
          >
            @{name}
          </Text>
        );
      })}
    </>
  );
}
