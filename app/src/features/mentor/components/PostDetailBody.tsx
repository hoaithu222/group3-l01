import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { MentorPostDetail } from '../api/mentor.types';
import { APPLICATION_STATUS_LABEL, POST_STATUS_LABEL } from '../constants/mentor.constants';
import { deadlineText, mentorsNeededText } from '../utils/mentor-format';

export interface PostDetailBodyProps {
  post: MentorPostDetail;
}

/**
 * Nội dung chi tiết bài (app.md §3): mô tả dạng CHỮ THUẦN (không dựng HTML/markdown từ người đăng), người đăng, nhóm, kỹ năng,
 * cam kết, số cố vấn, hạn; đơn của tôi (nếu có) bằng chữ. Không liệt kê thành viên nhóm (README §2 "riêng tư sinh viên").
 *
 * Đầu màn: ảnh nhóm (`workspace.avatarUrl`, chữ viết tắt khi thiếu) + tiêu đề + trạng thái + kỹ năng dạng huy hiệu. Khối "Thông tin" là các
 * hàng có ô icon tông màu (giờ · người · hạn) — số liệu người ứng tuyển cân nhắc đầu tiên, liếc là thấy.
 */
export function PostDetailBody({ post }: PostDetailBodyProps) {
  // Lưới thân màn chuẩn (`screen-layout.md`): khe 24 giữa các khối, 8 dưới AppBar.
  return (
    <View className="gap-xl py-xs">
      <View className="gap-sm">
        <View className="flex-row items-start gap-sm">
          <Avatar
            name={post.workspace.name}
            size="lg"
            source={post.workspace.avatarUrl ? { uri: post.workspace.avatarUrl } : undefined}
          />
          <View className="flex-1 gap-2xs">
            <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
              {post.title}
            </Text>
            <Text className="text-body-md text-fg-2">
              {post.workspace.name} · đăng bởi {post.createdBy.name}
            </Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-xs">
          <Badge
            label={POST_STATUS_LABEL[post.status]}
            size="sm"
            variant={post.status === 'OPEN' ? 'success' : 'neutral'}
          />
          {post.hidden ? <Badge label="Đã bị ẩn" size="sm" variant="error" /> : null}
        </View>
        {post.skillLabels.length > 0 ? (
          <View accessibilityLabel={`Kỹ năng cần: ${post.skillLabels.join(', ')}`} accessible className="flex-row flex-wrap gap-2xs">
            {post.skillLabels.map((skill) => (
              <Badge key={skill} label={skill} size="sm" variant="brand" />
            ))}
          </View>
        ) : null}
      </View>
      {post.myApplication ? (
        <Alert
          description={`Đơn của bạn: ${APPLICATION_STATUS_LABEL[post.myApplication.status]}`}
          tone="info"
        />
      ) : null}
      <Section title="Mô tả">
        <Card>
          <Text className="text-body-md text-fg-1" selectable>
            {post.description}
          </Text>
        </Card>
      </Section>
      <Section title="Thông tin">
        <Card className="gap-0">
          <ListItem
            className="py-xs"
            description={`${String(post.commitmentHoursPerWeek)} giờ/tuần`}
            divider
            emphasis="title"
            label="Cam kết"
            leading={<IconTile name="timer" size="sm" tone="info" />}
          />
          <ListItem
            className="py-xs"
            description={mentorsNeededText(post.mentorsNeeded, post.activeEngagements)}
            divider
            emphasis="title"
            label="Số cố vấn"
            leading={<IconTile name="add-team" size="sm" tone="success" />}
          />
          <ListItem
            className="py-xs"
            description={`${deadlineText(post.expiresAt)} · ${String(post.applicantsCount)} đơn`}
            emphasis="title"
            label="Nhận đơn"
            leading={<IconTile name="calendar" size="sm" tone="warning" />}
          />
        </Card>
      </Section>
    </View>
  );
}
