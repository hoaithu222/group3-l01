import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

import { useCancelScan, useDeleteScan } from '../api/plagiarism.queries';

interface ScanReportActionsProps {
  canCancel: boolean;
  canDelete: boolean;
  scanId: string;
}

/**
 * Hai hành động cuối màn báo cáo (`myActions`): huỷ lượt đang chạy, xoá lượt đã xong.
 *
 * ⛔ Cả hai đều KHÔNG hoàn tác được nên đều qua `Dialog` xác nhận — bản cũ huỷ ngay ở cú chạm đầu (chạm nhầm khi cuộn là
 * mất lượt quét đang chạy). Nút mang icon + tông nguy hiểm cho "Xoá" để không lẫn với nút phụ thường.
 */
export function ScanReportActions({ canCancel, canDelete, scanId }: ScanReportActionsProps) {
  const cancelMutation = useCancelScan();
  const deleteMutation = useDeleteScan();
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const close = () => setConfirm(null);

  if (!canCancel && !canDelete) return null;
  return (
    <View className="gap-sm">
      {canCancel ? (
        <Button
          fullWidth
          iconLeft="cancel"
          label="Huỷ lượt quét"
          loading={cancelMutation.isPending}
          variant="secondary"
          onPress={() => setConfirm('cancel')}
        />
      ) : null}
      {canDelete ? (
        <Button
          fullWidth
          iconLeft="delete"
          label="Xoá lượt quét"
          variant="danger-secondary"
          onPress={() => setConfirm('delete')}
        />
      ) : null}
      <Dialog
        description="Lượt quét sẽ dừng lại và không có báo cáo. Bạn có thể tạo lượt quét mới sau."
        primaryAction={{
          label: 'Huỷ lượt quét',
          loading: cancelMutation.isPending,
          onPress: () => cancelMutation.mutate(scanId, { onSettled: close }),
        }}
        secondaryAction={{ label: 'Tiếp tục quét', onPress: close }}
        title="Huỷ lượt quét?"
        variant="warning"
        visible={confirm === 'cancel'}
        onClose={close}
      />
      <Dialog
        description="Hành động này không thể hoàn tác."
        primaryAction={{
          label: 'Xoá',
          loading: deleteMutation.isPending,
          onPress: () => deleteMutation.mutate(scanId, { onSuccess: () => router.back() }),
        }}
        secondaryAction={{ label: 'Đóng', onPress: close }}
        title="Xoá lượt quét?"
        variant="warning"
        visible={confirm === 'delete'}
        onClose={close}
      />
    </View>
  );
}
