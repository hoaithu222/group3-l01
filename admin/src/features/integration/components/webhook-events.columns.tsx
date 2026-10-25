import { Link } from 'react-router-dom';

import { Badge, Tooltip } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatDate } from '@/shared/utils/format';

import {
  EVENT_TYPE_LABELS,
  WEBHOOK_PROVIDER_LABELS,
  WEBHOOK_STATUS_META,
} from '../constants/integration.labels';
import type { AdminWebhookEvent } from '../types/integration.types';

export interface WebhookEventColumnsOptions {
  /** URL THẬT mở ngăn kéo sự kiện (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (event: AdminWebhookEvent) => string;
  onOpen: (event: AdminWebhookEvent) => void;
  /** URL ngăn kéo workspace (`/workspace/:id`) — chỉ khi có `workspace:view`. */
  workspaceHref?: (workspaceId: string) => string;
}

/** Cột bảng "Sự kiện webhook" (admin.md p5-03 §2.1): nhận lúc · provider · workspace · loại · tóm tắt · trạng thái (chữ + màu) · lỗi. */
export function buildWebhookEventColumns({
  hrefFor,
  onOpen,
  workspaceHref,
}: WebhookEventColumnsOptions): TableColumn<AdminWebhookEvent>[] {
  return [
    {
      key: 'receivedAt',
      header: 'Nhận lúc',
      width: 150,
      cell: (e) => (
        <Link
          className="text-body-14 text-link tabular-nums hover:underline"
          to={hrefFor(e)}
          onClick={(ev) => {
            if (isModifiedClick(ev)) return;
            ev.preventDefault();
            onOpen(e);
          }}
        >
          {formatDate(e.receivedAt, 'HH:mm:ss DD/MM/YYYY')}
        </Link>
      ),
    },
    {
      key: 'provider',
      header: 'Nhà cung cấp',
      width: 130,
      cell: (e) => WEBHOOK_PROVIDER_LABELS[e.provider] ?? e.provider,
    },
    {
      key: 'workspace',
      header: 'Workspace',
      width: 180,
      cell: (e) =>
        e.workspace ? (
          workspaceHref ? (
            <Link
              className="block truncate text-link hover:underline"
              to={workspaceHref(e.workspace.id)}
            >
              {e.workspace.name}
            </Link>
          ) : (
            <span className="block truncate">{e.workspace.name}</span>
          )
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'type',
      header: 'Loại sự kiện',
      width: 150,
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate">{EVENT_TYPE_LABELS[e.type] ?? e.type}</div>
          <div className="truncate font-mono text-caption-12 text-fg-4">{e.type}</div>
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Tóm tắt',
      width: 320,
      cell: (e) => <span className="line-clamp-2">{e.summary ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (e) => {
        const meta = WEBHOOK_STATUS_META[e.status];
        return (
          <Badge color={meta?.color ?? 'neutral'} variant="tinted">
            {meta?.label ?? e.status}
          </Badge>
        );
      },
    },
    {
      key: 'error',
      header: 'Lỗi',
      width: 200,
      cell: (e) =>
        e.error ? (
          <Tooltip content={e.error}>
            <span className="block truncate text-error">{e.error}</span>
          </Tooltip>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
  ];
}
