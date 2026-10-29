<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '0');

const ACCOUNTS_EDGE_URL = 'https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-accounts';
const ACCOUNTS_ORIGIN = 'https://avitoboss.online';
const ACCOUNTS_MAX_INPUT = 16384;
const ACCOUNTS_MAX_RESPONSE = 131072;
const ACCOUNTS_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

function rejectAccounts(int $status, string $error = 'relay_unavailable'): void
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $error]);
    exit;
}

function accountsPrivateConfig(): array
{
    $root = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($root === false || !is_dir($root)) rejectAccounts(503, 'configuration');
    $requested = getenv('AVITO_RELAY_CONFIG');
    $path = ($requested !== false && $requested !== '')
        ? $requested : dirname($root) . DIRECTORY_SEPARATOR . '.avito-relay.php';
    if (!preg_match('~^(?:[a-z]:[\\\\/]|/)~i', $path)) rejectAccounts(503, 'configuration');
    $resolved = realpath($path);
    if ($resolved === false || !is_file($resolved) || !is_readable($resolved)) rejectAccounts(503, 'configuration');
    $compareRoot = rtrim(str_replace('\\', '/', $root), '/');
    $compareFile = str_replace('\\', '/', $resolved);
    if (DIRECTORY_SEPARATOR === '\\') {
        $compareRoot = strtolower($compareRoot);
        $compareFile = strtolower($compareFile);
    }
    if ($compareFile === $compareRoot || strpos($compareFile, $compareRoot . '/') === 0) rejectAccounts(503, 'configuration');
    ob_start();
    try { $config = require $resolved; }
    catch (Throwable $error) { ob_end_clean(); rejectAccounts(503, 'configuration'); }
    ob_end_clean();
    $secret = is_array($config) ? ($config['AVITO_RELAY_SECRET'] ?? null) : null;
    if (!is_string($secret) || !preg_match('/^[\x21-\x7e]{32,256}$/D', $secret)
        || strpos($secret, 'REPLACE_') === 0) rejectAccounts(503, 'configuration');
    return $config;
}

if (!in_array(strtolower((string) ($_SERVER['HTTPS'] ?? '')), ['on', '1'], true)) rejectAccounts(400, 'https_required');
if (!preg_match('/^avitoboss\.online(?::443)?$/iD', (string) ($_SERVER['HTTP_HOST'] ?? ''))) rejectAccounts(403, 'origin_rejected');
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && $origin !== ACCOUNTS_ORIGIN) rejectAccounts(403, 'origin_rejected');
if (strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') rejectAccounts(403, 'origin_rejected');

$uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
if (strlen($uri) > ACCOUNTS_MAX_INPUT || !preg_match('~^/(?!/)[^#\x00-\x20\x7f]*$~D', $uri)) rejectAccounts(400, 'invalid_request');
$parts = parse_url($uri);
if ($parts === false || isset($parts['host']) || isset($parts['scheme'])) rejectAccounts(400, 'invalid_request');
$path = $parts['path'] ?? '';
$base = '/api/integrations/avito-accounts';
$messenger = preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')/chats(?:/[A-Za-z0-9_-]{1,200}/(?:messages|read))?$~D', $path);
$biddingGet = preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')/bidding/(?:items(?:/[1-9][0-9]{0,15})?|groups|jobs)$~D', $path);
$biddingPost = preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')/bidding/(?:preview|apply|groups|queue-preview|queue-confirm|queue-cancel)$~D', $path);
$biddingList = $biddingGet && substr($path, -6) === '/items';
$biddingGroups = $biddingPost && substr($path, -7) === '/groups';
if ($biddingGet && preg_match('~/items/([1-9][0-9]{0,15})$~D', $path, $biddingItem)
    && strlen($biddingItem[1]) === 16 && strcmp($biddingItem[1], '9007199254740991') > 0) rejectAccounts(400, 'invalid_request');
$get = in_array($path, [$base . '/config', $base . '/context', $base . '/accounts', $base . '/preferences', $base . '/layout'], true)
    || preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')(?:/(?:profile|balance))?$~D', $path)
    || $messenger && substr($path, -5) !== '/read'
    || $biddingGet;
$post = in_array($path, [$base . '/accounts', $base . '/preferences', $base . '/layout'], true)
    || preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')/(?:reconnect|refresh|disconnect)$~D', $path)
    || $messenger && preg_match('~/(?:messages|read)$~D', $path)
    || $biddingPost;
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? '');
if (!$get && !$post) rejectAccounts(404, 'not_found');
if (!(($get && $method === 'GET') || ($post && $method === 'POST'))) rejectAccounts(405, 'method_not_allowed');

$query = (string) ($parts['query'] ?? '');
$biddingQuery = $method === 'GET' && $biddingList
    && preg_match('~^limit=99&offset=(?:0|[1-9][0-9]{0,4}|100000)(?:&statistics_days=(?:30|270))?&organization_id=(?i:' . ACCOUNTS_UUID . ')$~D', $query);
if ($method === 'GET' && $biddingGet && ($biddingList ? !$biddingQuery
    : !preg_match('~^organization_id=(?i:' . ACCOUNTS_UUID . ')$~D', $query))) rejectAccounts(400, 'invalid_request');
