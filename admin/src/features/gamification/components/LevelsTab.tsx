import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  Button,
  Callout,
  ConfirmWithReasonModal,
  NumberInput,
  Skeleton,
  Table,
  Text,
} from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format';

import {
  LEVEL_BASE_MAX,
  LEVEL_BASE_MIN,
  LEVEL_MAX_MAX,
  LEVEL_MAX_MIN,
  LEVEL_PREVIEW_COUNT,
} from '../constants/level.constants';
import { useLevelConfig, useUpdateLevels } from '../service/gamification.queries';
import type { LevelConfigView } from '../types/gamification.types';
import { inRange, previewRows, type LevelRow } from '../utils/level-preview';
import LevelCurveChart from './LevelCurveChart';

const COLUMNS: TableColumn<LevelRow>[] = [
  { key: 'level', header: 'Cấp', width: 80, cell: (r) => r.level },
  {
    key: 'toNext',
    header: 'XP để lên cấp sau',
    cell: (r) => <span className="tabular-nums">{r.toNext ? formatNumber(r.toNext) : '—'}</span>,
  },
  {
    key: 'cumulative',
    header: 'XP tích luỹ',
    cell: (r) => <span className="tabular-nums">{formatNumber(r.cumulative)}</span>,
  },
];

const LevelsForm = memo(function LevelsForm({ config }: { config: LevelConfigView }) {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const [base, setBase] = useState<number | null>(config.base);
  const [maxLevel, setMaxLevel] = useState<number | null>(config.maxLevel);
  const { close: closeConfirm, isOpen: confirmOpen, open: openConfirm } = useDisclosure();
  const update = useUpdateLevels();

  const valid =
    inRange(base, LEVEL_BASE_MIN, LEVEL_BASE_MAX) && inRange(maxLevel, LEVEL_MAX_MIN, LEVEL_MAX_MAX);
  const dirty = base !== config.base || maxLevel !== config.maxLevel;
  const rows = useMemo(
    () => (valid ? previewRows(base as number, maxLevel as number) : []),
    [base, maxLevel, valid],
  );

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (base === null || maxLevel === null) return;
      await update.mutateAsync({ base, maxLevel, expectedVersion: config.version, reason });
      closeConfirm();
    },
    [base, closeConfirm, config.version, maxLevel, update],
  );

  return (
    <div className="flex flex-col gap-3">
      <Callout description="Cấp độ n cần round(base × n^1.5) XP để lên cấp sau. Người dùng không bị hạ cấp khi tăng base." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-48 flex-col gap-1">
          <Text size="small" skin="muted">
            Hệ số base ({LEVEL_BASE_MIN}–{formatNumber(LEVEL_BASE_MAX)})
          </Text>
          <NumberInput
            aria-label="Hệ số base"
            disabled={!canUpdate}
            max={LEVEL_BASE_MAX}
            min={LEVEL_BASE_MIN}
            value={base}
            onChange={setBase}
          />
        </div>
        <div className="flex w-48 flex-col gap-1">
          <Text size="small" skin="muted">
            Cấp tối đa ({LEVEL_MAX_MIN}–{LEVEL_MAX_MAX})
          </Text>
          <NumberInput
            aria-label="Cấp tối đa"
            disabled={!canUpdate}
            max={LEVEL_MAX_MAX}
            min={LEVEL_MAX_MIN}
            value={maxLevel}
            onChange={setMaxLevel}
          />
        </div>
        {canUpdate ? (
          <Button
            disabled={!valid || !dirty}
            size="sm"
            variant="primary"
            onClick={openConfirm}
          >
            Lưu
          </Button>
        ) : null}
      </div>
      <Text size="small" skin="muted">
        Xem trước {LEVEL_PREVIEW_COUNT} cấp đầu (tính lại khi thay đổi)
      </Text>
      {rows.length > 0 ? <LevelCurveChart data={rows} /> : null}
      <Table
        columns={COLUMNS}
        data={rows}
        pagination={false}
        rowKey={(r) => String(r.level)}
      />
      <ConfirmWithReasonModal
        impact={
          <div className="flex flex-col gap-1 text-body-14">
            <span className="text-fg-4">
              Cũ: base {config.base}, cấp tối đa {config.maxLevel}
            </span>
            <span>
              Mới: base {base ?? '—'}, cấp tối đa {maxLevel ?? '—'}
            </span>
            <span className="text-fg-3">Người dùng không bị hạ cấp khi tăng base.</span>
          </div>
        }
        open={confirmOpen}
        title="Lưu cấu hình cấp độ"
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && closeConfirm()}
      />
    </div>
  );
});

/**
 * Tab "Cấp độ" (admin.md p4-03 §2.3) — `GET|PUT /admin/gamification/levels`; CAS theo `version`
 * của SystemConfig `gamification.level` (`RES_003` → interceptor báo + tải lại), `GAME_005` khi ngưỡng
 * cấp cao nhất vượt giới hạn lưu trữ.
 */
const LevelsTab = memo(function LevelsTab() {
  const { data, isError, refetch } = useLevelConfig();
  // `key` theo version: lưu xong / bị sửa nơi khác → form nạp lại giá trị mới.
  if (data) return <LevelsForm key={data.version} config={data} />;
  // Lỗi tải: báo + "Thử lại". Bản cũ dùng chung nhánh với "đang tải" nên lỗi thì kẹt ở "Đang tải…" mãi.
  if (isError) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được cấu hình cấp độ"
      />
    );
  }
  return <Skeleton className="w-full" height={160} />;
});

export default LevelsTab;
