import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { ModuleBanner } from '@/shared/ui/banner';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import { integrationsService } from '../api/integrations.service';
import type { ProviderInfo } from '../api/integrations.types';
import { ProviderCard } from '../components/ProviderCard';
import { useConnectProvider } from '../hooks/useConnectProvider';
import { useIntegrationSocket } from '../hooks/useIntegrationSocket';
import { useIntegrationProviders, useWorkspaceIntegrations } from '../queries/integrations.queries';
import { callbackErrorText } from '../utils/integration-labels';

/**
 * Tích hợp của nhóm (app.md §3 "Marketplace"): thẻ GitHub/GitLab/Figma kèm các kết nối hiện có. OWNER/ADMIN kết nối qua trình duyệt hệ thống
 * (`useConnectProvider`) rồi mở màn cấu hình; MEMBER chỉ xem tên nhà cung cấp + kênh nhận (BE đã rút gọn dữ liệu). Mất mạng → khoá Kết nối.
 */
export function IntegrationMarketplaceScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const providers = useIntegrationProviders();
  const list = useWorkspaceIntegrations(wsId);
  const { connect, pending } = useConnectProvider();
  const offline = useConnectionState() === 'offline';
  const [error, setError] = useState<string | null>(null);
  useIntegrationSocket(wsId);

  const workspaceProviders = (providers.data ?? []).filter((p) => p.kind === 'WORKSPACE');
  const canManage = list.data?.canManage === true;

  function openDetail(integrationId: string): void {
    router.push({
      params: { integrationId, wsId },
      pathname: '/workspaces/[wsId]/integrations/[integrationId]',
    });
  }

  async function handleConnect(provider: ProviderInfo): Promise<void> {
    const outcome = await connect(() => integrationsService.connect(wsId, provider.key)).catch(
      () => null,
    );
    if (!outcome || outcome.status === 'cancelled') return;
    if (outcome.status === 'ok' && outcome.id) openDetail(outcome.id);
    else setError(callbackErrorText(outcome.code));
  }

  const loading = providers.isLoading || list.isLoading;
  const failed = providers.isError || list.isError;

  return (
    <Screen
      header={<AppBar title="Tích hợp" onBack={router.back} />}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
    >
      <View className="gap-md py-xs">
        {/* Dải đầu màn: nói tích hợp để LÀM GÌ (AppBar chỉ có chữ "Tích hợp") — mắt xích `link`, tông `info` của phân hệ Nhóm. */}
        <Reveal>
          <ModuleBanner
            description="Nhận thông báo từ GitHub, GitLab, Figma ngay trong kênh của nhóm."
            icon="link"
            title="Kết nối công cụ của nhóm"
            tone="info"
          />
        </Reveal>
        {loading ? (
          <Card>
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </Card>
        ) : failed ? (
          // Mất mạng thì nói rõ là lỗi KẾT NỐI (`offline`), không phải app hỏng.
          <ScreenState
            action={{
              label: 'Thử lại',
              onPress: () => void Promise.all([providers.refetch(), list.refetch()]),
            }}
            fullscreen={false}
            state={isNetworkError(providers.error ?? list.error) ? 'offline' : 'error'}
            title="Không tải được danh sách tích hợp"
          />
        ) : workspaceProviders.length === 0 ? (
          <EmptyState icon="link" title="Chưa có nhà cung cấp nào được bật" tone="neutral" />
        ) : (
          <>
            {(list.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                description={
                  canManage
                    ? 'Kết nối GitHub để nhận thông báo commit vào kênh hoặc nhóm chat.'
                    : 'Quản trị nhóm có thể kết nối GitHub để nhận thông báo commit.'
                }
                icon="link"
                title="Chưa có tích hợp"
              />
            ) : null}
            {workspaceProviders.map((p) => (
              <ProviderCard
                key={p.provider}
                busy={pending || offline}
                canManage={canManage}
                connections={(list.data?.items ?? []).filter((i) => i.provider === p.provider)}
                provider={p}
                onConnect={(provider) => void handleConnect(provider)}
                onOpen={openDetail}
              />
            ))}
          </>
        )}
      </View>
      <Dialog
        description={error ?? ''}
        primaryAction={{ label: 'Đã hiểu', onPress: () => setError(null) }}
        title="Không kết nối được"
        variant="warning"
        visible={error !== null}
        onClose={() => setError(null)}
      />
    </Screen>
  );
}
