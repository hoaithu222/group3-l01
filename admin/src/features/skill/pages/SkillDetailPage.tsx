import { memo, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import {
  Button,
  Callout,
  ConfirmWithReasonModal,
  PageBody,
  PageShell,
  Skeleton,
  Tabs,
} from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { PageHeader } from '@/shared/widgets/header';
import { useDisclosure } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format';

import SkillForm from '../components/SkillForm';
import { useAdminSkill, useSetSkillActive } from '../service/skill.queries';

type DetailTab = 'info' | 'audit';

const TABS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'audit', label: 'Nhật ký' },
];

/**
 * `/skill/new` và `/skill/:id` (admin.md p6-06 §2.2): form + Xem trước; chi tiết có nút Bật/Tắt (lý do) và tab "Nhật ký" (`AuditTrailPanel` target
 * `SkillDefinition`). Không có `skill:update` → form chỉ đọc.
 */
const SkillDetailPage = memo(function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canCreate = useAuthStore((s) => s.hasPermission('skill', 'create'));
  const canUpdate = useAuthStore((s) => s.hasPermission('skill', 'update'));
  const [tab, setTab] = useState<DetailTab>('info');
  const toggle = useDisclosure();
  const setActive = useSetSkillActive();
  const { data: skill, isError, refetch } = useAdminSkill(id);

  const handleToggle = useCallback(
    async (reason: string) => {
      if (!skill) return;
      await setActive.mutateAsync({ id: skill.id, active: !skill.isActive, reason });
      toggle.close();
    },
    [setActive, skill, toggle],
  );

  const back = () => void navigate('/skill');

  if (!id) {
    return (
      <PageShell>
        <PageHeader
          backHref="/skill"
          backLabel="Về danh sách kỹ năng"
          title="Tạo kỹ năng"
          tone="emerald"
          onBack={back}
        />
        <PageBody overflow="scroll">
          <SkillForm canEdit={canCreate} skill={null} />
        </PageBody>
      </PageShell>
    );
  }

  let body;
  if (skill) {
    body = (
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="Chi tiết kỹ năng"
          options={TABS}
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as DetailTab)}
        />
        {tab === 'info' ? (
          <SkillForm
            key={skill.version}
            canEdit={canUpdate}
            skill={skill}
            onReload={() => void refetch()}
          />
        ) : (
          <AuditTrailPanel targetId={skill.id} targetType="SkillDefinition" />
        )}
      </div>
    );
  } else if (isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kỹ năng không tồn tại hoặc kết nối bị gián đoạn."
        intent="error"
        title="Không tải được kỹ năng"
      />
    );
  } else {
    body = <Skeleton className="w-full" height={240} />;
  }

  return (
    <PageShell>
      {/* Tên kỹ năng, nút quay lại và nút Bật/Tắt nằm trên THANH HEADER; trạng thái (đang bật · số người
          đạt / đã tắt) là dòng phụ dưới tên. Hai tab "Thông tin"/"Nhật ký" vẫn ở thân trang. */}
      <PageHeader
        backHref="/skill"
        backLabel="Về danh sách kỹ năng"
        end={
          skill && canUpdate ? (
            <Button size="sm" variant={skill.isActive ? 'stroke' : 'primary'} onClick={toggle.open}>
              {skill.isActive ? 'Tắt kỹ năng' : 'Bật kỹ năng'}
            </Button>
          ) : undefined
        }
        subtitle={
          skill
            ? skill.isActive
              ? `Đang bật · ${formatNumber(skill.holdersCount)} người đạt`
              : 'Đã tắt'
            : undefined
        }
        title={skill?.name ?? 'Chi tiết kỹ năng'}
        titleSize="sm"
        tone="emerald"
        onBack={back}
      />
      <PageBody overflow="scroll">{body}</PageBody>
      <ConfirmWithReasonModal
        confirmTone={skill?.isActive ? 'danger' : 'primary'}
        impact={
          skill
            ? skill.isActive
              ? 'Tắt: không cấp thêm huy hiệu; người đã đạt vẫn giữ.'
              : 'Bật: hệ thống cấp huy hiệu cho mọi người ĐÃ đủ tiêu chí (chạy nền, mỗi người một thông báo).'
            : null
        }
        open={toggle.isOpen}
        title={skill?.isActive ? 'Tắt kỹ năng' : 'Bật kỹ năng'}
        onConfirm={handleToggle}
        onOpenChange={(open) => !open && toggle.close()}
      />
    </PageShell>
  );
});

export default SkillDetailPage;
