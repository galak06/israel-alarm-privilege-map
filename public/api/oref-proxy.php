<?php
/**
 * Proxy for Pikud HaOref per-city alert history.
 * Browsers can't call alerts-history.oref.org.il directly (no CORS headers).
 *
 * GET /api/oref-proxy.php?city=<hebrew city name>
 * Returns: { "alertCount": N, "notificationCount": N }
 *
 * Strategy: query with city_0=<name> twice (full name, then base name)
 * and union the results to cover all sub-districts.
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

// Extract base city name (before " - " / " – " district suffix)
// e.g. "הרצליה - מרכז וגליל ים" → "הרצליה"
$parts    = preg_split('/\s+[-–]\s+/', $city, 2);
$baseCity = trim($parts[0]);

function fetchOrefCity($fromDate, $toDate, $cityName) {
    $url = sprintf(
        'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx'
        . '?lang=he&mode=1&fromDate=%s&toDate=%s&city_0=%s',
        $fromDate,
        $toDate,
        rawurlencode($cityName)
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
    if ($body === false || trim($body) === '' || trim($body) === 'null') return [];
    $records = json_decode($body, true);
    return is_array($records) ? $records : [];
}

// Fetch with full name (e.g. "הרצליה - מרכז וגליל ים")
$records = fetchOrefCity($fromDate, $toDate, $city);

// If empty and base differs, also fetch with base name (e.g. "הרצליה")
// to catch sibling districts
if (count($records) === 0 && $baseCity !== $city) {
    $records = fetchOrefCity($fromDate, $toDate, $baseCity);
}

$alertCount        = 0;
$notificationCount = 0;

foreach ($records as $r) {
    $cat = $r['category'] ?? 0;
    if ($cat === 1 || $cat === 2 || $cat === 13) {
        $alertCount++;
    } elseif ($cat === 14) {
        $notificationCount++;
    }
}

echo json_encode(['alertCount' => $alertCount, 'notificationCount' => $notificationCount]);
