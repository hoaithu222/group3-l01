import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { ForwardOption, ForwardPersonOption, ForwardTargetOption } from '../../api/chat.types';
import { isPersonOption, targetKey } from './forward-targets';

export interface ForwardTargetListProps {
  people: ForwardPersonOption[];
  scopes: ForwardTargetOption[];
  selected: ForwardOption[];
  onToggle: (option: ForwardOption) => void;
}

function Group({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ForwardOption[];
  selected: ForwardOption[];
  onToggle: (option: ForwardOption) => void;
}) {
  if (options.length === 0) return null;
  const selectedKeys = new Set(selected.map(targetKey));
  return (
    <View>
      {/* Không tự khai `px-*`: `ForwardSheet` là tấm `padded` (thân đã có lề 16) — khai thêm là tiêu đề nhóm thụt 32dp so với các hàng. */}
      <Text className="pb-2xs pt-xs text-label-sm font-semibold text-fg-2">{title}</Text>
      {options.map((option) => {
        const isSelected = selectedKeys.has(targetKey(option));
        return (
          <ListItem
            key={targetKey(option)}
            divider
            label={option.label}
            leading={
              // Người: ảnh THẬT 32dp (chữ viết tắt đỡ khi không có ảnh). Kênh/hội thoại: ô icon bong bóng chat — tông `info` cho KÊNH
              // (thuộc nhóm làm việc), `brand` cho hội thoại (màu nhận diện "Tin nhắn") — mắt tách được hai nhóm đích trong một danh sách.
              isPersonOption(option) ? (
                <Avatar
                  name={option.label}
                  size="sm"
                  source={option.avatarUrl ? { uri: option.avatarUrl } : undefined}
                />
              ) : (
                <IconTile
                  name="chat-bubble"
                  size="sm"
                  tone={option.scopeType === 'CHANNEL' ? 'info' : 'brand'}
                />
              )
            }
            selected={isSelected}
            trailing={isSelected ? <Icon color="fg-brand" name="checkmark-circle" /> : undefined}
            onPress={() => onToggle(option)}
          />
        );
      })}
    </View>
  );
}

/** Hai nhóm đích: NGƯỜI (nhắn riêng) rồi KÊNH/hội thoại — app.md p1-04 §3 `ForwardSheet`. */
export function ForwardTargetList({ people, scopes, selected, onToggle }: ForwardTargetListProps) {
  if (people.length === 0 && scopes.length === 0) {
    return (
      <EmptyState
        description="Không có người hay kênh nào khớp để chuyển tiếp tới."
        icon="search"
        tone="neutral"
      />
    );
  }
  return (
    <>
      <Group options={people} selected={selected} title="Người" onToggle={onToggle} />
      <Group options={scopes} selected={selected} title="Kênh" onToggle={onToggle} />
    </>
  );
}
