<?php
// Copy to config.php; this directory belongs OUTSIDE the public document root.
return [
    'dsn' => 'mysql:host=localhost;dbname=CPANELUSER_fasih;charset=utf8mb4',
    'db_user' => 'CPANELUSER_fasih',
    'db_password' => 'CHANGE_ME',
    'setup_key' => 'CHANGE_TO_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS',
    'allow_http' => false,
    'lease_seconds' => 300,
];
