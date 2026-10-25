import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';

import type { PersonOption } from '../api/conversations.types';
import { PeoplePickerList } from '../components/PeoplePickerList';
import { PersonRowsSkeleton } from '../components/PersonRowsSkeleton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePeopleSearch } from '../hooks/usePeopleSearch';

function openPerson(person: PersonOption): void {
  if (person.directConversationId) {
    router.push({
      pathname: '/messages/[conversationId]',
      params: { conversationId: person.directConversationId },
    });
    return;
  }
  router.push({
    pathname: '/messages/new',
    params: { userId: person.userId, name: person.name, avatarUrl: person.avatarUrl ?? '' },
  });
}

/**
 * app.md §3 — tìm người (`GET /conversations/people`), mục "Tạo nhóm mới" trên
 * đầu, chạm: có DM sẵn → mở luôn; chưa có → `?userId=` (route TỰ chuyển sang
 * `DraftDirectScreen`, xem `app/(app)/messages/new.tsx`).
 */
export function NewConversationScreen() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query).trim();
  const people = usePeopleSearch(debouncedQuery);

  return (
    <Screen
      header={<AppBar title="Nhắn tin mới" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm py-xs">
        <View className="px-md">
          <SearchInput placeholder="Tìm người" onChangeText={setQuery} />
        </View>

        {/* Ô icon 40dp tông `info` (màu nhận diện "Nhóm") + mô tả: đọc ra là LỐI VÀO tạo nhóm, không phải một người trong danh sách. */}
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-sm px-md py-sm active:opacity-70"
          onPress={() => router.push('/messages/new-group')}
        >
          <IconTile name="add-team" tone="info" />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-md font-semibold text-fg-1">Tạo nhóm mới</Text>
            <Text className="text-caption-sm text-fg-2">
              Chọn thành viên từ nhóm làm việc của bạn
            </Text>
          </View>
          <Icon color="fg-2" name="arrow-right-small" size="sm" />
        </Pressable>

        <View className="flex-1">
          {people.isLoading ? (
            <PersonRowsSkeleton label="Đang tìm người" />
          ) : people.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void people.refetch() }]}
              description={toErrorMessage(people.error)}
              icon="alert-warning"
              title="Không tải được"
              tone="danger"
            />
          ) : (people.data ?? []).length === 0 ? (
            debouncedQuery ? (
              <EmptyState
                description="Không có ai cùng nhóm làm việc khớp với từ khoá này."
                icon="search"
                size="compact"
                title="Không có kết quả"
                tone="neutral"
              />
            ) : (
              <EmptyState
                description="Chỉ hiện người cùng ít nhất một nhóm làm việc với bạn."
                icon="user"
                title="Không tìm thấy ai cùng nhóm"
              />
            )
          ) : (
            <PeoplePickerList people={people.data ?? []} onSelect={openPerson} />
          )}
        </View>
      </View>
    </Screen>
  );
}
