'use strict';

function parseStoredValue(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value == null ? '' : value)); } catch (error) { return value; }
}

function categoryForKey(key) {
  const name = String(key || '').toLowerCase();
  if (/assets|payment|cash|finance|income|expense/.test(name)) return 'cash_payments';
  if (/projects|tasks|task_/.test(name)) return 'projects_tasks';
  if (/goals|goal_|sales|funnel/.test(name)) return 'goals_sales';
  if (/clients|crm_/.test(name) && !/crm_ads/.test(name)) return 'crm';
  if (/crm_ads|advert|avito_/.test(name)) return 'advertising';
  if (/contract|proposal|kp_|commercial/.test(name)) return 'documents';
  return 'settings_other';
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return value === '' || value == null ? 0 : 1;
  const candidates = ['projects', 'tasks', 'payments', 'entries', 'items', 'clients', 'history', 'records', 'rows'];
  for (const name of candidates) if (Array.isArray(value[name])) return value[name].length;
  return Object.keys(value).length;
}

function analyzeBackupInventory(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  const groups = {};
  const entries = Object.keys(keys).sort().map((key) => {
    const raw = keys[key];
    const parsed = parseStoredValue(raw);
    const category = categoryForKey(key);
    const monthly = /(?:_month_|month_)[0-9]{4}-[0-9]{2}|_[0-9]{4}-[0-9]{2}(?:_|$)/i.test(key);
    const kind = Array.isArray(parsed) ? 'array' : (parsed && typeof parsed === 'object' ? 'object' : typeof parsed);
    const entry = { key, category, monthly, kind, records: recordCount(parsed), bytes: Buffer.byteLength(String(raw == null ? '' : raw), 'utf8') };
    const group = groups[category] || { category, keys: 0, liveKeys: 0, monthlyKeys: 0, records: 0, bytes: 0 };
    group.keys += 1; group[monthly ? 'monthlyKeys' : 'liveKeys'] += 1; group.records += entry.records; group.bytes += entry.bytes;
    groups[category] = group;
    return entry;
  });
  return {
    dryRun: true,
    keyCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    groups: Object.values(groups).sort((a, b) => b.bytes - a.bytes),
    entries
  };
}

module.exports = { analyzeBackupInventory, categoryForKey, parseStoredValue, recordCount };
