import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { SliderDot } from '@/shared/ui/pagination';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { useCapabilities } from '@/shell/capabilities';

import {
  AudienceStep,
  CREATE_CHANNEL_STEP_TITLES,
  DEFAULT_CHANNEL_DRAFT,
  NameStep,
  PolicyStep,
  ReviewStep,
  TypeStep,
  type ChannelDraft,
} from '../components/CreateChannelSteps';
import { useCreateChannel, useRestoreArchivedDuplicate } from '../queries/channels.queries';
import { channelDescriptionSchema, channelNameSchema, readChannelLimits } from '../schemas/channel.schemas';
import { getArchivedChannelId } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';

const STEP_COUNT = CREATE_CHANNEL_STEP_TITLES.length;

function stepIsValid(step: number, draft: ChannelDraft, limits: ReturnType<typeof readChannelLimits>): boolean {
  if (step !== 1) return true;
  return (
    channelNameSchema(limits).safeParse(draft.name).success &&
    channelDescriptionSchema(limits).safeParse(draft.description).success
  );
}

/**
 * Wizard 5 bước (app.md p1-03 §3): Tên/mô tả → Loại → Đối tượng → Quyền đăng
 * bài → Xem lại. `idempotencyKey` sinh MỘT LẦN lúc mở màn, giữ nguyên tới khi
 * tạo thành công (double-tap/mạng chậm chỉ tạo một kênh).
 *
 * `CH_001` (trùng tên, kèm `archivedChannelId`) đẩy người dùng VỀ bước 1 —
 * xung đột tên thuộc về trường "Tên kênh", `NameStep` là nơi hiện gợi ý khôi
 * phục, dù request tạo kênh chỉ thật sự gửi ở bước cuối.
 */
export function CreateChannelScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readChannelLimits(capabilities?.limits), [capabilities?.limits]);
  const [idempotencyKey] = useState(() => newIdempotencyKey('ch-create'));

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ChannelDraft>(DEFAULT_CHANNEL_DRAFT);
  const [archivedChannelId, setArchivedChannelId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createChannel = useCreateChannel(wsId);
  const restoreDuplicate = useRestoreArchivedDuplicate(wsId);

  function patchDraft(patch: Partial<ChannelDraft>): void {
    setDraft((prev) => ({ ...prev, ...patch }));
    setArchivedChannelId(undefined);
    setErrorMessage(null);
  }

  function goBack(): void {
    if (step > 1) setStep(step - 1);
    else router.back();
  }

  function goToChannel(channelId: string): void {
    router.replace({ params: { chId: channelId, wsId }, pathname: '/workspaces/[wsId]/channels/[chId]' });
  }

  function submit(): void {
    setErrorMessage(null);
    createChannel.mutate(
      {
        idempotencyKey,
        payload: {
          description: draft.description.trim() || undefined,
          initialMemberIds: draft.visibility === 'PRIVATE' ? draft.initialMemberIds : [],
          name: draft.name.trim(),
          postingPolicy: draft.postingPolicy,
          type: draft.type,
          visibility: draft.visibility,
        },
      },
      {
        onError: (error) => {
          const archivedId = getArchivedChannelId(error);
          if (archivedId) {
            setArchivedChannelId(archivedId);
            setStep(1);
            return;
          }
          setErrorMessage(toErrorMessage(error));
        },
        onSuccess: (created) => {
          hapticSuccess(); // kênh đã tạo — rung báo xong trước lượt chuyển màn
          goToChannel(created.id);
        },
      },
    );
  }

  function handleRestoreArchived(): void {
    if (!archivedChannelId) return;
    restoreDuplicate.mutate(archivedChannelId, {
      onError: (error) => setErrorMessage(toErrorMessage(error)),
      onSuccess: (restored) => goToChannel(restored.id),
    });
  }

  const valid = stepIsValid(step, draft, limits);
  const isLastStep = step === STEP_COUNT;

  return (
    <Screen header={<AppBar title={`Bước ${step}/${STEP_COUNT} · ${CREATE_CHANNEL_STEP_TITLES[step - 1]}`} onBack={goBack} />}>
      <View className="gap-xl py-xs">
        <SliderDot activeIndex={step - 1} count={STEP_COUNT} />

        {step === 1 ? (
          <NameStep
            archivedChannelId={archivedChannelId}
            draft={draft}
            limits={limits}
            restoring={restoreDuplicate.isPending}
            onChange={patchDraft}
            onRestoreArchived={handleRestoreArchived}
          />
        ) : step === 2 ? (
          <TypeStep draft={draft} onChange={patchDraft} />
        ) : step === 3 ? (
          <AudienceStep draft={draft} wsId={wsId} onChange={patchDraft} />
        ) : step === 4 ? (
          <PolicyStep draft={draft} onChange={patchDraft} />
        ) : (
          <ReviewStep draft={draft} errorMessage={errorMessage} />
        )}

        <Button
          disabled={!valid}
          fullWidth
          label={isLastStep ? 'Tạo kênh' : 'Tiếp theo'}
          loading={createChannel.isPending}
          onPress={() => (isLastStep ? submit() : setStep(step + 1))}
        />
      </View>
    </Screen>
  );
}
