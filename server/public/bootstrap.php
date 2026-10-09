<?php
declare(strict_types=1);
// FASIH_CONFIG may point to an alternative config OUTSIDE the document root.
$configPath=getenv('FASIH_CONFIG') ?: dirname(__DIR__).'/private/config.php';
if(!is_file($configPath)){http_response_code(503);header('Content-Type: application/json');echo json_encode(['ok'=>false,'error'=>'Konfigurasi belum tersedia. Ikuti INSTALL.md dan buat private/config.php.']);exit;}
$config=require $configPath;
require_once dirname(__DIR__).'/private/Service.php';
require_once dirname(__DIR__).'/private/migrate.php';
require_once dirname(__DIR__).'/private/TerritoryService.php';
date_default_timezone_set('UTC');
$https=($_SERVER['HTTPS']??'')==='on'||($_SERVER['HTTPS']??'')==='1';
if(PHP_SAPI!=='cli'&&!$https&&!($config['allow_http']??false)){http_response_code(426);header('Content-Type: application/json');echo json_encode(['ok'=>false,'error'=>'Gunakan HTTPS untuk FULX.']);exit;}
header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
if($https)header('Strict-Transport-Security: max-age=31536000');
try{
    $db=new PDO($config['dsn'],$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    $db->exec("SET time_zone='+00:00'");$db->exec('SET SESSION innodb_lock_wait_timeout=10');
    migrateTerritories($db);$service=new TerritoryService($db,$config);
}catch(Throwable $e){http_response_code(503);header('Content-Type: application/json');echo json_encode(['ok'=>false,'error'=>'Database belum terhubung. Periksa konfigurasi hosting.']);exit;}
function jsonReply(mixed $value,int $status=200): never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;}
function startAdminSession(): void {
    global $https;
    session_name('fulx_admin');session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);
    ini_set('session.use_strict_mode','1');session_start();
}
