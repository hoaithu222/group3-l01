import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

import type { MessageView } from '../../api/chat.types';

/** Số commit hiện tối đa (khớp BE `LIMITS.integration.commitsInMessageMax`) — payload lạ dài hơn vẫn bị cắt ở đây. */
export const INTEGRATION_COMMITS_MAX = 5;

const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: 'GitHub',
  GITLAB: 'GitLab',
  FIGMA: 'Figma',
};

interface IntegrationCard {
  provider: string;
  title: string;
  repo: string | null;
  url: string | null;
  host: string | null;
  commits: { sha7: string; message: string }[];
  hidden: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Đọc payload do SERVER ghi (`systemPayloadSchemas.INTEGRATION`) một cách phòng thủ — thiếu/sai kiểu trường nào thì bỏ trường đó, không vỡ. */
export function readIntegrationPayload(
  payload: Record<string, unknown> | null,
): IntegrationCard | null {
  const p = payload ?? {};
  const title = str(p.title) ?? str(p.summary);
  if (!title) return null;
  const rawUrl = str(p.url);
  let url: string | null = null;
  let host: string | null = null;
  if (rawUrl?.startsWith('https://')) {
    const match = /^https:\/\/([^/?#:]+)/.exec(rawUrl);
    host = match?.[1] ?? null;
    url = host ? rawUrl : null;
  }
  const commits = (Array.isArray(p.commits) ? p.commits : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ sha7: str(c.sha7) ?? '', message: str(c.message) ?? '' }))
    .filter((c) => c.sha7 || c.message)
    .slice(0, INTEGRATION_COMMITS_MAX);
  const total = typeof p.commitCount === 'number' ? p.commitCount : commits.length;
  const provider = PROVIDER_LABELS[str(p.provider) ?? ''] ?? str(p.source) ?? 'Tích hợp';
  return {
    commits,
    hidden: Math.max(0, total - commits.length),
    host,
    provider,
    repo: str(p.repo),
    title,
    url,
  };
}

/**
 * Thẻ tin hệ thống `INTEGRATION` (p5-03 app.md §3): nhà cung cấp + repo, tiêu đề 1 dòng, tối đa 5 commit (sha7 mono + dòng đầu), nút "Mở trên …"
 * ghi RÕ tên miền đích và chỉ mở sau khi xác nhận (không tự mở link — nội dung do người ngoài đặt). Payload lạ → "Thông báo từ tích hợp".
 * Nằm trong `chat` (không qua registry ở `app/(app)/_layout.tsx`) vì payload là hợp đồng CHUNG của p1-04, không cần dữ liệu module khác.
 */
export function IntegrationMessage({ message }: { message: Pick<MessageView, 'systemPayload'> }) {
  const [confirming, setConfirming] = useState(false);
  const card = readIntegrationPayload(message.systemPayload);

  if (!card) {
    return (
      <View className="items-center px-md py-2xs">
        <Text className="text-caption-sm text-fg-2">Thông báo từ tích hợp</Text>
      </View>
    );
  }

  return (
    <View className="mx-md my-2xs gap-2xs self-stretch rounded-md bg-bg-2 px-md py-sm">
      <Text className="text-caption-sm text-fg-2">
        {card.repo ? `${card.provider} · ${card.repo}` : card.provider}
      </Text>
      <Text className="text-label-md text-fg-1" numberOfLines={2}>
        {card.title}
      </Text>
      {card.commits.map((c) => (
        <Text
          key={`${c.sha7}-${c.message}`}
          className="text-caption-sm text-fg-1"
          numberOfLines={1}
        >
          <Text className="font-mono text-fg-2">{c.sha7}</Text> {c.message}
        </Text>
      ))}
      {card.hidden > 0 ? (
        <Text className="text-caption-sm text-fg-2">và {card.hidden} commit khác</Text>
      ) : null}
      {card.url && card.host ? (
        <View className="flex-row">
          <Button
            label={`Mở trên ${card.provider} (${card.host})`}
            size="sm"
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        </View>
      ) : null}
      <Dialog
        description={card.url ?? ''}
        primaryAction={{
          label: 'Mở liên kết',
          onPress: () => {
            setConfirming(false);
            if (card.url) void WebBrowser.openBrowserAsync(card.url);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title={`Mở ${card.host ?? 'liên kết'} ngoài ứng dụng?`}
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}
