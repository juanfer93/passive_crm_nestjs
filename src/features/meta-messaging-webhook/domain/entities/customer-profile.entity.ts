export type CustomerProfileFetchStatus = 'success' | 'failed';

export interface CustomerProfile {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  profilePictureUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  language?: string | null;
  source?: 'meta';
  fetchStatus?: CustomerProfileFetchStatus;
  fetchedAt?: Date;
  lastError?: string | null;
}
