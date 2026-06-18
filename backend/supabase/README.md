# Supabase migration workspace

This directory prepares PostgreSQL without switching the live frontend away
from localStorage.

1. Create a Supabase project.
2. Run `migrations/001_initial_schema.sql` in SQL Editor.
3. Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in backend `.env`.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is not required for ping.
5. Open `/api/backend/ping` to verify the connection.

Live import is intentionally not automatic. The importer will use stable legacy
keys and `legacy_import_map`, so retries cannot duplicate records.
