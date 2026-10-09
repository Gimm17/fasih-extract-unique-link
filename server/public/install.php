<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$installed=false;
try{$installed=(int)$db->query('SELECT COUNT(*) FROM admins')->fetchColumn()>0;}catch(PDOException $e){}
if($installed){http_response_code(410);header('Content-Type: text/plain; charset=utf-8');exit('FULX sudah terpasang. Installer terkunci. Buka dashboard.');}
$notice='';
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    try{
        $key=(string)($config['setup_key']??'');
        if(strlen($key)<32||str_contains($key,'CHANGE_')||!hash_equals($key,(string)($_POST['setup_key']??'')))throw new RuntimeException('Setup key salah atau belum diganti di config.php.');
        $name=trim((string)($_POST['username']??''));$password=(string)($_POST['password']??'');
        if(!preg_match('/^[a-zA-Z0-9_.-]{3,100}$/',$name)||strlen($password)<12)throw new RuntimeException('Username minimal 3 karakter; password minimal 12 karakter.');
        $sql=file_get_contents(dirname(__DIR__).'/private/schema.sql');foreach(explode(';',$sql) as $statement)if(trim($statement)!=='')$db->exec($statement);
        if((int)$db->query("SELECT GET_LOCK('fulx_initial_admin',10)")->fetchColumn()!==1)throw new RuntimeException('Pemasangan lain sedang berjalan. Coba lagi sebentar.');
        try{
            if((int)$db->query('SELECT COUNT(*) FROM admins')->fetchColumn()>0)throw new RuntimeException('Installer sudah digunakan.');
            $q=$db->prepare('INSERT INTO admins(username,password_hash,created_at) VALUES(?,?,UTC_TIMESTAMP(6))');$q->execute([$name,password_hash($password,PASSWORD_DEFAULT)]);
        }finally{$db->query("SELECT RELEASE_LOCK('fulx_initial_admin')")->fetchColumn();}
        header('Location: index.html');exit;
    }catch(Throwable $e){$notice=$e instanceof PDOException?'Database belum siap; periksa hak akses CREATE/ALTER dan log hosting.':$e->getMessage();}
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pasang FULX</title><link rel="stylesheet" href="dashboard.css"></head><body><main class="login-card"><div class="eyebrow">FULX · PEMASANGAN</div><h1>Siapkan pusat pekerjaan.</h1><p>Database akan dibuat di database kosong yang Anda siapkan melalui cPanel.</p><p class="notice"><?=htmlspecialchars($notice,ENT_QUOTES,'UTF-8')?></p><form method="post"><label>Setup key<input name="setup_key" type="password" required autocomplete="off"></label><label>Username admin<input name="username" required minlength="3" autocomplete="username"></label><label>Password admin<input name="password" type="password" required minlength="12" autocomplete="new-password"></label><button class="primary">Pasang FULX</button></form></main></body></html>
