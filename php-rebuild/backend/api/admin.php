<?php
// Admin dashboard API
//   GET  -> everything the dashboard shows (routes, buses, trips, bookings, passengers)
//   POST -> one change, e.g. {"action": "saveTrip", ...}
require __DIR__ . '/config.php';

requireLogin('admin');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    jsonResponse([
        'success' => true,
        'routes' => $pdo->query('SELECT * FROM routes ORDER BY origin, destination')->fetchAll(),
        'buses' => $pdo->query('SELECT * FROM vehicles ORDER BY id')->fetchAll(),
        'trips' => $pdo->query('
            SELECT t.*, r.origin, r.destination, v.reg_number, v.operator_name, v.total_seats
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            JOIN vehicles v ON v.id = t.vehicle_id
            ORDER BY t.departure_time
        ')->fetchAll(),
        'bookings' => $pdo->query('
            SELECT b.*, r.origin, r.destination, t.departure_time, v.operator_name
            FROM bookings b
            JOIN trips t ON t.id = b.trip_id
            JOIN routes r ON r.id = t.route_id
            JOIN vehicles v ON v.id = t.vehicle_id
            ORDER BY b.id DESC
        ')->fetchAll(),
        'passengers' => $pdo->query("
            SELECT id, name, email, phone, blocked
            FROM users
            WHERE UPPER(role) <> 'ADMIN'
            ORDER BY name
        ")->fetchAll()
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
}

// ---------- helpers ----------

function fail($message, $status = 400)
{
    global $pdo;
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(['success' => false, 'message' => $message], $status);
}

function ok($message)
{
    global $pdo;
    if ($pdo->inTransaction()) {
        $pdo->commit();
    }
    jsonResponse(['success' => true, 'message' => $message]);
}

function field($data, $key)
{
    return trim((string)($data[$key] ?? ''));
}

function findRow($table, $column, $value)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM $table WHERE $column = ?");
    $stmt->execute([$value]);
    return $stmt->fetch();
}

function countSeats($seats)
{
    return count(array_filter(explode(',', (string)$seats)));
}

// Seats held by confirmed bookings on a trip
function bookedSeatCount($tripId)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT seats FROM bookings WHERE trip_id = ? AND status = 'CONFIRMED'");
    $stmt->execute([$tripId]);
    $total = 0;
    foreach ($stmt->fetchAll() as $row) {
        $total += countSeats($row['seats']);
    }
    return $total;
}

function parseDateTime($value)
{
    $date = DateTime::createFromFormat('Y-m-d\TH:i', $value) ?: DateTime::createFromFormat('Y-m-d H:i:s', $value);
    return $date ?: null;
}

// Cancels a confirmed booking and puts its seats back on sale
function releaseBooking($booking)
{
    global $pdo;
    $pdo->prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?")->execute([$booking['id']]);
    $pdo->prepare('UPDATE trips SET available_seats = available_seats + ? WHERE id = ?')
        ->execute([countSeats($booking['seats']), $booking['trip_id']]);
}

$data = readJsonBody();
$action = $data['action'] ?? '';
$id = (int)($data['id'] ?? 0);
$ref = field($data, 'ref');

$pdo->beginTransaction();

switch ($action) {

    // ---------- routes ----------

    case 'saveRoute':
        $origin = field($data, 'origin');
        $destination = field($data, 'destination');
        $distance = (int)($data['distanceKm'] ?? 0);
        $duration = field($data, 'duration');
        $price = (int)($data['price'] ?? 0);
        $status = field($data, 'status');

        $town = "/^[A-Za-z][A-Za-z\\s'-]*$/";
        if (!preg_match($town, $origin) || !preg_match($town, $destination)) fail('Town names should contain letters only.');
        if (strcasecmp($origin, $destination) === 0) fail('Origin and destination must be different.');
        if ($distance < 1) fail('Enter the distance in kilometres.');
        if ($duration === '') fail('Enter the usual journey time, e.g. 5h 30m.');
        if ($price < 1000) fail('Default fare must be at least UGX 1,000.');
        if (!in_array($status, ['ACTIVE', 'INACTIVE'])) fail('Invalid status.');

        $dup = $pdo->prepare('SELECT id FROM routes WHERE LOWER(origin) = LOWER(?) AND LOWER(destination) = LOWER(?) AND id <> ?');
        $dup->execute([$origin, $destination, $id]);
        if ($dup->fetch()) fail('This route already exists.');

        if ($id) {
            $route = findRow('routes', 'id', $id) ?: fail('Route not found.', 404);
            $townsChanged = $route['origin'] !== $origin || $route['destination'] !== $destination;
            if ($townsChanged && findRow('trips', 'route_id', $id)) fail('This route has trips, so its towns cannot change.');
            $pdo->prepare('UPDATE routes SET origin = ?, destination = ?, distance_km = ?, duration = ?, price_ugx = ?, status = ? WHERE id = ?')
                ->execute([$origin, $destination, $distance, $duration, $price, $status, $id]);
            ok('Route updated.');
        }
        $pdo->prepare('INSERT INTO routes (origin, destination, distance_km, duration, price_ugx, status) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$origin, $destination, $distance, $duration, $price, $status]);
        ok('Route added.');

    case 'deleteRoute':
        if (findRow('trips', 'route_id', $id)) fail('This route has trips. Delete them first, or set the route to Inactive.', 409);
        $pdo->prepare('DELETE FROM routes WHERE id = ?')->execute([$id]);
        ok('Route deleted.');

    // ---------- buses ----------

    case 'saveBus':
        $plate = strtoupper(preg_replace('/\s+/', ' ', field($data, 'plate')));
        $operator = field($data, 'operator');
        $model = field($data, 'model');
        $type = field($data, 'type');
        $capacity = (int)($data['capacity'] ?? 0);
        $driver = field($data, 'driver');
        $status = field($data, 'status');

        if (!preg_match('/^[A-Z]{2,3}[\s-]?\d{3,4}[A-Z]?$/', $plate)) fail('Enter a valid number plate, e.g. UBA 123K.');
        if ($operator === '') fail('Enter the operator name.');
        if ($model === '') fail('Enter the bus make or model.');
        if (!in_array($type, ['Standard', 'Executive', 'VIP'])) fail('Invalid bus class.');
        if ($capacity < 4 || $capacity > 90) fail('Capacity must be between 4 and 90 seats.');
        if (!in_array($status, ['ACTIVE', 'MAINTENANCE', 'RETIRED'])) fail('Invalid status.');

        $dup = $pdo->prepare('SELECT id FROM vehicles WHERE reg_number = ? AND id <> ?');
        $dup->execute([$plate, $id]);
        if ($dup->fetch()) fail('A bus with this plate already exists.');

        if ($id) {
            findRow('vehicles', 'id', $id) ?: fail('Bus not found.', 404);
            $trips = $pdo->prepare('SELECT id FROM trips WHERE vehicle_id = ?');
            $trips->execute([$id]);
            foreach ($trips->fetchAll() as $trip) {
                $booked = bookedSeatCount($trip['id']);
                if ($capacity < $booked) fail("Trip {$trip['id']} already has $booked seats booked on this bus.");
                $pdo->prepare('UPDATE trips SET available_seats = ? WHERE id = ?')->execute([$capacity - $booked, $trip['id']]);
            }
            $pdo->prepare('UPDATE vehicles SET reg_number = ?, operator_name = ?, model = ?, bus_type = ?, total_seats = ?, driver_name = ?, status = ? WHERE id = ?')
                ->execute([$plate, $operator, $model, $type, $capacity, $driver, $status, $id]);
            ok('Bus updated.');
        }
        $pdo->prepare('INSERT INTO vehicles (reg_number, operator_name, model, bus_type, total_seats, driver_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$plate, $operator, $model, $type, $capacity, $driver, $status]);
        ok('Bus added to the fleet.');

    case 'deleteBus':
        if (findRow('trips', 'vehicle_id', $id)) fail('This bus is assigned to trips. Reassign or delete them first, or mark the bus as Retired.', 409);
        $pdo->prepare('DELETE FROM vehicles WHERE id = ?')->execute([$id]);
        ok('Bus removed.');

    // ---------- trips ----------

    case 'saveTrip':
        $trip = $id ? (findRow('trips', 'id', $id) ?: fail('Trip not found.', 404)) : null;
        $route = findRow('routes', 'id', (int)($data['routeId'] ?? 0)) ?: fail('Choose a route.');
        $bus = findRow('vehicles', 'id', (int)($data['busId'] ?? 0)) ?: fail('Choose a bus.');
        $departure = parseDateTime(field($data, 'departureTime'));
        $arrival = parseDateTime(field($data, 'arrivalTime'));
        $price = (int)($data['price'] ?? 0);
        $status = field($data, 'status');

        if ($route['status'] !== 'ACTIVE' && (!$trip || (int)$trip['route_id'] !== (int)$route['id'])) fail('That route is inactive.');
        if ($bus['status'] !== 'ACTIVE' && (!$trip || (int)$trip['vehicle_id'] !== (int)$bus['id'])) fail('That bus is not in service.');
        if (!$departure || !$arrival) fail('Enter departure and arrival times.');
        if ($arrival <= $departure) fail('Arrival must be after departure.');
        if ($price < 1000) fail('Fare must be at least UGX 1,000.');
        if (!in_array($status, ['SCHEDULED', 'CANCELLED'])) fail('Invalid status.');

        $dep = $departure->format('Y-m-d H:i:s');
        $arr = $arrival->format('Y-m-d H:i:s');

        if ($status === 'SCHEDULED') {
            $clash = $pdo->prepare("SELECT id FROM trips WHERE vehicle_id = ? AND id <> ? AND status = 'SCHEDULED' AND departure_time < ? AND arrival_time > ?");
            $clash->execute([$bus['id'], $id, $arr, $dep]);
            if ($other = $clash->fetch()) fail("{$bus['reg_number']} is already on trip {$other['id']} at that time.");
        }

        $booked = $trip ? bookedSeatCount($id) : 0;
        if ($bus['total_seats'] < $booked) fail("This trip already has $booked seats booked; that bus only has {$bus['total_seats']}.");
        $available = $bus['total_seats'] - $booked;

        if ($trip) {
            $pdo->prepare('UPDATE trips SET route_id = ?, vehicle_id = ?, departure_time = ?, arrival_time = ?, price_ugx = ?, available_seats = ?, status = ? WHERE id = ?')
                ->execute([$route['id'], $bus['id'], $dep, $arr, $price, $available, $status, $id]);
            ok("Trip $id updated.");
        }
        $pdo->prepare('INSERT INTO trips (route_id, vehicle_id, departure_time, arrival_time, price_ugx, available_seats, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$route['id'], $bus['id'], $dep, $arr, $price, $available, $status]);
        ok('Trip added. It is now visible to passengers.');

    case 'deleteTrip':
        if (findRow('bookings', 'trip_id', $id)) fail('This trip has bookings, so it cannot be deleted. Edit it and set the status to Cancelled instead.', 409);
        $pdo->prepare('DELETE FROM trips WHERE id = ?')->execute([$id]);
        ok("Trip $id deleted.");

    // ---------- bookings & payments ----------

    case 'cancelBooking':
        $booking = findRow('bookings', 'booking_ref', $ref) ?: fail('Booking not found.', 404);
        if ($booking['status'] !== 'CONFIRMED') fail('This booking is already cancelled.');
        releaseBooking($booking);
        ok($booking['payment_status'] === 'PAID' ? "Booking $ref cancelled. Refund it from Payments." : "Booking $ref cancelled.");

    case 'deleteBooking':
        $booking = findRow('bookings', 'booking_ref', $ref) ?: fail('Booking not found.', 404);
        if ($booking['status'] !== 'CANCELLED') fail('Cancel the booking before deleting it.');
        $pdo->prepare('DELETE FROM bookings WHERE id = ?')->execute([$booking['id']]);
        ok("Booking $ref deleted.");

    case 'markPaid':
        $booking = findRow('bookings', 'booking_ref', $ref) ?: fail('Booking not found.', 404);
        if ($booking['payment_status'] !== 'PAY_AT_STATION' || $booking['status'] !== 'CONFIRMED') fail('This booking has no pending payment.');
        $pdo->prepare("UPDATE bookings SET payment_status = 'PAID', paid_at = ? WHERE id = ?")->execute([gmdate('Y-m-d H:i:s'), $booking['id']]);
        ok("Payment for $ref recorded.");

    case 'refund':
        $booking = findRow('bookings', 'booking_ref', $ref) ?: fail('Booking not found.', 404);
        if ($booking['payment_status'] !== 'PAID') fail('Only paid bookings can be refunded.');
        $pdo->prepare("UPDATE bookings SET payment_status = 'REFUNDED', refunded_at = ? WHERE id = ?")->execute([gmdate('Y-m-d H:i:s'), $booking['id']]);
        if ($booking['status'] === 'CONFIRMED') {
            releaseBooking($booking);
        }
        ok("Refund for $ref recorded.");

    // ---------- passengers ----------

    case 'savePassenger':
        $name = field($data, 'name');
        $email = strtolower(field($data, 'email'));
        $phone = field($data, 'phone');
        $password = field($data, 'password');

        if (!preg_match("/^[A-Za-z][A-Za-z\\s'.-]*$/", $name)) fail('Enter a valid name (letters only).');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
        if ($phone !== '' && !preg_match('/^\+?[\d\s-]{9,15}$/', $phone)) fail('Enter a valid phone number.');
        if ($email === ADMIN_EMAIL) fail('Another account already uses this email.');

        $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
        $dup->execute([$email, $id]);
        if ($dup->fetch()) fail('Another account already uses this email.');
        if ((!$id || $password !== '') && strlen($password) < 6) fail('Password must be at least 6 characters.');

        if ($id) {
            $user = findRow('users', 'id', $id);
            if (!$user || strtoupper($user['role']) === 'ADMIN') fail('Passenger not found.', 404);
            $pdo->prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?')->execute([$name, $email, $phone, $id]);
            if ($password !== '') {
                $pdo->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
            }
            ok('Passenger updated.');
        }
        $pdo->prepare("INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'CUSTOMER')")
            ->execute([$name, $email, $phone, password_hash($password, PASSWORD_DEFAULT)]);
        ok('Passenger added.');

    case 'togglePassenger':
        $user = findRow('users', 'id', $id);
        if (!$user || strtoupper($user['role']) === 'ADMIN') fail('Passenger not found.', 404);
        $blocked = $user['blocked'] ? 0 : 1;
        $pdo->prepare('UPDATE users SET blocked = ? WHERE id = ?')->execute([$blocked, $id]);
        ok($blocked ? "{$user['name']} has been blocked from logging in." : "{$user['name']} has been unblocked.");

    case 'deletePassenger':
        $user = findRow('users', 'id', $id);
        if (!$user || strtoupper($user['role']) === 'ADMIN') fail('Passenger not found.', 404);
        // Keep their bookings for the records, just unlink them from the account
        $pdo->prepare('UPDATE bookings SET user_id = NULL WHERE user_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        ok('Passenger account deleted.');

    default:
        fail('Unknown action.');
}
