import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { MentorPostForm } from '../components/MentorPostForm';
import { MENTOR_LIMITS } from '../constants/mentor.constants';
import { useCreateMentorPost } from '../queries/mentor.mutations';
import { useWorkspaceMentorPosts } from '../queries/mentor.queries';
import { mentorErrorMessage } from '../utils/mentor-errors';
import { newIdempotencyKey } from '../utils/mentor-format';
import { mentorPostHref } from '../utils/mentor-routes';

/**
 * Đăng bài tìm cố vấn (app.md §3 "Đăng/sửa bài"): lỗi tại trường (Zod), `MENTOR_001` (đủ 3 bài mở) → banner dưới form, offline
 * → khoá nút. `Idempotency-Key` sinh MỘT LẦN khi mở màn — bấm "Đăng" hai lần chỉ ra một bài. Đăng xong → chi tiết bài.
 */
export function CreateMentorPostScreen() {
  const { wsId = '' } = useLocalSearchParams<{ wsId: string }>();
  const create = useCreateMentorPost(wsId);
  const posts = useWorkspaceMentorPosts(wsId);
  const offline = useConnectionState() === 'offline';
  const [idempotencyKey] = useState(() => newIdempotencyKey('mentor-post'));
  const openCount = (posts.data ?? []).filter((p) => p.status === 'OPEN' && !p.hidden).length;

  return (
    <Screen header={<AppBar title="Đăng bài tìm cố vấn" onBack={router.back} />} keyboardAware>
      <MentorPostForm
        errorMessage={create.error ? mentorErrorMessage(create.error) : null}
        locked={offline || openCount >= MENTOR_LIMITS.postsOpenPerWorkspace}
        submitting={create.isPending}
        onSubmit={(payload) =>
          create.mutate(
            { idempotencyKey, payload },
            {
              onSuccess: (post) => {
                hapticSuccess();
                showToast('success', 'Đã đăng bài tìm cố vấn');
                router.replace(mentorPostHref(post.id));
              },
            },
          )
        }
      />
    </Screen>
  );
}
