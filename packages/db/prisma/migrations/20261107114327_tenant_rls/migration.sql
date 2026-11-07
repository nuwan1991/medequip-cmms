-- Database-level tenant isolation (PostgreSQL Row-Level Security).
--
-- Two database roles:
--   * owner (the role that runs migrations, e.g. "medequip") owns the tables. Owners are
--     not subject to RLS, so migrations, seed and the auth subsystem keep working.
--   * medequip_app - the role the API uses for tenant data. It is NOT the owner, has no
--     BYPASSRLS, and only sees rows of the organization set per transaction:
--       SELECT set_config('app.organization_id', '<uuid>', true);
--     If the setting is missing, every policy matches nothing (fails closed).
--
-- The role's LOGIN and password are set outside migrations (infra/postgres/init.sql, CI,
-- or your DBA) because secrets must not be committed.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medequip_app') THEN
    CREATE ROLE medequip_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO medequip_app;

-- Current organization from the transaction setting (NULL when not set).
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_current_org() TO medequip_app;

-- ---------------------------------------------------------------------------
-- Grants. No DELETE anywhere: business records are soft-deleted, and the audit
-- log is append-only (SELECT + INSERT only).
-- ---------------------------------------------------------------------------
GRANT SELECT ON plans TO medequip_app;
GRANT SELECT ON organizations TO medequip_app;
GRANT SELECT, INSERT, UPDATE ON sites, users, locations, manufacturers, device_models, assets
  TO medequip_app;
GRANT SELECT, UPDATE ON sessions TO medequip_app;
GRANT SELECT, INSERT ON audit_logs TO medequip_app;

-- ---------------------------------------------------------------------------
-- Row-Level Security policies
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_org());

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sites
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assets
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- Shared device library: rows with organization_id NULL are readable by every tenant,
-- but tenants can only create/change their own rows.
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY library_read ON manufacturers FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY tenant_write ON manufacturers FOR INSERT
  WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_update ON manufacturers FOR UPDATE
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE device_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY library_read ON device_models FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY tenant_write ON device_models FOR INSERT
  WITH CHECK (organization_id = app_current_org());
CREATE POLICY tenant_update ON device_models FOR UPDATE
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());
