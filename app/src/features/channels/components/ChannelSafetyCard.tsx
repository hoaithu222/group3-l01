import { router } from 'expo-router';

import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { ChannelDetail } from '../api';

export interface ChannelSafetyCardProps {
  channel: Pick<ChannelDetail, 'id' | 'myPermissions' | 'name'>;
  wsId: string;
}

/**
 * "Báo cáo kênh" cho mọi thành viên, và "Báo cáo cần xử lý" cho người kiểm duyệt (p1-08 #7/#9). Hàng đợi là của
 * CẢ NHÓM (`workspaces/[wsId]/reports`): BE gộp mọi phạm vi tôi kiểm duyệt — OWNER/ADMIN thấy kênh công khai,
 * MANAGER thấy kênh riêng của mình — nên không có bộ lọc theo kênh. Hiện theo `myPermissions.canModerate`
 * (= `channel.message.moderate` của BE, đúng cờ mà BE dùng để cho gỡ tin). Báo cáo qua store chung
 * (`useModerationActions`): `channels` không import `moderation`.
 *
 * Hàng điều hướng = ô icon có tông + tiêu đề `emphasis="title"` + mũi tên `fg-2` (mẫu `MeNavRow`); mũi tên `fg-3` cũ chỉ 2.96:1.
 */
export function ChannelSafetyCard({ channel, wsId }: ChannelSafetyCardProps) {
  const { reportChannel } = useModerationActions();
  const arrow = <Icon color="fg-2" name="arrow-right-small" size="sm" />;

  return (
    <Section icon="shield-user" title="An toàn">
      <Card className="px-md py-2xs" padded={false}>
        {channel.myPermissions.canModerate ? (
          <ListItem
            className="py-xs"
            description="Xem và xử lý báo cáo trong phạm vi bạn kiểm duyệt"
            divider
            emphasis="title"
            label="Báo cáo cần xử lý"
            leading={<IconTile name="shield-user" tone="info" />}
            trailing={arrow}
            onPress={() =>
              router.push({ pathname: '/workspaces/[wsId]/reports', params: { wsId } })
            }
          />
        ) : null}
        <ListItem
          className="py-xs"
          description="Báo cáo kênh có nội dung vi phạm"
          emphasis="title"
          label="Báo cáo kênh"
          leading={<IconTile name="alert-warning" tone="warning" />}
          trailing={arrow}
          onPress={() => reportChannel(channel.id, channel.name)}
        />
      </Card>
    </Section>
  );
}
