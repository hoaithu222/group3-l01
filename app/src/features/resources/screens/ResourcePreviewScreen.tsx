import { isAxiosError } from 'axios';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { ActionMenu } from '@/shared/ui/action-menu';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { useFeature } from '@/shell/capabilities';

import { MeteredGate } from '../components/preview/MeteredGate';
import { PreviewActionBar } from '../components/preview/PreviewActionBar';
import { PreviewBody } from '../components/preview/PreviewBody';
import { PreviewInfoSheet } from '../components/preview/PreviewInfoSheet';
import { useIsOnline } from '../hooks/useIsOnline';
import { useMeteredConnection } from '../hooks/useMeteredConnection';
import { useResourceFileActions } from '../hooks/useResourceFileActions';
import { useResourceNavigation } from '../hooks/useResourceNavigation';
import { useResource } from '../queries/resources.queries';
import { shouldAskBeforeLoading } from '../utils/metered-gate';
import { resolvePreview } from '../utils/preview-kind';
import { removeResourceCache } from '../utils/resource-files';
import { printOrderHref } from '../utils/resource-routes';

/**
 * Xem trước một tệp (app.md p3-01 §3): tiêu đề, vùng xem theo `type`, thanh dưới
 * Tải về/Chia sẻ/Mở ngoài, "Thông tin". 404 (deep link, mất quyền) ⇒ màn TRUNG
 * TÍNH, không lộ tệp có tồn tại hay không. Rời màn ⇒ xoá bản tạm của tệp.
 */
export function ResourcePreviewScreen() {
  const { resourceId, wsId } = useLocalSearchParams<{ resourceId: string; wsId: string }>();
  const nav = useResourceNavigation(wsId);
  const online = useIsOnline();
  const metered = useMeteredConnection();
  const query = useResource(resourceId);
  const resource = query.data;
  const files = useResourceFileActions(resource);
  const [infoOpen, setInfoOpen] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const o2oEnabled = useFeature('o2o') === true;

  const id = resource?.id;
  const version = resource?.version;
  useEffect(() => {
    if (id === undefined || version === undefined) return;
    return () => void removeResourceCache({ id, version });
  }, [id, version]);

  const plan = resource ? resolvePreview(resource) : undefined;
  // ✅ "Thông tin tệp" và "Mở bằng ứng dụng khác" gom vào MỘT menu "⋯" (`ActionMenu`); thanh dưới chỉ còn Tải về/Chia sẻ.
  const header = (
    <AppBar
      actions={
        resource ? (
          <ActionMenu
            accessibilityLabel="Thêm thao tác cho tệp"
            items={[
              {
                icon: 'alert-information',
                key: 'info',
                label: 'Thông tin tệp',
                onPress: () => setInfoOpen(true),
              },
              {
                description: online ? undefined : 'Cần kết nối mạng',
                disabled: !online || Boolean(resource.deletedAt),
                icon: 'share-02',
                key: 'open',
                label: 'Mở bằng ứng dụng khác',
                onPress: () => void files.run('open'),
              },
              {
                // In tài liệu (p6-05 app.md §1): chỉ cho tệp PDF, mang `resourceId` sang màn cấu hình đơn in của O2O.
                hidden: !o2oEnabled || resource.type !== 'PDF',
                icon: 'document-2',
                key: 'print',
                label: 'In tài liệu',
                onPress: () => router.push(printOrderHref(resource)),
              },
            ]}
            title={resource.name}
          />
        ) : undefined
      }
      title={resource?.name ?? 'Xem tài liệu'}
      onBack={nav.back}
    />
  );

  const renderBody = () => {
    if (query.isLoading) return <Skeleton className="m-md h-64 rounded-md" />;
    if (query.isError || !resource || !plan) {
      const gone = isAxiosError(query.error) && query.error.response?.status === 404;
      return gone ? (
        <EmptyState
          actions={[{ label: 'Về kho tài liệu', onPress: nav.toWorkspace }]}
          description="Tệp không còn hoặc bạn không có quyền xem."
          fullscreen
          icon="lock"
          title="Không mở được tệp"
          tone="warning"
        />
      ) : (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={online ? toErrorMessage(query.error) : 'Cần kết nối mạng để xem tệp này.'}
          fullscreen
          icon={online ? 'alert-warning' : 'unlink'}
          title={online ? 'Không mở được tệp' : 'Cần kết nối để xem'}
          tone={online ? 'danger' : 'neutral'}
        />
      );
    }
    if (resource.deletedAt) {
      return (
        <EmptyState
          description="Tệp này đang ở trong thùng rác."
          fullscreen
          icon="delete"
          title="Tệp đã bị xoá"
          tone="neutral"
        />
      );
    }
    if (!online) {
      return (
        <EmptyState
          description="Kết nối mạng để xem hoặc tải tệp này."
          fullscreen
          icon="unlink"
          title="Cần kết nối để xem"
          tone="neutral"
        />
      );
    }
    if (
      shouldAskBeforeLoading({ allowed, expensive: metered, kind: plan.kind, size: resource.size })
    ) {
      return <MeteredGate size={resource.size} onAllow={() => setAllowed(true)} />;
    }
    return (
      <PreviewBody
        kind={plan.kind}
        resource={resource}
        variant={plan.variant}
        onDownload={() => void files.run('download')}
        onOpenExternal={() => void files.run('open')}
      />
    );
  };

  return (
    <Screen
      footer={
        resource && !resource.deletedAt ? (
          <PreviewActionBar
            busy={files.busy}
            disabled={!online}
            onRun={(action) => void files.run(action)}
          />
        ) : undefined
      }
      header={header}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">{renderBody()}</View>
      <PreviewInfoSheet resource={resource} visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Screen>
  );
}
