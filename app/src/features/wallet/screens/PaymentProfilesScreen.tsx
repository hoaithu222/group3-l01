import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { PaymentProfileView } from '../api';
import { AddPaymentProfileSheet } from '../components/AddPaymentProfileSheet';
import { PaymentProfileRow } from '../components/PaymentProfileRow';
import { WALLET_LIMITS } from '../constants/wallet.constants';
import { useIsOffline } from '../hooks/useIsOffline';
import { useSecureScreen } from '../hooks/useSecureScreen';
import { usePaymentProfileMutations } from '../queries/settlement.mutations';
import { usePaymentProfiles } from '../queries/wallet.queries';

/**
 * Tài khoản nhận tiền của TÔI (`/me/payment-profiles`, tối đa 3). Người đang nợ tôi sẽ thấy QR sinh từ
 * tài khoản MẶC ĐỊNH. Màn này nhập số tài khoản đầy đủ nên bật chặn chụp/ghi màn hình (Android).
 */
export function PaymentProfilesScreen() {
  useSecureScreen('wallet-profiles');
  const query = usePaymentProfiles();
  const { remove, setDefault } = usePaymentProfileMutations();
  const offline = useIsOffline();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PaymentProfileView | null>(null);

  const profiles = query.data ?? [];
  const full = profiles.length >= WALLET_LIMITS.paymentProfilesMax;
  const busy = remove.isPending || setDefault.isPending;
  const header = <AppBar title="Tài khoản nhận tiền" onBack={router.back} />;

  if (query.isPending) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={toErrorMessage(query.error)}
          icon="alert-warning"
          title="Không tải được"
          tone="danger"
        />
      </Screen>
    );
  }

  // Hành động CHÍNH của màn (thêm tài khoản) là nút dính đáy — trước đây là nút `secondary` cuối danh sách, mà màn không
  // có nút chính nào khác. Danh sách rỗng thì EmptyState đã mang CTA đó (đủ tối đa 1 CTA), nên footer chỉ vẽ khi đã có tài khoản.
  const canAddMore = profiles.length > 0 && !full;

  return (
    <Screen
      footer={
        canAddMore ? (
          <BottomActionBar>
            <Button
              disabled={offline}
              fullWidth
              iconLeft="add"
              label="Thêm tài khoản"
              onPress={() => setAdding(true)}
            />
          </BottomActionBar>
        ) : undefined
      }
      header={header}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View className="gap-lg py-xs">
        {profiles.length === 0 ? (
          <EmptyState
            actions={[
              { disabled: offline, label: 'Thêm tài khoản', onPress: () => setAdding(true) },
            ]}
            description="Thêm tài khoản để bạn bè quét QR trả tiền cho bạn."
            icon="bank"
            title="Chưa có tài khoản nhận tiền"
            tone="success"
          />
        ) : (
          <>
            <Card>
              {profiles.map((profile, index) => (
                <View key={profile.id}>
                  {index > 0 ? <Divider /> : null}
                  <PaymentProfileRow
                    busy={busy || offline}
                    profile={profile}
                    onDelete={setDeleting}
                    onMakeDefault={(item) =>
                      setDefault.mutate(item.id, {
                        onSuccess: () => showToast('success', 'Đã đổi tài khoản mặc định.'),
                      })
                    }
                  />
                </View>
              ))}
            </Card>
            {full ? (
              <Alert
                description="Bạn đã lưu đủ 3 tài khoản. Xoá bớt một tài khoản để thêm tài khoản mới."
                tone="info"
              />
            ) : null}
          </>
        )}
      </View>

      <AddPaymentProfileSheet
        firstProfile={profiles.length === 0}
        visible={adding}
        onClose={() => setAdding(false)}
      />

      <Dialog
        description={
          deleting
            ? `Tài khoản đuôi ${deleting.accountLast4} sẽ bị xoá. Bạn bè sẽ không còn thấy nó khi trả tiền cho bạn.`
            : undefined
        }
        primaryAction={{
          label: 'Xoá tài khoản',
          loading: remove.isPending,
          onPress: () => {
            if (!deleting) return;
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                showToast('success', 'Đã xoá tài khoản.');
              },
            });
          },
        }}
        secondaryAction={{ label: 'Giữ lại', onPress: () => setDeleting(null) }}
        title="Xoá tài khoản nhận tiền?"
        variant="warning"
        visible={deleting !== null}
        onClose={() => setDeleting(null)}
      />
    </Screen>
  );
}
