import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import {
  accountModeFromChoice,
  choiceFromAccountMode,
  effectiveChoice,
  inheritLabel,
  NOTIFY_CHOICE_LABEL,
  NotifyModeSheet,
  useWorkspaceNotifyPreference,
  type NotifyChoice,
} from '@/shared/notifications';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { NotificationWorkspace } from '../hooks/useNotificationWorkspaces';

type Field = 'channelMode' | 'groupMode';

const FIELDS: {
  field: Field;
  icon: IconName;
  label: string;
  showMentions: boolean;
  tone: IconTileTone;
}[] = [
  { field: 'groupMode', icon: 'add-team', label: 'Nhóm chat', showMentions: true, tone: 'success' },
  { field: 'channelMode', icon: 'chat-bubble', label: 'Kênh', showMentions: true, tone: 'accent' },
];

export interface WorkspaceNotifySheetProps {
  onClose: () => void;
  workspace: NotificationWorkspace | null;
}

/**
 * Chế độ thông báo MẶC ĐỊNH cho nhóm chat và kênh TRONG một nhóm làm việc (p1-07 `app.md` §3): mỗi dòng mở `NotifyModeSheet`
 * dùng chung; "Theo mặc định" kế thừa cài đặt tài khoản và hiện giá trị kế thừa thực tế (`effective` từ BE).
 * Kênh/hội thoại đặt riêng vẫn thắng cài đặt này.
 */
export function WorkspaceNotifySheet({ onClose, workspace }: WorkspaceNotifySheetProps) {
  const preference = useWorkspaceNotifyPreference(workspace?.id);
  const [editing, setEditing] = useState<Field | null>(null);
  const data = preference.data;

  const rowValue = (field: Field): string => {
    if (!data) return '';
    return data[field] === 'INHERIT'
      ? inheritLabel(effectiveChoice(data.effective[field]))
      : NOTIFY_CHOICE_LABEL[choiceFromAccountMode(data[field])];
  };

  return (
    <>
      <BottomSheet
        description="Áp dụng cho mọi nhóm chat và kênh trong nhóm làm việc này, trừ nơi bạn đã đặt riêng."
        padded={false}
        title={workspace?.name ?? 'Thông báo'}
        visible={workspace !== null && editing === null}
        onClose={onClose}
      >
        {/* ⚠️ `padded={false}` nghĩa là tấm KHÔNG đệm gì: hàng `ListItem` cũng không tự có lề ngang (nó vốn nằm trong `Card`) nên
            phải bọc `SheetList` (lề 16 như tiêu đề) — thiếu thì chữ + mũi tên dính sát mép tấm. `pb-md` chừa khe dưới hàng
            cuối trước vùng an toàn của tấm. */}
        <SheetList accessibilityRole="list" className="pb-md">
          {preference.isLoading ? (
            // Khung xương CÙNG HÌNH hai hàng cài đặt (ô icon + nhãn/giá trị) — thanh xám trơn không cho biết sắp hiện gì.
            <View className="py-xs">
              <SkeletonParagraphWithIcon className="py-xs" />
              <SkeletonParagraphWithIcon className="py-xs" />
            </View>
          ) : preference.isError || !data ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void preference.refetch() }]}
              description={toErrorMessage(preference.error)}
              icon="alert-warning"
              size="compact"
              title="Không tải được cài đặt"
              tone="danger"
            />
          ) : (
            FIELDS.map(({ field, icon, label, tone }, index) => (
              <ListItem
                key={field}
                className="py-xs"
                divider={index < FIELDS.length - 1}
                emphasis="title"
                label={label}
                leading={<IconTile name={icon} size="sm" tone={tone} />}
                trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
                value={rowValue(field)}
                onPress={() => setEditing(field)}
              />
            ))
          )}
        </SheetList>
      </BottomSheet>

      {data && editing ? (
        <NotifyModeSheet
          current={choiceFromAccountMode(data[editing])}
          inherited={effectiveChoice(data.effective[editing])}
          showMentions={FIELDS.find((f) => f.field === editing)?.showMentions}
          title={`${FIELDS.find((f) => f.field === editing)?.label ?? ''} trong ${workspace?.name ?? ''}`}
          visible
          onClose={() => setEditing(null)}
          onSelect={(choice: NotifyChoice) =>
            preference.update({ [editing]: accountModeFromChoice(choice) })
          }
        />
      ) : null}
    </>
  );
}
