import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { WrongAnswer } from '../utils/wrong-answers';

/** Một dòng đáp án của thẻ ôn lại: SAI (đỏ, ✗) hoặc ĐÚNG (xanh, ✓) — icon + chữ đi cùng màu, không dựa vào màu. */
function AnswerLine({ right, text }: { right: boolean; text: string }) {
  return (
    <View
      className={cn(
        'flex-row items-start gap-xs rounded-xs p-xs',
        right ? 'bg-surface-success' : 'bg-surface-error',
      )}
    >
      <Icon
        color={right ? 'success' : 'error'}
        name={right ? 'checkmark-circle' : 'cancel'}
        size="sm"
        variant="solid"
      />
      <Text className="flex-1 text-body-md text-fg-1">{text}</Text>
    </View>
  );
}

/** Một câu tôi làm sai: số câu · đề · đáp án tôi chọn (hoặc "chưa trả lời") · đáp án đúng · lời giải thích. */
export function WrongAnswerItem({ wrong }: { wrong: WrongAnswer }) {
  return (
    <View className="gap-xs rounded-md bg-surface-neutral p-sm">
      <View className="flex-row">
        <Badge label={`Câu ${String(wrong.index + 1)}`} size="sm" variant="neutral" />
      </View>
      <Text className="text-body-md font-semibold text-fg-1">{wrong.prompt}</Text>
      <AnswerLine
        right={false}
        text={wrong.myText ? `Bạn chọn: ${wrong.myText}` : 'Bạn chưa trả lời'}
      />
      <AnswerLine right text={`Đáp án đúng: ${wrong.correctText}`} />
      {wrong.explanation ? (
        <View className="flex-row items-start gap-xs px-xs">
          <Icon color="info" name="alert-information" size="sm" />
          <Text className="flex-1 text-body-md text-fg-2">{wrong.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}
