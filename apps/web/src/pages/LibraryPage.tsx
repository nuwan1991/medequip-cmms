import { useState, type FormEvent } from 'react';
import {
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  deviceModelCreateSchema,
  type DeviceModelDto,
  type ManufacturerDto,
  type RiskLevel,
} from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage, qs } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { RiskBadge } from '../components/Badges';

export function LibraryPage() {
  const { can } = useAuth();
  const canWrite = can('assets:write');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const manufacturers = useLoad(() => api<ManufacturerDto[]>('/library/manufacturers'), []);
  const models = useLoad(() => api<DeviceModelDto[]>(`/library/models${qs({ q })}`), [q]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await Promise.all([manufacturers.reload(), models.reload()]);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }

  return (
    <>
      <h1>Device library</h1>
      <p className="muted">
        Manufacturers and models used by your assets. Entries marked "shared" come from the MedEquip
        library; you can add your own.
      </p>
      {error && <p className="error">{error}</p>}

      {canWrite && (
        <div className="detail-grid">
          <AddManufacturer
            onAdd={(name) =>
              run(() => api('/library/manufacturers', { method: 'POST', body: { name } }))
            }
          />
          <AddModel
            manufacturers={manufacturers.data ?? []}
            onAdd={(body) => run(() => api('/library/models', { method: 'POST', body }))}
          />
        </div>
      )}

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
        }}
      >
        <input
          type="search"
          placeholder="Search model, category or manufacturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Category</th>
              <th>Default risk</th>
              <th>PM interval</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {models.data?.map((m) => (
              <tr key={m.id}>
                <td>{m.manufacturer.name}</td>
                <td>{m.name}</td>
                <td>
                  {m.category}
                  {m.nomenclatureCode && <div className="muted small">{m.nomenclatureCode}</div>}
                </td>
                <td>
                  <RiskBadge risk={m.defaultRiskLevel} />
                </td>
                <td>{m.pmIntervalMonths ? `${m.pmIntervalMonths} months` : '—'}</td>
                <td>{m.isGlobal && <span className="badge">shared</span>}</td>
              </tr>
            ))}
            {models.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No models found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AddManufacturer({ onAdd }: { onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAdd(name)) setName('');
      }}
    >
      <h2>Add manufacturer</h2>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <button type="submit">Add manufacturer</button>
    </form>
  );
}

function AddModel({
  manufacturers,
  onAdd,
}: {
  manufacturers: ManufacturerDto[];
  onAdd: (body: object) => Promise<boolean>;
}) {
  const empty = {
    manufacturerId: '',
    name: '',
    category: '',
    nomenclatureCode: '',
    defaultRiskLevel: 'MEDIUM' as RiskLevel,
    pmIntervalMonths: '',
  };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = deviceModelCreateSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid input');
    setError(null);
    if (await onAdd(form)) setForm(empty);
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>Add device model</h2>
      <select
        value={form.manufacturerId}
        onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })}
        required
      >
        <option value="">Manufacturer…</option>
        {manufacturers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        placeholder="Model name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <input
        placeholder="Category, e.g. Infusion pump"
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value })}
        required
      />
      <input
        placeholder="GMDN / UMDNS code (optional)"
        value={form.nomenclatureCode}
        onChange={(e) => setForm({ ...form, nomenclatureCode: e.target.value })}
      />
      <div className="row">
        <select
          value={form.defaultRiskLevel}
          onChange={(e) => setForm({ ...form, defaultRiskLevel: e.target.value as RiskLevel })}
          aria-label="Default risk"
        >
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              Risk: {RISK_LEVEL_LABELS[r]}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          max="120"
          placeholder="PM every … months"
          value={form.pmIntervalMonths}
          onChange={(e) => setForm({ ...form, pmIntervalMonths: e.target.value })}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit">Add model</button>
    </form>
  );
}
