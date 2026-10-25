import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

import type { InviteMembersResult, InviteSkipReason } from '../api';

const SKIP_REASON_LABEL: Record<InviteSkipReason, string> = {
  ALREADY_MEMBER: 'đã là thành viên',
  PENDING_EXISTS: 'đã có lời mời đang chờ',
  BANNED: 'không thể mời người này',
};

export interface InviteEmailResultProps {
  result: InviteMembersResult;
}

/** "Đã gửi 3 · Bỏ qua 1 (đã là thành viên)" — kèm từng email bị bỏ và lý do (app.md p3-04 §3). */
export function InviteEmailResult({ result }: InviteEmailResultProps) {
  const { created, skipped } = result;
  const summary = `Đã gửi ${created.length}${skipped.length > 0 ? ` · Bỏ qua ${skipped.length}` : ''}`;

  return (
    <Alert
      description={
        skipped.length > 0 ? (
          <View className="gap-3xs">
            {skipped.map((item) => (
              <Text key={item.email} className="text-body-md text-fg-2">
                {item.email} — {SKIP_REASON_LABEL[item.reason]}
              </Text>
            ))}
          </View>
        ) : (
          'Người được mời sẽ nhận email kèm liên kết tham gia.'
        )
      }
      title={summary}
      tone={created.length > 0 ? 'success' : 'warning'}
    />
  );
}
