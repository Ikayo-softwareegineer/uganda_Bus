<?php
require __DIR__ . '/config.php';

function rpcResponse($id, array $body, $status = 200)
{
    jsonResponse(array_merge(['jsonrpc' => '2.0'], $body, ['id' => $id]), $status);
}

function rpcError($id, $code, $message, $status = 200)
{
    rpcResponse($id, ['error' => ['code' => $code, 'message' => $message]], $status);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    rpcError(null, -32600, 'RPC requests must use POST', 405);
}

$request = json_decode(file_get_contents('php://input'));
if (json_last_error() !== JSON_ERROR_NONE) {
    rpcError(null, -32700, 'Invalid JSON payload', 400);
}

if (
    !($request instanceof stdClass)
    || ($request->jsonrpc ?? null) !== '2.0'
    || !isset($request->method)
    || !is_string($request->method)
    || $request->method === ''
    || (property_exists($request, 'id') && !is_string($request->id) && !is_int($request->id) && $request->id !== null)
) {
    rpcError(null, -32600, 'Invalid JSON-RPC request', 400);
}

$id = $request->id ?? null;
$params = $request->params ?? new stdClass();
if (!($params instanceof stdClass)) {
    rpcError($id, -32602, 'Parameters must be a JSON object');
}

try {
    if ($request->method === 'getTrips') {
        foreach (['origin', 'destination', 'date'] as $stringParam) {
            if (isset($params->$stringParam) && !is_string($params->$stringParam)) {
                rpcError($id, -32602, ucfirst($stringParam) . ' must be a string');
            }
        }
        $origin = trim((string)($params->origin ?? ''));
        $destination = trim((string)($params->destination ?? ''));
        $date = trim((string)($params->date ?? ''));
        $passengers = filter_var($params->passengers ?? 1, FILTER_VALIDATE_INT);

        if ($passengers === false || $passengers < 1) {
            rpcError($id, -32602, 'Passengers must be a positive whole number');
        }
        if ($date !== '') {
            $parsedDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
            if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date) {
                rpcError($id, -32602, 'Date must use YYYY-MM-DD format');
            }
        }
        if ($origin !== '' && $destination !== '' && strtolower($origin) === strtolower($destination)) {
            rpcError($id, -32602, 'Origin and destination cannot be the same');
        }

        $sql = "
            SELECT t.*, r.origin, r.destination, r.distance_km, r.duration, r.price_ugx AS route_price,
                   v.id AS vehicle_id, v.reg_number, v.model, v.total_seats, v.operator_name, v.driver_name
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            JOIN vehicles v ON v.id = t.vehicle_id
            WHERE t.available_seats >= :passengers
              AND t.status = 'SCHEDULED'
              AND r.status = 'ACTIVE'
              AND DATE(t.departure_time) >= DATE('now', 'localtime')
        ";
        $queryParams = [':passengers' => $passengers];

        if ($origin !== '') {
            $sql .= ' AND r.origin = :origin ';
            $queryParams[':origin'] = $origin;
        }
        if ($destination !== '') {
            $sql .= ' AND r.destination = :destination ';
            $queryParams[':destination'] = $destination;
        }
        if ($date !== '') {
            $sql .= ' AND DATE(t.departure_time) = :date ';
            $queryParams[':date'] = $date;
        } else {
            $sql .= " AND t.departure_time >= DATETIME('now', 'localtime') ";
        }

        $sql .= ' ORDER BY t.departure_time ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($queryParams);
        $trips = $stmt->fetchAll();

        rpcResponse($id, ['result' => ['count' => count($trips), 'trips' => $trips]]);
    }

    if ($request->method === 'getSeats') {
        $tripId = filter_var($params->tripId ?? null, FILTER_VALIDATE_INT);
        if ($tripId === false || $tripId === null || $tripId < 1) {
            rpcError($id, -32602, 'A valid tripId is required');
        }

        $stmt = $pdo->prepare('
            SELECT t.*, r.origin, r.destination, r.distance_km, r.duration,
                   v.reg_number, v.model, v.total_seats, v.operator_name, v.driver_name
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            JOIN vehicles v ON v.id = t.vehicle_id
            WHERE t.id = ?
        ');
        $stmt->execute([$tripId]);
        $trip = $stmt->fetch();

        if (!$trip) {
            rpcError($id, -32004, 'Trip not found');
        }

        $seatsStmt = $pdo->prepare("SELECT seats FROM bookings WHERE trip_id = ? AND status = 'CONFIRMED'");
        $seatsStmt->execute([$tripId]);
        $bookedSeats = [];
        foreach ($seatsStmt->fetchAll() as $row) {
            $bookedSeats = array_merge($bookedSeats, array_filter(explode(',', $row['seats'])));
        }
        $trip['booked_seats'] = array_values(array_unique($bookedSeats));

        rpcResponse($id, ['result' => ['trip' => $trip]]);
    }

    rpcError($id, -32601, 'Method not found');
} catch (PDOException $error) {
    error_log('RPC database error: ' . $error->getMessage());
    rpcError($id, -32603, 'Unable to complete the RPC request', 500);
}
