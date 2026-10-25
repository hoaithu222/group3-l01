import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import { SKIP_REASON_TEXT } from '../../constants/critical-path.constants';
import type { RescheduleController, RescheduleSession } from '../../hooks/useReschedule';
import { useTaskLookup } from '../../hooks/useTaskLookup';
import { rescheduleSheetTitle } from '../../utils/reschedule-text';
import { differsFromDevice, formatDayIn } from '../../utils/zoned-date';
import { RescheduleAffectedRow } from './RescheduleAffectedRow';

export interface RescheduleWarningSheetProps {
  boardId: string;
  controller: RescheduleController;
}

/**
 * Tấm cảnh báo dời lịch (app.md §2 `RescheduleWarningSheet`) — mở khi `PATCH` bị `TASK_006` hoặc khi kéo thanh Gantt làm
 * ảnh hưởng thẻ khác. Liệt kê THẺ SẼ DỜI (ngày cũ → mới, "+2 ngày"), cả THẺ KHÔNG DỜI kèm lý do (để người dùng không
 * nghĩ app bỏ sót — §7), rồi hai nút **Dời lịch** / **Huỷ**. Danh sách `affected` chỉ tới 200 mục: quá thì "và N thẻ khác".
 *
 * `TASK_019` (lịch vừa đổi) không đóng tấm mà THAY danh sách + banner "Lịch vừa thay đổi, hãy xem lại"; nút Dời lịch
 * sau đó dùng token mới (xem `useReschedule`). Ngày hiện theo múi giờ của SERVER, có ghi chú khi khác múi giờ máy.
 *
 * Bố cục: hai danh sách cùng nhịp hàng có kẻ ngăn; "Không dời" là nhóm `Section` với hàng `ListItem` (tên thẻ + lý do ở
 * dòng phụ) — trước đây là một bức tường dòng "tên — lý do" cùng một màu. Hàng nút là `SheetActions` [Huỷ | Dời lịch].
 */
export function RescheduleWarningSheet({ boardId, controller }: RescheduleWarningSheetProps) {
  const { applying, cancel, confirm, session } = controller;
  const { assigneesOf } = useTaskLookup(boardId);
  // Giữ phiên cuối cùng để tấm không "rỗng đi" trong nhịp trượt xuống sau khi đóng.
  const [shown, setShown] = useState<RescheduleSession | null>(session);
  if (session && session !== shown) setShown(session);

  const preview = shown?.preview;
  const timezone = preview?.timezone ?? '';
  const hiddenCount = preview ? Math.max(0, preview.affectedCount - preview.affected.length) : 0;

  const hasNotice = Boolean(shown?.error || shown?.refreshed);
  const notice = hasNotice ? (
    <View className="gap-xs">
      {shown?.error ? <Alert description={shown.error} tone="error" /> : null}
      {shown?.refreshed ? (
        <Alert
          description="Lịch vừa thay đổi, hãy xem lại danh sách trước khi dời."
          tone="warning"
        />
      ) : null}
    </View>
  ) : undefined;

  return (
    <BottomSheet
      alert={notice}
      description={
        preview
          ? `Hạn thẻ này sẽ đổi sang ${formatDayIn(preview.source.newDueDate, timezone)}.`
          : undefined
      }
      dismissOnBackdrop={!applying}
      footer={
        <SheetActions
          primary={{ label: 'Dời lịch', loading: applying, onPress: confirm }}
          // Đang áp thì khoá "Huỷ": đóng giữa chừng mà lệnh dời vẫn chạy là mất dấu kết quả.
          secondary={{ disabled: applying, label: 'Huỷ', onPress: cancel }}
        />
      }
      scrollable
      title={preview ? rescheduleSheetTitle(preview) : 'Dời lịch'}
      visible={session !== null}
      onClose={cancel}
    >
      {preview ? (
        // Không `pb-md`: tấm có `footer`, khe dưới khối cuối do vùng đáy lo.
        <View className="gap-md">
          {preview.mode === 'BULK' ? (
            <Alert
              description="Có nhiều thẻ nên việc dời chạy nền. Bạn sẽ nhận thông báo khi xong."
              tone="info"
            />
          ) : null}

          <View>
            {preview.affected.map((item, index) => (
              <RescheduleAffectedRow
                key={item.taskId}
                assignees={assigneesOf(item.taskId, item.assigneeIds)}
                divider={index < preview.affected.length - 1}
                item={item}
                timezone={timezone}
              />
            ))}
            {hiddenCount > 0 ? (
              <Text className="pt-xs text-body-md text-fg-2">{`và ${hiddenCount} thẻ khác`}</Text>
            ) : null}
          </View>

          {preview.skipped.length > 0 ? (
            <Section title="Không dời" tone="default">
              <View accessibilityRole="list">
                {preview.skipped.map((item, index) => (
                  <ListItem
                    key={item.taskId}
                    description={SKIP_REASON_TEXT[item.reason]}
                    divider={index < preview.skipped.length - 1}
                    emphasis="title"
                    label={item.title}
                    labelNumberOfLines={2}
                    // `sm` (14/20): cùng cỡ tiêu đề với hàng "sẽ dời" phía trên — nhóm phụ không được to hơn nhóm chính.
                    size="sm"
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {differsFromDevice(timezone) ? (
            <Text className="text-caption-sm text-fg-2">{`Ngày theo múi giờ ${timezone}.`}</Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
