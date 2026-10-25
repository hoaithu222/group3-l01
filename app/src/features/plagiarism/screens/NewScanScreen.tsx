import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { newIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSelection, hapticTap, hapticWarning } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useCreateScan, useEligibleResourcesInfinite } from '../api/plagiarism.queries';
import type { ScanMode } from '../api/plagiarism.types';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { NewScanFooter } from '../components/NewScanFooter';
import { ResourcePickerList } from '../components/ResourcePickerList';
import { ScanModeSelector } from '../components/ScanModeSelector';
import { PLAGIARISM_TARGETS_MAX } from '../constants';

/**
 * Tạo lượt kiểm tra trùng lặp mới (app.md §3). Lựa chọn tệp giữ bằng `useState` cục bộ — mất khi rời màn là chấp nhận được (app.md §5).
 *
 * Nút "Bắt đầu kiểm tra" DÍNH ĐÁY (`NewScanFooter`): danh sách tệp tới 50 dòng, để nút ở cuối vùng cuộn là phải cuộn
 * hết mới bấm được. Lỗi tạo lượt quét hiện bằng `Alert` ngay trên nút.
 */
export function NewScanScreen() {
  const { wsId = '', resourceId } = useLocalSearchParams<{ wsId: string; resourceId?: string }>();
  const [mode, setMode] = useState<ScanMode>('WITHIN_SELECTION');
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(resourceId ? [resourceId] : []),
  );
  const [excludeIds, setExcludeIds] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey('plagiarism-scan'));

  const eligible = useEligibleResourcesInfinite(wsId, undefined, undefined);
  const create = useCreateScan(wsId);
  const items = useMemo(() => eligible.data?.pages.flatMap((p) => p.items) ?? [], [eligible.data]);

  const toggleSelected = (id: string) => {
    // ⚠️ Chạm trần 50 tệp trước đây bị bỏ qua IM LẶNG — người dùng tưởng chạm không ăn. Giờ rung cảnh báo + nói lý do.
    if (!selected.has(id) && selected.size >= PLAGIARISM_TARGETS_MAX) {
      hapticWarning();
      showToast('info', `Mỗi lượt quét chọn tối đa ${PLAGIARISM_TARGETS_MAX} tệp.`);
    } else {
      hapticSelection();
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < PLAGIARISM_TARGETS_MAX) next.add(id);
      return next;
    });
  };
  const toggleExclude = (id: string) => {
    hapticSelection();
    setExcludeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = mode === 'WORKSPACE' ? selected.size >= 1 : selected.size >= 2;
  const errorMessage = create.error ? getCreateErrorMessage(create.error) : null;

  const submit = () => {
    hapticTap();
    create.mutate(
      {
        idempotencyKey,
        payload: {
          targetResourceIds: [...selected],
          mode,
          excludeResourceIds: [...excludeIds].filter((id) => !selected.has(id)),
          excludeFolderIds: [],
          note: note.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          router.replace(`/workspaces/${wsId}/plagiarism/${result.scanId}` as Href);
        },
      },
    );
  };

  return (
    <Screen
      footer={
        <NewScanFooter
          canSubmit={canSubmit}
          errorMessage={errorMessage}
          mode={mode}
          pending={create.isPending}
          onSubmit={submit}
        />
      }
      header={<AppBar title="Quét trùng lặp mới" onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-xl py-xs">
        <DisclaimerBanner />
        <Section icon="arrow-data-transfer-vertical" title="Chế độ so sánh">
          <ScanModeSelector value={mode} onChange={setMode} />
        </Section>
        <Section
          action={
            <Badge
              accessibilityLabel={`Đã chọn ${selected.size} trên ${PLAGIARISM_TARGETS_MAX} tệp`}
              label={`${selected.size}/${PLAGIARISM_TARGETS_MAX}`}
              variant={selected.size > 0 ? 'brand' : 'neutral'}
            />
          }
          icon="document"
          title="Chọn tệp"
        >
          {eligible.isLoading ? (
            <Card className="gap-md">
              <SkeletonParagraphWithIcon />
              <SkeletonParagraphWithIcon />
              <SkeletonParagraphWithIcon />
            </Card>
          ) : eligible.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void eligible.refetch() }]}
              description="Chưa tải được danh sách tệp của nhóm. Kiểm tra kết nối rồi thử lại."
              icon="alert-warning"
              size="compact"
              title="Không tải được danh sách tệp"
              tone="danger"
            />
          ) : items.length === 0 ? (
            <EmptyState
              description="Tải lên PDF, DOCX, TXT, MD hoặc mã nguồn trước khi kiểm tra trùng lặp."
              icon="document"
              size="compact"
              title="Nhóm chưa có tài liệu hỗ trợ"
              tone="info"
            />
          ) : (
            <ResourcePickerList data={items} selected={selected} onToggle={toggleSelected} />
          )}
          {eligible.hasNextPage ? (
            <Button
              label="Xem thêm"
              loading={eligible.isFetchingNextPage}
              size="sm"
              variant="secondary"
              onPress={() => void eligible.fetchNextPage()}
            />
          ) : null}
        </Section>
        {items.length > 0 ? (
          <Section icon="hide" title="Loại trừ tệp mẫu (tuỳ chọn)">
            <Text className="text-body-md text-fg-2">
              Phần trùng với các tệp này sẽ không tính vào điểm.
            </Text>
            <ResourcePickerList
              data={items.filter((i) => !selected.has(i.resourceId))}
              selected={excludeIds}
              onToggle={toggleExclude}
            />
          </Section>
        ) : null}
        <Section icon="edit" title="Ghi chú (tuỳ chọn)">
          <Input
            accessibilityLabel="Ghi chú"
            maxLength={300}
            multiline
            placeholder="Vd: đợt nộp bài tuần 5"
            value={note}
            onChangeText={setNote}
          />
        </Section>
      </View>
    </Screen>
  );
}

function getCreateErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data
    ?.error?.code;
  if (code === 'PLAG_001')
    return 'Số tệp không hợp lệ — chọn 1–50 tệp (so với nhau cần ít nhất 2 tệp).';
  if (code === 'PLAG_002') return 'Các tệp đã chọn chưa hỗ trợ kiểm tra trùng lặp.';
  if (code === 'PLAG_003') return 'Nhóm đang có lượt quét khác chạy, hãy đợi lượt trước hoàn tất.';
  if (code === 'PLAG_004') return 'Nhóm đã dùng hết số lượt quét trong ngày hôm nay.';
  return 'Không tạo được lượt quét, vui lòng thử lại.';
}
