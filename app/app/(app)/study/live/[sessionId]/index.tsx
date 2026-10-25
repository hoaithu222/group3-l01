import { LiveQuizGate } from '@/features/live-quiz/components/LiveQuizGate';
import { SessionScreen } from '@/features/live-quiz/screens/SessionScreen';

export default function LiveQuizSessionRoute() {
  return (
    <LiveQuizGate>
      <SessionScreen />
    </LiveQuizGate>
  );
}
