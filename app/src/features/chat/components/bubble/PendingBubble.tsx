import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { mentionsToPlainText } from '../../mentions/mention-markup';
import type { PendingMessage } from '../../store/outbox.store';
import { isRetryableSendCode } from '../../utils/send-error';
import { BubbleContent } from './BubbleContent';
import { SendStatus } from './SendStatus';

const PREVIEW_MAX_WIDTH = 240;
const PREVIEW_MAX_HEIGHT = 320;
const PREVIEW_TILE = 96;

/** Ảnh cục bộ của tin đang gửi — cùng khuôn kích thước với `ImageGrid` (1 ảnh: tỉ lệ thật; nhiều ảnh: ô vuông) để lúc tin thật về không nhảy bố cục. */
function PendingPreviews({ previews }: { previews: NonNullable<PendingMessage['previews']> }) {
  if (previews.length === 1) {
    const only = previews[0];
    if (!only) return null;
    const w = only.width ?? PREVIEW_MAX_WIDTH;
    const h = only.height ?? PREVIEW_MAX_HEIGHT;
    const ratio = Math.min(PREVIEW_MAX_WIDTH / w, PREVIEW_MAX_HEIGHT / h, 1);
    return (
      <Image
        accessibilityLabel="Ảnh đang gửi"
        contentFit="cover"
        source={{ uri: only.uri }}
        style={{ width: Math.round(w * ratio), height: Math.round(h * ratio), borderRadius: 6 }}
      />
    );
  }
  return (
    <View style={{ width: PREVIEW_MAX_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {previews.map((p, i) => (
        <Image
          key={`${p.uri}-${i}`}
          accessibilityLabel={`Ảnh ${i + 1} trên ${previews.length}, đang gửi`}
          contentFit="cover"
          source={{ uri: p.uri }}
          style={{ width: (PREVIEW_MAX_WIDTH - 2) / 2, height: PREVIEW_TILE, borderRadius: 6 }}
        />
      ))}
    </View>
  );
}

export interface PendingBubbleProps {
  pending: PendingMessage;
  onRetry?: (clientMessageId: string) => void;
  onEdit?: (clientMessageId: string) => void;
  onDiscard?: (clientMessageId: string) => void;
}

/** Bản tạm outbox (SENDING/FAILED) — luôn của CHÍNH MÌNH nên luôn căn phải (app.md §4.3). */
export function PendingBubble({ pending, onRetry, onEdit, onDiscard }: PendingBubbleProps) {
  const isFailed = pending.status === 'FAILED';

  return (
    <View
      accessibilityLabel={`Bạn, ${dayjs(pending.createdAtLocal).format('HH:mm')}, ${pending.content ? mentionsToPlainText(pending.content, pending.mentions) : '[Đính kèm]'}, ${isFailed ? 'gửi thất bại' : 'đang gửi'}`}
      className="items-end px-md py-3xs"
    >
      <View className="max-w-[80%] gap-3xs rounded-xs bg-action-base px-sm py-2xs tablet:max-w-[60%]">
        {pending.previews && pending.previews.length > 0 ? <PendingPreviews previews={pending.previews} /> : null}
        <BubbleContent attachments={[]} content={pending.content ?? null} mentions={pending.mentions} tone="onAction" />
      </View>
      <View className="mt-3xs">
        <SendStatus
          failMessage={pending.failMessage}
          status={isFailed ? 'FAILED' : 'SENDING'}
          onDiscard={isFailed ? () => onDiscard?.(pending.clientMessageId) : undefined}
          onEdit={isFailed ? () => onEdit?.(pending.clientMessageId) : undefined}
          onRetry={isFailed && isRetryableSendCode(pending.failCode) ? () => onRetry?.(pending.clientMessageId) : undefined}
        />
      </View>
    </View>
  );
}
