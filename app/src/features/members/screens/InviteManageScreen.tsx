import { router, useLocalSearchParams } from 'expo-router';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, type TabItemData } from '@/shared/ui/tab';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { CreateInviteResult, InviteRow as InviteRowData } from '../api';
import { InviteCreatedSheet } from '../components/InviteCreatedSheet';
import { InviteCreateSheet } from '../components/InviteCreateSheet';
import { InviteRow } from '../components/InviteRow';
import { useCreateInvite, useInvites, useRevokeInvite } from '../queries/invites.queries';

const STATUS_TABS: TabItemData[] = [
  { key: 'ACTIVE', label: 'Đang hoạt động' },
  { key: 'ENDED', label: 'Đã hết' },
];

/** BE trả 403 chung (không có mã `INV_*` riêng cho "không phải ADMIN/OWNER") — chỉ cần đúng mã HTTP. */
function isForbidden(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

/**
 * Quản lý link mời (OWNER/ADMIN, app.md p1-02 §3). Không gọi trước để biết có
 * quyền hay không (tránh cross-feature import `workspace.myPermissions`) —
 * BE tự trả 403, màn bắt lỗi đó rồi "quay lại" đúng cột Lỗi của app.md.
 */
export function InviteManageScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';

  const { data, error, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isLoading, isRefetching, refetch } =
    useInvites(wsId);
  const createInvite = useCreateInvite(wsId);
  const revokeInvite = useRevokeInvite(wsId);

  const [tab, setTab] = useState<'ACTIVE' | 'ENDED'>('ACTIVE');
  const [createOpen, setCreateOpen] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreateInviteResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRowData | null>(null);

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const filtered = useMemo(
    () => items.filter((invite) => (tab === 'ACTIVE' ? invite.status === 'ACTIVE' : invite.status !== 'ACTIVE')),
    [items, tab],
  );
  const forbidden = isError && isForbidden(error);

  useEffect(() => {
    if (!forbidden) return;
    showToast('error', 'Bạn không có quyền quản lý lời mời của nhóm này.');
    router.back();
  }, [forbidden]);

  return (
    <Screen
      header={<AppBar title="Link mời" onBack={router.back} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <View className="gap-md py-xs">
        <Button
          disabled={isOffline}
          iconLeft="add"
          label="Tạo link mời"
          onPress={() => setCreateOpen(true)}
        />

        {items.length > 0 ? (
          <Tabs
            items={STATUS_TABS}
            value={tab}
            onChange={(key) => {
              hapticSelection();
              setTab(key as 'ACTIVE' | 'ENDED');
            }}
          />
        ) : null}

        {isLoading ? (
          <View className="gap-sm">
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
          </View>
        ) : forbidden ? null : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được danh sách link mời"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Tạo link để mời người khác tham gia nhóm."
            icon="link"
            title="Chưa có link mời"
            tone="info"
          />
        ) : filtered.length === 0 ? (
          // ⚠️ Lọc theo tab là lọc TẠI CHỖ trên các trang đã tải: trang đầu toàn link đã hết thì tab "Đang hoạt động" rỗng dù trang
          // sau còn link dùng được — bản cũ chỉ có "Tải thêm" ở nhánh có dữ liệu, nên người dùng kẹt ở "Không có kết quả".
          <EmptyState
            actions={
              hasNextPage
                ? [{ disabled: isFetchingNextPage, label: 'Tải thêm', onPress: () => void fetchNextPage() }]
                : undefined
            }
            description={tab === 'ACTIVE' ? 'Không có link nào đang hoạt động.' : 'Chưa có link nào hết hạn/thu hồi.'}
            icon="search"
            title="Không có kết quả"
            tone="neutral"
          />
        ) : (
          <View>
            {/* `-mx-md`: hàng đã tự có `px-md` + kẻ `border-b` chạy hết bề ngang; `Screen` (padded) cộng thêm 16 nữa
                là chữ thụt vào 32dp. Kéo hàng ra tới mép để lề còn đúng 16. */}
            <View className="-mx-md">
              {filtered.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  revoking={revokeInvite.isPending && revokeInvite.variables === invite.id}
                  onRevoke={setRevokeTarget}
                />
              ))}
            </View>
            {hasNextPage ? (
              <Button
                label="Tải thêm"
                loading={isFetchingNextPage}
                variant="tertiary"
                onPress={() => void fetchNextPage()}
              />
            ) : null}
          </View>
        )}
      </View>

      <InviteCreateSheet
        loading={createInvite.isPending}
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(payload) =>
          createInvite.mutate(payload, {
            onSuccess: (result) => {
              hapticSuccess(); // link đã tạo — tấm "Đã tạo link" mở ngay sau đó
              setCreateOpen(false);
              setCreatedResult(result);
            },
            onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
          })
        }
      />

      <InviteCreatedSheet result={createdResult} onClose={() => setCreatedResult(null)} />

      {/* Thu hồi link là việc không hoàn tác (ai đang giữ link mất quyền vào ngay) ⇒ có bước xác nhận. ✅ `ConfirmSheet` tông `danger`
          (nút chính đỏ, "Giữ lại" + nền mờ khoá khi đang gửi) thay `Dialog` cảnh báo — cùng khuôn mọi xác nhận phá huỷ của app. */}
      <ConfirmSheet
        cancelLabel="Giữ lại"
        confirmLabel="Thu hồi"
        description="Ai đang giữ link này sẽ không dùng nó để vào nhóm được nữa."
        icon="unlink"
        loading={revokeInvite.isPending}
        title="Thu hồi link mời?"
        tone="danger"
        visible={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeInvite.mutate(revokeTarget.id, { onSettled: () => setRevokeTarget(null) });
        }}
      />
    </Screen>
  );
}
