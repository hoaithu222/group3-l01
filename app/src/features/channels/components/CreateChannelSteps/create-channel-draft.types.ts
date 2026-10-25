import type { ChannelType, ChannelVisibility, PostingPolicy } from '../../api';

/** Trạng thái tích luỹ của wizard 5 bước (app.md p1-03 §3) — sống ở `CreateChannelScreen`. */
export interface ChannelDraft {
  description: string;
  initialMemberIds: string[];
  name: string;
  postingPolicy: PostingPolicy;
  type: ChannelType;
  visibility: ChannelVisibility;
}

export const DEFAULT_CHANNEL_DRAFT: ChannelDraft = {
  description: '',
  initialMemberIds: [],
  name: '',
  postingPolicy: 'MEMBERS',
  type: 'TEXT',
  visibility: 'PUBLIC',
};

export const CREATE_CHANNEL_STEP_TITLES = ['Tên & mô tả', 'Loại kênh', 'Đối tượng', 'Quyền đăng bài', 'Xem lại'] as const;
