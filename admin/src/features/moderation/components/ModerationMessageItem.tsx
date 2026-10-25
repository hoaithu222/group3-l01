import { memo, useCallback } from 'react';

import { Badge, Button, Surface } from '@/shared/ui';
import { cn } from '@/shared/utils/style/cn';
import { formatDate } from '@/shared/utils/format';

import type { ModerationMessage } from '../types/moderation.types';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface ModerationMessageItemProps {
  message: ModerationMessage;
  /** Hiện nút "Gỡ tin" (`moderation:update`); tin đã gỡ/tin hệ thống không bao giờ có nút. */
  canRemove: boolean;
  onRemove: (message: ModerationMessage) => void;
}

const authorLabel = (m: ModerationMessage): string =>
  m.authorName ?? (m.kind === 'SYSTEM' ? 'Hệ thống' : 'Người dùng không còn');

/**
 * Một tin trong khối nội dung (public hoặc D-06). Tin bị báo cáo tô nổi bật; tin đã gỡ hiện nhãn
 * "Đã bị gỡ" — BE xoá nội dung gốc khi gỡ nên không có gì để hiện ngoài nhãn. Nội dung là văn bản
 * thuần (React tự thoát ký tự) — KHÔNG render HTML từ người dùng.
 */
const ModerationMessageItem = memo(function ModerationMessageItem({
  message,
  canRemove,
  onRemove,
}: ModerationMessageItemProps) {
  const author = authorLabel(message);
  const handleRemove = useCallback(() => onRemove(message), [message, onRemove]);
  const removable = canRemove && !message.deleted && message.kind === 'USER';

  return (
    <Surface
      as="li"
      className={cn('flex flex-col gap-1.5', message.isTarget && 'border-warning-5')}
      padding="md"
      tone={message.isTarget ? 'sunken' : 'base'}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-14-medium text-fg-1">{author}</span>
        <span className="tabular-nums text-caption-12 text-fg-4">
          {formatDate(message.createdAt, TIME_FORMAT)}
        </span>
        {message.editedAt && (
          <Badge color="neutral" size="sm" variant="outline">
            Đã sửa
          </Badge>
        )}
        {message.isTarget && (
          <Badge color="warning" size="sm" variant="tinted">
            Tin bị báo cáo
          </Badge>
        )}
        {message.deleted && (
          <Badge color="error" size="sm" variant="tinted">
            Đã bị gỡ
          </Badge>
        )}
        {removable && (
          <Button
            aria-label={`Gỡ tin nhắn của ${author}`}
            className="ml-auto"
            size="xs"
            skin="danger"
            variant="ghost"
            onClick={handleRemove}
          >
            Gỡ tin
          </Button>
        )}
      </div>

      {message.deleted ? (
        <p className="text-body-14 italic text-fg-4">
          Tin đã bị gỡ
          {message.deletedAt ? ` lúc ${formatDate(message.deletedAt, TIME_FORMAT)}` : ''} — nội dung
          gốc không còn được lưu.
        </p>
      ) : (
        message.content && (
          <p className="whitespace-pre-wrap break-words text-body-14 text-fg-2">
            {message.content}
          </p>
        )
      )}

      {message.attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {message.attachments.map((file, index) => (
            <Badge key={`${file.name}-${index}`} color="neutral" size="sm" variant="tinted">
              {file.name}
            </Badge>
          ))}
        </div>
      )}
    </Surface>
  );
});

export default ModerationMessageItem;
