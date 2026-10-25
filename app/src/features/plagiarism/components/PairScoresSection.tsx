import { Text } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { PairScore, ScanResult } from '../api/plagiarism.types';

/**
 * Bảng đối chiếu từng cặp (chế độ "trong các tệp đã chọn"): mỗi cặp một hàng, giá trị `a trong b / b trong a`.
 *
 * ✅ Hiện TÊN tệp (tra từ `results` — `targetResourceId` → `targetName`, dữ liệu đã có) thay cho 4 ký tự cuối của mã như
 * bản cũ; không tra được thì mới rơi về đuôi mã.
 */
export function PairScoresSection({
  pairs,
  results,
}: {
  pairs: readonly PairScore[];
  results: readonly ScanResult[];
}) {
  const names = new Map(results.map((r) => [r.targetResourceId, r.targetName]));
  const nameOf = (id: string) => names.get(id) ?? `…${id.slice(-4)}`;

  return (
    <Section icon="arrow-data-transfer-vertical" title="Bảng đối chiếu từng cặp">
      <Text className="text-body-md text-fg-2">
        Tỉ lệ nội dung của tệp đầu có trong tệp sau, và ngược lại.
      </Text>
      <Card>
        {pairs.map((pair) => (
          <ListItem
            key={`${pair.a}-${pair.b}`}
            label={`${nameOf(pair.a)} ↔ ${nameOf(pair.b)}`}
            labelNumberOfLines={2}
            leading={<IconTile name="copy" size="sm" tone="accent" />}
            value={`${pair.aInB}% / ${pair.bInA}%`}
          />
        ))}
      </Card>
    </Section>
  );
}
