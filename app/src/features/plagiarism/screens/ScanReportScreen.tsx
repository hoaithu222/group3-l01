import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import { useReport, useScan } from '../api/plagiarism.queries';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { HowScoringWorksSheet } from '../components/HowScoringWorksSheet';
import { PairScoresSection } from '../components/PairScoresSection';
import { ResultCard } from '../components/ResultCard';
import { ScanReportActions } from '../components/ScanReportActions';
import { ScanReportStats } from '../components/ScanReportStats';
import { ScanSummaryCard } from '../components/ScanSummaryCard';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { useScanProgressSocket } from '../hooks/useScanProgressSocket';
import { errorStateOf } from '../utils/error-state';
import { failureCodeLabel, isScanActive } from '../utils/level-label';

/** Khung xương đúng dáng màn báo cáo: thẻ tóm tắt + hàng ba thẻ số + hai thẻ kết quả. */
function ReportSkeleton() {
  return (
    <View className="gap-xl py-xs">
      <Skeleton className="h-40 rounded-md" />
      <View className="flex-row gap-sm">
        <Skeleton className="h-28 flex-1 rounded-md" />
        <Skeleton className="h-28 flex-1 rounded-md" />
        <Skeleton className="h-28 flex-1 rounded-md" />
      </View>
      <Skeleton className="h-24 rounded-md" />
    </View>
  );
}

/**
 * Báo cáo lượt quét (app.md §3): tóm tắt, kết quả từng tệp, tiến độ realtime khi chưa xong.
 *
 * Bố cục: thẻ tóm tắt → lời nhắc (có "Cách tính điểm") → ba thẻ số → kết quả xếp theo điểm → bảng từng cặp → hành động.
 * Lỗi tải báo cáo có nhánh riêng (bản cũ rơi vào "Không có đoạn trùng" — một kết luận SAI khi chỉ là mất sóng).
 */
export function ScanReportScreen() {
  const { wsId = '', scanId = '' } = useLocalSearchParams<{ wsId: string; scanId: string }>();
  useScanProgressSocket();
  const scan = useScan(scanId);
  const active = scan.data ? isScanActive(scan.data.status) : false;
  const reportEnabled = scan.data ? !active : false;
  const report = useReport(scanId, reportEnabled);
  // ⚠️ Chỉ tải lại báo cáo khi nó ĐANG bật: `refetch()` của query bị tắt vẫn gọi API thật.
  const pull = usePullRefresh(() =>
    Promise.all([scan.refetch(), reportEnabled ? report.refetch() : undefined]),
  );
  const [howScoringVisible, setHowScoringVisible] = useState(false);

  const header = <AppBar title="Báo cáo kiểm tra trùng lặp" onBack={router.back} />;

  if (scan.isLoading) {
    return (
      <Screen header={header}>
        <ScreenState skeleton={<ReportSkeleton />} state="loading" />
      </Screen>
    );
  }
  if (scan.isError || !scan.data) {
    const state = scan.isError ? errorStateOf(scan.error) : 'forbidden';
    return (
      <Screen header={header}>
        <ScreenState
          action={
            state === 'forbidden'
              ? undefined
              : { label: 'Thử lại', onPress: () => void scan.refetch() }
          }
          fullscreen
          state={state}
          title={state === 'forbidden' ? 'Không xem được lượt quét này' : undefined}
        />
      </Screen>
    );
  }

  const data = scan.data;
  const results = report.data?.results ?? [];
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const showResults = !active && data.status !== 'FAILED' && data.status !== 'CANCELLED';
  const pairs = report.data?.pairs ?? [];

  return (
    <Screen header={header} refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <View className="gap-xl py-xs">
        <Reveal>
          <ScanSummaryCard scan={data} />
        </Reveal>
        <Reveal index={1}>
          <DisclaimerBanner onOpenHowScoringWorks={() => setHowScoringVisible(true)} />
        </Reveal>

        {data.status === 'FAILED' ? (
          <EmptyState
            description={failureCodeLabel(data.failureCode)}
            icon="alert-warning"
            size="compact"
            title="Lượt quét không hoàn tất"
            tone="danger"
          />
        ) : null}
        {data.status === 'CANCELLED' ? (
          <EmptyState
            description="Bạn đã huỷ lượt quét này."
            icon="cancel"
            size="compact"
            title="Đã huỷ"
            tone="neutral"
          />
        ) : null}

        {showResults ? (
          report.isLoading ? (
            <Skeleton className="h-24 rounded-md" />
          ) : report.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void report.refetch() }]}
              description="Chưa tải được kết quả của lượt quét. Kiểm tra kết nối rồi thử lại."
              icon="alert-warning"
              size="compact"
              title="Không tải được báo cáo"
              tone="danger"
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              description="Không thấy đoạn trùng đáng kể ở tệp nào."
              icon="checkmark-circle"
              size="compact"
              title="Không có đoạn trùng"
              tone="success"
            />
          ) : (
            <>
              <Reveal index={2}>
                <ScanReportStats results={sorted} />
              </Reveal>
              <Section icon="analytics-02" title="Kết quả từng tệp">
                <View className="gap-sm">
                  {sorted.map((result) => (
                    <ResultCard
                      key={result.id}
                      result={result}
                      onPress={() =>
                        router.push(
                          `/workspaces/${wsId}/plagiarism/${scanId}/${result.targetResourceId}` as Href,
                        )
                      }
                    />
                  ))}
                </View>
              </Section>
            </>
          )
        ) : null}

        {pairs.length > 0 ? <PairScoresSection pairs={pairs} results={results} /> : null}

        <ScanReportActions
          canCancel={data.myActions?.cancel === true}
          canDelete={data.myActions?.delete === true && !active}
          scanId={scanId}
        />
      </View>
      <HowScoringWorksSheet
        visible={howScoringVisible}
        onClose={() => setHowScoringVisible(false)}
      />
    </Screen>
  );
}
