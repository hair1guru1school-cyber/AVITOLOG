'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const contractSource = fs.readFileSync(path.join(root, 'js/contract-generator.js'), 'utf8');
const kpSource = fs.readFileSync(path.join(root, 'js/kp-generator.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

function sliceBetween(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing source boundaries: ${start}`);
  return source.slice(first, last);
}

function extractionHarness(ready) {
  const scripts = [];
  const window = {};
  if (ready) {
    window.pdfjsLib = { getDocument() {}, GlobalWorkerOptions: {} };
    window.Tesseract = { recognize() {} };
  }
  const context = vm.createContext({ window, document: {
    createElement: () => ({}), head: { appendChild: script => scripts.push(script) }
  }, Error });
  const extraction = sliceBetween(contractSource, '  function loadExtractionScriptFromList(', '  function extractTextFromPdfByOcr(');
  vm.runInContext('var PDFJS_CDNS = ["pdf-a", "pdf-b"]; var TESSERACT_CDNS = ["ocr-a"];' + extraction, context);
  return { context, window, scripts };
}

test('contract PDF/OCR extraction loaders retain their own callback signature', () => {
  const h = extractionHarness(true);
  let pdfResult;
  let ocrResult;
  h.context.getPdfJs((error, library) => { assert.equal(error, null); pdfResult = library; });
  h.context.getTesseract((error, library) => { assert.equal(error, null); ocrResult = library; });
  assert.equal(pdfResult, h.window.pdfjsLib);
  assert.equal(ocrResult, h.window.Tesseract);
  assert.match(h.window.pdfjsLib.GlobalWorkerOptions.workerSrc, /pdf\.worker/);
  assert.equal(h.scripts.length, 0);
  assert.equal((contractSource.match(/function loadScriptFromList\(/g) || []).length, 1);
});

test('contract extraction can load PDF library and reports exhausted OCR mirrors', () => {
  const h = extractionHarness(false);
  let pdfResult;
  let failure;
  h.context.getPdfJs((error, library) => { assert.equal(error, null); pdfResult = library; });
  assert.equal(h.scripts[0].src, 'pdf-a');
  h.window.pdfjsLib = { getDocument() {}, GlobalWorkerOptions: {} };
  h.scripts[0].onload();
  assert.equal(pdfResult, h.window.pdfjsLib);
  h.context.getTesseract(error => { failure = error; });
  h.scripts[1].onerror();
  assert.match(failure.message, /OCR/);
});

test('contract PDF renderer loader retains the separate errorText/callback signature', () => {
  const scripts = [];
  const window = {};
  const context = vm.createContext({ window, Error, document: {
    createElement: () => ({}), head: { appendChild: script => scripts.push(script) }
  } });
  vm.runInContext('var HTML2CANVAS_CDNS = ["canvas-a", "canvas-b"]; var JSPDF_CDNS = ["pdf-render"];' +
    sliceBetween(contractSource, '  function loadScriptFromList(', '  function renderContractForm('), context);
  let result;
  context.getPdfRenderDeps((error, canvas, Pdf) => { assert.equal(error, null); result = { canvas, Pdf }; });
  assert.equal(scripts[0].src, 'canvas-a');
  scripts[0].onerror();
  assert.equal(scripts[1].src, 'canvas-b');
  window.html2canvas = function canvas() {};
  scripts[1].onload();
  assert.equal(scripts[2].src, 'pdf-render');
  window.jspdf = { jsPDF: function Pdf() {} };
  scripts[2].onload();
  assert.equal(result.canvas, window.html2canvas);
  assert.equal(result.Pdf, window.jspdf.jsPDF);
});

function downloadHarness() {
  const timers = [];
  const revoked = [];
  const clicks = [];
  const body = {
    children: [],
    appendChild(anchor) { this.children.push(anchor); anchor.parentNode = this; },
    removeChild(anchor) { this.children.splice(this.children.indexOf(anchor), 1); anchor.parentNode = null; }
  };
  const document = { body, createElement: () => ({ click() { clicks.push(this); } }), getElementById: () => null };
  const context = vm.createContext({
    document, window: {}, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: value => revoked.push(value) },
    setTimeout: (fn, delay) => timers.push({ fn, delay })
  });
  return { context, timers, revoked, clicks, body };
}

test('contract download keeps the Blob URL alive for mobile browser consumption', () => {
  const h = downloadHarness();
  vm.runInContext(sliceBetween(contractSource, '    function triggerBlobDownload(', '    function setPdfDownloadReady('), h.context);
  h.context.triggerBlobDownload(new Blob(['pdf']), 'contract.pdf');
  assert.equal(h.clicks[0].download, 'contract.pdf');
  assert.equal(h.body.children.length, 1);
  assert.equal(h.revoked.length, 0);
  assert.equal(h.timers[0].delay, 60000);
  h.timers[0].fn();
  assert.deepEqual(h.revoked, ['blob:test']);
  assert.equal(h.body.children.length, 0);
});

test('contract local Word fallback also keeps its URL alive, without claiming a Drive save', async () => {
  const h = downloadHarness();
  Object.assign(h.context, {
    getTargetFolderCtx: () => null, lastGeneratedHtml: '<p>Contract</p>', lastGeneratedData: {},
    inlineExportImages: async value => value, buildWordMhtml: value => value
  });
  vm.runInContext(sliceBetween(contractSource, '    window.__contractSaveW = async function()', '    window.__contractSavePdf = async function()'), h.context);
  await h.context.window.__contractSaveW();
  assert.equal(h.clicks.length, 1);
  assert.equal(h.timers[0].delay, 60000);
  assert.equal(h.revoked.length, 0);
});

function pdfHarness(options = {}) {
  const render = { width: 0, height: 0 };
  const pages = [];
  const calls = [];
  const source = { style: {}, scrollHeight: options.height || 3369, getBoundingClientRect: () => ({ width: 794 }) };
  const host = { style: {}, querySelector: () => source };
  const body = { appendChild(node) { node.parentNode = this; }, removeChild(node) { node.parentNode = null; } };
  function Pdf() {
    this.addPage = () => {};
    this.addImage = () => { if (options.pdfError) throw new Error('PDF failed'); };
    this.output = () => new Blob(['pdf']);
  }
  const document = {
    body,
    createElement(tag) {
      if (tag !== 'canvas') return host;
      const page = {
        width: 0, height: 0,
        getContext: () => options.noContext ? null : { fillRect() {}, drawImage() {} },
        toDataURL: () => options.invalidCanvas ? 'data:,' : 'data:image/jpeg;base64,AQ=='
      };
      pages.push(page);
      return page;
    }
  };
  const context = vm.createContext({
    document, Promise, Blob, Error, Math, Number,
    waitForImagesLoaded: () => Promise.resolve(),
    getPdfRenderDeps: callback => callback(null, async (node, settings) => {
      calls.push(settings);
      render.width = options.emptyCanvas ? 0 : Math.floor(settings.width * settings.scale);
      render.height = options.emptyCanvas ? 0 : Math.floor(settings.height * settings.scale);
      return render;
    }, Pdf)
  });
  vm.runInContext(sliceBetween(contractSource, '    function contractPdfRenderScale(', '    var wrap = document.createElement('), context);
  return { context, calls, render, pages, host };
}

test('contract PDF scale keeps long documents within a bounded mobile canvas', () => {
  const h = pdfHarness();
  for (const height of [1123, 3369, 20000, 100000]) {
    const scale = h.context.contractPdfRenderScale(794, height);
    assert.ok(scale > 0 && scale <= 2);
    assert.ok(794 * height * scale * scale <= 4000000.01);
    assert.ok(height * scale <= 16384);
  }
});

test('contract PDF releases render and page canvases after success', async () => {
  const h = pdfHarness();
  const blob = await h.context.htmlToPdfBlob('<p>Contract</p>', 'contract.pdf');
  assert.ok(blob.size > 0);
  assert.ok(h.calls[0].scale < 2);
  assert.equal(h.host.parentNode, null);
  assert.equal(h.render.width, 0);
  assert.equal(h.render.height, 0);
  assert.ok(h.pages.length >= 3);
  assert.ok(h.pages.every(page => page.width === 0 && page.height === 0));
});

for (const scenario of ['noContext', 'emptyCanvas', 'invalidCanvas', 'pdfError']) {
  test(`contract PDF fails visibly and releases its render canvas: ${scenario}`, async () => {
    const h = pdfHarness({ [scenario]: true });
    await assert.rejects(h.context.htmlToPdfBlob('<p>Contract</p>', 'contract.pdf'));
    assert.equal(h.host.parentNode, null);
    assert.equal(h.render.width, 0);
    assert.equal(h.render.height, 0);
    assert.ok(h.pages.every(page => page.width === 0 && page.height === 0));
  });
}

function kpHarness(options = {}) {
  let client = { folderId: 'original-folder', company: 'Original client' };
  let identity = { id: 'user-a', email: 'a@example.test' };
  const uploads = [];
  const remembered = [];
  const window = {
    AVITOLOG_PROFILE_SASHA: false,
    __avitologBackendIdentity: () => identity,
    resolveWritableDriveFolder: options.resolve || (async () => 'personal-folder')
  };
  const context = vm.createContext({
    window, Date, JSON, Object, String, Error, Array, console,
    getKpActiveClient: () => client,
    cleanKpFilePart: value => value,
    compactSavedKpRecord: value => value,
    rememberSavedKpPackageData: (folder, record) => remembered.push({ folder, record }),
    rememberSavedKpAsEditorPreset() {},
    driveUploadBlob: async (...args) => {
      uploads.push(args);
      return options.upload ? options.upload(...args) : { id: 'file-id', webViewLink: 'https://drive.google.com/file/d/file-id/view' };
    }
  });
  vm.runInContext(sliceBetween(kpSource, '  function kpSaveScopeKey()', '  function compactSavedKpRecord('), context);
  return { context, window, uploads, remembered, setClient(value) { client = value; }, mutateClient(value) { Object.assign(client, value); }, setIdentity(value) { identity = value; } };
}

test('KP snapshots the client and package data and uses a writable personal folder', async () => {
  const gate = deferred();
  const h = kpHarness({ resolve: () => gate.promise });
  const packageData = { packages: [{ name: 'Original package' }] };
  const saving = h.window.__saveKpPngToActiveClient(new Blob(['png']), packageData);
  h.mutateClient({ folderId: 'other-folder', company: 'Other client' });
  packageData.packages[0].name = 'Other package';
  gate.resolve('personal-folder');
  const result = await saving;
  assert.equal(h.uploads[0][3], 'personal-folder');
  assert.match(h.uploads[0][0], /Original client/);
  assert.equal(h.remembered[0].folder, 'original-folder');
  assert.equal(result.packageData.folderId, 'personal-folder');
  assert.equal(result.packageData.packages[0].name, 'Original package');
  assert.equal(result.folderLink, 'https://drive.google.com/drive/folders/personal-folder');
  assert.equal(result.id, 'file-id');
});

test('KP rejects a stale target captured before the iframe finishes its PNG', async () => {
  const h = kpHarness();
  const target = h.window.__getKpSaveTarget();
  h.setClient({ id: 'different-client', folderId: 'different-folder', company: 'Different client' });
  await assert.rejects(h.window.__saveKpPngToActiveClient(new Blob(['png']), {}, target), /изменился/);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.remembered.length, 0);
});

test('KP accepts an unchanged target captured before PNG generation', async () => {
  const h = kpHarness();
  const result = await h.window.__saveKpPngToActiveClient(new Blob(['png']), {}, h.window.__getKpSaveTarget());
  assert.equal(result.id, 'file-id');
  assert.equal(h.uploads.length, 1);
});

for (const transition of ['identity', 'profile']) {
  test(`KP cancels before upload when ${transition} changes during folder lookup`, async () => {
    const gate = deferred();
    const h = kpHarness({ resolve: () => gate.promise });
    const saving = h.window.__saveKpPngToActiveClient(new Blob(['png']), {});
    if (transition === 'identity') h.setIdentity({ id: 'user-b', email: 'b@example.test' });
    else h.window.AVITOLOG_PROFILE_SASHA = true;
    gate.resolve('personal-folder');
    await assert.rejects(saving, /изменился/);
    assert.equal(h.uploads.length, 0);
    assert.equal(h.remembered.length, 0);
  });
}

test('KP does not write stale local metadata if the user changes during upload', async () => {
  const gate = deferred();
  const h = kpHarness({ upload: () => gate.promise });
  const saving = h.window.__saveKpPngToActiveClient(new Blob(['png']), {});
  await new Promise(resolve => setImmediate(resolve));
  h.setIdentity({ id: 'user-b', email: 'b@example.test' });
  gate.resolve({ id: 'file-id' });
  await assert.rejects(saving, /изменился/);
  assert.equal(h.remembered.length, 0);
});

test('KP only remembers a save after Google confirms a file ID', async () => {
  for (const result of [null, {}, { id: '' }, { id: ' ' }]) {
    const h = kpHarness({ upload: async () => result });
    await assert.rejects(h.window.__saveKpPngToActiveClient(new Blob(['png']), {}), /не подтвердил/);
    assert.equal(h.remembered.length, 0);
  }
});

test('CRM is marked only after a confirmed KP upload, using the captured client', async () => {
  const calls = [], h = kpHarness(); h.window.__goalsKpCreated = (...args) => calls.push(args);
  await h.window.__saveKpPngToActiveClient(new Blob(['png']), {});
  assert.equal(calls.length, 1); assert.equal(calls[0][0].folderId, 'original-folder'); assert.equal(calls[0][1], 'file-id');
  for (const reply of [null, {}, { id: '' }]) {
    const failed = kpHarness({ upload: async () => reply }); failed.window.__goalsKpCreated = (...args) => calls.push(args);
    await assert.rejects(failed.window.__saveKpPngToActiveClient(new Blob(['png']), {}));
  }
  assert.equal(calls.length, 1);
});

test('KP does not upload when the writable folder is unavailable', async () => {
  const h = kpHarness({ resolve: async () => '' });
  await assert.rejects(h.window.__saveKpPngToActiveClient(new Blob(['png']), {}), /папку/);
  assert.equal(h.uploads.length, 0);
});
