import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Input } from '@/shared/ui/input';

import type { ResolveAction } from '../api/moderation.types';
import { RESOLVE_ACTION_COPY, RESOLVE_REASON_LIMITS } from '../constants/moderation.constants';

export interface ResolveReportFormProps {
  action: ResolveAction;
  disabled: boolean;
  errorMessage: string | null;
  onChangeReason: (reason: string) => void;
  reason: string;
  reasonError: string | undefined;
}

/**
 * Bước 2 của `ReportReviewSheet` (app.md p1-08 §3 `ResolveReportSheet`): hậu quả nói thẳng + ô LÝ DO bắt
 * buộc ≥ 10 ký tự. Lý do được ghi audit, và với "Gỡ tin" thì tác giả nhận được đúng câu này — nên ô
 * nhập là `required`, không phải tuỳ chọn.
 */
export function ResolveReportForm({
  action,
  disabled,
  errorMessage,
  onChangeReason,
  reason,
  reasonError,
}: ResolveReportFormProps) {
  const copy = RESOLVE_ACTION_COPY[action];

  return (
    <View className="gap-md">
      <Text className="text-body-md text-fg-2">{copy.consequence}</Text>
      <Input
        disabled={disabled}
        hint={`${String(reason.length)}/${String(RESOLVE_REASON_LIMITS.max)}`}
        label="Lý do"
        maxLength={RESOLVE_REASON_LIMITS.max}
        message={reasonError}
        multiline
        placeholder={`Nhập lý do (tối thiểu ${String(RESOLVE_REASON_LIMITS.min)} ký tự)`}
        required
        value={reason}
        onChangeText={onChangeReason}
      />
      {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
    </View>
  );
}
