import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ASSET_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  type AssetDetailDto,
  type AssetHistoryEntry,
} from '@medequip/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { RiskBadge, StatusBadge } from '../components/Badges';

const FIELD_LABELS: Record<string, string> = {
  assetTag: 'Asset tag',
  serialNumber: 'Serial number',
  udi: 'UDI',
  status: 'Status',
  riskLevel: 'Risk',
  site: 'Site',
  location: 'Location',
  model: 'Model',
  purchaseDate: 'Purchase date',
  purchaseCost: 'Purchase cost',
  warrantyEndsAt: 'Warranty ends',
  commissionedAt: 'Commissioned',
  notes: 'Notes',
};

const VALUE_LABELS: Record<string, string> = { ...ASSET_STATUS_LABELS, ...RISK_LEVEL_LABELS };
const show = (v: unknown) =>
  v === null || v === undefined ? '—' : (VALUE_LABELS[String(v)] ?? String(v));

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Removed',
};

export function AssetDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const asset = useLoad(() => api<AssetDetailDto>(`/assets/${id}`), [id]);
  const history = useLoad(() => api<AssetHistoryEntry[]>(`/assets/${id}/history`), [id]);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The QR code opens this asset page when scanned (fault reporting will start here).
  useEffect(() => {
    if (id) {
      QRCode.toDataURL(`${window.location.origin}/assets/${id}`, { margin: 1, width: 240 })
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [id]);

  async function remove() {
    if (!asset.data) return;
    if (
      !window.confirm(
        `Remove ${asset.data.assetTag}? Use status "Disposed" for equipment that left the ` +
          'hospital; remove only records created by mistake.',
      )
    ) {
      return;
    }
    try {
      await api(`/assets/${id}`, { method: 'DELETE' });
      navigate('/assets');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (asset.error) return <p className="error">{asset.error}</p>;
  const a = asset.data;
  if (!a) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="no-print">
        <Link to="/assets">← Assets</Link>
      </p>
      <div className="page-header no-print">
        <div>
          <h1>{a.assetTag}</h1>
          <p className="muted">
            {a.model.manufacturer} {a.model.name} · {a.model.category}
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => window.print()}>
            Print label
          </button>
          {can('assets:write') && (
            <>
              <Link className="button" to={`/assets/${a.id}/edit`}>
                Edit
              </Link>
              <button className="link danger" onClick={() => void remove()}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="detail-grid no-print">
        <section className="panel">
          <dl className="fields">
            <dt>Status</dt>
            <dd>
              <StatusBadge status={a.status} />
            </dd>
            <dt>Risk</dt>
            <dd>
              <RiskBadge risk={a.riskLevel} />
            </dd>
            <dt>Serial number</dt>
            <dd>{a.serialNumber ?? '—'}</dd>
            <dt>UDI</dt>
            <dd className="break">{a.udi ?? '—'}</dd>
            <dt>Site</dt>
            <dd>{a.site.name}</dd>
            <dt>Location</dt>
            <dd>{a.location?.path ?? '—'}</dd>
            <dt>Purchase date</dt>
            <dd>{a.purchaseDate ?? '—'}</dd>
            <dt>Purchase cost</dt>
            <dd>{a.purchaseCost ?? '—'}</dd>
            <dt>Warranty ends</dt>
            <dd>
              {a.warrantyEndsAt ?? '—'}
              {a.warrantyEndsAt && new Date(a.warrantyEndsAt) < new Date() && (
                <span className="muted"> (expired)</span>
              )}
            </dd>
            <dt>Commissioned</dt>
            <dd>{a.commissionedAt ?? '—'}</dd>
            <dt>Notes</dt>
            <dd className="pre">{a.notes ?? '—'}</dd>
          </dl>
        </section>

        <section className="panel label-preview">
          {qr && <img src={qr} alt={`QR code for ${a.assetTag}`} width={160} height={160} />}
          <strong>{a.assetTag}</strong>
          <span className="muted small">Scan to open this asset</span>
        </section>
      </div>

      <section className="no-print">
        <h2>History</h2>
        {history.error && <p className="error">{history.error}</p>}
        <ul className="history">
          {history.data?.map((h, i) => (
            <li key={i}>
              <div>
                <strong>{ACTION_LABELS[h.action] ?? h.action}</strong>{' '}
                <span className="muted">
                  {new Date(h.at).toLocaleString()} · {h.user ?? 'System'}
                </span>
              </div>
              {Object.entries(h.changes).map(([field, c]) => (
                <div key={field} className="small">
                  {FIELD_LABELS[field] ?? field}: <s>{show(c.from)}</s> → {show(c.to)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>

      {/* Printed label (only visible when printing) */}
      <div className="print-label">
        {qr && <img src={qr} alt="" />}
        <div>
          <div className="print-tag">{a.assetTag}</div>
          <div>
            {a.model.manufacturer} {a.model.name}
          </div>
          {a.serialNumber && <div>SN {a.serialNumber}</div>}
          <div>{a.site.name}</div>
        </div>
      </div>
    </>
  );
}
