import { useState } from 'react';

import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import {
  useNotificationWorkspaces,
  type NotificationWorkspace,
} from '../hooks/useNotificationWorkspaces';
import { WorkspaceNotifySheet } from './WorkspaceNotifySheet';

/**
 * "Theo nhóm làm việc" (p1-07 `app.md` §3): mỗi nhóm cho ghi đè chế độ thông báo của nhóm chat và kênh trong nhóm đó.
 * Không có nhóm nào (hoặc lỗi tải) → ẩn cả khối, không hiện thẻ rỗng — khối này phụ so với cài đặt tài khoản.
 */
export function WorkspaceNotifyCard({ disabled }: { disabled: boolean }) {
  const workspaces = useNotificationWorkspaces();
  const [selected, setSelected] = useState<NotificationWorkspace | null>(null);

  if (workspaces.isError || (workspaces.isSuccess && workspaces.data.length === 0)) return null;

  return (
    <Section icon="add-team" title="Theo nhóm làm việc">
      <Card className="gap-0 px-md py-2xs" padded={false}>
        {workspaces.isLoading ? (
          <Skeleton className="my-xs h-10 rounded-md" />
        ) : (
          workspaces.data?.map((workspace, index) => (
            <ListItem
              key={workspace.id}
              className="py-xs"
              description="Chế độ riêng cho nhóm chat và kênh trong nhóm này"
              disabled={disabled}
              divider={index < (workspaces.data?.length ?? 0) - 1}
              emphasis="title"
              label={workspace.name}
              leading={<Avatar name={workspace.name} shape="rounded" size="md" />}
              trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
              onPress={() => setSelected(workspace)}
            />
          ))
        )}
        <WorkspaceNotifySheet workspace={selected} onClose={() => setSelected(null)} />
      </Card>
    </Section>
  );
}
