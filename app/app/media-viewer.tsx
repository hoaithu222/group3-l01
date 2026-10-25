import { useLocalSearchParams } from 'expo-router';

import { MediaViewerScreen } from '@/features/chat/components/media/MediaViewerScreen';

/** Modal NGOÀI tab (app.md p1-04 §1) — `router.push('/media-viewer', {params:{messageId, index}})` từ `ImageGrid`/`VideoThumb`. */
export default function MediaViewerRoute() {
  const { messageId, index } = useLocalSearchParams<{ messageId: string; index?: string }>();
  return <MediaViewerScreen initialIndex={Number(index ?? 0)} messageId={messageId} />;
}
