import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SearchInput } from '@/shared/ui/search';
import { showToast } from '@/shared/utils/toast.utils';

import { chatService } from '../../api/chat.service';
import type {
  ForwardOption,
  ForwardResultItem,
  ForwardTargetOption,
  MessageView,
} from '../../api/chat.types';
import { CHAT_LIMITS } from '../../chat.constants';
import { useForwardTargets } from '../../hooks/useForwardTargets';
import { newClientMessageId } from '../../utils/client-message-id';
import { ForwardResultsList } from './ForwardResultsList';
import { ForwardTargetList } from './ForwardTargetList';
import { targetKey, toForwardTarget } from './forward-targets';

export interface ForwardSheetProps {
  visible: boolean;
  message: MessageView | undefined;
  onClose: () => void;
  /**
   * Nguồn đích KÊNH/hội thoại — màn cha truyền vào (vd `channelsService.search`), không truyền thì chỉ có
   * nhóm NGƯỜI. Đích NGƯỜI (nhắn riêng, BE `directUserId`) do chính sheet này tìm (`useForwardTargets`).
   */
  searchTargets?: (query: string) => Promise<ForwardTargetOption[]>;
}

/**
 * Chọn ≤ 10 đích (kênh hoặc người) + ghi chú, kết quả từng đích ✓/⚠ (app.md §3).
 *
 * ⚠️ Ô "Ghi chú" nằm ở ĐÁY tấm (ngay trên nút gửi) và chỉ hiện khi đã chọn ≥ 1 đích — bản cũ đặt nó SAU danh sách đích trong thân
 * cuộn: danh bạ dài thì phải cuộn hết mới thấy, và nhiều người gửi đi mà không biết có chỗ thêm lời nhắn. Chưa chọn ai thì ghi chú
 * chưa có nghĩa, ẩn đi để danh sách có thêm chỗ. Tấm tự nâng theo bàn phím nên ô ở đáy luôn nhìn thấy khi gõ.
 */
export function ForwardSheet({ visible, message, onClose, searchTargets }: ForwardSheetProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ForwardOption[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<ForwardResultItem[]>();
  const { people, scopes } = useForwardTargets(visible, query, searchTargets);

  const toggle = (option: ForwardOption) => {
    setSelected((prev) => {
      const key = targetKey(option);
      if (prev.some((p) => targetKey(p) === key)) return prev.filter((p) => targetKey(p) !== key);
      if (prev.length >= CHAT_LIMITS.forwardTargetsMax) {
        showToast('error', `Chỉ chọn tối đa ${CHAT_LIMITS.forwardTargetsMax} đích`);
        return prev;
      }
      return [...prev, option];
    });
  };

  const reset = () => {
    setQuery('');
    setSelected([]);
    setNote('');
    setResults(undefined);
  };

  const handleForward = async (): Promise<void> => {
    if (!message || selected.length === 0) return;
    setSending(true);
    try {
      const res = await chatService.forward(message.id, {
        forwardRequestId: newClientMessageId(),
        targets: selected.map(toForwardTarget),
        note: note.trim() || undefined,
      });
      setResults(res.results);
    } catch (error) {
      showToast('error', toErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <BottomSheet
      footer={
        results ? (
          <Button fullWidth label="Xong" onPress={close} />
        ) : (
          <View className="gap-sm">
            {selected.length > 0 ? (
              <Input
                label="Ghi chú (không bắt buộc)"
                placeholder="Thêm lời nhắn cho người nhận"
                value={note}
                onChangeText={setNote}
              />
            ) : null}
            <Button
              disabled={selected.length === 0 || sending}
              fullWidth
              label={`Chuyển tiếp${selected.length > 0 ? ` (${selected.length})` : ''}`}
              loading={sending}
              onPress={() => void handleForward()}
            />
          </View>
        )
      }
      scrollable
      search={
        results ? undefined : (
          <SearchInput placeholder="Tìm người hoặc kênh" onChangeText={setQuery} />
        )
      }
      title="Chuyển tiếp"
      visible={visible}
      onClose={close}
    >
      {results ? (
        <ForwardResultsList results={results} targets={selected} />
      ) : (
        <ForwardTargetList people={people} scopes={scopes} selected={selected} onToggle={toggle} />
      )}
    </BottomSheet>
  );
}
