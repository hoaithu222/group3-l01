import * as Clipboard from 'expo-clipboard';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { showToast } from '@/shared/utils/toast.utils';

export interface RecapConflictNoticeProps {
  /** Còn đang ở trạng thái 409 (chưa nạp bản mới). */
  conflict: boolean;
  loading?: boolean;
  /** Bản của MÌNH lúc bị 409 — `null` khi không có gì để giữ. */
  mine: string | null;
  onDiscardMine: () => void;
  onLoadLatest: () => void;
  onRestoreMine: () => void;
}

/**
 * 409 `RES_003` khi lưu (app.md §3): "Biên bản vừa được người khác sửa" + "Xem bản mới". Bản đang nhập KHÔNG mất: nằm trong khối "Bản của
 * bạn" (chép được, hoặc "Dùng lại bản của tôi" — lần lưu sau là ghi đè CÓ CHỦ Ý trên phiên bản mới nhất).
 */
export function RecapConflictNotice({ conflict, loading, mine, onDiscardMine, onLoadLatest, onRestoreMine }: RecapConflictNoticeProps) {
  if (!conflict && mine === null) return null;
  return (
    <View className="gap-xs">
      {conflict ? (
        <Alert
          actions={<Button label="Xem bản mới" loading={loading} size="sm" variant="secondary" onPress={onLoadLatest} />}
          description="Bản của bạn vẫn được giữ bên dưới để chép lại."
          title="Biên bản vừa được người khác sửa"
          tone="warning"
        />
      ) : null}
      {mine !== null && !conflict ? (
        <Card className="gap-xs">
          <Text className="text-label-md text-fg-1">Bản của bạn (chưa lưu)</Text>
          <Text className="text-body-md text-fg-2" numberOfLines={6} selectable>
            {mine || '(trống)'}
          </Text>
          <View className="flex-row flex-wrap gap-xs">
            <Button label="Dùng lại bản của tôi" size="sm" variant="secondary" onPress={onRestoreMine} />
            <Button
              label="Sao chép"
              size="sm"
              variant="tertiary"
              onPress={() => void Clipboard.setStringAsync(mine).then(() => showToast('success', 'Đã sao chép bản của bạn.'))}
            />
            <Button label="Bỏ bản này" size="sm" variant="neutral-tertiary" onPress={onDiscardMine} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
