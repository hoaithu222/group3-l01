import { router } from 'expo-router';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useJoinRequests } from '../queries/join-requests.queries';

export interface JoinRequestsEntryProps {
  /** Lớp cho khối ngoài — màn `padded={false}` truyền `px-md` để dòng thẳng cột 16 với ô tìm. */
  className?: string;
  /** Chỉ OWNER/ADMIN của nhóm bật duyệt (`joinPolicy=APPROVAL`) mới có yêu cầu để xem. */
  enabled: boolean;
  wsId: string;
}

/**
 * Lối vào "Yêu cầu tham gia" ở đầu màn Thành viên, kèm số yêu cầu đang chờ
 * (app.md p3-04 §3: "badge số ở màn Thành viên"). Ẩn khi không bật duyệt HOẶC khi
 * chưa có yêu cầu nào — màn Thành viên không thêm dòng vô nghĩa cho nhóm thường.
 *
 * Đếm bằng trang đầu của danh sách (cursor, không có `total`): đủ 20 và còn trang
 * sau thì ghi "20+" thay vì một con số sai.
 */
export function JoinRequestsEntry({ className, enabled, wsId }: JoinRequestsEntryProps) {
  const requests = useJoinRequests(wsId, enabled);
  // Yêu cầu mới do NGƯỜI KHÁC gửi không có sự kiện tới màn này — quay lại màn Thành viên (đã cũ) thì đếm lại.
  useRefetchOnFocus(requests, enabled);
  const { data } = requests;
  const firstPage = data?.pages[0];
  const count = firstPage?.items.length ?? 0;
  if (!enabled || count === 0) return null;

  const label = firstPage?.meta.hasMore ? `${count}+` : String(count);

  return (
    // Khung riêng (như các lối vào ở MeScreen): dòng này là VIỆC CẦN LÀM, khác với danh sách người bên dưới.
    <View className={className}>
      <Card padded={false}>
        <ListItem
          className="px-md"
          emphasis="title"
          label="Yêu cầu tham gia"
          // Tông `warning`: đây là VIỆC CẦN XỬ LÝ (có người đang chờ), cùng tông với huy hiệu số bên phải.
          leading={<IconTile name="user-add" size="sm" tone="warning" />}
          trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
          value={<Badge accessibilityLabel={`${label} yêu cầu đang chờ`} label={label} variant="warning" />}
          onPress={() => router.push({ pathname: '/workspaces/[wsId]/members/requests', params: { wsId } })}
        />
      </Card>
    </View>
  );
}
