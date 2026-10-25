import { LiveQuizGate } from '@/features/live-quiz/components/LiveQuizGate';
import { ResultsScreen } from '@/features/live-quiz/screens/ResultsScreen';

export default function LiveQuizResultsRoute() {
  return (
    <LiveQuizGate>
      <ResultsScreen />
    </LiveQuizGate>
  );
}
