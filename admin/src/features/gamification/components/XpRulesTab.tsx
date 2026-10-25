import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, ConfirmWithReasonModal, Table } from '@/shared/ui';

import { useUpdateXpRule, useXpRules } from '../service/gamification.queries';
import type { XpRule, XpRuleDraft } from '../types/gamification.types';
import { xpSourceMeta } from '../utils/xp-event-format';
import { describeDraft, pickDraft } from '../utils/xp-rule-draft';
import { buildXpRuleColumns } from './xp-rules-table.columns';

/**
 * Tab "Luật XP" (admin.md p4-03 §2.1) — sửa inline từng dòng, "Lưu" dòng đó → lý do bắt buộc →
 * `PUT /admin/xp-rules/:sourceType` (CAS `expectedVersion`; `RES_003` → interceptor toast + tải lại).
 * Tải lỗi → báo lỗi + "Thử lại" (không vẽ bảng trống như thể chưa có luật nào).
 */
const XpRulesTab = memo(function XpRulesTab() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const { data: rules = [], isLoading, isError, refetch } = useXpRules();
  const update = useUpdateXpRule();
  const [drafts, setDrafts] = useState<Record<string, XpRuleDraft>>({});
  const [confirming, setConfirming] = useState<XpRule | null>(null);

  const draftOf = useCallback((r: XpRule) => drafts[r.sourceType] ?? pickDraft(r), [drafts]);
  const patch = useCallback(
    (r: XpRule, p: Partial<XpRuleDraft>) =>
      setDrafts((prev) => ({
        ...prev,
        [r.sourceType]: { ...(prev[r.sourceType] ?? pickDraft(r)), ...p },
      })),
    [],
  );

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!confirming) return;
      await update.mutateAsync({
        sourceType: confirming.sourceType,
        ...draftOf(confirming),
        expectedVersion: confirming.version,
        reason,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[confirming.sourceType];
        return next;
      });
      setConfirming(null);
    },
    [confirming, draftOf, update],
  );

  const columns = useMemo(
    () => buildXpRuleColumns({ canUpdate, draftOf, patch, onSave: setConfirming }),
    [canUpdate, draftOf, patch],
  );

  const rowKey = useCallback((r: XpRule) => r.sourceType, []);
  const failed = isError && rules.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <Callout description="Thay đổi áp dụng cho sự kiện mới trong ≤ 60 giây, không tính lại XP cũ." />
      {failed ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối rồi thử lại."
          intent="error"
          title="Không tải được luật XP"
        />
      ) : (
        <Table
          columns={columns}
          data={rules}
          emptyMessage="Chưa có luật XP nào"
          loading={isLoading}
          pagination={false}
          rowKey={rowKey}
        />
      )}
      <ConfirmWithReasonModal
        impact={
          confirming ? (
            <div className="flex flex-col gap-1 text-body-14">
              <span>Luật: {xpSourceMeta(confirming.sourceType).label}</span>
              <span className="text-fg-4">Cũ: {describeDraft(pickDraft(confirming))}</span>
              <span>Mới: {describeDraft(draftOf(confirming))}</span>
            </div>
          ) : null
        }
        open={!!confirming}
        title="Lưu luật XP"
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
    </div>
  );
});

export default XpRulesTab;
