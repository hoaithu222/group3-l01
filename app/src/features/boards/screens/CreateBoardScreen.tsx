import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useZodForm } from '@/shared/form/useZodForm';
import { useCapabilities } from '@/shell/capabilities';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { FormInput } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import type { BoardTemplate } from '../api/boards.types';
import { BoardTemplatePicker } from '../components/BoardTemplatePicker';
import { ColumnsEditor } from '../components/ColumnsEditor';
import { DEFAULT_COLUMN_TEMPLATE } from '../constants/kanban.constants';
import { useCreateBoardFromTemplate } from '../queries/board-blueprints.queries';
import { useCreateBoard } from '../queries/boards.queries';
import { boardFormSchema, readBoardLimits, type BoardFormValues } from '../schemas/board.schemas';
import { boardHref } from '../utils/board-routes';
import { toDrafts, toInputs, validateDrafts, type ColumnDraft } from '../utils/columns-draft';
import { getErrorCode } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';

type CreateMode = 'custom' | 'default' | 'template';

const MODES: { key: CreateMode; label: string }[] = [
  { key: 'default', label: 'Mặc định' },
  { key: 'custom', label: 'Tuỳ chỉnh' },
  { key: 'template', label: 'Từ mẫu' },
];

/**
 * Tạo bảng (`app.md` §3 CreateBoard): tên, mô tả, mẫu cột "Mặc định" (BE lấy từ
 * `SystemConfig pm.defaultColumns` khi không gửi `columns`), "Tuỳ chỉnh" hoặc "Từ mẫu" (p3-02 P1: mẫu dựng sẵn "Đồ án", "Scrum nhẹ" — cột + nhãn
 * do BE dựng, `POST /workspaces/:id/boards/from-template`).
 *
 * `Idempotency-Key` sinh MỘT LẦN lúc mở màn — bấm "Tạo bảng" hai lần chỉ ra một
 * bảng. Lỗi thuộc form hiện TRONG form: tên ở trường, `TASK_009` (đủ số bảng)
 * và `TASK_008` (cột sai) ở banner — toast tự tắt sau 5 giây, người dùng còn
 * đang sửa (`form-validation.md`).
 */
export function CreateBoardScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readBoardLimits(capabilities?.limits), [capabilities?.limits]);
  const schema = useMemo(() => boardFormSchema(limits), [limits]);
  const [idempotencyKey] = useState(() => newIdempotencyKey('board-create'));
  // Khoá RIÊNG cho `from-template` (BE tách scope idempotency theo đường dẫn) — cũng sinh một lần lúc mở màn.
  const [templateKey] = useState(() => newIdempotencyKey('board-from-template'));
  const [mode, setMode] = useState<CreateMode>('default');
  const [template, setTemplate] = useState<BoardTemplate | null>(null);
  const [drafts, setDrafts] = useState<ColumnDraft[]>(() => toDrafts(DEFAULT_COLUMN_TEMPLATE));
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const createBoard = useCreateBoard(wsId);
  const fromTemplate = useCreateBoardFromTemplate(wsId);

  const form = useZodForm<BoardFormValues, BoardFormValues>(schema, {
    defaultValues: { description: '', name: '' },
  });

  const serverCode = getErrorCode(createBoard.error);
  // Tạo-từ-mẫu tắt toast ở service (`skipErrorToast`) nên MỌI lỗi của nó hiện ở đây (TASK_009 đủ bảng, 403, 404…); tạo thường chỉ hai mã form-scope.
  const serverMessage =
    mode === 'template'
      ? fromTemplate.error
        ? toErrorMessage(fromTemplate.error)
        : null
      : createBoard.error && (serverCode === 'TASK_009' || serverCode === 'TASK_008')
        ? toErrorMessage(createBoard.error)
        : null;
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` của `footer` — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();

  const pickTemplate = (next: BoardTemplate) => {
    const name = form.getValues('name');
    // Ô tên trống (hoặc còn là tên mẫu trước do CHÍNH màn này điền) ⇒ điền tên mẫu mới; tên người dùng tự gõ thì giữ nguyên.
    if (!name.trim() || name === template?.name) {
      form.setValue('name', next.name.slice(0, limits.nameMax), { shouldValidate: true });
    }
    setTemplate(next);
    setColumnsError(null);
  };

  const submit = form.handleSubmit((values) => {
    const problem =
      mode === 'custom'
        ? validateDrafts(drafts, limits)
        : mode === 'template' && !template
          ? 'Chọn một mẫu bảng để tiếp tục.'
          : null;
    setColumnsError(problem);
    if (problem) return;
    // Form hợp lệ, lệnh tạo sắp đi: rung nhẹ xác nhận cú chạm "Tạo bảng" (kết quả còn chờ mạng).
    hapticTap();
    const common = { description: values.description || undefined, name: values.name };
    const onSuccess = (board: { id: string }) => {
      router.replace(boardHref(wsId, board.id));
    };
    if (mode === 'template' && template) {
      fromTemplate.mutate(
        { idempotencyKey: templateKey, payload: { ...common, template: template.code } },
        { onSuccess },
      );
      return;
    }
    createBoard.mutate(
      { idempotencyKey, payload: { ...common, columns: mode === 'custom' ? toInputs(drafts) : undefined } },
      { onSuccess },
    );
  });

  // Nút chính dính đáy (như form họp): chế độ "Tuỳ chỉnh" kéo dài danh sách cột, để nút cuối `ScrollView` là phải cuộn hết mới thấy.
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        {serverMessage ? <Alert description={serverMessage} tone="error" /> : null}
        <Button
          fullWidth
          label="Tạo bảng"
          loading={createBoard.isPending || fromTemplate.isPending}
          onPress={submit}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  const columnSection =
    mode === 'custom' ? (
      <ColumnsEditor drafts={drafts} error={columnsError} limits={limits} onChange={setDrafts} />
    ) : mode === 'template' ? (
      <>
        <BoardTemplatePicker selected={template?.code ?? null} onSelect={pickTemplate} />
        {columnsError ? <Alert description={columnsError} tone="error" /> : null}
      </>
    ) : (
      <Text className="text-body-md text-fg-2">
        Cần làm · Đang làm · Chờ duyệt · Hoàn thành (theo cấu hình của hệ thống).
      </Text>
    );

  return (
    <Screen footer={footer} header={<AppBar title="Tạo bảng" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        <FormInput<BoardFormValues>
          autoCapitalize="sentences"
          control={form.control}
          label="Tên bảng"
          maxLength={limits.nameMax}
          name="name"
          placeholder="Ví dụ: Đồ án học kỳ 1"
          required
          returnKeyType="next"
        />
        <FormInput<BoardFormValues>
          control={form.control}
          label="Mô tả"
          multiline
          name="description"
          placeholder="Bảng này dùng để làm gì? (không bắt buộc)"
        />

        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">Mẫu cột</Text>
          <View className="flex-row flex-wrap gap-xs">
            {MODES.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                role="radio"
                selected={mode === item.key}
                onPress={() => {
                  hapticSelection();
                  setMode(item.key);
                }}
              />
            ))}
          </View>
          {columnSection}
        </View>
      </View>
    </Screen>
  );
}
