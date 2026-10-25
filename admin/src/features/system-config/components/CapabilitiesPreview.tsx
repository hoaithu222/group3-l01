import { memo } from 'react';

import { useCapabilities } from '@/app/capabilities';
import { Button, Callout, JsonViewer, Skeleton } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';

/**
 * Xem trước `/capabilities` hiện hành — đúng thứ mọi client (app/admin) nhận
 * sau khi admin sửa cấu hình. Thu gọn mặc định: JSON dài, chỉ mở khi cần đối chiếu.
 */
const CapabilitiesPreview = memo(function CapabilitiesPreview() {
  const disclosure = useDisclosure();
  const { data, isLoading, isError, refetch } = useCapabilities();

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-expanded={disclosure.isOpen}
        className="self-start"
        size="sm"
        startIcon={
          <SystemIcon
            name={disclosure.isOpen ? 'angle-down-outline' : 'angle-right-outline'}
            size={14}
          />
        }
        variant="ghost"
        onClick={disclosure.toggle}
      >
        Capabilities hiện hành
      </Button>
      {disclosure.isOpen &&
        (isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !data ? (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            intent="error"
            title="Không tải được capabilities"
          />
        ) : (
          <JsonViewer maxHeight={360} value={data} />
        ))}
    </div>
  );
});

export default CapabilitiesPreview;
