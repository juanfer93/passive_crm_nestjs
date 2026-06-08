export type DealerProfileKey =
  | 'offlease-fredericksburg'
  | 'offlease-motors-fredericksburg'
  | 'offlease-stafford';

export interface DealerProfile {
  key: DealerProfileKey;
  displayName: string;
  locationCity: string;
  locationState: string;
  assistantPrompt: string;
}
