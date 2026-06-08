import { ConversationState } from '@/features/meta-messaging-webhook/domain/entities/conversation-state.entity';

const REACTIVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function shouldReactivateLeadQualification(
  state: ConversationState | null,
  now: Date,
): boolean {
  if (state?.qualificationStatus !== 'completed' || !state.qualificationCompletedAt) {
    return false;
  }

  return now.getTime() - state.qualificationCompletedAt.getTime() >= REACTIVATION_WINDOW_MS;
}
