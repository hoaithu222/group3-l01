import { useState } from 'react';
import { View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Tabs } from '@/shared/ui/tab';

import type { SplitType, WalletMember } from '../api';
import { SPLIT_TYPE_LABEL } from '../constants/wallet.constants';
import {
  distributeEvenly,
  evenPercent,
  toggleParticipant,
  type SplitDraft,
} from '../domain/split-draft';
import type { SplitPreview } from '../domain/split-preview';
import { LEFT_MEMBER_NAME } from '../hooks/useMemberDirectory';
import { SplitParticipantRow } from './SplitParticipantRow';
import { SplitSummary } from './SplitSummary';

export interface SplitEditorProps {
  /** Tổng khoản chi (đồng) — dùng cho nút "Chia đều" của CUSTOM. `null` = chưa nhập. */
  amount: number | null;
  disabled?: boolean;
  draft: SplitDraft;
  invalidUserIds?: readonly string[];
  members: readonly WalletMember[];
  paidBy: string;
  /** `previewSplit` do form tính (cùng số nó dùng để khoá nút Lưu) — không tính lại ở đây để hai nơi không thể lệch nhau. */
  preview: SplitPreview;
  onChange: (next: SplitDraft) => void;
}

const TABS = (Object.keys(SPLIT_TYPE_LABEL) as SplitType[]).map((key) => ({
  key,
  label: SPLIT_TYPE_LABEL[key],
}));

/**
 * Chọn người + kiểu chia (EQUAL / CUSTOM / PERCENT) và cho thấy KẾT QUẢ ngay từng lần
 * gõ. Không giữ state chia — mọi thứ đi qua `draft`/`onChange` của form để nút Lưu và
 * bản xem trước luôn đọc cùng một nguồn.
 *
 * Đổi kiểu chia KHÔNG xoá số đã gõ ở kiểu khác (`SplitDraft` giữ cả ba); sang CUSTOM/
 * PERCENT lần đầu thì chưa có gì → bấm "Chia đều" là có điểm xuất phát HỢP LỆ.
 */
export function SplitEditor({
  amount,
  disabled,
  draft,
  invalidUserIds = [],
  members,
  onChange,
  paidBy,
  preview,
}: SplitEditorProps) {
  // Tăng sau mỗi thao tác điền hàng loạt → dựng lại các ô nhập (`PercentField` giữ chữ riêng).
  const [version, setVersion] = useState(0);
  const owedById = new Map(preview.perPerson.map((p) => [p.userId, p.owed]));
  // Khoản chi CŨ có thể còn người đã rời nhóm (không nằm trong danh sách ACTIVE). Không hiện thì họ vẫn
  // đi vào payload mà người dùng không thấy để bỏ chọn — lưu là ăn `WALLET_001` khó hiểu. Dựng dòng "ma".
  const knownIds = new Set(members.map((m) => m.userId));
  const leftIds = draft.selected.filter((id) => !knownIds.has(id));
  const rows: WalletMember[] = [
    ...members,
    ...leftIds.map((userId): WalletMember => ({
      avatarUrl: null,
      displayName: LEFT_MEMBER_NAME,
      isMe: false,
      name: LEFT_MEMBER_NAME,
      role: 'MEMBER',
      userId,
    })),
  ];
  const payerName = members.find((m) => m.userId === paidBy);
  const allSelected = members.length > 0 && members.every((m) => draft.selected.includes(m.userId));

  const bulk = (patch: Partial<SplitDraft>) => {
    onChange({ ...draft, ...patch });
    setVersion((value) => value + 1);
  };

  const fillEvenly = () => {
    if (draft.splitType === 'PERCENT')
      bulk({ percent: { ...draft.percent, ...evenPercent(draft.selected) } });
    else if (draft.splitType === 'CUSTOM' && amount)
      bulk({ custom: { ...draft.custom, ...distributeEvenly(amount, draft.selected) } });
  };

  return (
    <View className="gap-sm">
      <Tabs
        items={TABS}
        value={draft.splitType}
        variant="pill"
        onChange={(key) => onChange({ ...draft, splitType: key as SplitType })}
      />

      <View className="flex-row items-center justify-between">
        <LinkButton
          disabled={disabled}
          label={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          size="sm"
          onPress={() => bulk({ selected: allSelected ? [] : members.map((m) => m.userId) })}
        />
        {draft.splitType !== 'EQUAL' ? (
          <LinkButton
            disabled={disabled || (draft.splitType === 'CUSTOM' && !amount)}
            label="Chia đều số này"
            size="sm"
            onPress={fillEvenly}
          />
        ) : null}
      </View>

      <View>
        {rows.map((member) => (
          <SplitParticipantRow
            key={`${member.userId}-${version}`}
            checked={draft.selected.includes(member.userId)}
            customValue={draft.custom[member.userId] ?? null}
            disabled={disabled}
            invalid={invalidUserIds.includes(member.userId) || !knownIds.has(member.userId)}
            isMe={member.isMe}
            isPayer={member.userId === paidBy}
            name={member.displayName ?? member.name}
            owed={owedById.get(member.userId) ?? 0}
            percentBps={draft.percent[member.userId] ?? null}
            splitType={draft.splitType}
            onCustomChange={(value) =>
              onChange({ ...draft, custom: { ...draft.custom, [member.userId]: value } })
            }
            onPercentChange={(bps) =>
              onChange({ ...draft, percent: { ...draft.percent, [member.userId]: bps } })
            }
            onToggle={() => onChange(toggleParticipant(draft, member.userId))}
          />
        ))}
      </View>

      <SplitSummary
        payerName={
          payerName?.isMe ? 'Bạn' : (payerName?.displayName ?? payerName?.name ?? 'Người trả')
        }
        preview={preview}
        splitType={draft.splitType}
      />
    </View>
  );
}
