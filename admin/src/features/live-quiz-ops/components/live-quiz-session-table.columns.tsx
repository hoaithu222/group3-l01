import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import {
  liveQuizEndReasonLabel,
  LIVE_QUIZ_PLAYERS_MAX,
} from '../constants/live-quiz-ops.constants';
import type { AdminLiveQuizSession } from '../types/live-quiz-ops.types';
import { progressLabel, shortId } from '../utils/live-quiz-ops.utils';

export interface LiveQuizSessionColumnsOptions {
  /** URL THẬT mở ngăn kéo phiên (giữ bộ lọc) — Ctrl+click mở tab mới được. */
  hrefFor: (session: AdminLiveQuizSession) => string;
  onOpen: (session: AdminLiveQuizSession) => void;
  /** Đích của id người tổ chức (`/user/:id`) — chỉ khi có `user:view`. */
  userHref?: (userId: string) => string;
  /** Đích của id workspace (`/workspace/:id`) — chỉ khi có `workspace:view`. */
  workspaceHref?: (workspaceId: string) => string;
}

/**
 * Id ngắn: là `<Link>` khi có quyền vào trang đích, thiếu quyền thì chữ thường (không dẫn tới trang sẽ bị chặn). Hàm thường (không phải component)
 * để file này chỉ xuất hàm dựng cột — luật fast-refresh không cho lẫn component với export khác.
 */
function renderIdCell(id: string, href?: string) {
  return href ? (
    <Link className="font-mono text-caption-12 text-link hover:underline" title={id} to={href}>
      {shortId(id)}
    </Link>
  ) : (
    <span className="font-mono text-caption-12 text-fg-2" title={id}>
      {shortId(id)}
    </span>
  );
}

/**
 * Cột bảng phiên Live Quiz (admin.md p5-01 §2.1): bắt đầu lúc · bộ câu hỏi · người tổ chức · workspace · trạng thái (chữ + màu) · người chơi ·
 * câu · lý do kết thúc. BE chưa trả tên người tổ chức/workspace nên hiện mã rút gọn (đầy đủ ở `title`); không có PIN hay nội dung câu hỏi.
 */
export function buildLiveQuizSessionColumns({
  hrefFor,
  onOpen,
  userHref,
  workspaceHref,
}: LiveQuizSessionColumnsOptions): TableColumn<AdminLiveQuizSession>[] {
  return [
    {
      key: 'startedAt',
      header: 'Bắt đầu lúc',
      width: 150,
      cell: (s) => (
        <Link
          className="text-body-14 text-link tabular-nums hover:underline"
          to={hrefFor(s)}
          onClick={(ev) => {
            if (isModifiedClick(ev)) return;
            ev.preventDefault();
            onOpen(s);
          }}
        >
          {formatDate(s.startedAt ?? s.createdAt, 'HH:mm DD/MM/YYYY')}
        </Link>
      ),
    },
    {
      key: 'setTitle',
      header: 'Bộ câu hỏi',
      width: 240,
      cell: (s) => <span className="block truncate text-fg-1">{s.setTitle}</span>,
    },
    {
      key: 'host',
      header: 'Người tổ chức',
      width: 130,
      cell: (s) => renderIdCell(s.hostId, userHref?.(s.hostId)),
    },
    {
      key: 'workspace',
      header: 'Workspace',
      width: 130,
      cell: (s) =>
        s.workspaceId ? (
          renderIdCell(s.workspaceId, workspaceHref?.(s.workspaceId))
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (s) => {
        const meta = statusBadge('liveQuiz', s.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'players',
      header: 'Người chơi',
      width: 110,
      align: 'right',
      cell: (s) => (
        <span className="tabular-nums">
          {formatNumber(s.playersCount)} / {LIVE_QUIZ_PLAYERS_MAX}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Câu',
      width: 90,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{progressLabel(s)}</span>,
    },
    {
      key: 'endReason',
      header: 'Lý do kết thúc',
      width: 240,
      cell: (s) => liveQuizEndReasonLabel(s.endReason),
    },
  ];
}
