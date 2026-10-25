import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { Input } from '@/shared/ui/input';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { TaskReviewDto } from '../../api/reviews.types';
import { REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../../constants/review.constants';
import { useMentionables } from '../../queries/task-comments.queries';
import { isValidReviewReason } from '../../schemas/review.schemas';

export interface ReassignReviewerBodyProps {
  boardId: string;
  /** Không được chọn: người làm thẻ và người đã có review trong lượt (BE cũng chặn — ẩn để khỏi chọn nhầm rồi báo lỗi). */
  excludeIds: readonly string[];
  error?: string | null;
  pending?: boolean;
  /** Review đang được giao lại — tên người chấm hiện tại lên dòng mô tả của tấm. */
  review: TaskReviewDto;
  onClose: () => void;
  onConfirm: (payload: { reason: string; toUserId?: string }) => void;
}

/** Dấu tick NHÌN THẤY của hàng đang chọn (trạng thái cho trình đọc màn hình đi qua `selected` của `ListItem`). */
const mark = (on: boolean) =>
  on ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" /> : undefined;

const SKELETON_ROWS = [0, 1, 2] as const;

interface CandidateRowsProps {
  boardId: string;
  excludeIds: readonly string[];
  selectedId: string | undefined;
  onSelect: (userId: string) => void;
}

/** Người thay thế (MEMBER+ ACTIVE ≤ 20, trừ người bị loại) — kèm đủ ba trạng thái tải / lỗi / rỗng. */
function CandidateRows({ boardId, excludeIds, selectedId, onSelect }: CandidateRowsProps) {
  const found = useMentionables(boardId, '', true);
  const candidates = (found.data ?? []).filter((person) => !excludeIds.includes(person.id));

  if (found.isLoading) {
    return (
      <View className="gap-md py-sm">
        {SKELETON_ROWS.map((key) => (
          <SkeletonParagraphWithIcon key={key} />
        ))}
      </View>
    );
  }
  if (found.isError) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void found.refetch() }]}
        // `px-0`: nằm TRONG `SheetList` (đã lề 16) — giữ `px-md` riêng của `EmptyState` là thụt 32.
        className="px-0"
        description="Không tải được danh sách thành viên. Bạn vẫn có thể để hệ thống tự chọn."
        icon="alert-warning"
        size="compact"
        tone="danger"
      />
    );
  }
  if (candidates.length === 0) {
    return (
      <EmptyState
        className="px-0"
        description="Không còn thành viên nào khác nhận chấm được."
        icon="user"
        size="compact"
        tone="neutral"
      />
    );
  }
  return candidates.map((person, index) => (
    <ListItem
      key={person.id}
      divider={index < candidates.length - 1}
      emphasis="title"
      label={person.name}
      leading={
        <Avatar
          name={person.name}
          size="sm"
          source={person.avatarUrl ? { uri: person.avatarUrl } : undefined}
        />
      }
      selected={selectedId === person.id}
      trailing={mark(selectedId === person.id)}
      onPress={() => onSelect(person.id)}
    />
  ));
}

/**
 * Cả tấm "Giao lại người chấm": danh sách người thay (hoặc tự chọn theo cân tải) + lý do ≥ 10 ký tự + nút Giao lại.
 * Dựng mới mỗi lần mở (`key` ở `ReassignReviewerSheet`) nên lựa chọn/lý do tự về mặc định.
 *
 * ✅ Ô LÝ DO + nút nằm ở `footer` (đứng yên): trước đây chúng nằm dưới đáy danh sách tới 20 người — phải cuộn hết mới
 * thấy nơi nhập lý do, và nút "Giao lại" là viên thuốc nhỏ dạt trái. Ô giờ có nhãn thật nên dòng "Tối thiểu 10 ký tự"
 * (khe `hint` chỉ vẽ khi có `label`) mới hiện ra. Lỗi máy chủ ghim ở `alert`.
 */
export function ReassignReviewerBody({
  boardId,
  error,
  excludeIds,
  pending = false,
  review,
  onClose,
  onConfirm,
}: ReassignReviewerBodyProps) {
  const [toUserId, setToUserId] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState('');
  const valid = isValidReviewReason(reason);

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      description={`Người chấm hiện tại: ${review.reviewer.name || 'Thành viên đã rời'}`}
      // Đang gửi thì chạm nền mờ không đóng tấm — đóng giữa chừng mà yêu cầu vẫn chạy là mất dấu kết quả.
      dismissOnBackdrop={!pending}
      footer={
        <View className="gap-sm">
          <Input
            hint={`Tối thiểu ${REVIEW_REASON_MIN} ký tự`}
            label="Lý do giao lại"
            maxLength={REVIEW_REASON_MAX}
            multiline
            placeholder="Vì sao cần giao lại?"
            required
            value={reason}
            onChangeText={setReason}
          />
          <Button
            disabled={!valid}
            fullWidth
            label="Giao lại"
            loading={pending}
            onPress={() => onConfirm({ reason: reason.trim(), ...(toUserId ? { toUserId } : {}) })}
          />
        </View>
      }
      padded={false}
      scrollable
      title="Giao lại người chấm"
      visible
      onClose={onClose}
    >
      <SheetList accessibilityLabel="Người chấm thay" accessibilityRole="radiogroup">
        <ListItem
          description="Hệ thống chọn người đang chờ chấm ít nhất."
          divider
          emphasis="title"
          label="Tự chọn theo cân tải"
          leading={<IconTile name="magic-wand-01" size="sm" tone="brand" />}
          selected={toUserId === undefined}
          trailing={mark(toUserId === undefined)}
          onPress={() => setToUserId(undefined)}
        />
        <CandidateRows
          boardId={boardId}
          excludeIds={excludeIds}
          selectedId={toUserId}
          onSelect={setToUserId}
        />
      </SheetList>
    </BottomSheet>
  );
}
