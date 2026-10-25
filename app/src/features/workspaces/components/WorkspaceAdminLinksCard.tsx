import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { useFeature } from '@/shell/capabilities';

import type { WorkspaceDetail } from '../api';
import { WorkspaceActionRow } from './WorkspaceActionRow';

export interface WorkspaceAdminLinksCardProps {
  workspace: Pick<WorkspaceDetail, 'id' | 'myRole' | 'status'>;
}

/**
 * Khối "Quản trị" của Cài đặt nhóm — MỘT khung chứa các lối vào màn con, thay cho hai thẻ rời (mỗi thẻ một tiêu đề + một dòng):
 *  · "Cách vào nhóm và mời khách" → `settings/access` (p3-04) — CHỈ chủ nhóm (ADMIN không đặt được, BE 403).
 *  · "Áp mẫu cho nhóm" → `settings/templates` (p5-04) — chủ nhóm và quản trị viên, CHỈ khi cờ phụ `workspaceTemplates` bật (chưa
 *    biết cờ = ẩn, không chớp rồi biến) và nhóm chưa lưu trữ (`TPL_002`).
 * Không có dòng nào hiện ⇒ không vẽ cả khối. Chỉ ẩn/hiện để gọn; hàng rào thật là BE.
 */
export function WorkspaceAdminLinksCard({ workspace }: WorkspaceAdminLinksCardProps) {
  const templatesEnabled = useFeature('workspaceTemplates') === true;
  const isOwner = workspace.myRole === 'OWNER';
  const isManager = isOwner || workspace.myRole === 'ADMIN';
  const showTemplates = templatesEnabled && isManager && workspace.status !== 'ARCHIVED';
  if (!isOwner && !showTemplates) return null;

  const wsId = workspace.id;

  return (
    <Section icon="shield-user" title="Quản trị">
      <Card className="py-2xs">
        {isOwner ? (
          <WorkspaceActionRow
            chevron
            description="Duyệt thành viên mới · Cho phép mời khách"
            divider={showTemplates}
            icon="lock"
            label="Cách vào nhóm và mời khách"
            tileTone="info"
            tone="brand"
            onPress={() => router.push({ pathname: '/workspaces/[wsId]/settings/access', params: { wsId } })}
          />
        ) : null}
        {showTemplates ? (
          <WorkspaceActionRow
            chevron
            description="Thêm nhanh các kênh theo mẫu (Nhóm môn học, Đồ án…)"
            icon="magic-wand-01"
            label="Áp mẫu cho nhóm"
            tileTone="accent"
            tone="brand"
            onPress={() => router.push({ pathname: '/workspaces/[wsId]/settings/templates', params: { wsId } })}
          />
        ) : null}
      </Card>
    </Section>
  );
}
