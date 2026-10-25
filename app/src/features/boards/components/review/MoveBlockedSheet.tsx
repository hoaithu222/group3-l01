import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { MoveBlockedInfo } from '../../api/reviews.types';
import { useTaskReviews } from '../../queries/reviews.queries';
import { moveBlockedText } from '../../utils/review-text';

export interface MoveBlockedSheetProps {
  info: MoveBlockedInfo | null;
  onClose: () => void;
  /** Mở chi tiết thẻ (khối Chấm chéo, nơi giao lại/miễn chấm cho OWNER/ADMIN). */
  onOpenTask?: (taskId: string) => void;
}

/**
 * Tấm "Chưa thể hoàn thành thẻ" (p4-05 app.md §2 `MoveBlockedSheet`, PM2-06): BE chặn thẻ sang DONE khi chưa đủ lượt duyệt — kể cả kéo từ
 * TODO thẳng sang DONE. Nói rõ "Cần 2 lượt duyệt, đã có 1" + người còn chờ (đọc từ `GET /tasks/:id/reviews`, MEMBER thấy tên người chấm).
 * Thẻ đã về chỗ cũ (`useMoveTask` hoàn tác trước khi hiện tấm này). Client KHÔNG tự chặn từ dữ liệu có thể cũ — chỉ giải thích lời từ chối
 * của server.
 *
 * Bố cục: tên thẻ ở dòng mô tả của tấm (đứng yên dưới tiêu đề), người còn chờ là HÀNG có ảnh đại diện dưới tiêu đề nhóm "Còn chờ" (trước
 * đây là một câu nối bằng dấu phẩy), hai nút chia đôi đáy tấm [Xem chấm chéo | Đã hiểu] kèm ghi chú "đã về vị trí cũ" ngay trên.
 */
export function MoveBlockedSheet({ info, onClose, onOpenTask }: MoveBlockedSheetProps) {
  const reviews = useTaskReviews(info?.taskId ?? '', {
    enabled: info !== null && info.details.roundStatus === 'OPEN',
  });
  const waiting = (reviews.data?.currentRound?.reviews ?? []).filter(
    (review) => review.status === 'PENDING',
  );
  const text = info ? moveBlockedText(info.details) : null;

  return (
    <BottomSheet
      description={info?.taskTitle || undefined}
      footer={
        info ? (
          <SheetActions
            hint="Thẻ đã được đưa về vị trí cũ."
            primary={{ label: 'Đã hiểu', onPress: onClose }}
            secondary={
              onOpenTask
                ? {
                    // Nhãn nhìn thấy gọn cho nửa hàng (máy 360dp); câu đọc lên nói đủ nghĩa.
                    accessibilityLabel: 'Xem chấm chéo của thẻ',
                    label: 'Xem chấm chéo',
                    onPress: () => onOpenTask(info.taskId),
                  }
                : undefined
            }
          />
        ) : undefined
      }
      scrollable
      title="Chưa thể hoàn thành thẻ"
      visible={info !== null}
      onClose={onClose}
    >
      {info && text ? (
        // Không `pb-md`: tấm có `footer`, khe dưới khối cuối do vùng đáy lo.
        <View className="gap-md">
          <Alert description={text.hint} title={text.headline} tone="warning" />
          {waiting.length > 0 ? (
            <Section title="Còn chờ" tone="default">
              <View
                accessibilityLabel={`Còn chờ ${waiting.length} người chấm`}
                accessibilityRole="list"
              >
                {waiting.map((review, index) => {
                  const name = review.reviewer.name || 'Thành viên đã rời';
                  return (
                    <ListItem
                      key={review.id}
                      // `items-center`: hàng chỉ để đọc mặc định `items-start` — tên 24dp đứng lệch trên ảnh 32dp.
                      className="items-center"
                      divider={index < waiting.length - 1}
                      emphasis="title"
                      label={name}
                      leading={
                        <Avatar
                          name={name}
                          size="sm"
                          source={
                            review.reviewer.avatarUrl
                              ? { uri: review.reviewer.avatarUrl }
                              : undefined
                          }
                        />
                      }
                    />
                  );
                })}
              </View>
            </Section>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
