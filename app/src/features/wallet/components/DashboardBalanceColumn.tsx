import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { SettlementView, WalletSummaryView } from '../api';
import { previewBalances } from '../domain/balance-preview';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { BalanceHeader } from './BalanceHeader';
import { MemberBalanceRow } from './MemberBalanceRow';
import { MyPendingSettlementRow } from './MyPendingSettlementRow';
import { PendingSettlementCard } from './PendingSettlementCard';
import { SuggestionList } from './SuggestionList';

export interface DashboardBalanceColumnProps {
  busy: boolean;
  directory: MemberDirectory;
  pending: readonly SettlementView[];
  summary: WalletSummaryView | undefined;
  summaryError: boolean;
  onCancel: (settlement: SettlementView) => void;
  onConfirm: (settlement: SettlementView) => void;
  onPay: (suggestion: WalletSummaryView['suggestions'][number]) => void;
  onReject: (settlement: SettlementView) => void;
  onRetry: () => void;
}

/**
 * Cột "tiền của tôi": số dư · thẻ cần xác nhận · gợi ý thanh toán · số dư thành viên.
 * Trên máy tính bảng đây là cột TRÁI (app.md §7: "số dư/gợi ý | khoản chi").
 */
export function DashboardBalanceColumn(props: DashboardBalanceColumnProps) {
  const { busy, directory, pending, summary, summaryError } = props;
  const { meId, nameOf } = directory;
  // Hook đứng TRƯỚC nhánh lỗi bên dưới (return sớm không được nằm trước hook).
  const [showAllBalances, setShowAllBalances] = useState(false);

  if (summaryError && !summary) {
    return (
      <Alert
        actions={<Button label="Thử lại" size="sm" onPress={props.onRetry} />}
        description="Không tải được số dư. Kiểm tra kết nối rồi thử lại."
        tone="error"
      />
    );
  }

  // Người khác báo trả tôi (cần TÔI xác nhận) tách khỏi khoản tôi báo trả (chỉ huỷ được).
  const forMe = pending.filter((item) => item.toId === meId);
  const mine = pending.filter((item) => item.fromId === meId);
  const balances = [...(summary?.balances ?? [])].sort((a, b) => a.balance - b.balance);
  // Nhóm đông: chỉ hiện top người nợ + dòng của tôi, còn lại sau nút "Xem thêm" (chặn số dòng — không để khối này nuốt màn).
  const shown = previewBalances(balances, meId, showAllBalances);
  const canToggle = balances.length > shown.rows.length || showAllBalances;

  return (
    <View className="gap-xl">
      <BalanceHeader
        balance={summary?.myBalance}
        expensesThisMonth={summary?.totals.expensesThisMonth}
      />

      {forMe.map((item) => (
        <PendingSettlementCard
          key={item.id}
          busy={busy}
          fromName={nameOf(item.fromId)}
          meId={meId}
          settlement={item}
          onConfirm={props.onConfirm}
          onReject={props.onReject}
        />
      ))}
      {mine.map((item) => (
        <MyPendingSettlementRow
          key={item.id}
          busy={busy}
          meId={meId}
          settlement={item}
          toName={nameOf(item.toId)}
          onCancel={props.onCancel}
        />
      ))}

      <Section icon="chia-hoa-don" title="Gợi ý thanh toán">
        <Card>
          {summary ? (
            <SuggestionList
              avatarOf={(userId) => directory.memberOf(userId)?.avatarUrl}
              meId={meId}
              nameOf={nameOf}
              suggestions={summary.suggestions}
              onPay={props.onPay}
            />
          ) : (
            <Skeleton className="h-16 rounded-sm" />
          )}
        </Card>
      </Section>

      <Section icon="contact-list" title="Số dư thành viên">
        <Card>
          {summary && balances.length === 0 ? (
            // Trước đây thẻ này vẽ TRẮNG TRƠN khi chưa có số dư nào (nhóm chưa có khoản chi) — nhìn như lỗi tải.
            <Text className="text-body-md text-fg-2">
              Chưa có số dư nào. Số dư của từng người hiện ra khi nhóm có khoản chi đầu tiên.
            </Text>
          ) : summary ? (
            <>
              {shown.rows.map((item) => (
                <MemberBalanceRow
                  key={item.userId}
                  avatarUrl={directory.memberOf(item.userId)?.avatarUrl}
                  balance={item.balance}
                  isMe={item.userId === meId}
                  name={nameOf(item.userId)}
                />
              ))}
              {canToggle ? (
                <View className="items-center pt-xs">
                  <LinkButton
                    label={
                      showAllBalances ? 'Thu gọn' : `Xem thêm ${shown.hidden} người`
                    }
                    size="sm"
                    onPress={() => setShowAllBalances((open) => !open)}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <Skeleton className="h-24 rounded-sm" />
          )}
        </Card>
      </Section>
    </View>
  );
}
