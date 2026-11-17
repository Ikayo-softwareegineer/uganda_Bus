<?php
// Manual setup/reset helper. config.php already runs the schema automatically
// on first use, so this is only needed to re-run it by hand.
require __DIR__ . '/config.php';

initDatabase($pdo);

echo "Database initialized successfully.\n";
