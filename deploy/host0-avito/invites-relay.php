<?php
declare(strict_types=1);
ini_set('display_errors', '0');
ini_set('log_errors', '0');

const INVITES_EDGE_URL = 'https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-invites';
const INVITES_ORIGIN = 'https://avitoboss.online';
const INVITES_MAX_INPUT = 16384;
const INVITES_MAX_RESPONSE = 131072;
const INVITES_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const INVITES_COOKIE = '__Host-avito_invite_browser';

header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');
$invitesCallbackRequest = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) === '/oauth/avito/callback';

function rejectInvites(int $status, string $error = 'relay_unavailable'): void
{
    if (($GLOBALS['invitesCallbackRequest'] ?? false) === true) finishInviteCallback('failed');
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $error]);
    exit;
}
function clearInviteCookie(): void
{
    header('Set-Cookie: ' . INVITES_COOKIE . '=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax', true);
}
function finishInviteCallback(string $status): void
{
    clearInviteCookie();
    header('Location: ' . INVITES_ORIGIN . '/integrations/avito-connect/?status=' . $status, true, 303);
    exit;
}
function invitesModuleConfig(string $root, array $config): array
{
    $path = dirname($root) . DIRECTORY_SEPARATOR . '.avito-invites-config.php';
    if (!file_exists($path) && !is_link($path)) return $config;
    $resolved = realpath($path);
    if ($resolved === false || !is_file($resolved) || !is_readable($resolved)) rejectInvites(503, 'configuration');
    $compareRoot = rtrim(str_replace('\\', '/', $root), '/');
    $compareFile = str_replace('\\', '/', $resolved);
    if (DIRECTORY_SEPARATOR === '\\') { $compareRoot = strtolower($compareRoot); $compareFile = strtolower($compareFile); }
    if ($compareFile === $compareRoot || strpos($compareFile, $compareRoot . '/') === 0) rejectInvites(503, 'configuration');
    ob_start();
    try { $settings = require $resolved; }
    catch (Throwable $error) { ob_end_clean(); rejectInvites(503, 'configuration'); }
    ob_end_clean();
    $keys = ['AVITO_INVITES_ENABLED', 'AVITO_INVITES_CALLBACK_MODE', 'AVITO_INVITES_MANAGED_LOGS_ACCEPTED'];
    $allowedKeys = ['AVITO_INVITES_ENABLED', 'AVITO_INVITES_CALLBACK_MODE', 'AVITO_INVITES_MANAGED_LOGS_ACCEPTED', 'AVITO_INVITES_REG_LOGS_ACCEPTED'];
    if (!is_array($settings) || array_diff($keys, array_keys($settings)) || array_diff(array_keys($settings), $allowedKeys)
        || !in_array($settings['AVITO_INVITES_ENABLED'] ?? null, ['0', '1'], true)
        || !in_array($settings['AVITO_INVITES_CALLBACK_MODE'] ?? null, ['relay', 'supabase'], true)
        || !is_bool($settings['AVITO_INVITES_MANAGED_LOGS_ACCEPTED'] ?? null)
        || (array_key_exists('AVITO_INVITES_REG_LOGS_ACCEPTED', $settings) && !is_bool($settings['AVITO_INVITES_REG_LOGS_ACCEPTED']))) rejectInvites(503, 'configuration');
    foreach ($keys as $key) $config[$key] = $settings[$key];
    $config['AVITO_INVITES_REG_LOGS_ACCEPTED'] = $settings['AVITO_INVITES_REG_LOGS_ACCEPTED'] ?? false;
    return $config;
}
function invitesPrivateConfig(): array
{
    $root = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($root === false || !is_dir($root)) rejectInvites(503, 'configuration');
    $requested = getenv('AVITO_RELAY_CONFIG');
    $path = ($requested !== false && $requested !== '') ? $requested : dirname($root) . DIRECTORY_SEPARATOR . '.avito-relay.php';
    if (!preg_match('~^(?:[a-z]:[\\\\/]|/)~i', $path)) rejectInvites(503, 'configuration');
    $resolved = realpath($path);
    if ($resolved === false || !is_file($resolved) || !is_readable($resolved)) rejectInvites(503, 'configuration');
    $compareRoot = rtrim(str_replace('\\', '/', $root), '/');
    $compareFile = str_replace('\\', '/', $resolved);
    if (DIRECTORY_SEPARATOR === '\\') { $compareRoot = strtolower($compareRoot); $compareFile = strtolower($compareFile); }
    if ($compareFile === $compareRoot || strpos($compareFile, $compareRoot . '/') === 0) rejectInvites(503, 'configuration');
    ob_start();
    try { $config = require $resolved; }
    catch (Throwable $error) { ob_end_clean(); rejectInvites(503, 'configuration'); }
    ob_end_clean();
    $secret = is_array($config) ? ($config['AVITO_RELAY_SECRET'] ?? null) : null;
    if (!is_string($secret) || !preg_match('/^[\x21-\x7e]{32,256}$/D', $secret) || strpos($secret, 'REPLACE_') === 0) rejectInvites(503, 'configuration');
    if (isset($config['AVITO_INVITES_EDGE_URL']) && $config['AVITO_INVITES_EDGE_URL'] !== INVITES_EDGE_URL) rejectInvites(503, 'configuration');
    return invitesModuleConfig($root, $config);
}
set_exception_handler(function (Throwable $error): void { rejectInvites(503, 'relay_unavailable'); });

