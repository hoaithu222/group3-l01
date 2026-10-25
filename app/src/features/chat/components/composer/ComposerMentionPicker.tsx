import { MENTION_ALL_CONFIRM_ABOVE } from '../../chat.constants';
import { ALL_LABEL } from '../../mentions/mention-markup';
import { MentionPickerSheet } from '../../mentions/MentionPickerSheet';
import type { useComposerText } from '../../mentions/useComposerText';

export interface ComposerMentionPickerProps {
  picker: ReturnType<typeof useComposerText>['picker'];
  /** Nhóm đông: mở hộp xác nhận với số người sẽ nhận `@Tất cả` (thay vì chèn ngay). */
  onAskConfirmAll: (audience: number) => void;
}

/** Gợi ý nhắc tên nổi trên ô nhập — nối `picker` của `useComposerText` vào `MentionPickerSheet` (tách khỏi `ComposerBody` cho đủ trần 200 dòng). */
export function ComposerMentionPicker({ picker, onAskConfirmAll }: ComposerMentionPickerProps) {
  return (
    <MentionPickerSheet
      loading={picker.loading}
      query={picker.query}
      result={picker.result}
      onPickAll={() => {
        // Nhóm đông: hỏi lại trước khi báo cho cả nhóm (và đốt một lượt trong hạn mức 5 lần/giờ của BE).
        const audience = picker.result?.allCount;
        if (audience !== undefined && audience > MENTION_ALL_CONFIRM_ABOVE) onAskConfirmAll(audience);
        else picker.pick({ type: 'ALL', label: ALL_LABEL });
      }}
      onPickRole={(role) =>
        picker.pick({ type: 'ROLE', roleRef: role.roleRef, label: role.label, recipientCount: role.recipientCount })
      }
      onPickUser={(user) => picker.pick({ type: 'USER', userId: user.userId, label: user.name })}
    />
  );
}
