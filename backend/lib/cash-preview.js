'use strict';

const crypto = require('crypto');

function number(value) {
  const clean = String(value == null ? '' : value).replace(/[^0-9,.-]/g, '').replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(value) {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : []; }
  catch (error) { return []; }
}

function monthFromKey(key) {
  const match = String(key || '').match(/(?:_month_|month_)([0-9]{4}-[0-9]{2})|_([0-9]{4}-[0-9]{2})(?:_|$)/i);
  return match ? (match[1] || match[2]) : null;
}

function summarizeRows(items) {
  const result = { rows: items.length, rowsWithPaid: 0, rowsWithExpected: 0, paid: 0, expected: 0, soldFor: 0, toAgent: 0, historyPayments: 0, historyAmount: 0, effectivePaid: 0 };
  items.forEach((item) => {
    const paid = number(item && item.paid);
    const expected = number(item && item.expected);
    const soldFor = number(item && item.soldFor);
    const toAgent = number(item && item.toAgent);
    const history = Array.isArray(item && item.paymentHistory) ? item.paymentHistory : [];
    const historyAmount = history.reduce((sum, payment) => sum + number(payment && payment.amount), 0);
    if (paid || soldFor) result.rowsWithPaid += 1;
    if (expected) result.rowsWithExpected += 1;
    result.paid += paid; result.expected += expected; result.soldFor += soldFor; result.toAgent += toAgent;
    result.historyPayments += history.length; result.historyAmount += historyAmount;
    result.effectivePaid += history.length ? historyAmount : (paid || soldFor);
  });
  return result;
}

function analyzeCashPreview(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  const datasets = Object.keys(keys)
    .filter((key) => /avitolog_assets_(my|sasha|base|projects)/i.test(key))
    .map((key) => {
      const items = rows(keys[key]);
      const month = monthFromKey(key);
      const role = /assets_base/i.test(key) ? 'catalog' : (/assets_sasha/i.test(key) ? 'sasha' : 'owner');
      return Object.assign({
        key, role, month, monthly: Boolean(month),
        fingerprint: crypto.createHash('sha256').update(String(keys[key] || '')).digest('hex').slice(0, 12)
      }, summarizeRows(items));
    });
  const fingerprintCounts = datasets.reduce((map, item) => { map[item.fingerprint] = (map[item.fingerprint] || 0) + 1; return map; }, {});
  datasets.forEach((item) => { item.exactDuplicateDataset = fingerprintCounts[item.fingerprint] > 1; });
  return {
    dryRun: true,
    rule: 'paymentHistory when present, otherwise paid/soldFor',
    datasets: datasets.sort((a, b) => String(a.month || '9999-99').localeCompare(String(b.month || '9999-99')) || a.key.localeCompare(b.key)),
    totals: {
      datasets: datasets.length,
      liveDatasets: datasets.filter((item) => !item.monthly).length,
      monthlyDatasets: datasets.filter((item) => item.monthly).length,
      exactDuplicateDatasets: datasets.filter((item) => item.exactDuplicateDataset).length
    }
  };
}

function isoDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function buildCashImportPlan(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  const sourceKeys = Object.keys(keys).filter((key) =>
    /^avitolog_assets_(my|sasha)_v2_month_\d{4}-\d{2}$/.test(key)
  ).sort();
  const entries = [];
  const events = [];
  sourceKeys.forEach((sourceKey) => {
    const ownerScope = sourceKey.indexOf('_sasha_') >= 0 ? 'sasha' : 'owner';
    const month = monthFromKey(sourceKey);
    rows(keys[sourceKey]).forEach((item, index) => {
      const legacyKey = crypto.createHash('sha256').update(sourceKey + ':' + index).digest('hex');
      const paid = number(item && item.paid);
      const soldFor = number(item && item.soldFor);
      const received = ownerScope === 'sasha' ? (soldFor || paid) : paid;
      const history = Array.isArray(item && item.paymentHistory) ? item.paymentHistory : [];
      const historyAmount = history.reduce((sum, payment) => sum + number(payment && payment.amount), 0);
      entries.push({
        legacy_key: legacyKey, source_key: sourceKey, record_index: index, owner_scope: ownerScope,
        ledger_month: month + '-01', name: String((item && item.name) || '').trim() || 'Без названия',
        received_amount: received, legacy_paid_amount: paid, expected_amount: number(item && item.expected),
        sold_for_amount: soldFor, to_agent_amount: number(item && item.toAgent), aoa_percent: number(item && item.aoaPercent),
        payment_date: isoDate(item && item.paymentDate), start_date: isoDate(item && item.startDate),
        client_type: String((item && item.clientType) || '').trim() || null,
        drive_folder_id: String((item && (item.crmClientId || item.folderId)) || '').trim() || null,
        drive_folder_url: String((item && item.folderLink) || '').trim() || null,
        details: item || {}
      });
      history.forEach((payment, paymentIndex) => {
        events.push({
          ledger_legacy_key: legacyKey, event_index: paymentIndex, event_type: ownerScope === 'sasha' ? 'client_payment' : 'received',
          occurred_on: isoDate(payment && payment.date), amount: number(payment && payment.amount), synthesized: false,
          details: payment || {}
        });
      });
      const difference = received - historyAmount;
      if (difference !== 0) {
        events.push({
          ledger_legacy_key: legacyKey, event_index: history.length, event_type: history.length ? 'legacy_balance' : (ownerScope === 'sasha' ? 'client_payment' : 'received'),
          occurred_on: isoDate(item && (item.paymentDate || item.startDate)), amount: difference, synthesized: true,
          details: { reason: history.length ? 'Monthly total minus known paymentHistory' : 'Legacy total without paymentHistory' }
        });
      }
    });
  });
  const byMonth = {};
  entries.forEach((entry) => {
    const month = entry.ledger_month.slice(0, 7);
    const row = byMonth[month] || { month, ownerReceived: 0, ownerExpected: 0, sashaSoldFor: 0, sashaToAgent: 0, entries: 0 };
    row.entries += 1;
    if (entry.owner_scope === 'owner') { row.ownerReceived += entry.received_amount; row.ownerExpected += entry.expected_amount; }
    else { row.sashaSoldFor += entry.sold_for_amount; row.sashaToAgent += entry.to_agent_amount; }
    byMonth[month] = row;
  });
  return {
    dryRun: true, sourceKeys, entries, events,
    summary: { entries: entries.length, paymentEvents: events.length, realPaymentEvents: events.filter((event) => !event.synthesized).length, balanceEvents: events.filter((event) => event.synthesized).length, months: Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month)) }
  };
}

module.exports = { analyzeCashPreview, buildCashImportPlan, summarizeRows, monthFromKey, number };
