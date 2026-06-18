'use strict';

const crypto = require('crypto');
const { supabaseUserRequest } = require('./supabase-rest');

function checksumBackup(backup) {
  const stableBackup = Object.assign({}, backup || {});
  delete stableBackup.createdAt;
  return crypto.createHash('sha256').update(JSON.stringify(stableBackup)).digest('hex');
}

function backupSummary(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  return {
    format: String((backup && backup.format) || 'unknown'),
    profile: String((backup && backup.profile) || 'unknown'),
    keyCount: Object.keys(keys).length
  };
}

async function saveRawSnapshot(backup, authorization) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    const error = new Error('Backup must be a JSON object');
    error.status = 400;
    throw error;
  }
  const summary = backupSummary(backup);
  if (!summary.keyCount) {
    const error = new Error('Backup contains no storage keys');
    error.status = 400;
    throw error;
  }

  const memberships = await supabaseUserRequest(
    'organization_members?select=organization_id,role&limit=10', authorization
  );
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => item && (item.role === 'owner' || item.role === 'admin'))
    : null;
  if (!membership || !membership.organization_id) {
    const error = new Error('Owner or admin organization membership is required');
    error.status = 403;
    throw error;
  }

  const organizationId = membership.organization_id;
  const source = summary.format === 'unknown' ? 'avitolog-local-backup' : summary.format;
  const checksum = checksumBackup(backup);
  const filter = 'organization_id=eq.' + encodeURIComponent(organizationId) +
    '&source=eq.' + encodeURIComponent(source) + '&checksum=eq.' + encodeURIComponent(checksum);
  const existing = await supabaseUserRequest(
    'migration_source_snapshots?select=id,migration_run_id,created_at&' + filter + '&limit=1', authorization
  );
  if (Array.isArray(existing) && existing.length) {
    return { alreadyExists: true, snapshot: existing[0], checksum, summary };
  }

  const runs = await supabaseUserRequest('migration_runs', authorization, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      source,
      status: 'snapshot_saved',
      summary: Object.assign({ checksum }, summary)
    })
  });
  const run = Array.isArray(runs) ? runs[0] : null;
  if (!run || !run.id) throw new Error('Supabase did not return migration run id');

  const snapshots = await supabaseUserRequest('migration_source_snapshots', authorization, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      migration_run_id: run.id,
      organization_id: organizationId,
      source,
      source_created_at: backup.createdAt || null,
      key_count: summary.keyCount,
      checksum,
      raw_backup: backup
    })
  });
  const snapshot = Array.isArray(snapshots) ? snapshots[0] : null;
  if (!snapshot || !snapshot.id) throw new Error('Supabase did not return snapshot id');
  return { alreadyExists: false, snapshot, checksum, summary };
}

module.exports = { checksumBackup, backupSummary, saveRawSnapshot };
