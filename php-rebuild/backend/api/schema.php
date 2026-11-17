<?php
// Creates tables and adds columns introduced in later versions.
// Safe to run many times: every step checks before it changes anything.
function initDatabase(PDO $pdo)
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        distance_km INTEGER NOT NULL,
        duration TEXT NOT NULL,
        price_ugx INTEGER NOT NULL
    );');

    $pdo->exec('CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_number TEXT NOT NULL UNIQUE,
        model TEXT NOT NULL,
        total_seats INTEGER NOT NULL,
        operator_name TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        status TEXT DEFAULT "ACTIVE"
    );');

    $pdo->exec('CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL,
        vehicle_id INTEGER NOT NULL,
        departure_time TEXT NOT NULL,
        arrival_time TEXT NOT NULL,
        price_ugx INTEGER NOT NULL,
        available_seats INTEGER NOT NULL,
        status TEXT DEFAULT "SCHEDULED",
        FOREIGN KEY(route_id) REFERENCES routes(id),
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );');

    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT "CUSTOMER"
    );');

    $pdo->exec('CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT NOT NULL UNIQUE,
        user_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        trip_id INTEGER NOT NULL,
        seats TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        payment_status TEXT DEFAULT "PAID",
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(trip_id) REFERENCES trips(id)
    );');

    // Columns added after the first release (added to existing databases too)
    addColumnIfMissing($pdo, 'bookings', 'user_id', 'INTEGER REFERENCES users(id)');
    addColumnIfMissing($pdo, 'bookings', 'status', "TEXT NOT NULL DEFAULT 'CONFIRMED'");
    addColumnIfMissing($pdo, 'bookings', 'paid_at', 'TEXT');
    addColumnIfMissing($pdo, 'bookings', 'refunded_at', 'TEXT');
    addColumnIfMissing($pdo, 'routes', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
    addColumnIfMissing($pdo, 'vehicles', 'bus_type', "TEXT NOT NULL DEFAULT 'Standard'");
    addColumnIfMissing($pdo, 'users', 'blocked', 'INTEGER NOT NULL DEFAULT 0');
    // Version 3: per-passenger names, and ticket checks by staff at boarding
    addColumnIfMissing($pdo, 'bookings', 'passenger_names', 'TEXT');
    addColumnIfMissing($pdo, 'bookings', 'passenger_details', 'TEXT'); // JSON: seat, name, phone, email per traveller
    addColumnIfMissing($pdo, 'bookings', 'verified_at', 'TEXT');
    addColumnIfMissing($pdo, 'bookings', 'verified_by', 'INTEGER REFERENCES users(id)');

    $pdo->exec('CREATE TABLE IF NOT EXISTS admin_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        value INTEGER NOT NULL
    );');

    // Admin account row, so the admin session has a user id.
    // The login is checked against the configured administrator credentials.
    $insertAdmin = $pdo->prepare('INSERT OR IGNORE INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
    $insertAdmin->execute(['Admin', ADMIN_EMAIL, '', password_hash(ADMIN_PASSWORD, PASSWORD_DEFAULT), 'ADMIN']);

    refreshAdminStats($pdo);
}

function refreshAdminStats(PDO $pdo)
{
    $pdo->exec('DELETE FROM admin_stats');
    $pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Trips", (SELECT COUNT(*) FROM trips))');
    $pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Routes", (SELECT COUNT(*) FROM routes))');
    $pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Vehicles", (SELECT COUNT(*) FROM vehicles))');
    $pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Bookings", (SELECT COUNT(*) FROM bookings))');
}

function removeLegacyDemoData(PDO $pdo)
{
    $expectedRoutes = [];
    foreach ([
        ['Mbarara', 270, '4h 30m', 30000],
        ['Kabale', 410, '7h 00m', 45000],
        ['Fort Portal', 300, '5h 00m', 35000],
        ['Gulu', 335, '5h 30m', 40000],
        ['Jinja', 85, '2h 00m', 15000],
        ['Masaka', 130, '2h 30m', 20000]
    ] as [$town, $km, $duration, $fare]) {
        $expectedRoutes["Kampala|$town"] = [$km, $duration, $fare];
        $expectedRoutes["$town|Kampala"] = [$km, $duration, $fare];
    }

    $routeRows = $pdo->query('SELECT * FROM routes')->fetchAll();
    $seedRoutes = count($routeRows) === count($expectedRoutes);
    $routeIds = [];
    foreach ($routeRows as $route) {
        $key = $route['origin'] . '|' . $route['destination'];
        if (!isset($expectedRoutes[$key])
            || (int)$route['distance_km'] !== $expectedRoutes[$key][0]
            || $route['duration'] !== $expectedRoutes[$key][1]
            || (int)$route['price_ugx'] !== $expectedRoutes[$key][2]) {
            $seedRoutes = false;
            break;
        }
        $routeIds[$key] = (int)$route['id'];
    }

    $expectedVehicles = [
        'UBF 892K' => ['Scania Marcopolo G7 Luxury', 'Uganda Coach Express', 'Okello David'],
        'UBM 501M' => ['Isuzu FVR Royal Coach', 'Uganda Coach Express', 'Mukasa Ronald'],
        'UBA 104F' => ['Scania Touring HD', 'Global Coaches', 'Tumwesigye Alex'],
        'UBH 772T' => ['Mercedes-Benz Tourismo', 'Link Bus Services', 'Mugisha Brian'],
        'UBD 339L' => ['Yutong Grand Cruiser', 'YY Coaches', 'Opio Samuel']
    ];
    $vehicleRows = $pdo->query('SELECT * FROM vehicles')->fetchAll();
    $seedVehicles = count($vehicleRows) === count($expectedVehicles);
    $vehicleIds = [];
    foreach ($vehicleRows as $vehicle) {
        $plate = $vehicle['reg_number'];
        if (!isset($expectedVehicles[$plate])
            || $vehicle['model'] !== $expectedVehicles[$plate][0]
            || (int)$vehicle['total_seats'] !== 36
            || $vehicle['operator_name'] !== $expectedVehicles[$plate][1]
            || $vehicle['driver_name'] !== $expectedVehicles[$plate][2]) {
            $seedVehicles = false;
            break;
        }
        $vehicleIds[$plate] = (int)$vehicle['id'];
    }

    $bookings = $pdo->query('SELECT user_name, email, trip_id, seats, status FROM bookings')->fetchAll();
    $bookingsAreDemo = true;
    $demoBookedSeats = [];
    foreach ($bookings as $booking) {
        if (strcasecmp($booking['user_name'], 'Demo Passenger') !== 0
            || strtolower($booking['email']) !== 'passenger@ugandabus.com') {
            $bookingsAreDemo = false;
            continue;
        }
        if ($booking['status'] === 'CONFIRMED') {
            $demoBookedSeats[$booking['trip_id']] = ($demoBookedSeats[$booking['trip_id']] ?? 0)
                + count(array_filter(explode(',', (string)$booking['seats'])));
        }
    }

    $tripRows = $pdo->query('
        SELECT t.*, r.origin, r.destination, r.distance_km, r.price_ugx AS route_price,
               v.reg_number, v.total_seats
        FROM trips t
        JOIN routes r ON r.id = t.route_id
        JOIN vehicles v ON v.id = t.vehicle_id
    ')->fetchAll();
    $totalTrips = (int)$pdo->query('SELECT COUNT(*) FROM trips')->fetchColumn();
    $seedTrips = $totalTrips === 252
        && count($tripRows) === 252
        && count($routeIds) === count($expectedRoutes)
        && count($vehicleIds) === count($expectedVehicles)
        && $seedRoutes
        && $seedVehicles;
    $tripKeys = [];
    $tripsPerDate = [];
    $departureTimes = ['06:00', '10:30', '16:00'];
    foreach ($tripRows as $trip) {
        $routeKey = $trip['origin'] . '|' . $trip['destination'];
        $departureDate = substr($trip['departure_time'], 0, 10);
        $departureTime = substr($trip['departure_time'], 11, 5);
        $tripKey = $departureDate . '|' . $routeKey . '|' . $departureTime;
        $expectedArrival = (new DateTime($trip['departure_time']))
            ->modify('+' . (int)$trip['distance_km'] . ' minutes')
            ->format('Y-m-d H:i:s');
        if (!isset($expectedRoutes[$routeKey])
            || !isset($expectedVehicles[$trip['reg_number']])
            || !isset($routeIds[$routeKey])
            || !isset($vehicleIds[$trip['reg_number']])
            || !in_array($departureTime, $departureTimes, true)
            || isset($tripKeys[$tripKey])
            || $trip['arrival_time'] !== $expectedArrival
            || (int)$trip['price_ugx'] !== (int)$trip['route_price']
            || (int)$trip['available_seats'] !== (int)$trip['total_seats'] - ($demoBookedSeats[$trip['id']] ?? 0)
            || $trip['status'] !== 'SCHEDULED') {
            $seedTrips = false;
            break;
        }
        $tripKeys[$tripKey] = true;
        $tripsPerDate[$departureDate] = ($tripsPerDate[$departureDate] ?? 0) + 1;
    }
    if (count($tripKeys) !== 252 || count($tripsPerDate) !== 7) {
        $seedTrips = false;
    }
    foreach ($tripsPerDate as $count) {
        if ($count !== 36) {
            $seedTrips = false;
            break;
        }
    }

    $knownUsers = [
        'admin@ugandabus.com',
        'passenger@ugandabus.com',
        'staff@ugandabus.com',
        ADMIN_EMAIL
    ];
    $usersAreDemo = true;
    foreach ($pdo->query('SELECT email FROM users')->fetchAll() as $user) {
        if (!in_array(strtolower($user['email']), $knownUsers, true)) {
            $usersAreDemo = false;
            break;
        }
    }

    if ($seedRoutes && $seedVehicles && $seedTrips && $usersAreDemo && $bookingsAreDemo) {
        $pdo->exec('DELETE FROM bookings');
        $pdo->exec('DELETE FROM trips');
        $pdo->exec('DELETE FROM routes');
        $pdo->exec('DELETE FROM vehicles');
    } else {
        $releaseSeats = $pdo->prepare('
            UPDATE trips
            SET available_seats = MIN(
                available_seats + ?,
                (SELECT total_seats FROM vehicles WHERE vehicles.id = trips.vehicle_id)
            )
            WHERE id = ?
        ');
        foreach ($bookings as $booking) {
            if (strcasecmp($booking['user_name'], 'Demo Passenger') === 0
                && strtolower($booking['email']) === 'passenger@ugandabus.com'
                && $booking['status'] === 'CONFIRMED') {
                $seatCount = count(array_filter(explode(',', (string)$booking['seats'])));
                $releaseSeats->execute([$seatCount, $booking['trip_id']]);
            }
        }
        $pdo->exec("DELETE FROM bookings WHERE LOWER(user_name) = 'demo passenger' AND LOWER(email) = 'passenger@ugandabus.com'");
    }

    $pdo->exec("
        UPDATE bookings SET user_id = NULL
        WHERE user_id IN (SELECT id FROM users WHERE LOWER(email) IN (
            'admin@ugandabus.com', 'passenger@ugandabus.com', 'staff@ugandabus.com'
        ))
    ");
    $pdo->exec("
        UPDATE bookings SET verified_by = NULL
        WHERE verified_by IN (SELECT id FROM users WHERE LOWER(email) IN (
            'admin@ugandabus.com', 'passenger@ugandabus.com', 'staff@ugandabus.com'
        ))
    ");
    $pdo->exec("
        DELETE FROM users WHERE LOWER(email) IN (
            'admin@ugandabus.com', 'passenger@ugandabus.com', 'staff@ugandabus.com'
        )
    ");
}

function addColumnIfMissing(PDO $pdo, $table, $column, $definition)
{
    $columns = array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(), 'name');
    if (!in_array($column, $columns)) {
        $pdo->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    }
}
