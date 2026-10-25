import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon, type IconName } from '@/shared/ui/icon';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { MeetingDetailDto, MeetingRsvp } from '../../api/meetings.types';
import { RSVP_LABEL } from '../../constants/meetings.constants';
import { useRsvp } from '../../queries/meetings.mutations';
import { classifyMeetingError } from '../../utils/meeting-errors';

const CHOICES: readonly Exclude<MeetingRsvp, 'PENDING'>[] = ['ACCEPTED', 'TENTATIVE', 'DECLINED'];

/** Icon của từng phản hồi — dùng CHUNG cho chip chọn và dòng tổng đếm để hai chỗ nói cùng một ngôn ngữ hình. */
const RSVP_ICON: Record<MeetingRsvp, IconName> = {
  ACCEPTED: 'checkmark-circle',
  DECLINED: 'clear-circle',
  PENDING: 'clock',
  TENTATIVE: 'alert-help',
};

/** Tổng đếm theo thứ tự đọc tự nhiên; nhãn viết thường vì đứng sau con số ("3 tham dự"). */
const SUMMARY: readonly { key: MeetingRsvp; label: string }[] = [
  { key: 'ACCEPTED', label: 'tham dự' },
  { key: 'TENTATIVE', label: 'có thể' },
  { key: 'DECLINED', label: 'không' },
  { key: 'PENDING', label: 'chưa phản hồi' },
];

/**
 * Phản hồi tham dự (RSVP) — CHỈ thông tin, không chặn vào phòng (README p2-04). Lạc quan: chip đổi ngay, lỗi thì hook hoàn về và
 * báo toast. Chỉ hiện chip khi server cho (`myActions.canRsvp`). Tổng đếm lấy từ `rsvpSummary` (socket cập nhật), vẽ thành các "viên"
 * icon + số để liếc là thấy, nhưng vẫn là MỘT câu cho trình đọc màn hình (đọc một lượt, không vuốt qua bốn ô rời).
 */
export function MeetingRsvpBar({ meeting }: { meeting: MeetingDetailDto }) {
  const rsvp = useRsvp(meeting.id);
  const summary = meeting.rsvpSummary;
  const spoken = SUMMARY.map((item) => `${String(summary[item.key])} ${item.label}`).join(', ');

  const choose = (next: Exclude<MeetingRsvp, 'PENDING'>) => {
    if (next === meeting.myRsvp || rsvp.isPending) return;
    hapticSelection();
    rsvp.mutate(next, {
      onError: (error) => showToast('error', classifyMeetingError(error).message),
    });
  };

  return (
    <Section icon="checkmark-square" title="Phản hồi tham dự">
      <View className="gap-sm">
        {meeting.myActions.canRsvp ? (
          <View className="gap-xs">
            <Text className="text-label-md text-fg-1">Bạn sẽ tham dự?</Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-xs">
              {CHOICES.map((choice) => (
                <Chip
                  key={choice}
                  label={RSVP_LABEL[choice]}
                  leading={
                    <Icon
                      color={meeting.myRsvp === choice ? 'fg-brand' : 'fg-2'}
                      name={RSVP_ICON[choice]}
                      size="sm"
                    />
                  }
                  role="radio"
                  selected={meeting.myRsvp === choice}
                  onPress={() => choose(choice)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View accessibilityLabel={`Phản hồi: ${spoken}`} accessible className="flex-row flex-wrap gap-xs">
          {SUMMARY.map((item) => (
            <View
              key={item.key}
              className="flex-row items-center gap-2xs rounded-full bg-bg-2 px-sm py-2xs"
            >
              <Icon color="fg-2" name={RSVP_ICON[item.key]} size={14} />
              <Text className="text-caption-lg text-fg-1">
                <Text className="font-semibold">{String(summary[item.key])}</Text> {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Section>
  );
}
