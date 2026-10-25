import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useFormState } from 'react-hook-form';

import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config/constants';

import { MeetingForm } from '../components/form/MeetingForm';
import { useCreateMeeting, useUpdateMeeting } from '../queries/meetings.mutations';
import { useMeetingDetail, useMyWorkspacesForMeetings } from '../queries/meetings.queries';
import { meetingFormSchema, type MeetingFormValues } from '../schemas/meeting-form.schema';
import { classifyMeetingError } from '../utils/meeting-errors';
import {
  buildCreatePayload,
  buildUpdatePayload,
  defaultFormValues,
  valuesFromDetail,
} from '../utils/meeting-form-payload';

/** `Idempotency-Key` cho một lần mở form tạo (≥ 8 ký tự) — gửi lại cùng khoá khi bấm lặp/thử lại không tạo trùng cuộc họp. */
function newIdempotencyKey(): string {
  return `meeting-create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tạo (`/meetings/new?workspaceId=&date=`) hoặc sửa (`/meetings/[meetingId]/edit`) cuộc họp. Sửa gửi kèm `version` (khoá lạc quan, qua
 * `buildUpdatePayload`); họp đang diễn ra (`canEditLimited`) khoá ngày/giờ bắt đầu. Lỗi có TRƯỜNG (`classifyMeetingError().field`)
 * gắn vào đúng ô; còn lại hiện ở chân màn cạnh nút Lưu, giữ nguyên dữ liệu đã nhập.
 *
 * 409 `RES_003` (người khác vừa sửa): banner "Tải lại" — bản nhập được GIỮ (effect nạp chỉ ghi đè khi form chưa bị sửa), tải lại chỉ
 * đổi `version` nền để lần lưu kế gửi đúng `expectedVersion`. 404 khi lưu ⇒ về lịch (cuộc họp không còn).
 */
export function MeetingFormScreen() {
  const { date, meetingId, workspaceId } = useLocalSearchParams<{
    date?: string;
    meetingId?: string;
    workspaceId?: string;
  }>();
  const editing = Boolean(meetingId);
  const detail = useMeetingDetail(meetingId);
  const workspaces = useMyWorkspacesForMeetings(!editing);
  const create = useCreateMeeting();
  const update = useUpdateMeeting(meetingId ?? '');
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const schema = useMemo(() => meetingFormSchema({ mode: editing ? 'edit' : 'create' }), [editing]);
  const form = useZodForm<MeetingFormValues, MeetingFormValues>(schema, {
    defaultValues: defaultFormValues({
      dayKey: date && DAY_KEY.test(date) ? date : undefined,
      workspaceId,
    }),
  });
  const { isDirty } = useFormState({ control: form.control });
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` của `footer` — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();

  const meeting = detail.data;
  const { reset } = form;
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!meeting) return;
    // Nạp lần đầu / khi form chưa bị sửa. Đang có chỗ người dùng đã nhập (sau 409, hoặc người khác đổi lịch giữa chừng) ⇒ GIỮ.
    if (loadedId.current === meeting.id && isDirty) return;
    loadedId.current = meeting.id;
    reset(valuesFromDetail(meeting));
  }, [meeting, isDirty, reset]);

  const fail = (error: unknown) => {
    const failure = classifyMeetingError(error);
    setConflict(failure.kind === 'VERSION_CONFLICT');
    if (failure.kind === 'VERSION_CONFLICT') {
      setFormError(null);
    } else if (failure.kind === 'NOT_FOUND') {
      showToast('info', failure.message);
      router.replace(PATHS.MEETINGS);
    } else if (failure.field) {
      form.setError(failure.field, { message: failure.message });
      setFormError(null);
    } else {
      setFormError(failure.message);
    }
  };

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    setConflict(false);
    if (meeting) {
      update.mutate(buildUpdatePayload(values, meeting), {
        onError: fail,
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã lưu thay đổi.');
          router.back();
        },
      });
      return;
    }
    create.mutate(
      { idempotencyKey, payload: buildCreatePayload(values), workspaceId: values.workspaceId },
      {
        onError: fail,
        // Rung "xong" khi SERVER đã tạo (không phải lúc bấm): màn chuyển sang chi tiết có thể chậm, cú rung báo việc đã thành.
        onSuccess: (created) => {
          hapticSuccess();
          router.replace({ params: { meetingId: created.id }, pathname: '/meetings/[meetingId]' });
        },
      },
    );
  });

  const header = <AppBar title={editing ? 'Sửa cuộc họp' : 'Tạo cuộc họp'} onBack={router.back} />;

  if (editing && !meeting) {
    return (
      <Screen header={header}>
        {detail.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void detail.refetch() }]}
            description={classifyMeetingError(detail.error).message}
            icon="alert-warning"
            size="compact"
            title="Không mở được cuộc họp"
            tone="danger"
          />
        ) : (
          <View className="py-xs">
            <SkeletonParagraph />
          </View>
        )}
      </Screen>
    );
  }

  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar contentClassName="tablet:max-w-none">
        {conflict ? (
          <Alert
            actions={
              <Button
                label="Tải lại"
                size="xs"
                variant="secondary"
                onPress={() => {
                  setConflict(false);
                  void detail.refetch();
                }}
              />
            }
            description="Bản bạn đang nhập vẫn được giữ. Tải lại để lấy phiên bản mới nhất rồi lưu lại."
            title="Cuộc họp đã được cập nhật bởi người khác"
            tone="warning"
          />
        ) : null}
        {formError ? <Alert description={formError} tone="error" /> : null}
        <Button
          fullWidth
          label={editing ? 'Lưu' : 'Tạo cuộc họp'}
          loading={create.isPending || update.isPending}
          onPress={() => void submit()}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen constrained={false} footer={footer} header={header} keyboardAware>
      <MeetingForm
        form={form}
        hasChatGroup={Boolean(meeting?.conversationId)}
        limited={Boolean(meeting && !meeting.myActions.canEdit && meeting.myActions.canEditLimited)}
        workspaces={editing ? undefined : (workspaces.data ?? [])}
      />
    </Screen>
  );
}
