import { LiveQuizGate } from '@/features/live-quiz/components/LiveQuizGate';
import { JoinScreen } from '@/features/live-quiz/screens/JoinScreen';

export default function LiveQuizJoinRoute() {
  return (
    <LiveQuizGate>
      <JoinScreen />
    </LiveQuizGate>
  );
}
