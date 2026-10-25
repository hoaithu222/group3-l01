import { Card } from '@/shared/ui/card';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { MeetingDetailDto } from '../../api/meetings.types';
import {
  openMeetingChat,
  openMeetingRecap,
  openMeetingRecapEditor,
  openMeetingRecordings,
} from '../../utils/meeting-navigation';

interface LinkRow {
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  /** Tông ô icon — mỗi lối vào một tông (chat · biên bản · bản ghi) để ba hàng liền nhau không trông như một khối xám. */
  tone: IconTileTone;
}

/**
 * Các lối vào đi kèm cuộc họp, MỌI hàng theo cờ server (`myActions.canViewRecap/canEditRecap`, `hasPublishedRecap`, `readyRecordingCount`) —
 * client không tự suy quyền:
 *  · nhóm chat (`conversationId`, tạo lúc lên lịch; bị lưu trữ khi họp huỷ/xoá nhưng vẫn mở xem lại được ⇒ không ẩn theo trạng thái);
 *  · người sửa (chủ trì/đồng chủ trì/người viết): "Viết biên bản" (chưa công bố) hoặc "Xem & sửa biên bản";
 *  · người xem: "Xem biên bản" chỉ khi ĐÃ công bố (nháp không lộ);
 *  · "Bản ghi cuộc họp (N)" khi có bản sẵn sàng; chủ trì còn thấy khi họp cho phép ghi (để theo dõi bản đang xử lý/lỗi).
 * Người chỉ có metadata (`isMetadataOnly`) không thấy hàng nào — BE không trả `conversationId` và từ chối biên bản/bản ghi cho họ.
 */
function linkRows(meeting: MeetingDetailDto): LinkRow[] {
  if (meeting.isMetadataOnly) return [];
  const a = meeting.myActions;
  const hostLike = meeting.myRole === 'HOST' || meeting.myRole === 'CO_HOST';
  const ran = meeting.status === 'LIVE' || meeting.status === 'ENDED';
  const showRecordings = meeting.readyRecordingCount > 0 || (hostLike && ran && meeting.recordingAllowed);
  const rows: LinkRow[] = [];

  const { conversationId } = meeting;
  if (conversationId) {
    rows.push({
      icon: 'chat-bubble',
      key: 'chat',
      label: 'Nhóm chat của cuộc họp',
      onPress: () => openMeetingChat(conversationId),
      tone: 'brand',
    });
  }
  if (a.canEditRecap) {
    rows.push({
      icon: 'edit',
      key: 'recap',
      label: meeting.hasPublishedRecap ? 'Xem & sửa biên bản' : 'Viết biên bản',
      onPress: () =>
        meeting.hasPublishedRecap ? openMeetingRecap(meeting.id) : openMeetingRecapEditor(meeting.id),
      tone: 'info',
    });
  } else if (a.canViewRecap) {
    rows.push({
      icon: 'document',
      key: 'recap',
      label: 'Xem biên bản',
      onPress: () => openMeetingRecap(meeting.id),
      tone: 'info',
    });
  }
  if (showRecordings) {
    rows.push({
      icon: 'play',
      key: 'recordings',
      label:
        meeting.readyRecordingCount > 0
          ? `Bản ghi cuộc họp (${String(meeting.readyRecordingCount)})`
          : 'Bản ghi cuộc họp',
      onPress: () => openMeetingRecordings(meeting.id),
      tone: 'accent',
    });
  }
  return rows;
}

/**
 * "Trao đổi & tài liệu" của chi tiết cuộc họp: MỘT thẻ, mỗi lối vào là một dòng bấm được — ô icon có tông + tiêu đề + mũi tên (khuôn
 * `MeNavRow`), thay cho ba nút `secondary` xếp dọc mỗi cái dưới một tiêu đề riêng. Không có lối vào nào ⇒ không vẽ cả khối.
 * Mũi tên `fg-2` chứ không `fg-3`: nó là dấu hiệu "bấm được", `fg-3` chỉ 2.96:1 trên thẻ trắng.
 */
export function MeetingLinksSection({ meeting }: { meeting: MeetingDetailDto }) {
  const rows = linkRows(meeting);
  if (rows.length === 0) return null;

  return (
    <Section icon="link" title="Trao đổi & tài liệu">
      <Card className="gap-0">
        {rows.map((row, index) => (
          <ListItem
            key={row.key}
            className="py-xs"
            divider={index < rows.length - 1}
            emphasis="title"
            label={row.label}
            leading={<IconTile name={row.icon} size="sm" tone={row.tone} />}
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={row.onPress}
          />
        ))}
      </Card>
    </Section>
  );
}
