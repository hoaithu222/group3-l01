import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import type { DiscoveryScope } from '../api/discovery.types';
import { PinnedListScreen } from './PinnedListScreen';
import { ScopeSearchScreen } from './ScopeSearchScreen';

/**
 * Bốn vỏ mỏng cho route (`app/**` chỉ `import` + `return` — `feature-structure.md`): đọc tham số đường dẫn rồi dựng
 * `scope` cho màn dùng chung. Kênh cần `wsId` (route kênh nằm dưới `/workspaces/[wsId]/…` nên `openMessage` mới dựng
 * được href tới tin); hội thoại chỉ cần `conversationId`.
 */
function useChannelScope(): DiscoveryScope {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  return useMemo(() => ({ scopeType: 'CHANNEL', scopeId: chId, workspaceId: wsId }), [chId, wsId]);
}

function useConversationScope(): DiscoveryScope {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return useMemo(() => ({ scopeType: 'CONVERSATION', scopeId: conversationId }), [conversationId]);
}

export function ChannelSearchScreen() {
  return <ScopeSearchScreen scope={useChannelScope()} />;
}

export function ConversationSearchScreen() {
  return <ScopeSearchScreen scope={useConversationScope()} />;
}

export function ChannelPinnedScreen() {
  return <PinnedListScreen scope={useChannelScope()} />;
}

export function ConversationPinnedScreen() {
  return <PinnedListScreen scope={useConversationScope()} />;
}
