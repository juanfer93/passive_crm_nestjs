import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';

export const META_USER_PROFILE = Symbol('META_USER_PROFILE');

export interface MetaUserProfilePort {
  fetchProfile(pageId: string | undefined, metaUserId: string): Promise<CustomerProfile>;
}
