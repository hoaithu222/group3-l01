import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { BoardColumn } from '../../api/boards.types';
import { COLUMN_KIND_ART, COLUMN_KIND_LABEL } from '../../constants/kanban.constants';

/** Vượt giới hạn WIP? `wipLimit` rỗng = không giới hạn. */
export function isOverWip(column: Pick<BoardColumn, 'wipLimit'>, count: number): boolean {
  return column.wipLimit != null && count > column.wipLimit;
}

/**
 * Đầu cột: tên · số thẻ · giới hạn WIP "3/5" (`app.md` §2 `ColumnHeader`).
 * Vượt WIP thì có ICON + CHỮ "Vượt giới hạn" cạnh màu `error` — WIP là cảnh báo
 * mềm, không chặn thêm thẻ (README §1 P0), và màu không được là dấu hiệu duy nhất.
 *
 * Ô icon nhỏ theo LOẠI cột (`COLUMN_KIND_ART`) đứng trước tên — trang trí (loại đã nằm trong nhãn trợ năng của cả hàng).
 */
export function ColumnHeader({ column, count }: { column: BoardColumn; count: number }) {
  const over = isOverWip(column, count);
  const countText = column.wipLimit != null ? `${count}/${column.wipLimit}` : String(count);

  return (
    <View
      accessibilityLabel={`Cột ${column.title}, ${COLUMN_KIND_LABEL[column.kind]}, ${count} thẻ${
        over ? `, vượt giới hạn ${column.wipLimit}` : ''
      }`}
      accessibilityRole="header"
      accessible
      className="flex-row items-center gap-xs px-xs pb-xs"
    >
      <IconTile name={COLUMN_KIND_ART[column.kind].icon} size="sm" tone={COLUMN_KIND_ART[column.kind].tone} />
      <Text className="flex-1 text-label-lg font-semibold text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {column.title}
      </Text>
      {over ? (
        <View className="flex-row items-center gap-3xs">
          <Icon color="error" name="alert-warning" size={16} />
          <Text className="text-caption-sm font-semibold text-error">Vượt giới hạn</Text>
        </View>
      ) : null}
      <Text
        className={over ? 'text-label-md font-semibold text-error' : 'text-label-md text-fg-2'}
        maxFontSizeMultiplier={1.3}
      >
        {countText}
      </Text>
    </View>
  );
}
