import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, Table, Toolbar } from '@/shared/ui';

import { useUpdateQuest } from '../service/economy.mutations';
import { useCoinQuests } from '../service/economy.queries';
import type { AdminCoinQuest } from '../types/economy-catalog.types';
import { isVersionConflict } from '../utils/economy-errors';
import EconomyLoadError from './EconomyLoadError';
import QuestFormModal from './QuestFormModal';
import { buildQuestColumns } from './quest-table.columns';
import ToggleActiveConfirm from './ToggleActiveConfirm';

/**
 * Nhóm "Nhiệm vụ ngày" (admin.md p7-02 §2.1) — `GET /admin/economy/quests` (cả nhiệm vụ đang tắt). Tạo/Sửa qua `QuestFormModal`; bật/tắt qua hộp thoại lý do
 * (audit `coins.quest.update`, CAS `expectedVersion`). Không có `gamification:update` → chỉ xem. Người dùng nhận thưởng bằng cách bấm chủ động ở app.
 */
const QuestTable = memo(function QuestTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const { data: quests, error, isLoading, refetch } = useCoinQuests();
  const update = useUpdateQuest();
  const [editing, setEditing] = useState<AdminCoinQuest | 'new' | null>(null);
  const [toggling, setToggling] = useState<AdminCoinQuest | null>(null);

  const handleToggle = useCallback(
    async (reason: string) => {
      if (!toggling) return;
      try {
        await update.mutateAsync({
          id: toggling.id,
          expectedVersion: toggling.version,
          isActive: !toggling.isActive,
          reason,
        });
      } catch (err) {
        // Nhiệm vụ vừa bị sửa ở nơi khác: danh sách đã tải lại, bỏ hộp thoại (nó cầm bản cũ) — interceptor đã báo.
        if (!isVersionConflict(err)) throw err;
      }
      setToggling(null);
    },
    [toggling, update],
  );

  const columns = useMemo(
    () => buildQuestColumns({ canUpdate, onEdit: setEditing, onToggle: setToggling }),
    [canUpdate],
  );
  const rows = useMemo(() => [...(quests ?? [])].sort((a, b) => a.order - b.order), [quests]);
  const failed = !!error && !quests;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Tiến độ tính theo ngày của từng người dùng; người dùng bấm nhận thưởng ở app. Đổi mục tiêu/chỉ số không hồi tố phần đã nhận."
        intent="info"
        variant="ghost"
      />
      {canUpdate && (
        <Toolbar
          right={
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
              Thêm nhiệm vụ
            </Button>
          }
        />
      )}
      {failed ? (
        <EconomyLoadError
          error={error}
          title="Không tải được nhiệm vụ ngày"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          data={rows}
          emptyMessage="Chưa có nhiệm vụ ngày nào"
          loading={isLoading}
          pagination={false}
          rowKey={(r) => r.id}
        />
      )}
      {editing && (
        <QuestFormModal
          quest={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ToggleActiveConfirm
        effect="Nhiệm vụ tắt không hiện cho người dùng và không nhận thưởng được nữa (kể cả tiến độ đã đạt mà chưa nhận); thưởng đã nhận không bị thu hồi."
        noun="nhiệm vụ"
        target={toggling ? { label: toggling.title, next: !toggling.isActive } : null}
        onClose={() => setToggling(null)}
        onConfirm={handleToggle}
      />
    </div>
  );
});

export default QuestTable;
