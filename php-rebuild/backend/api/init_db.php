<?php
require __DIR__ . '/config.php';

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

// Link each booking to the user who made it (added for existing databases too)
$bookingColumns = array_column($pdo->query('PRAGMA table_info(bookings)')->fetchAll(), 'name');
if (!in_array('user_id', $bookingColumns)) {
    $pdo->exec('ALTER TABLE bookings ADD COLUMN user_id INTEGER REFERENCES users(id)');
}

$pdo->exec('CREATE TABLE IF NOT EXISTS admin_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    value INTEGER NOT NULL
);');

$countRoutes = $pdo->query('SELECT COUNT(*) AS count FROM routes')->fetch()['count'];
if ($countRoutes == 0) {
    $routes = [
        ['Kampala', 'Mbarara', 290, '5h 30m', 28000],
        ['Kampala', 'Gulu', 380, '7h 15m', 36000],
        ['Kampala', 'Jinja', 80, '2h 00m', 16000],
        ['Kampala', 'Fort Portal', 260, '5h 00m', 26000],
        ['Mbarara', 'Kabale', 180, '4h 15m', 22000],
        ['Gulu', 'Lira', 120, '2h 45m', 18000]
    ];

    $insertRoute = $pdo->prepare('INSERT INTO routes (origin, destination, distance_km, duration, price_ugx) VALUES (?, ?, ?, ?, ?)');
    foreach ($routes as $route) {
        $insertRoute->execute($route);
    }
}

$countVehicles = $pdo->query('SELECT COUNT(*) AS count FROM vehicles')->fetch()['count'];
if ($countVehicles == 0) {
    $vehicles = [
        ['UBB-1001', 'Coaster', 20, 'Great Link', 'John Kato'],
        ['UBB-1002', 'Hiace', 16, 'Roadmaster', 'David Ssebulime'],
        ['UBB-1003', 'Skyline', 30, 'Pearl Travel', 'Samuel Okello'],
        ['UBB-1004', 'Volvo', 22, 'Bus Uganda', 'Moses Tumusiime']
    ];

    $insertVehicle = $pdo->prepare('INSERT INTO vehicles (reg_number, model, total_seats, operator_name, driver_name) VALUES (?, ?, ?, ?, ?)');
    foreach ($vehicles as $vehicle) {
        $insertVehicle->execute($vehicle);
    }
}

$countTrips = $pdo->query('SELECT COUNT(*) AS count FROM trips')->fetch()['count'];
if ($countTrips == 0) {
    $routes = $pdo->query('SELECT * FROM routes')->fetchAll();
    $vehicles = $pdo->query('SELECT * FROM vehicles')->fetchAll();
    $today = new DateTime();

    $insertTrip = $pdo->prepare('INSERT INTO trips (route_id, vehicle_id, departure_time, arrival_time, price_ugx, available_seats, status) VALUES (?, ?, ?, ?, ?, ?, ?)');

    // One trip per route per day, for the next 7 days (today included)
    for ($day = 0; $day < 7; $day++) {
        foreach ($routes as $index => $route) {
            $vehicle = $vehicles[$index % count($vehicles)];
            $dep = (clone $today)->modify('+' . $day . ' day')->setTime(7 + ($index % 4), 30);
            $arr = (clone $dep)->modify('+' . round($route['distance_km'] / 55 * 60) . ' minutes'); // ~55 km/h average

            $insertTrip->execute([
                $route['id'],
                $vehicle['id'],
                $dep->format('Y-m-d H:i:s'),
                $arr->format('Y-m-d H:i:s'),
                $route['price_ugx'],
                $vehicle['total_seats'],
                'SCHEDULED'
            ]);
        }
    }
}

// Default admin account (password is stored hashed, never as plain text)
$insertAdmin = $pdo->prepare('INSERT OR IGNORE INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
$insertAdmin->execute(['Admin', 'admin@ugandabus.com', '', password_hash('Admin@123', PASSWORD_DEFAULT), 'ADMIN']);

$pdo->exec('DELETE FROM admin_stats');
$pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Trips", (SELECT COUNT(*) FROM trips))');
$pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Routes", (SELECT COUNT(*) FROM routes))');
$pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Vehicles", (SELECT COUNT(*) FROM vehicles))');
$pdo->exec('INSERT INTO admin_stats (label, value) VALUES ("Bookings", (SELECT COUNT(*) FROM bookings))');

echo "Database initialized successfully.\n";
