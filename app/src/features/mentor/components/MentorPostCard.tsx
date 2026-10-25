import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Icon, type IconName } from '@/shared/ui/icon';

import type { MentorPostCard as MentorPostCardData } from '../api/mentor.types';
import { APPLICATION_STATUS_LABEL } from '../constants/mentor.constants';
import { deadlineText, mentorsNeededText } from '../utils/mentor-format';

export interface MentorPostCardProps {
  post: MentorPostCardData;
  onPress: (post: MentorPostCardData) => void;
}

/** Số huy hiệu kỹ năng hiện trên thẻ — đủ để nhận ra bài hợp mình, còn lại gộp "+N" (chi tiết bài có đủ). */
const MAX_SKILLS = 3;

/** Một số liệu của dòng cuối: icon + chữ — ba ý (giờ/tuần · số cố vấn · hạn) mỗi ý một mốc nhìn thay cho một chuỗi dài. */
function Stat({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View className="flex-row items-center gap-3xs">
      <Icon color="fg-2" name={icon} size={14} />
      <Text className="text-caption-sm text-fg-2">{text}</Text>
    </View>
  );
}

/**
 * Một bài trên bảng tin (app.md §3): tiêu đề, NHÓM (ảnh + tên nhóm + người đăng — không lộ thành viên), kỹ năng (huy hiệu), giờ/tuần,
 * "Cần 2 · Đã có 1", hạn; đã ứng tuyển → nhãn trạng thái bằng CHỮ. Cả thẻ là MỘT ô trợ năng (nhãn đọc đủ cả kỹ năng).
 * `active:opacity-70`: phản hồi nhấn của hàng tự dựng (hàng của `FlashList` — không bọc `Reveal`).
 */
export function MentorPostCard({ onPress, post }: MentorPostCardProps) {
  const needed = mentorsNeededText(post.mentorsNeeded, post.activeEngagements);
  const applied = post.myApplication ? APPLICATION_STATUS_LABEL[post.myApplication.status] : null;
  const skills = post.skillLabels.slice(0, MAX_SKILLS);
  const moreSkills = post.skillLabels.length - skills.length;
  const label = [
    post.title,
    `Nhóm ${post.workspace.name}`,
    post.skillLabels.length > 0 ? `Kỹ năng: ${post.skillLabels.join(', ')}` : null,
    `${String(post.commitmentHoursPerWeek)} giờ mỗi tuần`,
    needed,
    applied ? `Đơn của bạn: ${applied}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-[44px] gap-xs border-b border-b-divider-1 px-md py-sm active:opacity-70"
      onPress={() => onPress(post)}
    >
      <View className="flex-row items-center gap-sm">
        {/* Ảnh nhóm (`workspace.avatarUrl`) khi có — thiếu/lỗi thì chữ viết tắt tên nhóm như trước. */}
        <Avatar
          name={post.workspace.name}
          size="md"
          source={post.workspace.avatarUrl ? { uri: post.workspace.avatarUrl } : undefined}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
            {post.title}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {post.workspace.name} · {post.createdBy.name}
          </Text>
        </View>
        {applied ? <Badge label={applied} size="sm" variant="info" /> : null}
      </View>
      {skills.length > 0 ? (
        <View className="flex-row flex-wrap gap-2xs">
          {skills.map((skill) => (
            <Badge key={skill} label={skill} size="sm" variant="brand" />
          ))}
          {moreSkills > 0 ? (
            <Badge label={`+${String(moreSkills)}`} size="sm" variant="neutral" />
          ) : null}
        </View>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-x-md gap-y-2xs">
        <Stat icon="timer" text={`${String(post.commitmentHoursPerWeek)} giờ/tuần`} />
        <Stat icon="add-team" text={needed} />
        <Stat icon="calendar" text={deadlineText(post.expiresAt)} />
      </View>
    </Pressable>
  );
}
