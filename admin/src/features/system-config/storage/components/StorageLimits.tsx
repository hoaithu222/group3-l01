import { memo, useMemo } from 'react';

import { useCapabilities } from '@/app/capabilities';
import type { Capabilities } from '@/core/capabilities/capabilities.types';
import { Badge, BoxPanel, Callout, Skeleton, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import { labelOf, STORAGE_KIND_LABELS } from '../constants/storage.constants';
import { mimeShortLabel, readUploadKinds } from '../utils/upload-limits';

interface LimitRow {
  key: string;
  label: string;
  formats: string[];
  maxBytes: number;
  maxSeconds?: number;
}

const COLUMNS: TableColumn<LimitRow>[] = [
  {
    key: 'label',
    header: 'Loại tệp',
    width: 150,
    cell: (r) => <span className="text-fg-1">{r.label}</span>,
  },
  {
    key: 'formats',
    header: 'Định dạng',
    cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.formats.map((f) => (
          <Badge key={f} color="neutral" variant="tinted">
            {f}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'maxBytes',
    header: 'Tối đa',
    align: 'right',
    width: 170,
    cell: (r) => (
      <span className="tabular-nums text-fg-1">
        {formatFileSize(r.maxBytes)}
        {r.maxSeconds ? ` · ${formatNumber(r.maxSeconds)} giây` : ''}
      </span>
    ),
  },
];

const rowKey = (row: LimitRow) => row.key;

/** Bảng theo loại từ `limits.upload.kinds`; thiếu (BE cũ) → một hàng gộp từ `upload.allowedMime`. */
function buildRows(caps: Capabilities): LimitRow[] {
  const kinds = readUploadKinds(caps.limits);
  if (kinds.length > 0) {
    return kinds.map(([kind, l]) => ({
      key: kind,
      label: labelOf(STORAGE_KIND_LABELS, kind),
      formats: [...new Set(l.mime.map(mimeShortLabel))],
      maxBytes: l.maxBytes,
      maxSeconds: l.maxSeconds,
    }));
  }
  return [
    {
      key: 'all',
      label: 'Mọi loại',
      formats: [...new Set(caps.upload.allowedMime.map(mimeShortLabel))],
      maxBytes: caps.upload.maxFileBytes,
    },
  ];
}

/**
 * "Giới hạn hiện hành" — CHỈ ĐỌC (admin.md p0-05 §2.1); sửa ở tab `limits`. Nguồn:
 * `GET /capabilities` — `upload.{ maxFileBytes, signedUrlTtlSeconds }` cho dòng tóm tắt,
 * `limits.upload.kinds` cho bảng theo loại (xem `readUploadKinds`).
 */
const StorageLimits = memo(function StorageLimits() {
  const { data, isLoading, isError } = useCapabilities();
  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  return (
    <BoxPanel
      border="hairline"
      description="Chỉ đọc — sửa ở tab Giới hạn"
      title="Giới hạn hiện hành"
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <Callout intent="warning" title="Không tải được giới hạn hiện hành" variant="ghost" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Text size="small" skin="muted">
              Kích thước tệp tối đa:{' '}
              <Text className="tabular-nums" size="small" weight="medium">
                {formatFileSize(data.upload.maxFileBytes)}
              </Text>
            </Text>
            <Text size="small" skin="muted">
              Liên kết tải có chữ ký hết hạn sau:{' '}
              <Text className="tabular-nums" size="small" weight="medium">
                {formatNumber(data.upload.signedUrlTtlSeconds)} giây
              </Text>
            </Text>
          </div>
          <Table columns={COLUMNS} data={rows} pagination={false} rowKey={rowKey} />
        </div>
      )}
    </BoxPanel>
  );
});

export default StorageLimits;