if ($query !== '') {
    $adsStatisticsQuery = $method === 'GET'
        && preg_match('~^' . $base . '/accounts/(?i:' . ACCOUNTS_UUID . ')$~D', $path)
        && preg_match('~^organization_id=(?i:' . ACCOUNTS_UUID . ')&ads_stats=1$~D', $query);
    $messengerQuery = $method === 'GET' && $messenger
        && preg_match('~^organization_id=(?i:' . ACCOUNTS_UUID . ')&limit=50&offset=(?:0|[1-9][0-9]{0,2}|1000)$~D', $query);
    if ($method !== 'GET' || $path === $base . '/config' || $path === $base . '/context'
        || !preg_match('~^organization_id=(' . ACCOUNTS_UUID . ')$~iD', $query) && !$adsStatisticsQuery && !$messengerQuery && !$biddingQuery) rejectAccounts(400, 'invalid_request');
}
$inputLimit = $method === 'POST' && $path === $base . '/layout' ? 65536 : ACCOUNTS_MAX_INPUT;
if ($method === 'POST' && $biddingGroups) $inputLimit = 24576;
if ($method === 'POST' && $biddingPost && substr($path, -14) === '/queue-preview') $inputLimit = 262144;
$input = file_get_contents('php://input', false, null, 0, $inputLimit + 1);
if ($input === false || strlen($input) > $inputLimit) rejectAccounts(413, 'request_too_large');
$body = null;
if ($method === 'POST') {
    if ($origin !== ACCOUNTS_ORIGIN) rejectAccounts(403, 'origin_rejected');
    if (!preg_match('~^application/json(?:\s*;\s*charset=utf-8)?$~iD', trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')))) rejectAccounts(415, 'invalid_request');
    $decoded = json_decode($input);
    if (json_last_error() !== JSON_ERROR_NONE || !is_object($decoded)) rejectAccounts(400, 'invalid_request');
} elseif ($input !== '') rejectAccounts(400, 'invalid_request');

$authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
if ($path !== $base . '/config' && $authorization === '') rejectAccounts(401, 'authentication_required');
if ($authorization !== '' && (strlen($authorization) > 4096 || !preg_match('/^Bearer [A-Za-z0-9._~+\/-]+=*$/iD', $authorization))) rejectAccounts(400, 'invalid_request');
if (!extension_loaded('curl') || !extension_loaded('openssl')) rejectAccounts(503, 'configuration');
$config = accountsPrivateConfig();
$secret = $config['AVITO_RELAY_SECRET'];

if ($method === 'POST') {
    // The Edge invocation sees ciphertext, not account credentials in a request body.
    $key = hash('sha256', 'avito-accounts-transport:v1:' . $secret, true);
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($input, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'POST:' . $path, 16);
    if ($ciphertext === false || strlen($tag) !== 16) rejectAccounts(503, 'configuration');
    $body = json_encode(['sealed' => ['v' => 1, 'iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'ciphertext' => base64_encode($ciphertext)]]);
    if ($body === false) rejectAccounts(400, 'invalid_request');
    unset($input, $decoded, $key, $ciphertext);
}
$timestamp = (string) time();
$signedPath = $path . ($query !== '' ? '?' . $query : '');
$proof = hash_hmac('sha256', $timestamp . "\n" . $method . "\n" . $signedPath . "\n"
    . hash('sha256', $body ?? '') . "\n" . $authorization, $secret);
$headers = ['Accept: application/json', 'Origin: ' . ACCOUNTS_ORIGIN,
    'x-avito-relay-timestamp: ' . $timestamp, 'x-avito-relay-secret: ' . $proof];
if ($authorization !== '') $headers[] = 'Authorization: ' . $authorization;
if ($body !== null) $headers[] = 'Content-Type: application/json';
$responseBody = '';
$responseLimit = $messenger ? 1048576 : ACCOUNTS_MAX_RESPONSE;
if ($biddingList) $responseLimit = 1048576;
$responseHeaders = [];
$headerBytes = 0;
$handle = curl_init(ACCOUNTS_EDGE_URL . $path . ($query !== '' ? '?' . $query : ''));
if ($handle === false) rejectAccounts(503);
curl_setopt_array($handle, [
    CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 90,
    CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
    CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_PROXY => '', CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$responseHeaders, &$headerBytes): int {
        $headerBytes += strlen($line);
        if ($headerBytes > ACCOUNTS_MAX_INPUT) return 0;
        if (preg_match('~^HTTP/[0-9.]+ ~', $line)) $responseHeaders = [];
        elseif (strpos($line, ':') !== false) {
            $entry = explode(':', rtrim($line, "\r\n"), 2);
            $responseHeaders[strtolower(trim($entry[0]))][] = trim($entry[1]);
        }
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
if ($ok === false || $status < 200 || $status > 599 || ($status >= 300 && $status < 400)
    || !empty($responseHeaders['location'])) rejectAccounts(502);
$types = $responseHeaders['content-type'] ?? [];
if (count($types) !== 1 || !preg_match('~^application/json(?:\s*;\s*charset=utf-8)?$~iD', $types[0])) rejectAccounts(502);
json_decode($responseBody);
if (json_last_error() !== JSON_ERROR_NONE) rejectAccounts(502);
http_response_code($status);
echo $responseBody;
