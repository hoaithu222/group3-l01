import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen } from '@/shared/ui/screen';

import { integrationKeys } from '../queries/integrations.queries';
import { parseCallback } from '../utils/callback-url';
import { callbackErrorText } from '../utils/integration-labels';

/**
 * `superapp://integrations/callback?status&provider&id&code&workspaceId` (app.md §1/§4) — đường về khi hệ điều hành đã đóng app giữa lúc OAuth
 * (Android), nên `openAuthSessionAsync` không nhận được kết quả. Thành công → mở thẳng màn cấu hình (hoặc Lịch cá nhân); lỗi → thông điệp theo
 * mã (`INT_003` "Phiên kết nối hết hạn"…). Tham số chỉ nhận đúng dạng (`parseCallback`) — không bao giờ điều hướng tới đường dẫn tuỳ ý.
 */
export function IntegrationCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const outcome = parseCallback(params);
  const qc = useQueryClient();
  const { id, workspaceId } = outcome;
  const kind: 'calendar' | 'integration' | null =
    outcome.status !== 'ok'
      ? null
      : outcome.provider === 'google-calendar'
        ? 'calendar'
        : id && workspaceId
          ? 'integration'
          : null;

  useEffect(() => {
    if (!kind) return;
    void qc.invalidateQueries({ queryKey: integrationKeys.all });
    if (kind === 'calendar') router.replace('/me/integrations');
    else if (id && workspaceId)
      router.replace({
        params: { integrationId: id, wsId: workspaceId },
        pathname: '/workspaces/[wsId]/integrations/[integrationId]',
      });
  }, [kind, id, workspaceId, qc]);

  if (kind) {
    return (
      <Screen>
        <View className="py-xl">
          <LoadingMore label="Đang hoàn tất kết nối…" />
        </View>
      </Screen>
    );
  }

  const cancelled = outcome.status === 'cancelled';
  return (
    <Screen>
      <EmptyState
        actions={[
          {
            label: 'Quay lại',
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
          },
        ]}
        description={cancelled ? 'Bạn đã huỷ kết nối.' : callbackErrorText(outcome.code)}
        icon={cancelled ? 'unlink' : 'alert-warning'}
        title={cancelled ? 'Đã huỷ kết nối' : 'Không kết nối được'}
        tone={cancelled ? 'neutral' : 'danger'}
      />
    </Screen>
  );
}
