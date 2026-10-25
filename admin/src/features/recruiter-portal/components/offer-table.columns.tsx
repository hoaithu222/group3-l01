import { Link } from 'react-router-dom';

import { DECLINE_REASON_LABEL } from '@/features/recruiter';
import { Avatar, Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { OfferItem } from '../types/offer.types';
import OfferStatusBadge from './OfferStatusBadge';

export interface OfferColumnOptions {
  /** Đường dẫn mở ngăn kéo lời mời (giữ bộ lọc) — tiêu đề là `<Link>` thật. */
  detailHref: (offerId: string) => string;
}

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';
const dash = <span className="text-fg-5">—</span>;
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Cột bảng lời mời của doanh nghiệp (admin.md p6-08 §2.6): ứng viên (tên hiển thị + ảnh; đã ẩn danh hoá → "Tài khoản đã xoá") · tiêu đề · người gửi · trạng thái (kèm lý do từ chối dạng
 * MÃ → chữ) · gửi lúc · phản hồi lúc · tin mới. KHÔNG có email ứng viên ở danh sách — chỉ chi tiết lời mời và CHỈ khi sinh viên đã chia sẻ.
 */
export function buildOfferColumns({ detailHref }: OfferColumnOptions): TableColumn<OfferItem>[] {
  return [
    {
      key: 'student',
      header: 'Ứng viên',
      width: 200,
      cell: (o) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={o.student.displayName} size="xs" src={o.student.avatarUrl ?? undefined} />
          <span className="truncate">{o.student.displayName}</span>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Tiêu đề',
      width: 240,
      cell: (o) => (
        <Link
          className="block truncate text-link hover:underline"
          to={detailHref(o.id)}
          onClick={stop}
        >
          {o.title}
        </Link>
      ),
    },
    {
      key: 'recruiter',
      header: 'Người gửi',
      width: 150,
      cell: (o) => <span className="block truncate text-fg-2">{o.recruiter.name}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 200,
      cell: (o) => (
        <div className="flex flex-col gap-0.5">
          <OfferStatusBadge status={o.status} />
          {o.status === 'DECLINED' && o.declineReason ? (
            <span className="text-caption-12 text-fg-3">{DECLINE_REASON_LABEL[o.declineReason]}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'sentAt',
      header: 'Gửi lúc',
      width: 140,
      cell: (o) => <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(o.sentAt, TIME_FORMAT)}</span>,
    },
    {
      key: 'respondedAt',
      header: 'Phản hồi lúc',
      width: 140,
      cell: (o) =>
        o.respondedAt ? (
          <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(o.respondedAt, TIME_FORMAT)}</span>
        ) : (
          dash
        ),
    },
    {
      key: 'unread',
      header: 'Tin mới',
      width: 90,
      align: 'right',
      cell: (o) =>
        o.unreadMessages > 0 ? (
          <Badge color="primary" size="sm" variant="solid">
            {o.unreadMessages}
          </Badge>
        ) : (
          dash
        ),
    },
  ];
}
