import { router } from 'expo-router';
import { useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { Section } from '@/shared/ui/section';

import type { BoardDetail } from '../../api/boards.types';
import { useArchiveBoard } from '../../queries/boards.queries';
import { boardListHref } from '../../utils/board-routes';

/**
 * Lưu trữ / khôi phục bảng. Lưu trữ cần xác nhận (Dialog) vì bảng chuyển sang
 * CHỈ ĐỌC với cả nhóm; khôi phục thì làm ngay. Xong việc quay về danh sách bảng.
 */
export function BoardArchiveSection({ board, wsId }: { board: BoardDetail; wsId: string }) {
  const [confirming, setConfirming] = useState(false);
  const archive = useArchiveBoard(board.id, wsId);
  const isArchived = Boolean(board.archivedAt);

  const run = () =>
    archive.mutate(!isArchived, {
      onSettled: () => setConfirming(false),
      onSuccess: () => router.replace(boardListHref(wsId)),
    });

  return (
    <Section icon="lock" title="Lưu trữ">
      {archive.error ? <Alert description={toErrorMessage(archive.error)} tone="error" /> : null}
      <Button
        label={isArchived ? 'Khôi phục bảng' : 'Lưu trữ bảng'}
        loading={archive.isPending && !confirming}
        variant={isArchived ? 'secondary' : 'danger-secondary'}
        onPress={isArchived ? run : () => setConfirming(true)}
      />
      <Dialog
        description="Bảng sẽ chuyển sang chỉ xem cho cả nhóm. Bạn có thể khôi phục lại bất cứ lúc nào."
        primaryAction={{ label: 'Lưu trữ', loading: archive.isPending, onPress: run }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title="Lưu trữ bảng này?"
        variant="warning"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
}
