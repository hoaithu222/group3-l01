import { render } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { WalletMember } from '../api';
import { ExpenseSaveBar } from '../components/ExpenseSaveBar';
import { SplitEditor } from '../components/SplitEditor';
import { createSplitDraft, draftToParticipants, type SplitDraft } from '../domain/split-draft';
import { previewSplit } from '../domain/split-preview';

export const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const MEMBERS: WalletMember[] = [
  { avatarUrl: null, displayName: null, isMe: true, name: 'An', role: 'OWNER', userId: 'A' },
  { avatarUrl: null, displayName: null, isMe: false, name: 'Bình', role: 'MEMBER', userId: 'B' },
  {
    avatarUrl: null,
    displayName: 'Cường',
    isMe: false,
    name: 'Cuong Tran',
    role: 'MEMBER',
    userId: 'C',
  },
];

/**
 * Bộ dựng NHƯ FORM THẬT: `SplitEditor` nhận `preview` từ cha, còn nút Lưu (`ExpenseSaveBar`) đọc CÙNG
 * `preview.valid` — đó là toàn bộ lý do form không thể có lúc nút bật mà dòng tóm tắt đang báo thiếu.
 */
function Harness({
  amount,
  initial,
  onSave,
}: {
  amount: number | null;
  initial?: Partial<SplitDraft>;
  onSave: () => void;
}) {
  const [draft, setDraft] = useState<SplitDraft>({
    ...createSplitDraft(['A', 'B', 'C']),
    ...initial,
  });
  const preview = previewSplit({
    amount: amount ?? 0,
    paidBy: 'A',
    participants: draftToParticipants(draft),
    splitType: draft.splitType,
  });

  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <SplitEditor
        amount={amount}
        draft={draft}
        members={MEMBERS}
        paidBy="A"
        preview={preview}
        onChange={setDraft}
      />
      <ExpenseSaveBar canSave={preview.valid} onSave={onSave} />
    </SafeAreaProvider>
  );
}

export async function renderEditor(props: {
  amount: number | null;
  initial?: Partial<SplitDraft>;
}) {
  const onSave = jest.fn();
  await render(<Harness {...props} onSave={onSave} />);
  return onSave;
}
