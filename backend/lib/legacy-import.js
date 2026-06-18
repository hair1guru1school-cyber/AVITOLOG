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

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch (e) { return null; }
}

function unwrapKeyBackup(root) {
  const keys = object(root.keys);
  if (!Object.keys(keys).length) return root;
  const clients = parseJson(keys.avitolog_clients);
  const projects = parseJson(keys.avitolog_projects);
  return {
    source: root.format || root.source || 'avitolog-key-backup',
    clients: Array.isArray(clients) ? clients : [],
    projects: projects
  };
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

function itemLabel(item, index) {
  return text(item.company || item.company_name || item.name || item.title || item.contact_name || item.contactName) || ('Запись #' + (index + 1));
}

function duplicateGroups(items, keys) {
  const grouped = new Map();
  keys.forEach((key, index) => {
    const group = grouped.get(key) || [];
    group.push({ index, label: itemLabel(object(items[index]), index) });
    grouped.set(key, group);
  });
  return Array.from(grouped.entries())
    .filter((entry) => entry[1].length > 1)
    .slice(0, 20)
    .map((entry) => ({ legacyKey: entry[0], records: entry[1] }));
}

function findClients(root) {
  const candidates = [root.clients, root.crmClients, root.clientData, object(root.data).clients];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function findProjects(root) {
  const candidates = [root.projects, object(root.projects).projects, object(root.projectData).projects, object(root.projectsData).projects, object(root.data).projects];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function previewLegacyBackup(payload) {
  const original = object(payload);
  const root = unwrapKeyBackup(original);
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
    source: text(root.source) || text(original.format) || 'avitolog-local-backup',
    counts: { clients: clients.length, projects: projects.length },
    uniqueCounts: { clients: new Set(clientKeys).size, projects: new Set(projectKeys).size },
    duplicates: {
      clients: duplicateGroups(clients, clientKeys),
      projects: duplicateGroups(projects, projectKeys)
    },
    sampleKeys: { clients: clientKeys.slice(0, 3), projects: projectKeys.slice(0, 3) },
    warnings
  };
}

module.exports = { previewLegacyBackup, stableKey };
