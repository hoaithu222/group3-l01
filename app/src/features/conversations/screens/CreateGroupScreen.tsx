import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { PersonOption } from '../api/conversations.types';
import { DetailsStep, MembersStep, MEMBERS_MAX, WorkspaceStep } from '../components/CreateGroupSteps';
import { useCreateGroup, useMyWorkspaceOptions } from '../hooks/useCreateGroup';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePeopleSearch } from '../hooks/usePeopleSearch';
import { getErrorCode } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';

type Step = 1 | 2 | 3;

/**
 * app.md §3 — thuật sĩ 3 bước tạo nhóm; bỏ qua bước 1 khi chỉ có 1 workspace.
 *
 * ⚠️ "Bỏ qua bước 1" SUY RA từ dữ liệu (`effectiveStep`), không `setState`
 * trong `useEffect` khi `workspaces.data` tải xong — đúng luật app/AGENTS.md
 * "seed state từ prop/dữ liệu bất đồng bộ không dùng useEffect+setState"
 * (ESLint `react-hooks/set-state-in-effect` chặn cứng ca đó).
 */
export function CreateGroupScreen() {
  const workspaces = useMyWorkspaceOptions();
  const [step, setStep] = useState<Step>(1);
  const [manualWorkspaceId, setManualWorkspaceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PersonOption[]>([]);
  const [title, setTitle] = useState('');
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const idempotencyKey = useRef(newIdempotencyKey('conv-create')).current;
  const createGroup = useCreateGroup();

  const singleWorkspace = workspaces.data?.length === 1 ? workspaces.data[0] : undefined;
  const workspaceId = manualWorkspaceId ?? singleWorkspace?.id ?? null;
  const minStep: Step = singleWorkspace ? 2 : 1;
  const effectiveStep = Math.max(step, minStep) as Step;

  const people = usePeopleSearch(debouncedQuery, workspaceId ?? undefined);

  const title2 = useMemo(() => `Tạo nhóm — Bước ${String(effectiveStep)}/3`, [effectiveStep]);

  function toggleMember(person: PersonOption): void {
    setSelected((prev) =>
      prev.some((p) => p.userId === person.userId) ? prev.filter((p) => p.userId !== person.userId) : [...prev, person],
    );
  }

  function submit(): void {
    if (!workspaceId) return;
    createGroup.mutate(
      { payload: { workspaceId, title: title.trim(), memberIds: selected.map((p) => p.userId), avatarAssetId }, idempotencyKey },
      {
        // Rung "thành công" TRƯỚC khi thay màn — việc dài (3 bước) vừa xong; màn nhóm mới hiện ra ngay sau đó.
        onSuccess: (created) => {
          hapticSuccess();
          router.replace({ pathname: '/messages/[conversationId]', params: { conversationId: created.id } });
        },
        onError: (error) => {
          const code = getErrorCode(error);
          if (code === 'CONV_003') {
            showToast('error', 'Có người không thuộc nhóm làm việc này — hãy bỏ chọn rồi thử lại.');
            setStep(2);
            return;
          }
          showToast('error', code === 'CONV_004' ? 'Nhóm chat đã đạt số thành viên tối đa.' : 'Không tạo được nhóm, thử lại sau.');
        },
      },
    );
  }

  const canNext = effectiveStep === 1 ? Boolean(workspaceId) : effectiveStep === 2 ? selected.length > 0 : title.trim().length > 0;

  return (
    <Screen
      footer={
        <BottomActionBar>
          <View className="flex-row gap-sm">
            {effectiveStep > minStep ? (
              <View className="flex-1">
                <Button fullWidth label="Quay lại" variant="neutral-secondary" onPress={() => setStep((effectiveStep - 1) as Step)} />
              </View>
            ) : null}
            <View className="flex-1">
              <Button
                disabled={!canNext}
                fullWidth
                label={effectiveStep === 3 ? 'Tạo nhóm' : 'Tiếp tục'}
                loading={createGroup.isPending}
                onPress={() => (effectiveStep === 3 ? submit() : setStep((effectiveStep + 1) as Step))}
              />
            </View>
          </View>
        </BottomActionBar>
      }
      header={<AppBar title={title2} onBack={router.back} />}
      keyboardAware
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 py-sm">
        {effectiveStep === 1 ? (
          <WorkspaceStep isLoading={workspaces.isLoading} options={workspaces.data ?? []} selectedId={workspaceId} onSelect={setManualWorkspaceId} />
        ) : effectiveStep === 2 ? (
          <MembersStep
            isLoading={people.isLoading}
            people={(people.data ?? []).filter((p) => selected.length < MEMBERS_MAX || selected.some((s) => s.userId === p.userId))}
            selected={selected}
            onQueryChange={setQuery}
            onToggle={toggleMember}
          />
        ) : (
          <DetailsStep title={title} onAvatarAssetId={setAvatarAssetId} onTitleChange={setTitle} />
        )}
      </View>
    </Screen>
  );
}
