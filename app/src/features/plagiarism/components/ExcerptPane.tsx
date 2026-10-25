import { Platform, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { SkeletonText } from '@/shared/ui/skeleton';

import type { Excerpt } from '../api/plagiarism.types';

interface ExcerptPaneProps {
  excerpt: Excerpt | undefined;
  loading?: boolean;
  title: string;
}

/** Khung chung của một khối đối chiếu — `rounded-md` (24) đúng cấp "thẻ", `p-md` đệm trong thẻ. */
const PANE = 'gap-sm rounded-md border-hairline border-border-1 bg-bg-1 p-md';

/**
 * Một khối chữ đối chiếu (app.md `ExcerptPane`) — highlight đoạn giống nhau lồng trong `<Text>`. Mã nguồn dùng font hệ
 * thống monospace (không có token font "code" trong design-tokens hiện tại — xem `docs`/báo cáo, đây là lệch kế hoạch
 * đã ghi rõ thay vì tự thêm cả một quy trình font mới).
 *
 * Đầu khối: ô icon (tài liệu/mã) + TÊN VAI (`title` — "Tệp của nhóm"/"Nguồn trùng") + tên tệp · dòng, để hai khối xếp
 * chồng trên điện thoại vẫn phân biệt được bên nào là bên nào. Đang tải = khung xương đúng dáng đoạn chữ.
 */
export function ExcerptPane({ excerpt, loading, title }: ExcerptPaneProps) {
  if (loading || !excerpt) {
    return (
      <View
        accessibilityLabel={`${title}, đang tải`}
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        accessible
        className={PANE}
      >
        <Text className="text-label-md font-semibold text-fg-1">{title}</Text>
        <SkeletonText lines={4} />
      </View>
    );
  }
  if ('unavailable' in excerpt) {
    return (
      <View className={PANE}>
        <EmptyState
          description="Nguồn không còn khả dụng hoặc bạn không còn quyền xem"
          icon="lock"
          size="compact"
          title={title}
          tone="warning"
        />
      </View>
    );
  }

  const sorted = [...excerpt.highlights].sort((a, b) => a.from - b.from);
  const segments: { highlighted: boolean; text: string }[] = [];
  let cursor = 0;
  for (const h of sorted) {
    const from = Math.max(cursor, h.from);
    const to = Math.max(from, h.to);
    if (from > cursor)
      segments.push({ highlighted: false, text: excerpt.text.slice(cursor, from) });
    segments.push({ highlighted: true, text: excerpt.text.slice(from, to) });
    cursor = to;
  }
  if (cursor < excerpt.text.length)
    segments.push({ highlighted: false, text: excerpt.text.slice(cursor) });

  const isCode = excerpt.kind === 'CODE';
  return (
    <View className={PANE}>
      <View className="flex-row items-center gap-sm">
        <IconTile
          name={isCode ? 'document-2' : 'document'}
          size="sm"
          tone={isCode ? 'accent' : 'info'}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md font-semibold text-fg-1">{title}</Text>
          <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
            {excerpt.name} · dòng {excerpt.lineStart}-{excerpt.lineEnd}
          </Text>
        </View>
      </View>
      {excerpt.stale ? (
        <Badge label="Tệp đã được sửa sau khi quét" size="sm" variant="warning" />
      ) : null}
      <Text
        accessibilityLabel={`Đoạn giống nhau, dòng ${excerpt.lineStart} đến ${excerpt.lineEnd}`}
        className="text-body-md text-fg-1"
        style={isCode ? { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' } : undefined}
      >
        {segments.map((s, i) => (
          <Text key={i} className={s.highlighted ? 'bg-surface-warning text-fg-1' : undefined}>
            {s.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}
