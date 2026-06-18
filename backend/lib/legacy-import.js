'use strict';

const crypto = require('crypto');

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function stableKey(kind, item, index) {
  const explicit = text(item.id || item.clientId || item.projectId || item.folderId || item.crmClientId);
  if (explicit) return kind + ':' + explicit;
  const fingerprint = JSON.stringify([
    text(item.company || item.company_name || item.name || item.title),
    text(item.contact_name || item.contactName || item.phone),
    Number(index) || 0
  ]);
  return kind + ':sha256:' + crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
}

function findClients(root) {
  const candidates = [root.clients, root.crmClients, root.clientData, object(root.data).clients];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function findProjects(root) {
  const candidates = [root.projects, object(root.projectData).projects, object(root.projectsData).projects, object(root.data).projects];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function previewLegacyBackup(payload) {
  const root = object(payload);
  if (!Object.keys(root).length) throw new Error('Backup must be a JSON object');
  const clients = findClients(root);
  const projects = findProjects(root);
  const clientKeys = clients.map((item, index) => stableKey('client', object(item), index));
  const projectKeys = projects.map((item, index) => stableKey('project', object(item), index));
  const warnings = [];
  if (!clients.length) warnings.push('No client array was recognized');
  if (!projects.length) warnings.push('No project array was recognized');
  const duplicateClientKeys = clientKeys.filter((key, index) => clientKeys.indexOf(key) !== index);
  const duplicateProjectKeys = projectKeys.filter((key, index) => projectKeys.indexOf(key) !== index);
  if (duplicateClientKeys.length) warnings.push('Duplicate client legacy keys: ' + new Set(duplicateClientKeys).size);
  if (duplicateProjectKeys.length) warnings.push('Duplicate project legacy keys: ' + new Set(duplicateProjectKeys).size);
  return {
    dryRun: true,
    source: text(root.source) || 'avitolog-local-backup',
    counts: { clients: clients.length, projects: projects.length },
    sampleKeys: { clients: clientKeys.slice(0, 3), projects: projectKeys.slice(0, 3) },
    warnings
  };
}

module.exports = { previewLegacyBackup, stableKey };
