import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import { usePollVoters } from '../../hooks/usePollVoters';
import type { VotersTarget } from '../../store/chat-ext-intent.store';
import { describeChatExtError } from '../../utils/error-info';

export interface PollVotersSheetProps {
  target: VotersTarget | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Thân sheet — CHỈ dựng khi đang mở (`target` có) nên `optionId` chọn luôn khởi tạo lại từ ý định.
 *
 * ✅ Hàng người là `ListItem` (avatar 32 · tên `emphasis="title"` · kẻ ngăn) thay cho hàng tự dựng; đang tải là khung xương CÙNG HÌNH
 * hàng (avatar + chữ); rỗng/lỗi là `EmptyState` cỡ `compact` — bản `full` cao ~300dp, trong tấm thì đẩy cả hàng chip ra khỏi tầm nhìn.
 */
function VotersBody({ target, onClose }: { target: VotersTarget; onClose: () => void }) {
  const [optionId, setOptionId] = useState(target.optionId);
  const voters = usePollVoters(target.pollId, optionId);
  const info = voters.isError ? describeChatExtError(voters.error) : undefined;
  const gone = info?.gone === true && info.code !== 'POLL_006';

  // 404 (khảo sát không còn khả dụng / mất quyền kênh) là kết luận cuối: đóng tấm và báo, không bắt người dùng đọc một tấm rỗng.
  useEffect(() => {
    if (!gone) return;
    showToast('info', 'Khảo sát không còn khả dụng');
    onClose();
  }, [gone, onClose]);

  const people = voters.data?.pages.flatMap((page) => page.data) ?? [];

  let content;
  if (info?.code === 'POLL_006') {
    content = (
      <EmptyState
        description={info.message}
        icon="hide"
        size="compact"
        title="Khảo sát ẩn danh"
        tone="neutral"
      />
    );
  } else if (info) {
    content = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void voters.refetch() }]}
        description={info.message}
        icon="alert-warning"
        size="compact"
        title="Không tải được danh sách"
        tone="danger"
      />
    );
  } else if (voters.isPending) {
    content = (
      <View>
        {[0, 1, 2].map((i) => (
          <SkeletonParagraphWithIcon key={i} className="py-xs" />
        ))}
      </View>
    );
  } else if (people.length === 0) {
    content = (
      <EmptyState
        description="Khi có người chọn lựa chọn này, họ sẽ hiện ở đây."
        icon="contact-list"
        size="compact"
        title="Chưa ai chọn"
        tone="neutral"
      />
    );
  } else {
    content = (
      <View accessibilityRole="list">
        {people.map((person, index) => (
          <ListItem
            key={person.id}
            className="py-xs"
            divider={index < people.length - 1}
            emphasis="title"
            label={person.name}
            labelNumberOfLines={2}
            leading={
              // Trang trí: tên đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Avatar
                  name={person.name}
                  size="sm"
                  source={person.avatar ? { uri: person.avatar } : undefined}
                />
              </View>
            }
          />
        ))}
        {voters.hasNextPage ? (
          // Canh giữa: `Button` không `fullWidth` ôm sát chữ, để trần là một viên thuốc nhỏ dạt trái dưới danh sách.
          <View className="items-center pt-xs">
            <Button
              label="Xem thêm"
              loading={voters.isFetchingNextPage}
              variant="tertiary"
              onPress={() => void voters.fetchNextPage()}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="gap-sm pb-md">
      {/* ⚠️ `grow-0`: ScrollView ngang không có nó thì chiếm hết chiều cao còn lại của tấm và đẩy danh sách xuống đáy.
          `-mx-md` + `px-md`: hàng chip chạy TRÀN hai mép tấm khi cuộn (không bị cắt cụt ở lề 16) mà chip đầu vẫn thẳng lề nội dung. */}
      <ScrollView
        accessibilityLabel="Lựa chọn"
        accessibilityRole="radiogroup"
        className="-mx-md grow-0"
        contentContainerClassName="gap-xs px-md"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {target.options.map((option) => (
          <Chip
            key={option.id}
            label={option.text}
            role="radio"
            selected={option.id === optionId}
            onPress={() => setOptionId(option.id)}
          />
        ))}
      </ScrollView>
      {content}
    </View>
  );
}

/** Tấm "Người đã bầu" của khảo sát KHÔNG ẩn danh (app.md §3 `PollVotersScreen`, dựng dạng tấm: không thêm route vào bảng typed routes đã ~180 mục). Chip đổi lựa chọn, danh sách cuộn "Xem thêm". */
export function PollVotersSheet({ target, visible, onClose }: PollVotersSheetProps) {
  return (
    <BottomSheet
      description={target?.question}
      scrollable
      title="Người đã bầu"
      visible={visible}
      onClose={onClose}
    >
      {target ? <VotersBody key={target.pollId} target={target} onClose={onClose} /> : null}
    </BottomSheet>
  );
}
