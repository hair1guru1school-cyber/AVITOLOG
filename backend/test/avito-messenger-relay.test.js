'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../deploy/host0-avito');
const UUID = '24136436-1484-4e54-9da3-a5bfbf281515';
for (const [file, module, resource, constant] of [
  ['accounts', 'avito-accounts', 'accounts', 'ACCOUNTS'],
  ['invites', 'avito-invites', 'connections', 'INVITES']
]) {
  const relay = fs.readFileSync(path.join(root, file + '-relay.php'), 'utf8');
  const rules = fs.readFileSync(path.join(root, file + '.htaccess'), 'utf8');
  test(file + ' relay forwards only the explicit read-only messenger catalog flag and retains authorization', () => {
    const predicate = module === 'avito-accounts'
      ? "$messengerCatalogQuery = $method === 'GET' && in_array($path, [$base . '/accounts', $base . '/preferences'], true)"
      : "$messengerCatalogQuery = $method === 'GET' && $path === $base . '/connections'";
    assert.ok(relay.includes(predicate));
    assert.ok(relay.includes("&& preg_match('~^organization_id=(?i:' . " + constant + "_UUID . ')&messenger_access=1$~D', $query)"));
    assert.ok(relay.includes('&& !$biddingQuery && !$messengerCatalogQuery'));
    assert.ok(relay.includes("$authorization === ''"));
    assert.ok(relay.includes('x-avito-relay-secret:'));
    assert.ok(relay.includes("hash_hmac('sha256'"));
    const query = new RegExp('^organization_id=' + UUID + '&messenger_access=1$');
    assert.equal(query.test('organization_id=' + UUID + '&messenger_access=1'),true);
    for (const suffix of ['0','2','true','1&messenger_access=1','1&extra=1','1&ads_stats=1']) assert.equal(query.test('organization_id=' + UUID + '&messenger_access=' + suffix),false);
  });
  test(file + ' messenger relay preserves strict method, session and encrypted POST boundaries', () => {
    assert.ok(relay.includes("$messenger = preg_match('~^' . $base . '/" + resource + "/(?i:' . " + constant + "_UUID . ')/chats(?:/[A-Za-z0-9_-]{1,200}/(?:messages|read))?$~D', $path);"));
    assert.ok(relay.includes("|| $messenger && substr($path, -5) !== '/read'"));
    assert.ok(relay.includes("|| $messenger && preg_match('~/(?:messages|read)$~D', $path)"));
    assert.ok(relay.includes("$origin !== " + constant + "_ORIGIN"));
    assert.ok(relay.includes("$authorization === ''"));
    assert.match(relay, /openssl_encrypt\(\$input, 'aes-256-gcm'/);
    assert.match(relay, /'POST:' \. \$path/);
    assert.match(relay, /\$signedPath = \$path \. \(\$query !== '' \? '\?' \. \$query : ''\)/);
  });
  test(file + ' messenger response extension is isolated while old input/response limits and verified upstream remain unchanged', () => {
    assert.ok(relay.includes('const ' + constant + '_MAX_INPUT = 16384;'));
    assert.ok(relay.includes('const ' + constant + '_MAX_RESPONSE = 131072;'));
    assert.ok(relay.includes('$responseLimit = $messenger ? 1048576 : ' + constant + '_MAX_RESPONSE;'));
    assert.match(relay, /CURLOPT_WRITEFUNCTION => function \(\$curl, string \$chunk\) use \(&\$responseBody, \$responseLimit\)/);
    assert.match(relay, /strlen\(\$responseBody\) \+ strlen\(\$chunk\) > \$responseLimit/);
    assert.match(relay, /CURLOPT_FOLLOWLOCATION => false/);
    assert.match(relay, /CURLOPT_SSL_VERIFYPEER => true/);
    assert.match(relay, /CURLOPT_SSL_VERIFYHOST => 2/);
    assert.ok(relay.includes("$messengerQuery = $method === 'GET' && $messenger"));
    assert.match(relay, /&limit=50&offset=/);
  });
  test(file + ' messenger Apache routes cover only known account/chat paths and retain CGI Authorization before routing', () => {
    const rewrite = rules.split(/\r?\n/).filter(line => line.startsWith('RewriteRule ') && line.includes('/chats'));
    assert.equal(rewrite.length, 1, 'one explicit messenger rewrite is required, not a broad gateway fallback');
    const expression = rewrite[0].split(' ')[1], pattern = new RegExp(expression);
    const prefix = 'api/integrations/' + module + '/' + resource + '/' + UUID;
    for (const suffix of ['/chats', '/chats/chat_1/messages', '/chats/u2i-abc/read']) assert.equal(pattern.test(prefix + suffix), true, suffix);
    for (const suffix of ['/chats/chat_1/delete', '/chats/../messages', '/chats/%2f/messages', '/chats/chat_1/messages/extra', '/secrets']) assert.equal(pattern.test(prefix + suffix), false, suffix);
    assert.equal(pattern.test('api/other/' + UUID + '/chats'), false);
    assert.ok(rules.indexOf(' - [E=HTTP_AUTHORIZATION:%1]') < rules.indexOf(rewrite[0]));
    assert.ok(rewrite[0].endsWith('_avito-relay/' + file + '-relay.php [END]'));
  });
}
