import { Text, View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { LinkButton } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useTaskDetail } from '../../queries/task-detail.queries';
import { MarkdownView } from '../MarkdownView';

export interface ReviewTaskContextProps {
  boardId: string;
  taskId: string;
  onOpenDetail: () => void;
}

/**
 * Thẻ đang chấm (p4-05 app.md §3 `ReviewSubmit`, §7 "Tablet: 2 cột"): tiêu đề + liên kết mở chi tiết ở MỌI bề rộng; từ tablet thêm
 * mô tả, checklist và số tệp đính kèm CHỈ ĐỌC ở cột trái để người chấm đối chiếu ngay bên cạnh form chấm — không phải chuyển màn.
 *
 * Dùng `useBreakpoint` vì hai bố cục là hai CÂY khác nhau (điện thoại: chỉ tiêu đề). Dữ liệu là `useTaskDetail` (đã có trong cache khi
 * mở từ chi tiết thẻ; mở từ thông báo thì tải một lần). Không có nút sửa nào ở đây.
 */
export function ReviewTaskContext({ boardId, taskId, onOpenDetail }: ReviewTaskContextProps) {
  const { isTablet } = useBreakpoint();
  const { data, isLoading } = useTaskDetail(boardId, taskId);

  if (!data) {
    return isLoading ? <Skeleton className="h-16 rounded-md" /> : null;
  }

  const checklist = data.checklist.slice(0, 12);

  return (
    <Card>
      <View className="gap-sm">
        <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
          {data.title}
        </Text>
        <View className="flex-row">
          <LinkButton iconRight="arrow-right-small" label="Mở chi tiết thẻ" onPress={onOpenDetail} />
        </View>

        {isTablet ? (
          <View className="gap-md">
            {data.description ? <MarkdownView source={data.description} /> : null}
            {checklist.length > 0 ? (
              <View className="gap-xs">
                <Text className="text-label-lg font-semibold text-fg-1">{`Việc nhỏ ${data.checklistDone}/${data.checklistTotal}`}</Text>
                {checklist.map((item) => (
                  <View key={item.id} className="flex-row items-start gap-xs">
                    <Icon color={item.done ? 'success' : 'fg-2'} name={item.done ? 'checkmark-circle' : 'timer'} size="sm" />
                    <Text className="flex-1 text-body-md text-fg-1">{`${item.text}${item.done ? ' (đã xong)' : ''}`}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {data.attachmentCount > 0 ? (
              <Text className="text-body-md text-fg-2">{`${data.attachmentCount} tệp đính kèm — mở chi tiết thẻ để xem.`}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