if (!in_array(strtolower((string) ($_SERVER['HTTPS'] ?? '')), ['on', '1'], true)) rejectInvites(400, 'https_required');
if (!preg_match('/^avitoboss\.online(?::443)?$/iD', (string) ($_SERVER['HTTP_HOST'] ?? ''))) rejectInvites(403, 'origin_rejected');
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
if (strlen($uri) > INVITES_MAX_INPUT || !preg_match('~^/(?!/)[^#\x00-\x20\x7f]*$~D', $uri)) rejectInvites(400, 'invalid_request');
$parts = parse_url($uri);
if ($parts === false || isset($parts['host']) || isset($parts['scheme'])) rejectInvites(400, 'invalid_request');
$path = $parts['path'] ?? '';
$callback = $path === '/oauth/avito/callback';
$base = '/api/integrations/avito-invites';
$query = (string) ($parts['query'] ?? '');
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? '');
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$authorization = '';
$input = '';
$messenger = false;

if ($callback) {
    clearInviteCookie();
    if ($method !== 'GET') rejectInvites(405, 'method_not_allowed');
    $cookie = $_COOKIE[INVITES_COOKIE] ?? null;
    if (!is_string($cookie) || !preg_match('/^[a-f0-9]{64}$/D', $cookie)) finishInviteCallback('failed');
    $values = [];
    foreach (explode('&', $query) as $part) {
        $entry = explode('=', $part, 2);
        if (count($entry) !== 2) finishInviteCallback('failed');
        $key = rawurldecode($entry[0]);
        if (!in_array($key, ['state', 'code', 'error', 'error_description'], true) || isset($values[$key])) finishInviteCallback('failed');
        $value = rawurldecode($entry[1]);
        if ($value === '' || strlen($value) > 2048 || preg_match('/[\x00-\x1f\x7f]/', $value) || preg_match('/\x20/', $value) && $key !== 'error_description') finishInviteCallback('failed');
        $values[$key] = $value;
    }
    if (!isset($values['state']) || !preg_match('/^[a-f0-9]{64}$/D', $values['state']) || isset($values['code']) === isset($values['error'])) finishInviteCallback('failed');
    $payload = ['state' => $values['state'], 'browser' => $cookie];
    if (isset($values['code'])) $payload['code'] = $values['code'];
    else $payload['error'] = preg_match('/^[a-z_]{1,80}$/D', $values['error']) ? $values['error'] : 'access_denied';
    $input = json_encode($payload);
    if ($input === false) finishInviteCallback('failed');
    unset($values, $payload, $cookie);
    $path = $base . '/callback';
    $query = '';
    $method = 'POST';
} else {
    if ($origin !== '' && $origin !== INVITES_ORIGIN || strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') rejectInvites(403, 'origin_rejected');
    $messenger = preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')/chats(?:/[A-Za-z0-9_-]{1,200}/(?:messages|read))?$~D', $path);
    $biddingGet = preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')/bidding/(?:items(?:/[1-9][0-9]{0,15})?|groups|jobs)$~D', $path);
    $biddingPost = preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')/bidding/(?:preview|apply|groups|queue-preview|queue-confirm|queue-cancel)$~D', $path);
    $biddingList = $biddingGet && substr($path, -6) === '/items';
    $biddingGroups = $biddingPost && substr($path, -7) === '/groups';
    if ($biddingGet && preg_match('~/items/([1-9][0-9]{0,15})$~D', $path, $biddingItem)
        && strlen($biddingItem[1]) === 16 && strcmp($biddingItem[1], '9007199254740991') > 0) rejectInvites(400, 'invalid_request');
    $get = in_array($path, [$base . '/config', $base . '/context', $base . '/connections', $base . '/invitations'], true)
        || preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')$~D', $path)
        || $messenger && substr($path, -5) !== '/read'
        || $biddingGet;
    $post = in_array($path, [$base . '/begin', $base . '/invitations'], true)
        || preg_match('~^' . $base . '/invitations/(?i:' . INVITES_UUID . ')/revoke$~D', $path)
        || preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')/(?:refresh|disconnect)$~D', $path)
        || $messenger && preg_match('~/(?:messages|read)$~D', $path)
        || $biddingPost;
    if (!$get && !$post) rejectInvites(404, 'not_found');
    if (!(($get && $method === 'GET') || ($post && $method === 'POST'))) rejectInvites(405, 'method_not_allowed');
    $biddingQuery = $method === 'GET' && $biddingList
        && preg_match('~^limit=99&offset=(?:0|[1-9][0-9]{0,4}|100000)(?:&statistics_days=(?:30|270))?&organization_id=(?i:' . INVITES_UUID . ')$~D', $query);
    if ($method === 'GET' && $biddingGet && ($biddingList ? !$biddingQuery
        : !preg_match('~^organization_id=(?i:' . INVITES_UUID . ')$~D', $query))) rejectInvites(400, 'invalid_request');
    $adsStatisticsQuery = $method === 'GET'
        && preg_match('~^' . $base . '/connections/(?i:' . INVITES_UUID . ')$~D', $path)
        && preg_match('~^organization_id=(?i:' . INVITES_UUID . ')&ads_stats=1$~D', $query);
    $messengerQuery = $method === 'GET' && $messenger
        && preg_match('~^organization_id=(?i:' . INVITES_UUID . ')&limit=50&offset=(?:0|[1-9][0-9]{0,2}|1000)$~D', $query);
    if ($query !== '' && ($method !== 'GET' || in_array($path, [$base . '/config', $base . '/context'], true) || !preg_match('~^organization_id=(' . INVITES_UUID . ')$~iD', $query) && !$adsStatisticsQuery && !$messengerQuery && !$biddingQuery)) rejectInvites(400, 'invalid_request');
    $inputLimit = $method === 'POST' && $biddingGroups ? 24576 : INVITES_MAX_INPUT;
    if ($method === 'POST' && $biddingPost && substr($path, -14) === '/queue-preview') $inputLimit = 262144;
    $input = file_get_contents('php://input', false, null, 0, $inputLimit + 1);
    if ($input === false || strlen($input) > $inputLimit) rejectInvites(413, 'request_too_large');
    if ($method === 'POST') {
        if ($origin !== INVITES_ORIGIN) rejectInvites(403, 'origin_rejected');
        if (!preg_match('~^application/json(?:\s*;\s*charset=utf-8)?$~iD', trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')))) rejectInvites(415, 'invalid_request');
        $decoded = json_decode($input);
        if (json_last_error() !== JSON_ERROR_NONE || !is_object($decoded)) rejectInvites(400, 'invalid_request');
        if ($path === $base . '/begin' && (count(get_object_vars($decoded)) !== 1 || !isset($decoded->invite) || !is_string($decoded->invite) || !preg_match('/^[a-f0-9]{64}$/D', $decoded->invite))) rejectInvites(400, 'invalid_request');
    } elseif ($input !== '') rejectInvites(400, 'invalid_request');
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    if (!in_array($path, [$base . '/config', $base . '/begin'], true) && $authorization === '') rejectInvites(401, 'authentication_required');
    if ($authorization !== '' && (strlen($authorization) > 4096 || !preg_match('/^Bearer [A-Za-z0-9._~+\/-]+=*$/iD', $authorization))) rejectInvites(400, 'invalid_request');
}
$config = invitesPrivateConfig();
$callbackMode = $config['AVITO_INVITES_CALLBACK_MODE'] ?? 'relay';
$loggingAccepted = $callbackMode === 'supabase'
    ? ($config['AVITO_INVITES_MANAGED_LOGS_ACCEPTED'] ?? false) === true
    : $callbackMode === 'relay' && (($config['AVITO_INVITES_CALLBACK_LOGGING_CONFIRMED'] ?? false) === true
        || ($config['AVITO_INVITES_REG_LOGS_ACCEPTED'] ?? false) === true);
$enabled = ($config['AVITO_INVITES_ENABLED'] ?? '0') === '1' && $loggingAccepted;
if (!$enabled) {
    if ($callback) finishInviteCallback('failed');
    if ($path === $base . '/config') { echo json_encode(['ok' => true, 'configuration' => ['enabled' => false, 'ready' => false]]); exit; }
    rejectInvites(503, 'integration_disabled');
}
if ($callbackMode === 'supabase' && ($callback || $path === $base . '/begin')) rejectInvites(404, 'not_found');
if (!extension_loaded('curl') || !extension_loaded('openssl')) rejectInvites(503, 'configuration');
$secret = $config['AVITO_RELAY_SECRET'];
$body = null;
if ($method === 'POST') {
    $key = hash('sha256', 'avito-invites-transport:v1:' . $secret, true);
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($input, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'POST:' . $path, 16);
    if ($ciphertext === false || strlen($tag) !== 16) rejectInvites(503, 'configuration');
    $body = json_encode(['sealed' => ['v' => 1, 'iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'ciphertext' => base64_encode($ciphertext)]]);
    if ($body === false) rejectInvites(400, 'invalid_request');
    unset($input, $decoded, $key, $ciphertext);
}
$timestamp = (string) time();
$signedPath = $path . ($query !== '' ? '?' . $query : '');
$proof = hash_hmac('sha256', $timestamp . "\n" . $method . "\n" . $signedPath . "\n" . hash('sha256', $body ?? '') . "\n" . $authorization, $secret);
$headers = ['Accept: application/json', 'Origin: ' . INVITES_ORIGIN, 'x-avito-relay-timestamp: ' . $timestamp, 'x-avito-relay-secret: ' . $proof];
if ($authorization !== '') $headers[] = 'Authorization: ' . $authorization;
if ($body !== null) $headers[] = 'Content-Type: application/json';
$responseBody = '';
$responseLimit = $messenger ? 1048576 : INVITES_MAX_RESPONSE;
if ($biddingList) $responseLimit = 1048576;
$responseHeaders = [];
$headerBytes = 0;
$handle = curl_init(INVITES_EDGE_URL . $path . ($query !== '' ? '?' . $query : ''));
if ($handle === false) rejectInvites(503);
curl_setopt_array($handle, [
    CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 90,
    CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
    CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_PROXY => '', CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$responseHeaders, &$headerBytes): int {
        $headerBytes += strlen($line);
        if ($headerBytes > INVITES_MAX_INPUT) return 0;
        if (preg_match('~^HTTP/[0-9.]+ ~', $line)) $responseHeaders = [];
        elseif (strpos($line, ':') !== false) { $entry = explode(':', rtrim($line, "\r\n"), 2); $responseHeaders[strtolower(trim($entry[0]))][] = trim($entry[1]); }
        return strlen($line);
    },
    CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$responseBody, $responseLimit): int {
        if (strlen($responseBody) + strlen($chunk) > $responseLimit) return 0;
        $responseBody .= $chunk;
        return strlen($chunk);
    }
]);
if ($body !== null) curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
$ok = curl_exec($handle);
$status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
curl_close($handle);
if ($ok === false || $status < 200 || $status > 599 || ($status >= 300 && $status < 400) || !empty($responseHeaders['location'])) rejectInvites(502);
$types = $responseHeaders['content-type'] ?? [];
if (count($types) !== 1 || !preg_match('~^application/json(?:\s*;\s*charset=utf-8)?$~iD', $types[0])) rejectInvites(502);
$response = json_decode($responseBody, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($response)) rejectInvites(502);
if ($callback) finishInviteCallback($status >= 200 && $status < 300 && ($response['ok'] ?? false) === true && ($response['status'] ?? '') === 'connected' ? 'connected' : (in_array(($response['error'] ?? ''), ['access_denied', 'denied'], true) ? 'cancelled' : 'failed'));
// CDN cookies belong to the upstream domain and must never be forwarded to this site.
$cookies = array_values(array_filter($responseHeaders['set-cookie'] ?? [], function (string $cookie): bool {
    return strpos($cookie, INVITES_COOKIE . '=') === 0;
}));
if ($path === $base . '/begin' && $status >= 200 && $status < 300) {
    if (count($cookies) !== 1 || !preg_match('/^__Host-avito_invite_browser=[a-f0-9]{64}; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Lax$/D', $cookies[0])) rejectInvites(502);
    header('Set-Cookie: ' . $cookies[0], false);
} elseif ($cookies) rejectInvites(502);
http_response_code($status);
echo $responseBody;
