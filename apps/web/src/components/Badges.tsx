import {
  ASSET_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  type AssetStatus,
  type RiskLevel,
  type UsageDto,
} from '@medequip/shared';

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`pill status-${status.toLowerCase()}`}>{ASSET_STATUS_LABELS[status]}</span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <span className={`pill risk-${risk.toLowerCase()}`}>{RISK_LEVEL_LABELS[risk]}</span>;
}

/** "240 of 300 assets · Free plan" with a warning colour near the limit. */
export function UsageLine({
  usage,
  kind,
}: {
  usage: UsageDto | null;
  kind: 'assets' | 'users' | 'sites';
}) {
  if (!usage) return null;
  const { used, limit } = usage[kind];
  const near = limit !== null && used >= limit * 0.8;
  return (
    <p className={near ? 'usage near-limit' : 'usage muted'}>
      {used} {limit === null ? '' : `of ${limit} `}
      {kind} · {usage.plan.name} plan
      {limit !== null && used >= limit && ' — limit reached, upgrade to add more'}
    </p>
  );
}
