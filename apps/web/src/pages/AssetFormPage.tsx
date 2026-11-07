import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  assetCreateSchema,
  assetUpdateSchema,
  type AssetDetailDto,
  type DeviceModelDto,
  type LocationDto,
  type SiteDto,
} from '@medequip/shared';
import { api, errorMessage, qs } from '../lib/api';
import { useLoad } from '../lib/useLoad';

type FormState = Record<
  | 'siteId'
  | 'locationId'
  | 'modelId'
  | 'assetTag'
  | 'serialNumber'
  | 'udi'
  | 'status'
  | 'riskLevel'
  | 'purchaseDate'
  | 'purchaseCost'
  | 'warrantyEndsAt'
  | 'commissionedAt'
  | 'notes',
  string
>;

const EMPTY: FormState = {
  siteId: '',
  locationId: '',
  modelId: '',
  assetTag: '',
  serialNumber: '',
  udi: '',
  status: 'IN_SERVICE',
  riskLevel: '',
  purchaseDate: '',
  purchaseCost: '',
  warrantyEndsAt: '',
  commissionedAt: '',
  notes: '',
};

function fromAsset(a: AssetDetailDto): FormState {
  return {
    siteId: a.site.id,
    locationId: a.location?.id ?? '',
    modelId: a.model.id,
    assetTag: a.assetTag,
    serialNumber: a.serialNumber ?? '',
    udi: a.udi ?? '',
    status: a.status,
    riskLevel: a.riskLevel,
    purchaseDate: a.purchaseDate ?? '',
    purchaseCost: a.purchaseCost ?? '',
    warrantyEndsAt: a.warrantyEndsAt ?? '',
    commissionedAt: a.commissionedAt ?? '',
    notes: a.notes ?? '',
  };
}

export function AssetFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [original, setOriginal] = useState<AssetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sites = useLoad(() => api<SiteDto[]>('/sites'), []);
  const models = useLoad(() => api<DeviceModelDto[]>('/library/models'), []);
  const locations = useLoad(
    () =>
      form.siteId
        ? api<LocationDto[]>(`/locations${qs({ siteId: form.siteId })}`)
        : Promise.resolve([]),
    [form.siteId],
  );

  useEffect(() => {
    if (id) {
      api<AssetDetailDto>(`/assets/${id}`)
        .then((a) => {
          setOriginal(a);
          setForm(fromAsset(a));
        })
        .catch((e) => setError(errorMessage(e)));
    }
  }, [id]);

  // Default to the only site when there is just one.
  useEffect(() => {
    if (!editing && !form.siteId && sites.data?.length === 1) {
      setForm((f) => ({ ...f, siteId: sites.data![0].id }));
    }
  }, [editing, form.siteId, sites.data]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value, ...(key === 'siteId' ? { locationId: '' } : {}) }));

  const selectedModel = models.data?.find((m) => m.id === form.modelId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let saved: AssetDetailDto;
      if (editing && original) {
        const before = fromAsset(original);
        const changes = Object.fromEntries(
          Object.entries(form).filter(([k, v]) => before[k as keyof FormState] !== v),
        );
        if (Object.keys(changes).length === 0) {
          navigate(`/assets/${id}`);
          return;
        }
        const body = { ...changes, version: original.version };
        const parsed = assetUpdateSchema.safeParse(body);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
        saved = await api<AssetDetailDto>(`/assets/${id}`, { method: 'PATCH', body });
      } else {
        const parsed = assetCreateSchema.safeParse(form);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new Error(`${issue?.path.join('.')}: ${issue?.message}`);
        }
        saved = await api<AssetDetailDto>('/assets', { method: 'POST', body: form });
      }
      navigate(`/assets/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing && !original && !error) return <p className="muted">Loading…</p>;

  return (
    <>
      <p>
        <Link to={editing ? `/assets/${id}` : '/assets'}>← Back</Link>
      </p>
      <h1>{editing ? `Edit ${original?.assetTag}` : 'Add asset'}</h1>

      <form className="panel form-grid" onSubmit={onSubmit}>
        <h2 className="span-all">Identification</h2>
        <label>
          Asset tag *
          <input
            value={form.assetTag}
            onChange={(e) => set('assetTag')(e.target.value)}
            placeholder="e.g. BME-00123"
            required
          />
        </label>
        <label>
          Device model *
          <select value={form.modelId} onChange={(e) => set('modelId')(e.target.value)} required>
            <option value="">Select…</option>
            {models.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.manufacturer.name} — {m.name} ({m.category})
              </option>
            ))}
          </select>
          <small className="muted">
            Not listed? <Link to="/library">Add it to the device library</Link>.
          </small>
        </label>
        <label>
          Serial number
          <input value={form.serialNumber} onChange={(e) => set('serialNumber')(e.target.value)} />
        </label>
        <label>
          UDI
          <input value={form.udi} onChange={(e) => set('udi')(e.target.value)} />
        </label>

        <h2 className="span-all">Location & status</h2>
        <label>
          Site *
          <select value={form.siteId} onChange={(e) => set('siteId')(e.target.value)} required>
            <option value="">Select…</option>
            {sites.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            value={form.locationId}
            onChange={(e) => set('locationId')(e.target.value)}
            disabled={!form.siteId}
          >
            <option value="">— None —</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => set('status')(e.target.value)}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Risk level
          <select value={form.riskLevel} onChange={(e) => set('riskLevel')(e.target.value)}>
            {!editing && (
              <option value="">
                From model
                {selectedModel ? ` (${RISK_LEVEL_LABELS[selectedModel.defaultRiskLevel]})` : ''}
              </option>
            )}
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {RISK_LEVEL_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <h2 className="span-all">Purchase & warranty</h2>
        <label>
          Purchase date
          <input
            type="date"
            value={form.purchaseDate}
            onChange={(e) => set('purchaseDate')(e.target.value)}
          />
        </label>
        <label>
          Purchase cost
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.purchaseCost}
            onChange={(e) => set('purchaseCost')(e.target.value)}
          />
        </label>
        <label>
          Warranty ends
          <input
            type="date"
            value={form.warrantyEndsAt}
            onChange={(e) => set('warrantyEndsAt')(e.target.value)}
          />
        </label>
        <label>
          Commissioned
          <input
            type="date"
            value={form.commissionedAt}
            onChange={(e) => set('commissionedAt')(e.target.value)}
          />
        </label>
        <label className="span-all">
          Notes
          <textarea rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
        </label>

        {error && <p className="error span-all">{error}</p>}
        <div className="span-all row">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add asset'}
          </button>
          <Link to={editing ? `/assets/${id}` : '/assets'}>Cancel</Link>
        </div>
      </form>
    </>
  );
}
