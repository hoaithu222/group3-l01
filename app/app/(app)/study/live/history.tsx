import { LiveQuizGate } from '@/features/live-quiz/components/LiveQuizGate';
import { HistoryScreen } from '@/features/live-quiz/screens/HistoryScreen';

export default function LiveQuizHistoryRoute() {
  return (
    <LiveQuizGate>
      <HistoryScreen />
    </LiveQuizGate>
  );
}
