export const MODELS = [
  {
    value: 'v3.1-20260211',
    label: 'H3 / Tripo v3.1',
    description: 'Độ chi tiết cao, phù hợp hero asset, in 3D, product mockup.'
  },
  {
    value: 'v3.0-20250812',
    label: 'H3 / Tripo v3.0',
    description: 'High detail ổn định, nhiều tuỳ chỉnh geometry.'
  },
  {
    value: 'P1-20260311',
    label: 'P1 Smart Mesh',
    description: 'Tối ưu topology sạch/low-poly, hợp realtime pipeline.'
  },
  {
    value: 'v2.5-20250123',
    label: 'H2 / Tripo v2.5',
    description: 'Baseline ổn định, cân bằng tốc độ và chất lượng.'
  },
  {
    value: 'Turbo-v1.0-20250506',
    label: 'Turbo v1.0',
    description: 'Ưu tiên tốc độ thử ý tưởng nhanh.'
  }
];

export const FINAL_STATUSES = new Set([
  'success', 'failed', 'cancelled', 'banned', 'expired', 'unknown'
]);
