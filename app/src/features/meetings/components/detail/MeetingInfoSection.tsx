import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { FORMAT_LABEL, PLATFORM_LABEL, VISIBILITY_LABEL } from '../../constants/meetings.constants';
import { canShareMeeting } from '../../utils/meeting-link';
import { MeetingInfoRow } from './MeetingInfoRow';

/**
 * Phần còn lại của thông tin cuộc họp (thời gian/phòng chờ ở `MeetingTimeHero`): nền tảng + hình thức, ai xem được, địa điểm, mã họp,
 * lý do huỷ, agenda. `isMetadataOnly` ⇒ BE đã lược agenda/địa điểm/link, ở đây chỉ báo cho người xem hiểu vì sao trống. Mã họp chỉ hiện khi
 * còn ai để mời (cùng điều kiện với nút "Chia sẻ" trên AppBar); việc chia sẻ nằm ở AppBar, không phải một nút riêng trong thân màn.
 *
 * Mỗi ý một hàng có icon ĐÚNG NGHĨA (máy quay/ghim địa điểm cho hình thức, ổ khoá/nhóm cho quyền xem) thay cho một dòng gộp ba ý dưới
 * icon người. Nội dung (agenda) là khối riêng có tiêu đề + thẻ — trả về HAI khối anh em (fragment) để khe 24 giữa các khối của màn
 * chi tiết áp cả cho nó.
 */
export function MeetingInfoSection({ meeting }: { meeting: MeetingDetailDto }) {
  return (
    <>
      <View className="gap-sm">
        <MeetingInfoRow
          icon={meeting.format === 'OFFLINE' ? 'location' : 'video-camera'}
          text={`${PLATFORM_LABEL[meeting.platform]} · ${FORMAT_LABEL[meeting.format]}`}
        />
        <MeetingInfoRow
          icon={meeting.visibility === 'ATTENDEES' ? 'lock' : 'add-team'}
          text={VISIBILITY_LABEL[meeting.visibility]}
        />
        {meeting.location ? <MeetingInfoRow icon="navigation-map" text={meeting.location} /> : null}
        {canShareMeeting(meeting) ? <MeetingInfoRow icon="link" text={`Mã họp: ${meeting.code}`} /> : null}
        {meeting.status === 'CANCELLED' && meeting.cancelReason ? (
          <Text className="text-body-md text-fg-2">Lý do huỷ: {meeting.cancelReason}</Text>
        ) : null}
        {meeting.isMetadataOnly ? (
          <Text className="text-body-md text-fg-2">
            Bạn đang xem thông tin tóm tắt với vai trò quản trị nhóm.
          </Text>
        ) : null}
      </View>
      {meeting.agenda ? (
        <Section icon="document" title="Nội dung">
          <Card>
            <Text className="text-body-md text-fg-1" selectable>
              {meeting.agenda}
            </Text>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
