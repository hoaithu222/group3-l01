import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  Badge,
  Button,
  ConfirmWithReasonModal,
  Drawer,
  EmptyState,
  JsonViewer,
  Skeleton,
  Text,
} from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import {
  EVENT_TYPE_LABELS,
  WEBHOOK_PROVIDER_LABELS,
  WEBHOOK_STATUS_META,
} from '../constants/integration.labels';
import { useReplayWebhookEvent, useWebhookEvent } from '../service/integration.queries';
import type { AdminWebhookEventDetail } from '../types/integration.types';

export interface WebhookEventDrawerProps {
  /** `null` = đóng (đồng bộ `?eventId=`). */
  eventId: string | null;
  onClose: () => void;
  /** Mở một sự kiện khác trong chuỗi phát lại. */
  onOpenEvent: (id: string) => void;
}

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm:ss DD/MM/YYYY') : '—');

/** Tin hệ thống đã tạo: chỉ id + tên kênh CÔNG KHAI; kênh riêng tư chỉ ghi "kênh riêng tư" (admin không thấy tên). */
function messageLabel(message: AdminWebhookEventDetail['message']): string {
  if (!message) return 'Chưa đăng tin';
  if (!message.channel) return `Tin ${message.id}`;
  return message.channel.private
    ? `Tin ${message.id} · kênh riêng tư`
    : `Tin ${message.id} · #${message.channel.name ?? ''}`;
}

/**
 * Ngăn kéo chi tiết sự kiện webhook (admin.md p5-03 §2.1): metadata, payload ĐÃ CHE phía BE (`JsonViewer`), tin hệ thống đã tạo, chuỗi phát lại.
 * "Phát lại" chỉ khi có `integration:update` VÀ sự kiện FAILED/IGNORED còn trong thời gian lưu → `ConfirmWithReasonModal` → `POST …/replay`.
 */
const WebhookEventDrawer = memo(function WebhookEventDrawer({
  eventId,
  onClose,
  onOpenEvent,
}: WebhookEventDrawerProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('integration', 'update'));
  const { data: event, isPending, isError } = useWebhookEvent(eventId ?? undefined);
  const replay = useReplayWebhookEvent();
  const [confirming, setConfirming] = useState(false);
  const canReplay =
    !!event &&
    canUpdate &&
    event.replayable &&
    (event.status === 'FAILED' || event.status === 'IGNORED');
  const status = event ? WEBHOOK_STATUS_META[event.status] : undefined;

  return (
    <Drawer
      open={eventId !== null}
      side="right"
      size="lg"
      title="Sự kiện webhook"
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && eventId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !event ? (
        <EmptyState
          description="Sự kiện không tồn tại hoặc đã bị dọn theo thời gian lưu."
          title="Không tìm thấy sự kiện"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-body-16-semibold text-fg-1">
                {event.summary ?? EVENT_TYPE_LABELS[event.type] ?? event.type}
              </div>
              <Text size="small" skin="muted">
                {WEBHOOK_PROVIDER_LABELS[event.provider]} · {event.type}
              </Text>
            </div>
            <Badge color={status?.color ?? 'neutral'} variant="tinted">
              {status?.label ?? event.status}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Fact label="Mã giao hàng" value={event.eventId} />
            <Fact label="Workspace" value={event.workspace?.name ?? '—'} />
            <Fact label="Nhận lúc" value={when(event.receivedAt)} />
            <Fact label="Xử lý lúc" value={when(event.processedAt)} />
            <Fact label="Số lần xử lý" value={String(event.attempts)} />
            <Fact label="Tin hệ thống" value={messageLabel(event.message)} />
            {event.error ? <Fact label="Lỗi" value={event.error} wide /> : null}
          </dl>
          {canReplay && (
            <div>
              <Button size="sm" variant="stroke" onClick={() => setConfirming(true)}>
                Phát lại
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Text size="small" weight="medium">
              Payload (đã che dữ liệu nhạy cảm)
            </Text>
            {event.payload === null ? (
              <Text size="small" skin="muted">
                Đã quá thời gian lưu — payload đã bị xoá.
              </Text>
            ) : (
              <JsonViewer maxHeight={360} value={event.payload} />
            )}
          </div>
          {event.replays.length > 0 && (
            <div className="flex flex-col gap-1">
              <Text size="small" weight="medium">
                Chuỗi phát lại
              </Text>
              {event.replays.map((r) => (
                <Button
                  key={r.id}
                  className="justify-start"
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenEvent(r.id)}
                >
                  {when(r.receivedAt)} · {WEBHOOK_STATUS_META[r.status]?.label ?? r.status}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      <ConfirmWithReasonModal
        impact="Tạo một sự kiện MỚI từ payload đã lưu và xử lý lại — nếu thành công sẽ đăng thêm một tin hệ thống vào kênh nhận."
        open={confirming}
        title="Phát lại sự kiện webhook"
        onConfirm={async (reason) => {
          if (!event) return;
          await replay.mutateAsync({ id: event.id, reason });
          setConfirming(false);
        }}
        onOpenChange={setConfirming}
      />
    </Drawer>
  );
});

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-caption-12 text-fg-4">{label}</dt>
      <dd className="break-words text-body-14 text-fg-1">{value}</dd>
    </div>
  );
}

export default WebhookEventDrawer;
