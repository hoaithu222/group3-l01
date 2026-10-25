import { View } from 'react-native';

import type { MessageAttachment, MessageMention } from '../../api/chat.types';
import { FileRow } from './FileRow';
import { ImageGrid } from './ImageGrid';
import { TextContent } from './TextContent';
import { VideoThumb } from './VideoThumb';
import { VoiceNotePlayer } from './VoiceNotePlayer';

export interface BubbleContentProps {
  content: string | null;
  attachments: MessageAttachment[];
  /** Nhãn ảnh chụp cho chip nhắc tên — bản tạm outbox cũng có (`PendingMessage.mentions`). */
  mentions?: MessageMention[];
  tone: 'default' | 'onAction';
  onOpenMedia?: (index: number) => void;
}

/** Nội dung MỘT tin (không tombstone) — text + đính kèm theo loại (app.md §3). */
export function BubbleContent({ content, attachments, mentions, tone, onOpenMedia }: BubbleContentProps) {
  const images = attachments.filter((a) => a.kind === 'IMAGE');
  const videos = attachments.filter((a) => a.kind === 'VIDEO');
  const voiceNotes = attachments.filter((a) => a.kind === 'VOICE');
  const files = attachments.filter((a) => a.kind === 'FILE' || a.kind === 'AUDIO');

  return (
    <View className="gap-2xs">
      {images.length > 0 ? <ImageGrid attachments={images} onOpen={(i) => onOpenMedia?.(i)} /> : null}
      {videos.map((v, i) => (
        <VideoThumb key={v.assetId} attachment={v} onPress={() => onOpenMedia?.(images.length + i)} />
      ))}
      {voiceNotes.map((v) => (
        <VoiceNotePlayer key={v.assetId} attachment={v} tone={tone} />
      ))}
      {files.map((f) => (
        <FileRow key={f.assetId} attachment={f} />
      ))}
      {content ? <TextContent content={content} mentions={mentions} tone={tone} /> : null}
    </View>
  );
}
