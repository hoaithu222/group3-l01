import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { RoadmapTab, TodayLessonCard } from '@/features/roadmap';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput } from '@/shared/ui/search';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';
import { useFeature } from '@/shell/capabilities';

import type { StudySetSummaryDto } from '../api/study.types';
import { ExploreHeader } from '../components/home/ExploreHeader';
import { StudyHomeHeader } from '../components/home/StudyHomeHeader';
import { StudyHomeMenu } from '../components/StudyHomeMenu';
import { StudySetList } from '../components/StudySetList';
import { SEARCH_DEBOUNCE_MS } from '../constants/study.constants';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePopularTags, useStudySets } from '../queries/study-sets.queries';
import { newSetHref, setHref } from '../utils/study-routes';

// p4-07: tab thứ 3 "Lộ trình" — `roadmap` là feature NỀN không có route riêng trên thanh tab, chỉ được `study`
// ghép vào màn của chính nó (ngoại lệ khai ở `scripts/feature-boundaries.json`, cùng tiền lệ `live-quiz`).
type HomeTab = 'mine' | 'public' | 'roadmap';

/**
 * "Học" (app.md p4-01 §3 `StudyHome`): tab **Của tôi** · **Khám phá**, ô tìm IME-safe (debounce 300 ms, ≥ 2 ký tự — BE
 * từ chối `q` ngắn hơn), chip thẻ phổ biến (chỉ ở Khám phá), nút "Tạo bộ học" (ẩn khi ngoại tuyến).
 * Bộ của NHÓM nằm ở màn "Học" trong hub nhóm (`WorkspaceStudyScreen`) vì cần biết nhóm nào — không có tab "Nhóm" ở
 * đây.
 *
 * ⚠️ Bố cục theo luật "một hành động chính": Tab + ô tìm là vùng ĐỨNG YÊN; mọi thứ còn lại cuộn CÙNG danh sách bộ (`header` của
 * `StudySetList`). "Của tôi" mở đầu bằng thẻ "Hôm nay" (một nút "Ôn ngay") rồi lưới lối tắt chế độ học; "Khám phá" có giới thiệu gọn và thẻ lọc.
 * Giới thiệu tắt khi đang tìm/lọc; thẻ lọc luôn cuộn cùng danh sách để còn đổi/bỏ lọc khi kết quả rỗng. Trước đây các khối cố định ăn quá nửa chỗ
 * (máy 640dp chỉ còn ~2 hàng). Lối phụ (Thi đấu trực tiếp, Lịch sử thi thử) vẫn còn trong menu "⋯" của thanh tiêu đề (`StudyHomeMenu`) —
 * "Lịch sử thi thử" chỉ ở đó; "Thi đấu trực tiếp" còn thêm một ô trong lưới (khi cờ bật). Lối "Tạo bộ học" chỉ có MỘT nơi tại mỗi thời điểm:
 * nút "+" trên thanh tiêu đề, trừ lúc "Của tôi" rỗng thì nút trong trạng thái rỗng làm việc đó (không vẽ cả hai).
 */
export function StudyHomeScreen() {
  const [tab, setTab] = useState<HomeTab>('mine');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const q = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const offline = useConnectionState() === 'offline';
  const tags = usePopularTags();
  // p5-01: lối vào "Thi đấu trực tiếp" — mở route của feature `live-quiz`, không import chéo feature.
  const liveQuiz = useFeature('live-quiz') === true;
  // p4-07: tab "Lộ trình" + thẻ "Hôm nay học gì" — cùng cách gate `liveQuiz` ở trên.
  const roadmap = useFeature('roadmap') === true;

  const openSet = (set: StudySetSummaryDto) => router.push(setHref(set.id));
  const create = () => router.push(newSetHref());
  const filtering = Boolean(q.trim() || (tab === 'public' && tag));
  // `tab === 'roadmap'` không có `scope` tương ứng ở `study-sets` ⇒ rơi về 'mine' vô hại, vì `enabled` bên dưới đã tắt truy vấn này.
  const params = {
    q,
    scope: tab === 'roadmap' ? 'mine' : tab,
    tag: tab === 'public' ? tag : undefined,
  } as const;
  // Cùng khoá truy vấn với `StudySetList` bên dưới ⇒ React Query gộp làm MỘT lần gọi; ở đây để biết "rỗng" và làm nguồn cho tấm chọn bộ.
  const list = useStudySets(params, tab !== 'roadmap');
  // Gốc tab Học (vẫn mounted): bộ do người khác sửa/chia sẻ, hay sửa ở máy khác — quay lại là tải lại nếu đã cũ.
  useRefetchOnFocus(list, tab !== 'roadmap');
  const sets = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const emptyMine = tab === 'mine' && !filtering && list.isSuccess && sets.length === 0;
  const headerCreate = !offline && !emptyMine && tab !== 'roadmap';

  const header =
    tab === 'mine' ? (
      filtering ? null : (
        <>
          {roadmap ? <TodayLessonCard /> : null}
          <StudyHomeHeader
            hasMore={list.hasNextPage}
            liveQuiz={liveQuiz}
            sets={sets}
            status={list.isLoading ? 'loading' : list.isError ? 'error' : 'ready'}
          />
        </>
      )
    ) : (
      <ExploreHeader
        filtering={filtering}
        selectedTag={tag}
        tags={tags.data}
        onSelectTag={setTag}
      />
    );

  return (
    <Screen
      header={
        <AppBar
          actions={
            <>
              {headerCreate ? (
                <Button
                  accessibilityLabel="Tạo bộ học"
                  iconLeft="add"
                  iconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={create}
                />
              ) : null}
              <StudyHomeMenu liveQuiz={liveQuiz} />
            </>
          }
          title="Học"
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs pt-2xs">
        <View className="gap-xs px-md">
          <Tabs
            items={[
              { key: 'mine', label: 'Của tôi' },
              { key: 'public', label: 'Khám phá' },
              // p4-07: chỉ hiện khi cờ `roadmap` bật — README p4-07 §8 "cờ tắt ⇒ tab ẩn".
              ...(roadmap ? [{ key: 'roadmap', label: 'Lộ trình' }] : []),
            ]}
            value={tab}
            onChange={(key) => {
              if (key !== tab) hapticSelection();
              setTab(key as HomeTab);
            }}
          />
          {tab === 'roadmap' ? null : (
            <SearchInput placeholder="Tìm bộ học" onChangeText={setQuery} />
          )}
        </View>

        <View className="flex-1">
          {tab === 'roadmap' ? (
            <RoadmapTab />
          ) : (
            <StudySetList
              key={tab}
              emptyActions={
                tab === 'mine' && !offline && !filtering
                  ? [{ label: 'Tạo bộ học', onPress: create }]
                  : undefined
              }
              emptyDescription={
                filtering
                  ? 'Không tìm thấy bộ học nào khớp. Thử từ khoá hoặc thẻ khác.'
                  : tab === 'mine'
                    ? 'Tạo bộ học đầu tiên: thẻ ghi nhớ, trắc nghiệm, điền chỗ trống.'
                    : 'Chưa có bộ học công khai nào.'
              }
              emptyIcon={filtering ? 'search' : 'book'}
              emptyTitle={
                filtering
                  ? 'Không có kết quả'
                  : tab === 'mine'
                    ? 'Chưa có bộ học'
                    : 'Chưa có gì để khám phá'
              }
              emptyTone={filtering ? 'neutral' : 'success'}
              header={header}
              params={params}
              showOwner={tab === 'public'}
              onOpen={openSet}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
