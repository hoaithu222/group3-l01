import { Linking, Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { LoadingMore } from '@/shared/ui/progress';

import type { Portfolio, PortfolioBuild } from '../../api/portfolio.types';
import { BUILD_STATUS_LABELS } from '../../constants/portfolio.constants';
import { isBuildInFlight } from '../../utils/portfolio-cache';
import { TAKEN_DOWN_MESSAGE } from '../../utils/portfolio-errors';
import { portfolioStatusView } from '../../utils/portfolio-text';
import { draftUrlOf, sharePortfolioLink } from '../../utils/portfolio-url';

export interface PortfolioStatusCardProps {
  portfolio: Portfolio | null;
  latestBuild: PortfolioBuild | null;
  /** `<PUBLIC_PORTFOLIO_BASE_URL>/<slug>` — BE chỉ trả khi PUBLISHED và không bị gỡ. */
  publicUrl: string | null;
  /** "Thử lại" sau khi tạo trang thất bại. */
  onRetry: () => void;
  offline?: boolean;
}

/**
 * Thẻ trạng thái của hồ sơ (app.md p6-07 §3): Bản nháp · Đang tạo trang · Đã công khai + link + Chia sẻ · Bị gỡ. Trạng thái "Đang tạo trang…" KHÔNG chặn điều hướng — quay lại màn
 * vẫn thấy tiến độ vì nó đọc thẳng `latestBuild` trong cache (socket/poll vá vào đó).
 *
 * ⚠️ Link chỉ mở/chia sẻ được khi `publicUrl` KHÁC `null`. Hồ sơ chưa công khai chỉ hiện đường dẫn DỰ KIẾN (dạng chữ, không bấm được): trang `/p/<slug>` khi đó là 404.
 */
export function PortfolioStatusCard({
  latestBuild,
  offline = false,
  onRetry,
  portfolio,
  publicUrl,
}: PortfolioStatusCardProps) {
  const status = portfolioStatusView(portfolio);
  const running = latestBuild && isBuildInFlight(latestBuild) ? latestBuild : null;
  const failed = !running && latestBuild?.status === 'FAILED' ? latestBuild : null;

  return (
    <Card title="Trang portfolio công khai">
      <View className="gap-sm">
        <View className="flex-row flex-wrap items-center gap-xs">
          <Badge label={status.label} variant={status.tone} />
          {running ? <Badge label={BUILD_STATUS_LABELS[running.status]} variant="info" /> : null}
        </View>

        {portfolio?.takenDown ? <Alert description={TAKEN_DOWN_MESSAGE} tone="error" /> : null}

        {running ? (
          <View className="flex-row items-center gap-xs">
            <LoadingMore className="py-0" label="Đang tạo trang" />
            <Text className="flex-1 text-body-md text-fg-2">
              Bạn có thể rời màn này, trang vẫn được tạo và sẽ báo khi xong.
            </Text>
          </View>
        ) : null}

        {failed ? (
          <Alert
            actions={
              <Button
                disabled={offline || portfolio?.takenDown === true}
                label="Thử lại"
                size="xs"
                variant="secondary"
                onPress={onRetry}
              />
            }
            description={`${failed.error ?? 'Không tạo được trang, vui lòng thử lại.'}${portfolio?.status === 'PUBLISHED' ? ' Bản trang cũ vẫn đang hiển thị.' : ''}`}
            title={BUILD_STATUS_LABELS.FAILED}
            tone="error"
          />
        ) : null}

        {publicUrl ? (
          <View className="gap-xs">
            <Text className="text-body-md text-fg-brand" selectable>
              {publicUrl}
            </Text>
            <View className="flex-row gap-xs">
              <Button
                iconLeft="share"
                label="Chia sẻ"
                pressableClassName="flex-1"
                size="sm"
                variant="secondary"
                onPress={() => void sharePortfolioLink(publicUrl)}
              />
              <Button
                iconLeft="link"
                label="Mở trang"
                pressableClassName="flex-1"
                size="sm"
                variant="tertiary"
                onPress={() => void Linking.openURL(publicUrl)}
              />
            </View>
            {portfolio?.hasUnpublishedChanges && !running ? (
              <Alert
                description="Bạn đã thay đổi hồ sơ sau lần tạo trang gần nhất. Bấm “Cập nhật trang” để trang công khai khớp."
                tone="warning"
              />
            ) : null}
          </View>
        ) : portfolio ? (
          <Text className="text-body-md text-fg-2">{`Đường dẫn dự kiến: ${draftUrlOf(portfolio.slug)}`}</Text>
        ) : (
          <Text className="text-body-md text-fg-2">
            Chọn dự án bạn đã góp sức, hệ thống sẽ tự dựng trang từ số liệu đã ghi nhận.
          </Text>
        )}
      </View>
    </Card>
  );
}
