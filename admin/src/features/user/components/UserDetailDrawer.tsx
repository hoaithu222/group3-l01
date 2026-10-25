import { memo, useState, type ReactNode } from 'react';

import { useFeature } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import { UserGamificationTab } from '@/features/gamification';
import { STUDY_FEATURE_FLAG, UserStudyTab } from '@/features/moderation';
import { UserSkillsTab } from '@/features/skill';
import { Button, Callout, Drawer, Skeleton, Tabs } from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { useUserActionModals } from '../hooks';
import { useUser } from '../service/user.queries';
import { changeRoleBlockedReason, lockToggleBlockedReason } from '../utils/user-guards';
import PendingDeletionCallout from './PendingDeletionCallout';
import UserActionModals from './UserActionModals';
import UserProfileTab from './UserProfileTab';
import UserSessionsTab from './UserSessionsTab';

export interface UserDetailDrawerProps {
  /** `null` = đóng. */
  userId: string | null;
  onClose: () => void;
}

type DrawerTab = 'profile' | 'sessions' | 'gamification' | 'skills' | 'study' | 'audit';

const TABS = [
  { key: 'profile', label: 'Hồ sơ' },
  { key: 'sessions', label: 'Phiên' },
  { key: 'gamification', label: 'Gamification' },
  { key: 'skills', label: 'Kỹ năng' },
  { key: 'study', label: 'Học tập' },
  { key: 'audit', label: 'Nhật ký' },
];

/**
 * Ngăn kéo chi tiết người dùng — hồ sơ + hành động (khoá/mở/đổi vai trò/xoá),
 * phiên đăng nhập, nhật ký audit.
 *
 * `open` suy từ `userId !== null` — một nguồn sự thật duy nhất, xem
 * `ComposedDetailDrawer` (mẫu `/demo/ghep`) cho lý do.
 *
 * Hồ sơ tải riêng (`GET /users/:id`) nên có ĐỦ ba trạng thái: đang tải (khung xương), lỗi (báo + "Thử
 * lại" — trước đây drawer để trống và mất cả tiêu đề lẫn nút đóng) và có dữ liệu. `title` luôn có chữ:
 * `Drawer` chỉ vẽ phần đầu (kèm nút đóng) khi `title` khác rỗng.
 *
 * Nút khoá/mở khoá/đổi vai trò bị khoá kèm chú thích khi BE chắc chắn từ chối (chờ xoá, đã ẩn danh,
 * chính mình — `utils/user-guards.ts`); hộp thoại hành động ở `UserActionModals`.
 */
const UserDetailDrawer = memo(function UserDetailDrawer({
  userId,
  onClose,
}: UserDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('profile');
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasRole = useAuthStore((s) => s.hasRole);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canUpdate = hasPermission('user', 'update');
  // BE giới hạn `PATCH /:id/role` cho riêng vai `admin` (`requireRoles([ADMIN])`)
  // — `manager` có thể có `user:update` nhưng KHÔNG được đổi vai trò.
  const canChangeRole = canUpdate && hasRole('admin');
  // `POST /:id/anonymize` (mọi mode) đòi `user:delete`; mode NOW còn kiểm
  // thêm role `admin` ở service (defense in depth — be.md §6/§8).
  const canDeletePermission = hasPermission('user', 'delete');
  const canAnonymizeNow = canDeletePermission && hasRole('admin');
  // Tab Gamification (p4-03): cần `gamification:view` + cờ `gamification` đang bật ở BE.
  const gamificationEnabled = useFeature('gamification');
  const showGamification = hasPermission('gamification', 'view') && gamificationEnabled === true;
  // Tab Kỹ năng (p6-06): cần `skill:view` + cờ `career` đang bật ở BE.
  const careerEnabled = useFeature('career');
  const showSkills = hasPermission('skill', 'view') && careerEnabled === true;
  // Tab Học tập (p4-01): cần `moderation:view` + cờ `study` đang bật ở BE (tắt → `404 CFG_005`).
  const studyEnabled = useFeature(STUDY_FEATURE_FLAG);
  const showStudy = hasPermission('moderation', 'view') && studyEnabled === true;
  // Tab chỉ bị ẩn khi có mặt trong bảng này với giá trị `false`; tab luôn có (hồ sơ, phiên, nhật ký) không khai.
  const gated: Partial<Record<DrawerTab, boolean>> = { gamification: showGamification, skills: showSkills, study: showStudy };
  const tabs = TABS.filter((t) => gated[t.key as DrawerTab] !== false);

  const { data, isLoading, isError, refetch } = useUser(userId ?? undefined);
  const user = data?.data;
  // BE trả 400 `USER_014` khi target === actor — ẩn nút thẳng ở client thay vì
  // để admin bấm rồi ăn lỗi.
  const canDelete = canDeletePermission && user?.id !== currentUserId;

  const modals = useUserActionModals();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTab('profile');
      onClose();
    }
  };

  let body: ReactNode;
  if (user) {
    body = (
      <div className="flex h-full flex-col gap-3">
        {user.status === 'PENDING_DELETION' && (
          <PendingDeletionCallout
            canCancel={canDelete}
            deletionGraceUntil={user.deletionGraceUntil}
            onCancel={modals.cancelDeletion.open}
          />
        )}
        <Tabs
          aria-label="Thông tin người dùng"
          options={tabs}
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as DrawerTab)}
        />
        {tab === 'profile' && (
          <UserProfileTab
            canChangeRole={canChangeRole}
            canDelete={canDelete}
            canUpdate={canUpdate}
            lockBlockedReason={lockToggleBlockedReason(user, currentUserId)}
            roleBlockedReason={changeRoleBlockedReason(user, currentUserId)}
            user={user}
            onChangeRole={modals.role.open}
            onDelete={modals.remove.open}
            onLock={modals.lock.open}
            onRemoveAvatar={modals.removeAvatar.open}
            onUnlock={modals.unlock.open}
          />
        )}
        {tab === 'sessions' && <UserSessionsTab userId={user.id} />}
        {tab === 'gamification' && showGamification && (
          <UserGamificationTab userId={user.id} userName={user.name} />
        )}
        {tab === 'skills' && showSkills && <UserSkillsTab userId={user.id} userName={user.name} />}
        {tab === 'study' && showStudy && <UserStudyTab userId={user.id} />}
        {tab === 'audit' && <AuditTrailPanel targetId={user.id} targetType="User" />}
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
        description="Người dùng không tồn tại hoặc kết nối bị gián đoạn."
        intent="error"
        title="Không tải được hồ sơ người dùng"
      />
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full" height={32} />
        <Skeleton className="w-full" height={160} />
        <Skeleton className="w-3/5" height={32} />
      </div>
    );
  }

  return (
    <Drawer
      open={userId !== null}
      side="right"
      // `xl` (800px): tab Phiên xếp bảng phiên (6 cột) rồi bảng sinh trắc học (7 cột)
      // — ở `lg` (640px) cả hai đều tràn ngang.
      size="xl"
      title={user ? user.name : 'Chi tiết người dùng'}
      onOpenChange={handleOpenChange}
    >
      {body}
      {user && (
        <UserActionModals canAnonymizeNow={canAnonymizeNow} modals={modals} user={user} />
      )}
    </Drawer>
  );
});

export default UserDetailDrawer;
