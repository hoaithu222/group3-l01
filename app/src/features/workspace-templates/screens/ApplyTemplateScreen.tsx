import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { ApplyResultView } from '../components/ApplyResultView';
import { TemplatePicker } from '../components/TemplatePicker';
import { FORBIDDEN_MESSAGE } from '../constants/workspace-templates.constants';
import { useApplyTemplateScreen } from '../hooks/useApplyTemplateScreen';

/**
 * "Áp mẫu cho nhóm" (app.md p5-04 §3 "Áp mẫu (cài đặt)"): chọn một mẫu → tick kênh (báo trước kênh CÓ THỂ bị bỏ qua vì trùng tên
 * — BE mới là chuẩn) → "Áp mẫu" → kết quả kênh đã tạo/bỏ qua. Chỉ CHỦ NHÓM và QUẢN TRỊ VIÊN (`myRole`): người khác vào thẳng đường
 * dẫn chỉ thấy thông báo, và BE vẫn chặn bằng 403. Nhóm đã lưu trữ hoặc máy mất mạng thì nút bị KHOÁ kèm lý do bằng chữ.
 */
export function ApplyTemplateScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const screen = useApplyTemplateScreen(wsId);
  const { head, templates } = screen;
  const header = <AppBar title="Áp mẫu cho nhóm" onBack={router.back} />;

  if (head.isPending || templates.isPending) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  const loadError = head.error ?? templates.error;
  if (loadError || !head.data || !templates.data) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[
            {
              label: 'Thử lại',
              onPress: () => {
                void head.refetch();
                void templates.refetch();
              },
            },
          ]}
          description={loadError ? toErrorMessage(loadError) : 'Không tải được mẫu nhóm.'}
          icon="alert-warning"
          title="Không tải được"
          tone="danger"
        />
      </Screen>
    );
  }

  if (!screen.canApply) {
    return (
      <Screen header={header}>
        <Alert
          className="mt-xs"
          description={FORBIDDEN_MESSAGE}
          title="Bạn không áp được mẫu"
          tone="warning"
        />
      </Screen>
    );
  }

  if (screen.result) {
    return (
      <Screen header={header}>
        <ApplyResultView
          channels={screen.template?.channels ?? []}
          result={screen.result}
          onDone={router.back}
          onOpenChannels={() =>
            router.replace({ pathname: '/workspaces/[wsId]/channels', params: { wsId } })
          }
        />
      </Screen>
    );
  }

  const nothingChecked = (screen.selection?.channelKeys.length ?? 0) === 0;
  // Lý do nút bị khoá — hiện bằng chữ ngay trên nút, không để người dùng đoán vì sao bấm không được.
  const blockedReason = screen.isArchived
    ? 'Nhóm đã lưu trữ nên không áp được mẫu.'
    : screen.offline
      ? 'Cần kết nối để áp mẫu.'
      : null;

  return (
    <Screen
      footer={
        <BottomActionBar>
          <View className="gap-xs">
            {blockedReason ? <Alert description={blockedReason} tone="warning" /> : null}
            <Button
              disabled={blockedReason !== null || screen.selection === null || nothingChecked}
              fullWidth
              label="Áp mẫu"
              loading={screen.isApplying}
              onPress={screen.submit}
            />
          </View>
        </BottomActionBar>
      }
      header={header}
    >
      <View className="gap-xl py-xs">
        {/* Dải đầu màn — nói điều AppBar chưa nói: áp mẫu chỉ THÊM kênh, không đụng kênh đang có (trùng tên thì bỏ qua). */}
        <Reveal>
          <ModuleBanner
            description="Chọn một mẫu rồi tick kênh muốn thêm. Kênh đang có không bị đổi, kênh trùng tên sẽ được bỏ qua."
            icon="magic-wand-01"
            title="Thêm kênh nhanh theo mẫu"
            tone="accent"
          />
        </Reveal>
        {screen.error ? <Alert description={screen.error.message} tone="error" /> : null}
        {templates.data.length === 0 ? (
          <EmptyState
            description="Chưa có mẫu nhóm nào đang bật."
            icon="magic-wand-01"
            title="Không có mẫu"
            tone="info"
          />
        ) : (
          <TemplatePicker
            allowNone={false}
            disabled={screen.isApplying}
            skips={screen.skips}
            templates={templates.data}
            value={screen.selection}
            onChange={screen.changeSelection}
          />
        )}
      </View>
    </Screen>
  );
}
