export type FollowUpStatus = 'inactive' | 'active' | 'exhausted';

export interface FollowUpState {
  status: FollowUpStatus;
  attempts: number;
  nextFollowUpAt?: Date;
  lastSentAt?: Date;
}
