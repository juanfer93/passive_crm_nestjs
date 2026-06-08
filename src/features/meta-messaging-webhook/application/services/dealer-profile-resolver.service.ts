import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildQualificationPrompt } from '@/features/meta-messaging-webhook/application/prompts/dealer-qualification.prompt';
import {
  DealerProfile,
  DealerProfileKey,
} from '@/features/meta-messaging-webhook/domain/entities/dealer-profile.entity';

const dealerProfiles: Record<DealerProfileKey, DealerProfile> = {
  'offlease-fredericksburg': {
    key: 'offlease-fredericksburg',
    displayName: 'Off Lease Fredericksburg',
    locationCity: 'Fredericksburg',
    locationState: 'Virginia',
    assistantPrompt: buildQualificationPrompt('Off Lease Fredericksburg', 'Fredericksburg'),
  },
  'offlease-motors-fredericksburg': {
    key: 'offlease-motors-fredericksburg',
    displayName: 'Off Lease Motors of Fredericksburg',
    locationCity: 'Fredericksburg',
    locationState: 'Virginia',
    assistantPrompt: buildQualificationPrompt(
      'Off Lease Motors of Fredericksburg',
      'Fredericksburg',
    ),
  },
  'offlease-stafford': {
    key: 'offlease-stafford',
    displayName: 'Off Lease Stafford',
    locationCity: 'Stafford',
    locationState: 'Virginia',
    assistantPrompt: buildQualificationPrompt('Off Lease Stafford', 'Stafford'),
  },
};

export const DEFAULT_DEALER_PROFILE_KEY: DealerProfileKey = 'offlease-fredericksburg';

@Injectable()
export class DealerProfileResolver {
  constructor(private readonly config: ConfigService) {}

  resolve(input?: { profileKey?: string; pageId?: string }): DealerProfile {
    const pageProfileKey = input?.pageId ? this.pageProfileMap[input.pageId] : undefined;
    const configuredDefault = this.config.get<string>('DEFAULT_DEALER_PROFILE');
    const key = input?.profileKey ?? pageProfileKey ?? configuredDefault ?? DEFAULT_DEALER_PROFILE_KEY;

    return getDealerProfile(key);
  }

  list(): DealerProfile[] {
    return Object.values(dealerProfiles);
  }

  private get pageProfileMap(): Record<string, DealerProfileKey> {
    const rawMap = this.config.get<string>('META_PAGE_DEALER_PROFILE_MAP');

    if (!rawMap) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawMap) as Record<string, string>;
      return Object.entries(parsed).reduce<Record<string, DealerProfileKey>>(
        (map, [pageId, profileKey]) => {
          if (isDealerProfileKey(profileKey)) {
            map[pageId] = profileKey;
          }

          return map;
        },
        {},
      );
    } catch {
      return {};
    }
  }
}

export function getDealerProfile(profileKey: string): DealerProfile {
  if (isDealerProfileKey(profileKey)) {
    return dealerProfiles[profileKey];
  }

  return dealerProfiles[DEFAULT_DEALER_PROFILE_KEY];
}

function isDealerProfileKey(value: string): value is DealerProfileKey {
  return value in dealerProfiles;
}
