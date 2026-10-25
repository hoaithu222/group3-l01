import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useZodForm } from '@/shared/form/useZodForm';
import { shouldRotateIdempotencyKey, useIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { useNetworkStatus } from '@/shared/hooks/use-network-status';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { summarizeTemplateResult, type TemplateStepProps } from '@/shared/workspace-templates';
import { useCapabilities } from '@/shell/capabilities';

import { WorkspaceCreatePreview } from '../components/WorkspaceCreatePreview';
import { useTemplateChoice } from '../hooks/useTemplateChoice';
import { useCreateWorkspace } from '../queries/workspaces.queries';
import { createWorkspaceSchema, readWorkspaceLimits, type CreateWorkspaceFormValues } from '../schemas/workspace.schemas';
import { createSignature, isTemplateRejected, templateBody } from '../utils/create-template';

export interface CreateWorkspaceScreenProps {
  /**
   * Bước CHỌN MẪU (p5-04) do FILE ROUTE truyền vào: `workspaces` không import chéo `workspace-templates`
   * (feature-structure.md) nên tầng route là nơi ghép, như `extraSections` của `WorkspaceOverviewScreen`. Không truyền = form
   * như cũ (tên + mô tả).
   */
  renderTemplateStep?: (props: TemplateStepProps) => ReactNode;
}

/**
 * Tạo nhóm (app.md p1-01 §3 + p5-04 §3 "bước mẫu"). `Idempotency-Key` sinh khi mở màn và giữ nguyên cho CÙNG một body — bấm "Tạo"
 * nhiều lần (mạng chậm) chỉ tạo một workspace (WS-01). ⚠️ BE lưu cả phản hồi 4xx theo khoá 24 giờ (`idempotency.ts`), nên khoá đổi
 * khi body đổi (sửa tên, chọn/bỏ mẫu/kênh) và sau mỗi phản hồi 4xx — nếu không, `TPL_001` rồi "Không dùng mẫu" sẽ nhận lại đúng
 * `TPL_001` vì cùng khoá. Ảnh đại diện CHƯA có (picker ảnh p0-05 chưa dựng).
 *
 * Chọn mẫu: gửi `templateCode` + `channelKeys` (kênh đang tick). `TPL_001`/`CFG_005` ⇒ về "Không dùng mẫu" kèm thông báo, người dùng
 * tạo nhóm trơn được ngay. Tạo xong hiện GỌN kết quả `data.template` (đã tạo/bỏ qua/lỗi) bằng toast rồi vào nhóm.
 *
 * Đầu form là thẻ XEM TRƯỚC đổi theo từng chữ (`WorkspaceCreatePreview`, cùng khuôn thẻ danh sách); đang gửi thì khoá cả form
 * lẫn bước mẫu; mất mạng thì nút nói "Kết nối lại để tạo" (bị khoá) thay vì để lượt gửi hỏng.
 */
export function CreateWorkspaceScreen({ renderTemplateStep }: CreateWorkspaceScreenProps = {}) {
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readWorkspaceLimits(capabilities?.limits), [capabilities?.limits]);
  const schema = useMemo(() => createWorkspaceSchema(limits), [limits]);
  const createWorkspace = useCreateWorkspace();
  const choice = useTemplateChoice();

  const form = useZodForm<CreateWorkspaceFormValues, CreateWorkspaceFormValues>(schema, {
    defaultValues: { name: '', description: '' },
  });
  const values = useWatch({ control: form.control });
  const { key: idempotencyKey, rotate } = useIdempotencyKey('ws-create', createSignature(values, choice.selection));

  const errorMessage = createWorkspace.error ? toErrorMessage(createWorkspace.error) : null;
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` của `footer` — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  // Đang gửi ⇒ KHOÁ cả form (app.md §3 "Nút Tạo loading, khoá form"): sửa tên giữa chừng là đổi chữ ký body ⇒ khoá
  // idempotency MỚI cho lượt sau trong khi lượt đang bay vẫn có thể thành công — hai nhóm.
  const busy = createWorkspace.isPending;
  // Mất mạng: nói thẳng lý do trên nút thay vì để người dùng bấm rồi chờ lỗi (app.md §3 "Kết nối lại để tạo").
  const { isOnline } = useNetworkStatus();

  const submit = form.handleSubmit((formValues) => {
    createWorkspace.mutate(
      {
        payload: {
          description: formValues.description || undefined,
          name: formValues.name,
          ...templateBody(choice.selection),
        },
        idempotencyKey,
      },
      {
        onError: (error) => {
          if (shouldRotateIdempotencyKey(error)) rotate();
          if (choice.selection && isTemplateRejected(error)) {
            choice.reject();
            createWorkspace.reset();
          }
        },
        onSuccess: (result) => {
          hapticSuccess(); // nhóm đã tạo — rung báo xong đi trước lượt chuyển màn
          if (result.template) {
            const outcome = summarizeTemplateResult(result.template);
            showToast(outcome.tone, outcome.message);
          }
          router.replace({ pathname: '/workspaces/[wsId]', params: { wsId: result.workspace.id } });
        },
      },
    );
  });

  // Nút chính dính ĐÁY (trên bàn phím khi mở): form có thể dài thêm nhờ bước chọn mẫu + danh sách kênh, để nút cuối nội dung là phải
  // cuộn mới thấy "Tạo nhóm" — và gõ mô tả xong lại phải đóng bàn phím để tìm nút. Cùng mẫu `MeetingFormScreen`.
  // ⚠️ Câu lỗi nằm NGAY TRÊN nút (trong thanh đáy), không cuối form: form dài thêm nhờ bước mẫu, lỗi ở đáy nội dung thì bấm "Tạo
  // nhóm" xong không thấy gì xảy ra (câu lỗi nằm khuất dưới thanh đáy/bàn phím).
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        <View className="gap-xs">
          {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
          <Button
            disabled={!isOnline}
            fullWidth
            label={isOnline ? 'Tạo nhóm' : 'Kết nối lại để tạo'}
            loading={busy}
            onPress={submit}
          />
        </View>
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen footer={footer} header={<AppBar title="Tạo nhóm" onBack={router.back} />} keyboardAware>
      {/* Thứ tự đọc từ trên xuống = thứ tự làm: xem trước thẻ → thông tin nhóm → (tuỳ chọn) mẫu. Khe 24 giữa các khối có tiêu đề. */}
      <View className="gap-xl py-xs">
        <WorkspaceCreatePreview description={values.description} name={values.name} />

        <Section icon="edit" title="Thông tin nhóm">
          <View className="gap-md">
            <FormInput<CreateWorkspaceFormValues>
              autoCapitalize="sentences"
              control={form.control}
              disabled={busy}
              // Bộ đếm cạnh nhãn: biết còn bao nhiêu chữ TRƯỚC khi chạm trần `maxLength` (ô tự chặn, không báo gì).
              hint={`${values.name?.length ?? 0}/${limits.nameMax}`}
              label="Tên nhóm"
              maxLength={limits.nameMax}
              name="name"
              placeholder="Ví dụ: Nhóm dự án A"
              required
              returnKeyType="next"
              // "Tiếp" trên bàn phím sang thẳng ô mô tả (giữ bàn phím mở) thay vì đóng bàn phím.
              submitBehavior="submit"
              onSubmitEditing={() => form.setFocus('description')}
            />

            <FormInput<CreateWorkspaceFormValues>
              control={form.control}
              disabled={busy}
              hint={`${values.description?.length ?? 0}/${limits.descriptionMax}`}
              label="Mô tả"
              maxLength={limits.descriptionMax}
              multiline
              name="description"
              placeholder="Nhóm này dùng để làm gì? (không bắt buộc)"
            />
          </View>
        </Section>

        {choice.notice ? <Alert description={choice.notice} tone="info" /> : null}
        {renderTemplateStep?.({
          disabled: busy,
          onChange: choice.change,
          refreshToken: choice.refreshToken,
          value: choice.selection,
        })}
      </View>
    </Screen>
  );
}
