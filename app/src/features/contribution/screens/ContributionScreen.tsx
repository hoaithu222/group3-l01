import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { FeatureOffScreen } from '@/shell/capabilities';

import { ActivitySection } from '../components/ActivitySection';
import { ContributionBanners } from '../components/ContributionBanners';
import { ContributionConfigSheet } from '../components/ContributionConfigSheet';
import { ContributionStats } from '../components/ContributionStats';
import { ExportReportButton } from '../components/ExportReportButton';
import { FormulaCard } from '../components/FormulaCard';
import { MemberBreakdownSheet } from '../components/MemberBreakdownSheet';
import { PeriodPicker } from '../components/PeriodPicker';
import { ScoreboardSection } from '../components/ScoreboardSection';
import { useContributionScreen } from '../hooks/useContributionScreen';

/** Múi giờ mặc định của hệ thống (`pm.timezone`) — chỉ dùng cho tới khi server trả múi giờ thật của nhóm. */
const FALLBACK_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Màn "Đóng góp" của một bảng (p4-06 app.md §3): kỳ báo cáo · công thức (và "Đổi trọng số" cho OWNER/ADMIN) · bảng điểm từng thành viên kèm SỐ GỐC · biểu đồ hoạt động
 * theo ngày · xuất PDF. CHỈ ĐỌC với mọi vai trò — không có nút sửa điểm hay % ở đâu cả; việc ghi duy nhất là công thức. Điện thoại: danh sách + tấm chi tiết;
 * máy tính bảng: bảng (+ panel chi tiết bên phải khi đủ rộng, ≥ 840dp).
 *
 * Trạng thái: khung xương từng khối · rỗng "Kỳ này chưa có thẻ hoàn thành" · lỗi + Thử lại (mất quyền thì không có nút) · offline chỉ đọc kèm "Dữ liệu lúc …" ·
 * `stale` "Đang cập nhật số liệu". Mất quyền/bảng bị xoá do `BoardScopeProvider` (layout `[boardId]`) đưa ra hub nhóm.
 */
export function ContributionScreen() {
  const view = useContributionScreen();
  const { tier } = useBreakpoint();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const { report } = view;
  const data = report.data;
  const timezone = view.timezone ?? FALLBACK_TIMEZONE;
  const selected = data?.members.find((member) => member.user.id === selectedId) ?? null;
  const sidePanel = view.tablet && tier === 'tablet-lg';

  if (view.featureOff) return <FeatureOffScreen />;

  const header = (
    <AppBar
      actions={
        <ExportReportButton
          boardId={view.boardId}
          disabled={view.offline || !data}
          period={view.period}
          onCreated={view.setExportId}
        />
      }
      subtitle={view.boardName}
      title="Đóng góp"
      onBack={router.back}
    />
  );

  return (
    // `constrained={false}` trên máy tính bảng: bảng điểm 8 cột cần TRÀN bề ngang, trần 720dp biến máy tính bảng thành điện thoại to.
    <Screen
      constrained={!view.tablet}
      header={header}
      refreshing={report.isRefetching}
      onRefresh={view.refresh}
    >
      <View className="gap-xl py-xs">
        <ContributionBanners
          archived={view.archived}
          boardId={view.boardId}
          exportId={view.exportId}
          offline={view.offline}
          period={view.period}
          report={data}
          timezone={timezone}
          onDismissExport={() => view.setExportId(undefined)}
          onReplaceExport={view.setExportId}
        />
        {/* Hàng chip tự có lề ngang; `Screen` đã đệm 16 — bù `-mx-md` để chip không thụt 32dp. */}
        <View className="-mx-md">
          <PeriodPicker period={view.period} periods={view.periods.data} onChange={view.setPeriod} />
        </View>
        {/* Tóm tắt kỳ (thẻ xong · điểm · thành viên) — hiện dần một lần khi số liệu về; đổi kỳ giữ bản cũ nên không chạy lại. */}
        {data ? (
          <Reveal>
            <ContributionStats report={data} />
          </Reveal>
        ) : null}
        <Section icon="setting2" title="Công thức">
          {data ? (
            <FormulaCard
              canEdit={view.canEdit}
              formula={data.formula}
              timezone={timezone}
              onEdit={() => setConfigOpen(true)}
            />
          ) : (
            <Skeleton className="h-44 rounded-md" />
          )}
        </Section>
        <ScoreboardSection
          report={report}
          selected={selected}
          sidePanel={sidePanel}
          tablet={view.tablet}
          onSelect={(member) => setSelectedId(member?.user.id ?? null)}
        />
        <ActivitySection
          heat={view.heat}
          heatmap={view.heatmap}
          members={data?.members ?? []}
          range={view.range}
          weeks={view.weeks}
          onHeat={view.setHeat}
        />
      </View>

      {data ? (
        <MemberBreakdownSheet
          boardId={data.boardId}
          member={sidePanel ? null : selected}
          period={data.period.key}
          timezone={timezone}
          weights={data.formula.weights}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      <ContributionConfigSheet boardId={view.boardId} visible={configOpen} onClose={() => setConfigOpen(false)} />
    </Screen>
  );
}
