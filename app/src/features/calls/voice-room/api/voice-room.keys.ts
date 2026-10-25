export const voiceRoomKeys = {
  all: ['voice-room'] as const,
  preview: (channelId: string) => ['voice-room', 'preview', channelId] as const,
};
