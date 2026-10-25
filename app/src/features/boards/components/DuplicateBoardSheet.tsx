import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useCapabilities } from '@/shell/capabilities';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { hapticTap } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useAttemptKey } from '../hooks/useAttemptKey';
import { useDuplicateBoard } from '../queries/board-blueprints.queries';
import { readBoardLimits } from '../schemas/board.schemas';
import { boardHref } from '../utils/board-routes';
import { copyBoardName } from '../utils/copy-name';

export interface DuplicateBoardSheetProps {
  boardId: string;
  boardName: string;
  wsId: string;
  onClose: () => void;
}

/**
 * Nhân bản bảng (p3-02 P1, `POST /boards/:id/duplicate`, OWNER/ADMIN của nhóm): tên bản sao (điền sẵn "<tên> (bản sao)") + ba lựa chọn khớp DTO
 * của BE — nhãn, cấu hình chấm chéo (mặc định BẬT) và THẺ CHƯA XONG (mặc định TẮT: sao chép cấu trúc thôi, thẻ là việc nặng và tối đa 100 thẻ).
 * Cột và mô tả luôn được chép; người làm, bình luận, tệp, phụ thuộc và trạng thái chấm KHÔNG được chép (nói rõ trong tấm để không ai tưởng bản sao
 * mang theo cả lịch sử).
 *
 * ⚠️ Chỉ DỰNG khi đang mở (`KanbanHeaderActions`: `open ? <DuplicateBoardSheet /> : null`, cùng cách `MoveTaskSheet`): mỗi lần mở là một lượt mới —
 * tên và lựa chọn điền sẵn bằng khởi tạo lười, khoá idempotent mới, không còn câu lỗi cũ.
 *
 * Lỗi hiện NGAY trong tấm (`TASK_009` nhóm đủ bảng, 403 không phải quản trị nhóm, 404 bảng không còn với tôi) và giữ nguyên lựa chọn. Xong thì mở bản
 * sao (push — Back về bảng gốc). Nơi gọi quyết định hiện nút theo `canCreateBoard`; BE vẫn là nơi quyết định cuối cùng.
 */
export function DuplicateBoardSheet({ boardId, boardName, wsId, onClose }: DuplicateBoardSheetProps) {
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readBoardLimits(capabilities?.limits), [capabilities?.limits]);
  const duplicate = useDuplicateBoard(wsId);
  const attempt = useAttemptKey('board-duplicate');
  const [name, setName] = useState(() => copyBoardName(boardName, limits.nameMax));
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeReviewConfig, setIncludeReviewConfig] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(false);

  // Đang gửi thì không cho đóng (chạm nền/vuốt xuống/Huỷ): đóng giữa chừng làm mất luôn bước mở bản sao khi BE trả về.
  const dismiss = () => {
    if (!duplicate.isPending) onClose();
  };

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0 && trimmed.length <= limits.nameMax;

  const submit = () => {
    if (!nameOk || duplicate.isPending) return;
    hapticTap();
    duplicate.mutate(
      { boardId, idempotencyKey: attempt.key, payload: { includeLabels, includeReviewConfig, includeTasks, name: trimmed } },
      {
        onError: (error) => attempt.settle(error),
        onSuccess: (board) => {
          onClose();
          showToast('success', 'Đã nhân bản bảng');
          if (board.tasksTruncated) {
            showToast('warning', `Chỉ sao chép được ${board.copiedTasks ?? 0} thẻ đầu tiên — bảng gốc còn thẻ chưa được chép.`);
          }
          router.push(boardHref(wsId, board.id));
        },
      },
    );
  };

  return (
    <BottomSheet
      alert={duplicate.error ? <Alert description={toErrorMessage(duplicate.error)} tone="error" /> : undefined}
      footer={
        <SheetActions
          primary={{ disabled: !nameOk, label: 'Nhân bản', loading: duplicate.isPending, onPress: submit }}
          secondary={{ disabled: duplicate.isPending, label: 'Huỷ', onPress: dismiss }}
        />
      }
      scrollable
      title="Nhân bản bảng"
      visible
      onClose={dismiss}
    >
      <View className="gap-md pb-md">
        <Input
          label="Tên bảng mới"
          maxLength={limits.nameMax}
          message={nameOk ? undefined : 'Nhập tên bảng'}
          messageTone="error"
          value={name}
          onChangeText={setName}
        />
        <Toggle
          description="Sao chép nhãn của bảng gốc."
          label="Nhãn"
          value={includeLabels}
          onChange={setIncludeLabels}
        />
        <Toggle
          description="Sao chép cách chấm chéo (số lượt duyệt, tiêu chí)."
          label="Cấu hình chấm chéo"
          value={includeReviewConfig}
          onChange={setIncludeReviewConfig}
        />
        <Toggle
          description="Chỉ thẻ chưa hoàn thành, tối đa 100 thẻ, vào đúng cột tương ứng."
          label="Cả thẻ chưa xong"
          value={includeTasks}
          onChange={setIncludeTasks}
        />
        <Text className="text-caption-lg text-fg-2">
          Cột và mô tả luôn được sao chép. Người làm, bình luận, tệp đính kèm, phụ thuộc và kết quả chấm không được sao chép.
        </Text>
      </View>
    </BottomSheet>
  );
}
