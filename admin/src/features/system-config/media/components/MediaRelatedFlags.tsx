import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useCapabilities } from '@/app/capabilities';
import { Badge, BoxPanel, Skeleton, Text } from '@/shared/ui';

import { MEDIA_FEATURES_TAB_HREF, MEDIA_RELATED_FLAGS } from '../constants/media.constants';

/**
 * Cờ tính năng phụ thuộc hạ tầng media (`voice`, `meeting`) — chỉ ĐỌC, kèm link sang tab
 * "Tính năng" để bật/tắt. Tab media luôn hiện kể cả khi hai cờ tắt: vận hành kiểm hạ tầng
 * TRƯỚC khi bật cờ (admin.md p0-08 §1).
 */
const MediaRelatedFlags = memo(function MediaRelatedFlags() {
  const { data, isLoading } = useCapabilities();

  return (
    <BoxPanel border="hairline" className="h-auto" title="Cờ tính năng liên quan">
      <div className="flex flex-col gap-2 p-2">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          MEDIA_RELATED_FLAGS.map(({ flag, label }) => {
            const feature = data?.features[flag];
            return (
              <div key={flag} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <Text size="small" weight="medium">
                    {label}
                  </Text>
                  <Text size="tiny" skin="muted">
                    {flag}
                  </Text>
                </div>
                {feature ? (
                  <Badge
                    color={feature.enabled ? 'success' : 'warning'}
                    dot
                    size="sm"
                    variant="tinted"
                  >
                    {feature.enabled ? 'Đang bật' : 'Đang tắt'}
                  </Badge>
                ) : (
                  <Badge color="neutral" dot size="sm" variant="tinted">
                    Không rõ
                  </Badge>
                )}
              </div>
            );
          })
        )}
        <Link className="text-caption-12 text-link hover:underline" to={MEDIA_FEATURES_TAB_HREF}>
          Bật/tắt ở tab Tính năng
        </Link>
      </div>
    </BoxPanel>
  );
});

export default MediaRelatedFlags;
