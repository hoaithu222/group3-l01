import type { ChannelHit, FileHit, MeetingHit, MessageHit, PersonHit, SearchRow } from '../api';
import { ChannelResultItem } from './ChannelResultItem';
import { FileResultItem } from './FileResultItem';
import { MeetingResultItem } from './MeetingResultItem';
import { MessageResultItem } from './MessageResultItem';
import { PersonResultItem } from './PersonResultItem';

/** Mỗi loại kết quả một handler ỔN ĐỊNH (`useCallback`) — hàng `memo` chỉ vẽ lại khi dữ liệu của CHÍNH nó đổi. */
export interface SearchRowHandlers {
  onChannel: (hit: ChannelHit) => void;
  onFile: (hit: FileHit) => void;
  onJoin: (hit: ChannelHit) => void;
  onMeeting: (hit: MeetingHit) => void;
  onMessage: (hit: MessageHit) => void;
  onPerson: (hit: PersonHit) => void;
}

export interface SearchResultRowProps {
  handlers: SearchRowHandlers;
  /** id kênh đang gửi yêu cầu "Tham gia". */
  joiningId: string | null;
  /** id của mình — hàng "Người" của chính mình chỉ hiển thị. */
  meId: string | undefined;
  row: SearchRow;
  /** Hàng đang được xem trước (máy tính bảng). */
  selected: boolean;
}

/** Rẽ nhánh theo `row.type` — kiểu đã được thu hẹp ở `SearchRow`, không ép kiểu ở nơi gọi. */
export function SearchResultRow({
  handlers,
  joiningId,
  meId,
  row,
  selected,
}: SearchResultRowProps) {
  switch (row.type) {
    case 'messages':
      return <MessageResultItem hit={row.hit} selected={selected} onPress={handlers.onMessage} />;
    case 'files':
      return <FileResultItem hit={row.hit} onPress={handlers.onFile} />;
    case 'channels':
      return (
        <ChannelResultItem
          hit={row.hit}
          joining={joiningId === row.hit.channelId}
          onJoin={handlers.onJoin}
          onOpen={handlers.onChannel}
        />
      );
    case 'people':
      return (
        <PersonResultItem
          hit={row.hit}
          isMe={row.hit.userId === meId}
          onPress={handlers.onPerson}
        />
      );
    case 'meetings':
      return <MeetingResultItem hit={row.hit} onPress={handlers.onMeeting} />;
  }
}
