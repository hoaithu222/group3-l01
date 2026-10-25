import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import { ExpenseDeleteDialog } from '../components/ExpenseDeleteDialog';
import { ExpenseDetailBody } from '../components/ExpenseDetailBody';
import { ExpenseEditForm } from '../components/ExpenseEditForm';
import { ExpenseHeaderActions } from '../components/ExpenseHeaderActions';
import { WalletDenied } from '../components/WalletDenied';
import { useIsOffline } from '../hooks/useIsOffline';
import { useMemberDirectory } from '../hooks/useMemberDirectory';
import { useWalletGate } from '../hooks/useWalletGate';
import { useDeleteExpense } from '../queries/expense.mutations';
import { useExpense } from '../queries/wallet.queries';
import { expenseActionState } from '../utils/expense-actions';
import { httpStatusOf } from '../utils/wallet-errors';
import { expenseHref } from '../utils/wallet-routes';

type Mode = 'adjust' | 'edit' | 'view';

/**
 * Chi tiết khoản chi (app.md §3): xem · sửa · xoá · điều chỉnh. Ba chế độ cùng MỘT route
 * (`expenses/[expenseId]`) — chuyển bằng state chứ không thêm route, vì thoát khỏi form sửa
 * phải về ĐÚNG chi tiết này, không phải nhảy sang một màn khác trong ngăn xếp.
 */
export function ExpenseDetailScreen() {
  const { expenseId, wsId } = useLocalSearchParams<{ expenseId: string; wsId: string }>();
  const gate = useWalletGate(wsId);
  const query = useExpense(wsId, expenseId);
  const directory = useMemberDirectory(wsId);
  const remove = useDeleteExpense(wsId, expenseId);
  const offline = useIsOffline();
  const [mode, setMode] = useState<Mode>('view');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const back = () => (mode === 'view' ? router.back() : setMode('view'));
  const header = <AppBar title="Chi tiết khoản chi" onBack={back} />;

  if (gate.denied) return <WalletDenied />;

  if (query.isError && httpStatusOf(query.error) === 404) {
    return (
      <Screen header={header}>
        {/* 404 = không còn/mất quyền ⇒ quy ước `lock` + `warning` (không có "Thử lại": thử lại vẫn 404). */}
        <EmptyState
          description="Khoản chi này đã bị xoá hoặc bạn không còn quyền xem."
          icon="lock"
          title="Khoản chi không còn"
          tone="warning"
        />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description="Không tải được khoản chi. Kiểm tra kết nối rồi thử lại."
          icon="alert-warning"
          title="Không tải được"
          tone="danger"
        />
      </Screen>
    );
  }

  const expense = query.data;
  if (!expense || directory.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (mode !== 'view') {
    return (
      <ExpenseEditForm
        expense={expense}
        meId={directory.meId}
        members={directory.members}
        mode={mode}
        wsId={wsId}
        onAdjustInstead={() => setMode('adjust')}
        onCancel={() => setMode('view')}
        onDone={(saved) => {
          // Điều chỉnh tạo MỘT khoản mới — mở nó; sửa thì ở lại xem khoản này (đã làm mới).
          if (mode === 'adjust') router.replace(expenseHref(wsId, saved.id));
          else setMode('view');
        }}
        onReload={() => {
          void query.refetch();
          setMode('view');
        }}
      />
    );
  }

  // Sửa · Điều chỉnh · Xoá ở THANH TIÊU ĐỀ (không còn ba nút cuối thân màn). Khoản đã khoá/không quản lý được thì thanh
  // tiêu đề trống — lối ra duy nhất là nút trong `ExpenseLockedNotice` ở thân màn.
  const { canEditOrDelete } = expenseActionState(expense, remove.error);
  const viewHeader = (
    <AppBar
      actions={
        canEditOrDelete ? (
          <ExpenseHeaderActions
            offline={offline}
            onAdjust={() => setMode('adjust')}
            onDelete={() => setConfirmingDelete(true)}
            onEdit={() => setMode('edit')}
          />
        ) : undefined
      }
      title="Chi tiết khoản chi"
      onBack={back}
    />
  );

  return (
    <Screen
      header={viewHeader}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <ExpenseDetailBody
        deleteError={remove.error}
        directory={directory}
        expense={expense}
        onAdjust={() => setMode('adjust')}
        onOpenExpense={(item) => router.push(expenseHref(wsId, item.id))}
      />
      {expense.adjustsExpenseId ? (
        <View className="pb-md">
          <Button
            label="Xem khoản chi gốc"
            variant="secondary"
            onPress={() => router.push(expenseHref(wsId, expense.adjustsExpenseId as string))}
          />
        </View>
      ) : null}

      <ExpenseDeleteDialog
        deleting={remove.isPending}
        visible={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          // Lỗi xoá (kể cả `WALLET_004`) hiện TRONG chi tiết qua `deleteError` — service tắt toast.
          remove.mutate(undefined, {
            onSuccess: () => {
              showToast('success', 'Đã xoá khoản chi.');
              router.back();
            },
          });
        }}
      />
    </Screen>
  );
}
