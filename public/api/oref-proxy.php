<?php
/**
 * Proxy for Pikud HaOref per-city alert history.
 * Browsers can't call alerts-history.oref.org.il directly (no CORS headers),
 * so this server-side script fetches on their behalf.
 *
 * GET /api/oref-proxy.php?city=<hebrew city name>
 * Returns: { "alertCount": N, "notificationCount": N }
 *
 * Oref API uses granular neighborhood names (e.g. "שדרות, איבים") not city names,
 * so we fetch all records and filter by prefix match on the `data` field.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$city = trim($_GET['city'] ?? '');
if ($city === '') {
    http_response_code(400);
    echo json_encode(['error' => 'city parameter required']);
    exit;
}

$now       = new DateTime('now', new DateTimeZone('Asia/Jerusalem'));
$yesterday = new DateTime('-1 day', new DateTimeZone('Asia/Jerusalem'));
$toDate    = $now->format('d.m.Y');
$fromDate  = $yesterday->format('d.m.Y');

// Fetch all records (no city filter — Oref uses granular neighborhood names
// that don't match city-level names directly)
$url = sprintf(
    'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx'
    . '?lang=he&mode=1&fromDate=%s&toDate=%s',
    $fromDate,
    $toDate
);

$ctx = stream_context_create([
    'http' => [
        'method'  => 'GET',
        'header'  => implode("\r\n", [
            'Referer: https://alerts-history.oref.org.il/',
            'X-Requested-With: XMLHttpRequest',
            'User-Agent: Mozilla/5.0 (compatible; oref-proxy/1.0)',
        ]),
        'timeout' => 10,
        'ignore_errors' => true,
    ],
    'ssl' => ['verify_peer' => true],
]);

$body = @file_get_contents($url, false, $ctx);

if ($body === false || trim($body) === '' || trim($body) === 'null') {
    echo json_encode(['alertCount' => 0, 'notificationCount' => 0]);
    exit;
}

$records = json_decode($body, true);
if (!is_array($records)) {
    echo json_encode(['alertCount' => 0, 'notificationCount' => 0]);
    exit;
}

// Extract the base city name (before " - " or " – " district suffixes)
// e.g. "הרצליה - מרכז וגליל ים" → "הרצליה"
$baseCity = preg_split('/[\s]+[-–][\s]+/', $city)[0];

$alertCount        = 0;
$notificationCount = 0;

foreach ($records as $r) {
    $loc = $r['data'] ?? '';
    // Match if the location starts with the city name or base city name
    // e.g. city="שדרות" matches loc="שדרות, איבים"
    if (
        $loc === $city ||
        strpos($loc, $city . ',') === 0 ||
        strpos($loc, $city . ' ') === 0 ||
        $loc === $baseCity ||
        strpos($loc, $baseCity . ',') === 0 ||
        strpos($loc, $baseCity . ' ') === 0
    ) {
        $cat = $r['category'] ?? 0;
        if ($cat === 1 || $cat === 2 || $cat === 13) {
            $alertCount++;
        } elseif ($cat === 14) {
            $notificationCount++;
        }
    }
}

echo json_encode(['alertCount' => $alertCount, 'notificationCount' => $notificationCount]);
