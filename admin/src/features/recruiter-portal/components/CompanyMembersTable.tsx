import { memo, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { MEMBER_ROLE_LABEL } from '@/features/recruiter';
import type { CompanyMemberView } from '@/features/recruiter';
import { useDisclosure } from '@/shared/hooks';
import { Badge, Button, Callout, ConfirmDialog, EmptyState, Skeleton, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { useCompanyMembers, useRemoveMember } from '../service/company.queries';
import AddMemberModal from './AddMemberModal';

export interface CompanyMembersTableProps {
  companyId: string;
  /** OWNER — thêm/gỡ thành viên. */
  isOwner: boolean;
  /** Thêm thành viên cần doanh nghiệp đã duyệt (BE `companyScope({ owner, approved })`). */
  canAdd: boolean;
}

/**
 * Bảng thành viên (admin.md p6-08 §2.7): tên, email, vai trò, ngày tham gia; OWNER thêm ("Thêm thành viên") và gỡ (xác nhận). Không gỡ được OWNER cuối cùng (`RECR_012`, interceptor toast) —
 * nút gỡ vẫn hiện để BE là chốt chặn thật; riêng chính mình thì ẩn để OWNER không vô tình tự khoá mình khỏi cổng. Đây là email NHÂN SỰ của doanh nghiệp mình, không phải email ứng viên.
 */
const CompanyMembersTable = memo(function CompanyMembersTable({ companyId, isOwner, canAdd }: CompanyMembersTableProps) {
  const members = useCompanyMembers(companyId);
  const remove = useRemoveMember();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const addModal = useDisclosure();
  const [removing, setRemoving] = useState<CompanyMemberView | null>(null);

  const columns = useMemo<TableColumn<CompanyMemberView>[]>(() => {
    const cols: TableColumn<CompanyMemberView>[] = [
      { key: 'name', header: 'Tên', width: 180, cell: (m) => <span className="block truncate">{m.name}</span> },
      { key: 'email', header: 'Email', width: 240, cell: (m) => <span className="block truncate text-fg-2">{m.email || '—'}</span> },
      {
        key: 'role',
        header: 'Vai trò',
        width: 140,
        cell: (m) => (
          <Badge color={m.role === 'OWNER' ? 'info' : 'neutral'} size="sm" variant="tinted">
            {MEMBER_ROLE_LABEL[m.role]}
          </Badge>
        ),
      },
      {
        key: 'joinedAt',
        header: 'Tham gia',
        width: 110,
        cell: (m) => <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(m.joinedAt, 'DD/MM/YYYY')}</span>,
      },
    ];
    if (isOwner) {
      cols.push({
        key: 'actions',
        header: '',
        width: 90,
        cell: (m) =>
          m.userId === currentUserId ? null : (
            <Button size="sm" skin="danger" variant="stroke" onClick={() => setRemoving(m)}>
              Gỡ
            </Button>
          ),
      });
    }
    return cols;
  }, [currentUserId, isOwner]);

  let body;
  if (members.isError && !members.data) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void members.refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được danh sách thành viên"
      />
    );
  } else if (members.isLoading) {
    body = <Skeleton className="w-full" height={96} />;
  } else if ((members.data ?? []).length === 0) {
    body = <EmptyState size="sm" title="Chưa có thành viên nào" />;
  } else {
    body = <Table columns={columns} data={members.data ?? []} pagination={false} rowKey={(m) => m.userId} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-14-medium text-fg-1">Thành viên</span>
        {isOwner && canAdd ? (
          <Button size="sm" variant="stroke" onClick={addModal.open}>
            Thêm thành viên
          </Button>
        ) : null}
      </div>
      {body}
      {addModal.isOpen ? (
        <AddMemberModal
          companyId={companyId}
          open
          onOpenChange={(next) => !next && addModal.close()}
        />
      ) : null}
      <ConfirmDialog
        actionLabel="Gỡ thành viên"
        description={`${removing?.name ?? 'Thành viên này'} sẽ mất quyền truy cập cổng tuyển dụng của doanh nghiệp.`}
        open={removing !== null}
        title="Gỡ thành viên?"
        variant="delete"
        onConfirm={() => {
          if (removing) remove.mutate({ companyId, userId: removing.userId });
        }}
        onOpenChange={(next) => !next && setRemoving(null)}
      />
    </div>
  );
});

export default CompanyMembersTable;
