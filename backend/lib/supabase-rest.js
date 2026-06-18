'use strict';

function config() {
  return {
    url: String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    anonKey: String(process.env.SUPABASE_ANON_KEY || '').trim(),
    hasServiceRole: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
  };
}

function getSupabaseStatus() {
  const cfg = config();
  return {
    provider: 'supabase',
    configured: Boolean(cfg.url && cfg.anonKey),
    serviceRoleConfigured: cfg.hasServiceRole,
    mode: 'parallel-migration'
  };
}

async function pingSupabase(authorization) {
  const cfg = config();
  if (!cfg.url || !cfg.anonKey) {
    const error = new Error('Supabase is not configured yet');
    error.status = 503;
    throw error;
  }
  const bearer = String(authorization || '').trim();
  const response = await fetch(cfg.url + '/rest/v1/organizations?select=id&limit=1', {
    headers: {
      apikey: cfg.anonKey,
      Authorization: bearer || ('Bearer ' + cfg.anonKey),
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error('Supabase REST returned ' + response.status + (body ? ': ' + body.slice(0, 240) : ''));
    error.status = 502;
    throw error;
  }
  return { provider: 'supabase', configured: true, reachable: true, authenticated: Boolean(bearer) };
}

module.exports = { getSupabaseStatus, pingSupabase };
