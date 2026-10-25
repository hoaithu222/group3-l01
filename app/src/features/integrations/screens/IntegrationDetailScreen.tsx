import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import { EventTypeChecklist } from '../components/EventTypeChecklist';
import { IntegrationStatusBanner } from '../components/IntegrationStatusBanner';
import { RepoPickerSheet } from '../components/RepoPickerSheet';
import { TargetScopePicker } from '../components/TargetScopePicker';
import { WebhookEventList } from '../components/WebhookEventList';
import { useIntegrationDraft } from '../hooks/useIntegrationDraft';
import { useIntegrationSocket } from '../hooks/useIntegrationSocket';
import { useDisconnectIntegration, useIntegrationDetail } from '../queries/integrations.queries';
import { PROVIDER_LABELS } from '../utils/integration-labels';

/**
 * Cấu hình một kết nối (app.md §3 "Chi tiết"): tài khoản ngoài, banner trạng thái, repo theo dõi (≤ 20), loại sự kiện, nơi nhận (kênh hoặc nhóm chat), Lưu
 * (`expectedVersion`), Ngắt kết nối (xác nhận nêu hậu quả) và log sự kiện. 404 (đã ngắt/không còn quyền) → về marketplace.
 */
export function IntegrationDetailScreen() {
  const { integrationId, wsId } = useLocalSearchParams<{ integrationId: string; wsId: string }>();
  const { data: view, error, isLoading, isError, refetch } = useIntegrationDetail(integrationId);
  const draft = useIntegrationDraft(view, wsId);
  const disconnect = useDisconnectIntegration(wsId);
  const offline = useConnectionState() === 'offline';
  const [picking, setPicking] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useIntegrationSocket(wsId);

  const header = (
    <AppBar
      title={view ? `${PROVIDER_LABELS[view.provider]} · ${view.externalName}` : 'Tích hợp'}
      onBack={router.back}
    />
  );
  if (isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (isError && isNetworkError(error)) {
    // Mất mạng: nói rõ là lỗi KẾT NỐI (Thử lại chữa được) — không phải "không còn quyền".
    return (
      <Screen header={header}>
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void refetch() }}
          state="offline"
          title="Không mở được tích hợp"
        />
      </Screen>
    );
  }
  if (isError || !view) {
    // 404/mất quyền (quy ước `ScreenState forbidden`): ổ khoá tông `warning`, không phải lỗi hệ thống.
    return (
      <Screen header={header}>
        <EmptyState
          actions={[
            { label: 'Về danh sách tích hợp', onPress: () => router.back() },
            { label: 'Thử lại', onPress: () => void refetch() },
          ]}
          description="Kết nối không còn tồn tại hoặc bạn không còn quyền quản lý."
          icon="lock"
          title="Không mở được tích hợp"
          tone="warning"
        />
      </Screen>
    );
  }

  const locked = offline || view.status === 'REVOKED';
  return (
    <Screen header={header}>
      <View className="gap-xl py-xs">
        <IntegrationStatusBanner reason={view.statusReason} status={view.status} />
        {draft.conflict ? (
          <Alert
            description="Cấu hình vừa được đổi ở nơi khác — đã tải lại bản mới nhất."
            title="Đã có thay đổi mới"
            tone="warning"
          />
        ) : null}
        {/* Tiêu đề nhóm NGOÀI thẻ + icon mốc (`Section icon`) — màn cấu hình dài, cùng khuôn các màn cài đặt khác. */}
        <Section icon="document" title="Repo theo dõi">
          <Card>
            <View className="gap-xs">
              {draft.repos.length === 0 ? (
                <Text className="text-body-md text-fg-2">
                  Chưa chọn repo nào — chọn repo để bắt đầu nhận thông báo.
                </Text>
              ) : (
                draft.repos.map((r) => (
                  <View key={r.id} className="flex-row items-center gap-xs">
                    <Icon color="fg-2" name="file-2" size="sm" />
                    <Text className="flex-1 text-body-md text-fg-1">{r.fullName}</Text>
                  </View>
                ))
              )}
              <View className="flex-row">
                <Button
                  disabled={locked}
                  iconLeft="add"
                  label="Chọn repo"
                  size="sm"
                  variant="secondary"
                  onPress={() => setPicking(true)}
                />
              </View>
            </View>
          </Card>
        </Section>
        <Section icon="filter" title="Loại sự kiện">
          <Card>
            <EventTypeChecklist
              disabled={locked}
              supported={view.supportedEvents}
              value={draft.events}
              onChange={draft.setEvents}
            />
          </Card>
        </Section>
        <Card>
          <TargetScopePicker
            current={view.target}
            disabled={locked}
            error={draft.targetError}
            value={draft.target}
            wsId={wsId}
            onChange={draft.setTarget}
          />
        </Card>
        <Button
          disabled={!draft.dirty || locked}
          fullWidth
          label="Lưu cấu hình"
          loading={draft.saving}
          onPress={draft.save}
        />
        <WebhookEventList integrationId={view.id} offline={offline} />
        <Button
          disabled={offline}
          fullWidth
          label="Ngắt kết nối"
          variant="danger-secondary"
          onPress={() => setConfirmDisconnect(true)}
        />
      </View>
      {picking ? (
        <RepoPickerSheet
          integrationId={view.id}
          selected={draft.repos}
          visible
          onClose={() => setPicking(false)}
          onDone={(next) => {
            draft.setRepos(next);
            setPicking(false);
          }}
        />
      ) : null}
      <Dialog
        description="Kênh sẽ ngừng nhận thông báo và log sự kiện của kết nối bị xoá. Với GitHub, hãy gỡ ứng dụng trong cài đặt tổ chức để thu hồi hẳn quyền."
        primaryAction={{
          label: 'Ngắt kết nối',
          loading: disconnect.isPending,
          onPress: () => disconnect.mutate(view.id, { onSuccess: () => router.back() }),
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirmDisconnect(false) }}
        title="Ngắt kết nối tích hợp?"
        variant="warning"
        visible={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </Screen>
  );
}
