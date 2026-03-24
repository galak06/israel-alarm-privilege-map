<?php
/**
 * Proxy for Pikud HaOref per-city alert history.
 * Browsers can't call alerts-history.oref.org.il directly (no CORS headers).
 *
 * GET /api/oref-proxy.php?city=<hebrew city name>
 * Returns: { "alertCount": N, "notificationCount": N }
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

// Extract base city name before " - " / " – " district suffix
// e.g. "הרצליה - מרכז וגליל ים" → "הרצליה"
$parts    = preg_split('/\s+[-–]\s+/', $city, 2);
$baseCity = trim($parts[0]);

function fetchOrefCity($fromDate, $toDate, $cityName, &$debug = null) {
    $url = sprintf(
        'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx'
        . '?lang=he&mode=1&fromDate=%s&toDate=%s&city_0=%s',
        $fromDate,
        $toDate,
        rawurlencode($cityName)
    );

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => [
            'Referer: https://alerts-history.oref.org.il/',
            'X-Requested-With: XMLHttpRequest',
            'User-Agent: Mozilla/5.0 (compatible; oref-proxy/1.0)',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $body    = curl_exec($ch);
    $errno   = curl_errno($ch);
    $errmsg  = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($debug !== null) {
        $debug[] = ['url' => $url, 'http' => $httpCode, 'errno' => $errno, 'err' => $errmsg, 'body_len' => strlen($body ?: ''), 'body_preview' => substr($body ?: '', 0, 200)];
    }

    if ($body === false || trim($body) === '' || trim($body) === 'null') return [];
    $records = json_decode($body, true);
    return is_array($records) ? $records : [];
}

$debugMode = isset($_GET['debug']);
$debugLog  = $debugMode ? [] : null;

// Try full city name first; fall back to base name if empty
$records = fetchOrefCity($fromDate, $toDate, $city, $debugLog);
if (count($records) === 0 && $baseCity !== $city) {
    $records = fetchOrefCity($fromDate, $toDate, $baseCity, $debugLog);
}

if ($debugMode) {
    echo json_encode(['debug' => $debugLog, 'fromDate' => $fromDate, 'toDate' => $toDate, 'city' => $city, 'baseCity' => $baseCity, 'recordCount' => count($records)]);
    exit;
}

$alertEvents = [];
$notifEvents = [];

foreach ($records as $r) {
    $cat = $r['category'] ?? 0;
    $timeStr = $r['alertDate'] ?? ''; // e.g. "2024-03-24 16:09:00"
    if ($timeStr === '') continue;

    // Parse time to unix for de-duplication (1-minute window)
    $ts = strtotime($timeStr);
    $roundedTs = floor($ts / 60);

    // cat 1 = rockets, cat 2 = hostile aircraft, cat 3 = terrorist infiltration → real alarms
    // cat 13 = event ended (closure message, ignored to avoid double counting)
    // cat 14 = advance warning → notification
    if ($cat === 1 || $cat === 2 || $cat === 3) {
        $alertEvents[$roundedTs] = true;
    } elseif ($cat === 14) {
        $notifEvents[$roundedTs] = true;
    }
}

echo json_encode(['alertCount' => count($alertEvents), 'notificationCount' => count($notifEvents)]);
