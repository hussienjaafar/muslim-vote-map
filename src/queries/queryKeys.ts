export const voterImpactKeys = {
  all: ['voter-impact'] as const,
  states: () => [...voterImpactKeys.all, 'states'] as const,
  districts: () => [...voterImpactKeys.all, 'districts'] as const,
  districtsByState: (stateCode: string) =>
    [...voterImpactKeys.districts(), stateCode] as const,
  district: (cdCode: string) =>
    [...voterImpactKeys.all, 'district', cdCode] as const,
};
