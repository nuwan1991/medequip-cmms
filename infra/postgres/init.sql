-- Runs once when the local PostgreSQL container is first created.
-- Creates the restricted application role used by the API (Row-Level Security applies to it).
-- Development password only - use a real secret in any shared or production environment.
CREATE ROLE medequip_app LOGIN PASSWORD 'medequip_app';
