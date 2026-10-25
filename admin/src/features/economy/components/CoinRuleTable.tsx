import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Callout, ConfirmWithReasonModal, Table } from '@/shared/ui';

import { COIN_LIMITS, COIN_SOURCE_LABELS } from '../constants/economy.constants';
import { usePutCoinRule } from '../service/economy.mutations';
import { useCoinRules } from '../service/economy.queries';
import type { CoinRuleDraft } from '../types/economy-catalog.types';
import type { CoinSourceType } from '../types/economy.types';
import {
  buildRuleRows,
  describeRuleDraft,
  pickRuleDraft,
  type CoinRuleRow,
} from '../utils/coin-rule-draft';
import { isVersionConflict } from '../utils/economy-errors';
import { buildCoinRuleColumns } from './coin-rule-table.columns';
import EconomyLoadError from './EconomyLoadError';

/**
 * Nhóm "Quy tắc thưởng" (admin.md p7-02 §2.1) — luật thưởng xu theo nguồn XP: `GET /admin/economy/rules` (kèm xu đã phát 7 ngày), lưu bằng
 * `PATCH /admin/economy/rules/:sourceType` (tạo luật mới thì `expectedVersion` 0; sửa thì CAS — `RES_003` = luật vừa bị sửa ở nơi khác → bỏ bản nháp, danh sách tải lại).
 * Mỗi lần lưu hỏi lý do (10–500) và ghi nhật ký `coins.rule.update`. Luật có hiệu lực ≤ 60 giây, KHÔNG hồi tố.
 */
const CoinRuleTable = memo(function CoinRuleTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const { data: rules, error, isLoading, refetch } = useCoinRules();
  const put = usePutCoinRule();
  const [drafts, setDrafts] = useState<Record<string, CoinRuleDraft>>({});
  const [confirming, setConfirming] = useState<CoinSourceType | null>(null);

  const rows = useMemo(() => (rules ? buildRuleRows(rules) : []), [rules]);
  const confirmingRow = confirming ? rows.find((r) => r.sourceType === confirming) : undefined;

  const draftOf = useCallback(
    (row: CoinRuleRow) => drafts[row.sourceType] ?? pickRuleDraft(row),
    [drafts],
  );
  const patch = useCallback(
    (row: CoinRuleRow, part: Partial<CoinRuleDraft>) =>
      setDrafts((prev) => ({
        ...prev,
        [row.sourceType]: { ...(prev[row.sourceType] ?? pickRuleDraft(row)), ...part },
      })),
    [],
  );
  const columns = useMemo(
    () =>
      buildCoinRuleColumns({
        canUpdate,
        draftOf,
        patch,
        onSave: (row) => setConfirming(row.sourceType),
      }),
    [canUpdate, draftOf, patch],
  );

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!confirmingRow) return;
      try {
        await put.mutateAsync({
          sourceType: confirmingRow.sourceType,
          ...draftOf(confirmingRow),
          expectedVersion: confirmingRow.rule?.version ?? 0,
          reason,
        });
      } catch (err) {
        // Xung đột phiên bản: nháp dựa trên bản cũ nên bỏ đi; danh sách đã tải lại và interceptor đã báo.
        if (!isVersionConflict(err)) throw err;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[confirmingRow.sourceType];
        return next;
      });
      setConfirming(null);
    },
    [confirmingRow, draftOf, put],
  );

  const failed = !!error && !rules;
  return (
    <div className="flex flex-col gap-3">
      <Callout
        description={`Thay đổi có hiệu lực trong ≤ 60 giây và KHÔNG tính lại xu đã phát. Mỗi người nhận tối đa ${COIN_LIMITS.dailyEarnCap} xu/ngày từ mọi nguồn; trần của một luật không vượt trần chung. Nguồn chưa có luật thì không phát xu.`}
        intent="info"
        variant="ghost"
      />
      {failed ? (
        <EconomyLoadError
          error={error}
          title="Không tải được quy tắc thưởng"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          data={rows}
          emptyMessage="Chưa có nguồn thưởng nào"
          loading={isLoading}
          pagination={false}
          rowKey={(r) => r.sourceType}
        />
      )}
      <ConfirmWithReasonModal
        impact={
          confirmingRow ? (
            <div className="flex flex-col gap-1">
              <span>
                Luật:{' '}
                {COIN_SOURCE_LABELS[confirmingRow.sourceType]?.label ?? confirmingRow.sourceType}
              </span>
              <span className="text-fg-4">
                Cũ:{' '}
                {confirmingRow.rule
                  ? describeRuleDraft(pickRuleDraft(confirmingRow))
                  : 'chưa có luật'}
              </span>
              <span>Mới: {describeRuleDraft(draftOf(confirmingRow))}</span>
            </div>
          ) : null
        }
        open={!!confirmingRow}
        title="Lưu quy tắc thưởng"
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
    </div>
  );
});

export default CoinRuleTable;
