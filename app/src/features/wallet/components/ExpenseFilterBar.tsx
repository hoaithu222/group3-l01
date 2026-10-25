import dayjs from 'dayjs';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button, LinkButton } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Calendar, type DateRange } from '@/shared/ui/date-picker';
import { SelectSheet } from '@/shared/ui/select';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { ExpenseFilter, WalletMember } from '../api';
import { categoryLabel, EXPENSE_CATEGORIES } from '../constants/wallet.constants';

export interface ExpenseFilterBarProps {
  filter: ExpenseFilter;
  members: readonly WalletMember[];
  onChange: (next: ExpenseFilter) => void;
}

type Open = 'category' | 'date' | 'user' | null;

const ALL = '';

/**
 * Bộ lọc lịch sử khoản chi: người · danh mục · khoảng ngày (app.md §3). Mỗi bộ lọc là MỘT chip mở
 * tấm chọn — ba ô nhập chiếm hết màn điện thoại còn chip thì gọn một hàng cuộn ngang. Chip đang lọc
 * hiện GIÁ TRỊ đã chọn (không chỉ đổi màu) và có "Xoá lọc".
 */
export function ExpenseFilterBar({ filter, members, onChange }: ExpenseFilterBarProps) {
  const [open, setOpen] = useState<Open>(null);
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const user = members.find((member) => member.userId === filter.userId);
  const hasFilter = Boolean(filter.userId || filter.category || filter.from || filter.to);

  const applyRange = () => {
    // `to` = hết ngày cuối (23:59:59.999 giờ máy) — chọn 19/09 thì khoản ghi lúc 20:00 ngày 19 vẫn nằm trong.
    const from = range.start ? dayjs(range.start).startOf('day').toISOString() : undefined;
    const last = range.end ?? range.start;
    const to = last ? dayjs(last).endOf('day').toISOString() : undefined;
    onChange({ ...filter, from, to });
    setOpen(null);
  };

  const dateLabel = filter.from
    ? `${formatDate(filter.from)} – ${formatDate(filter.to ?? filter.from)}`
    : 'Ngày';

  return (
    <>
      {/* `grow-0`: ScrollView NGANG mặc định `flexGrow: 1` — đứng cạnh danh sách `flex-1` trong cùng cột thì bị kéo cao
          ~nửa màn (chip trôi giữa màn). */}
      <ScrollView
        className="grow-0"
        contentContainerClassName="flex-row items-center gap-xs px-md py-2xs"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Chip
          label={user ? (user.displayName ?? user.name) : 'Người'}
          selected={Boolean(filter.userId)}
          onPress={() => setOpen('user')}
        />
        <Chip
          label={filter.category ? categoryLabel(filter.category) : 'Danh mục'}
          selected={Boolean(filter.category)}
          onPress={() => setOpen('category')}
        />
        <Chip label={dateLabel} selected={Boolean(filter.from)} onPress={() => setOpen('date')} />
        {hasFilter ? <LinkButton label="Xoá lọc" size="sm" onPress={() => onChange({})} /> : null}
      </ScrollView>

      <SelectSheet
        options={[
          { label: 'Tất cả', value: ALL },
          ...members.map((m) => ({ label: m.displayName ?? m.name, value: m.userId })),
        ]}
        searchable
        searchPlaceholder="Tìm thành viên"
        title="Lọc theo người trả/tham gia"
        value={filter.userId ?? ALL}
        visible={open === 'user'}
        onChange={(value) => onChange({ ...filter, userId: value || undefined })}
        onClose={() => setOpen(null)}
      />
      <SelectSheet
        options={[{ label: 'Tất cả', value: ALL }, ...EXPENSE_CATEGORIES]}
        title="Lọc theo danh mục"
        value={filter.category ?? ALL}
        visible={open === 'category'}
        onChange={(value) => onChange({ ...filter, category: value || undefined })}
        onClose={() => setOpen(null)}
      />
      <BottomSheet
        footer={<Button disabled={!range.start} fullWidth label="Áp dụng" onPress={applyRange} />}
        title="Lọc theo khoảng ngày"
        visible={open === 'date'}
        onClose={() => setOpen(null)}
      >
        <Calendar mode="range" value={range} onChange={setRange} />
      </BottomSheet>
    </>
  );
}
