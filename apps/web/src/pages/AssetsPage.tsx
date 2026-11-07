import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  type AssetListResponse,
  type LocationDto,
  type SiteDto,
  type UsageDto,
} from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, download, errorMessage, qs } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { RiskBadge, StatusBadge, UsageLine } from '../components/Badges';

const PAGE_SIZE = 50;

export function AssetsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = {
    q: params.get('q') ?? '',
    siteId: params.get('siteId') ?? '',
    locationId: params.get('locationId') ?? '',
    status: params.get('status') ?? '',
    riskLevel: params.get('riskLevel') ?? '',
  };
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(filters.q);
  const [exportError, setExportError] = useState<string | null>(null);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'siteId') next.delete('locationId');
    next.delete('page');
    setParams(next, { replace: true });
  };

  const query = qs({ ...filters, page, pageSize: PAGE_SIZE });
  const list = useLoad(() => api<AssetListResponse>(`/assets${query}`), [query]);
  const sites = useLoad(() => api<SiteDto[]>('/sites'), []);
  const locations = useLoad(
    () => api<LocationDto[]>(`/locations${qs({ siteId: filters.siteId })}`),
    [filters.siteId],
  );
  const usage = useLoad(() => api<UsageDto>('/organization/usage'), []);

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Assets</h1>
          <UsageLine usage={usage.data} kind="assets" />
        </div>
        <div className="row">
          <button
            className="secondary"
            onClick={() =>
              download(`/assets/export.csv${qs(filters)}`, 'assets.csv').catch((e) =>
                setExportError(errorMessage(e)),
              )
            }
          >
            Export CSV
          </button>
          {can('assets:write') && (
            <Link className="button" to="/assets/new">
              Add asset
            </Link>
          )}
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter('q', search.trim());
        }}
      >
        <input
          type="search"
          placeholder="Search tag, serial, model, manufacturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search"
        />
        <select
          value={filters.siteId}
          onChange={(e) => setFilter('siteId', e.target.value)}
          aria-label="Site"
        >
          <option value="">All sites</option>
          {sites.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={filters.locationId}
          onChange={(e) => setFilter('locationId', e.target.value)}
          aria-label="Location"
        >
          <option value="">All locations</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {'  '.repeat(l.depth)}
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Status"
        >
          <option value="">Any status</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.riskLevel}
          onChange={(e) => setFilter('riskLevel', e.target.value)}
          aria-label="Risk"
        >
          <option value="">Any risk</option>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {RISK_LEVEL_LABELS[r]}
            </option>
          ))}
        </select>
      </form>

      {(list.error || exportError) && <p className="error">{list.error ?? exportError}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Device</th>
              <th>Location</th>
              <th>Status</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/assets/${a.id}`}>
                    <strong>{a.assetTag}</strong>
                  </Link>
                  {a.serialNumber && <div className="muted small">SN {a.serialNumber}</div>}
                </td>
                <td>
                  {a.model.manufacturer} {a.model.name}
                  <div className="muted small">{a.model.category}</div>
                </td>
                <td>
                  {a.location?.name ?? '—'}
                  <div className="muted small">{a.site.name}</div>
                </td>
                <td>
                  <StatusBadge status={a.status} />
                </td>
                <td>
                  <RiskBadge risk={a.riskLevel} />
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No assets found.
                  {can('assets:write') && !filters.q && ' Add your first asset to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {list.data && list.data.total > PAGE_SIZE && (
        <div className="pager">
          <button
            className="secondary"
            disabled={page <= 1}
            onClick={() => setFilter('page', String(page - 1))}
          >
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages} · {list.data.total} assets
          </span>
          <button
            className="secondary"
            disabled={page >= totalPages}
            onClick={() => setFilter('page', String(page + 1))}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
