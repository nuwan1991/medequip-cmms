import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  LOCATION_TYPES,
  LOCATION_TYPE_LABELS,
  type LocationDto,
  type LocationType,
  type SiteDto,
  type UsageDto,
} from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage, qs } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { UsageLine } from '../components/Badges';

export function LocationsPage() {
  const { can } = useAuth();
  const canWrite = can('assets:write');
  const sites = useLoad(() => api<SiteDto[]>('/sites'), []);
  const usage = useLoad(() => api<UsageDto>('/organization/usage'), []);
  const [siteId, setSiteId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId && sites.data?.length) setSiteId(sites.data[0].id);
  }, [siteId, sites.data]);

  const locations = useLoad(
    () => (siteId ? api<LocationDto[]>(`/locations${qs({ siteId })}`) : Promise.resolve([])),
    [siteId],
  );

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await locations.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const rename = (l: LocationDto) => {
    const name = window.prompt('New name', l.name);
    if (name && name.trim() !== l.name) {
      void run(() => api(`/locations/${l.id}`, { method: 'PATCH', body: { name } }));
    }
  };

  const remove = (l: LocationDto) => {
    if (window.confirm(`Remove "${l.path}"?`)) {
      void run(() => api(`/locations/${l.id}`, { method: 'DELETE' }));
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Locations</h1>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site">
          {sites.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}

      {canWrite && siteId && (
        <AddLocationForm
          siteId={siteId}
          locations={locations.data ?? []}
          onAdd={(body) => run(() => api('/locations', { method: 'POST', body }))}
        />
      )}

      <div className="panel">
        {locations.data?.length === 0 && (
          <p className="muted">No locations yet. Start with a building or department.</p>
        )}
        <ul className="tree">
          {locations.data?.map((l) => (
            <li key={l.id} style={{ paddingLeft: `${l.depth * 24}px` }}>
              <span className="badge">{LOCATION_TYPE_LABELS[l.type]}</span>{' '}
              <Link to={`/assets?siteId=${l.siteId}&locationId=${l.id}`}>{l.name}</Link>
              {l.code && <span className="muted"> · {l.code}</span>}
              {canWrite && (
                <span className="tree-actions">
                  <button className="link" onClick={() => rename(l)}>
                    Rename
                  </button>
                  <button className="link danger" onClick={() => remove(l)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {can('org:manage') && (
        <SitesSection
          sites={sites.data ?? []}
          usage={usage.data}
          onAdd={(body) =>
            run(async () => {
              await api('/sites', { method: 'POST', body });
              await Promise.all([sites.reload(), usage.reload()]);
            })
          }
        />
      )}
    </>
  );
}

function AddLocationForm({
  siteId,
  locations,
  onAdd,
}: {
  siteId: string;
  locations: LocationDto[];
  onAdd: (body: object) => Promise<void>;
}) {
  const [type, setType] = useState<LocationType>('DEPARTMENT');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    await onAdd({ siteId, parentId, type, name });
    setName('');
  }

  return (
    <form className="panel filters" onSubmit={submit}>
      <select value={type} onChange={(e) => setType(e.target.value as LocationType)}>
        {LOCATION_TYPES.map((t) => (
          <option key={t} value={t}>
            {LOCATION_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <input
        placeholder="Name, e.g. ICU"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Inside">
        <option value="">Top level</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            Inside: {l.path}
          </option>
        ))}
      </select>
      <button type="submit">Add location</button>
    </form>
  );
}

function SitesSection({
  sites,
  usage,
  onAdd,
}: {
  sites: SiteDto[];
  usage: UsageDto | null;
  onAdd: (body: object) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <section>
      <h2>Sites (hospitals)</h2>
      <UsageLine usage={usage} kind="sites" />
      <ul>
        {sites.map((s) => (
          <li key={s.id}>
            {s.name} <span className="muted">({s.code})</span>
          </li>
        ))}
      </ul>
      <form
        className="filters"
        onSubmit={async (e) => {
          e.preventDefault();
          await onAdd({ name, code });
          setName('');
          setCode('');
        }}
      >
        <input
          placeholder="Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          placeholder="Code, e.g. NORTH"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button type="submit">Add site</button>
      </form>
    </section>
  );
}
