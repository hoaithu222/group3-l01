import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { SearchInput, useSearchInput } from '@/shared/ui/search';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { SearchScopeOption } from '../api';
import { useSearchScopes } from '../queries/workspace-search.queries';
import type { SearchFilters } from '../utils/search-params';

type Scope = NonNullable<SearchFilters['scope']>;

export interface SearchScopePickerProps {
  selected: Scope | null;
  workspaceId: string;
  /** `null` = "Toàn nhóm" (bỏ lọc phạm vi). */
  onSelect: (scope: Scope | null) => void;
}

const CHECK = <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />;

/**
 * Chọn PHẠM VI tìm (app.md p5-04 §2): một kênh (đã vào hoặc công khai khám phá được) hoặc một nhóm chat. BE vẫn kiểm lại
 * quyền đọc từng phạm vi (`SRCH_102`) nên danh sách này chỉ là gợi ý. Lọc theo tên phía máy (≤ vài trăm mục), không dấu.
 */
export function SearchScopePicker({ selected, workspaceId, onSelect }: SearchScopePickerProps) {
  const input = useSearchInput();
  const scopes = useSearchScopes(workspaceId, true);

  const groups = useMemo(() => {
    const visible = (scopes.data ?? []).filter((scope) => matchesSearch(input.value, scope.name));
    return {
      channels: visible.filter((scope) => scope.type === 'CHANNEL'),
      conversations: visible.filter((scope) => scope.type === 'CONVERSATION'),
    };
  }, [scopes.data, input.value]);

  const renderScope = (scope: SearchScopeOption) => {
    const isSelected = selected?.id === scope.id;
    return (
      <ListItem
        key={`${scope.type}:${scope.id}`}
        divider
        label={scope.type === 'CHANNEL' ? `#${scope.name}` : scope.name}
        leading={<Icon color="fg-2" name={scope.isPrivate ? 'lock' : 'chat-bubble'} />}
        selected={isSelected}
        trailing={isSelected ? CHECK : undefined}
        onPress={() => onSelect({ id: scope.id, name: scope.name, type: scope.type })}
      />
    );
  };

  return (
    <View className="gap-sm">
      <SearchInput {...input.inputProps} placeholder="Tìm kênh hoặc nhóm chat" />

      <ListItem
        divider
        label="Toàn nhóm"
        leading={<Icon color="fg-2" name="search" />}
        selected={selected === null}
        trailing={selected === null ? CHECK : undefined}
        onPress={() => onSelect(null)}
      />

      {scopes.isPending ? (
        <View className="gap-xs">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </View>
      ) : scopes.isError ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void scopes.refetch() }]}
          description={toErrorMessage(scopes.error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được danh sách"
          tone="danger"
        />
      ) : groups.channels.length + groups.conversations.length === 0 ? (
        <Text className="py-md text-center text-body-md text-fg-2">
          Không có kênh hay nhóm chat nào khớp.
        </Text>
      ) : (
        <>
          {groups.channels.length > 0 ? (
            <Section title="Kênh">{groups.channels.map(renderScope)}</Section>
          ) : null}
          {groups.conversations.length > 0 ? (
            <Section title="Nhóm chat">{groups.conversations.map(renderScope)}</Section>
          ) : null}
        </>
      )}
    </View>
  );
}
