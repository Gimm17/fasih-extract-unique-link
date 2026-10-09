<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
try{
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')throw new ApiError('Gunakan POST JSON.',405,'METHOD');
    if(!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/json'))throw new ApiError('Content-Type harus application/json.',415,'CONTENT_TYPE');
    $raw=file_get_contents('php://input',false,null,0,2*1024*1024+1);
    if(strlen($raw)>2*1024*1024)throw new ApiError('Paket terlalu besar.',413,'SIZE');
    $input=json_decode($raw,true,64,JSON_THROW_ON_ERROR);if(!is_array($input))throw new ApiError('JSON tidak valid.');
    $action=(string)($input['action']??'');
    $workerActions=['worker_info','import_begin','import_page','import_finish','claim','heartbeat','begin_record','checkpoint','close_page','retry_own'];
    if(in_array($action,$workerActions,true)){
        $auth=$_SERVER['HTTP_AUTHORIZATION']??($_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
        if(!preg_match('/^Bearer ([a-f0-9]{64})$/',$auth,$m))throw new ApiError('Token komputer diperlukan.',401,'AUTH');
        $w=$service->worker($m[1]);
        $value=match($action){
            'worker_info'=>$service->info($w),'import_begin'=>$service->beginImport($w,$input),'import_page'=>$service->importPage($w,$input),
            'import_finish'=>$service->finishImport($w,$input),'claim'=>$service->claim($w,$input),'heartbeat'=>$service->heartbeat($w,$input),
            'begin_record'=>$service->beginRecord($w,$input),'checkpoint'=>$service->checkpoint($w,$input),'close_page'=>$service->closePage($w,$input),'retry_own'=>$service->retryOwn($w,$input)
        };
        jsonReply(['ok'=>true,'value'=>$value]);
    }
    // Dashboard requests are same-origin and use an HttpOnly session + CSRF token.
    $origin=$_SERVER['HTTP_ORIGIN']??'';$ownOrigin=($https?'https':'http').'://'.($_SERVER['HTTP_HOST']??'');
    if($origin!==''&&$origin!==$ownOrigin)throw new ApiError('Origin dashboard tidak cocok.',403,'ORIGIN');
    startAdminSession();
    if($action==='login'){
        $bucket=hash('sha256',($_SERVER['REMOTE_ADDR']??'unknown').'|'.gmdate('Y-m-d-H').'-'.intdiv((int)gmdate('i'),10));
        $q=$db->prepare('INSERT INTO login_limits(bucket,hits,expires_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE hits=hits+1');$q->execute([$bucket]);
        $q=$db->prepare('SELECT hits FROM login_limits WHERE bucket=?');$q->execute([$bucket]);if((int)$q->fetchColumn()>10)throw new ApiError('Terlalu banyak percobaan login. Coba lagi setelah 10 menit.',429,'RATE_LIMIT');
        $q=$db->prepare('SELECT * FROM admins WHERE username=?');$q->execute([Service::text($input['username']??'')]);$admin=$q->fetch();
        if(!$admin||!password_verify((string)($input['password']??''),$admin['password_hash']))throw new ApiError('Nama pengguna atau password salah.',401,'AUTH');
        session_regenerate_id(true);$_SESSION=['admin'=>$admin['id'],'username'=>$admin['username'],'csrf'=>bin2hex(random_bytes(24)),'at'=>time()];
        $db->exec('DELETE FROM login_limits WHERE expires_at<UTC_TIMESTAMP()');
        jsonReply(['ok'=>true,'value'=>['username'=>$admin['username'],'csrf'=>$_SESSION['csrf']]]);
    }
    if(!isset($_SESSION['admin'])||time()-(int)($_SESSION['at']??0)>28800)throw new ApiError('Silakan login ke dashboard.',401,'AUTH');
    $_SESSION['at']=time();$csrf=$_SESSION['csrf'];$adminId=$_SESSION['admin'];$username=$_SESSION['username'];
    $reads=['session','campaigns','overview','rows','export'];
    if(!in_array($action,$reads,true)&&!hash_equals($csrf,(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'')))throw new ApiError('Token formulir tidak cocok. Muat ulang dashboard.',403,'CSRF');
    session_write_close();
    $campaign=(string)($input['campaignId']??'');
    $value=match($action){
        'session'=>['username'=>$username,'csrf'=>$csrf],
        'campaigns'=>$service->campaigns(),
        'overview'=>$service->overview($campaign),
        'rows','export'=>['rows'=>$service->rows($campaign,$action==='export'?null:($input['result']??null),null,(int)($input['offset']??0),(int)($input['limit']??100),$action==='export'?'':Service::text($input['search']??''))],
        'create_campaign'=>$service->createCampaign($input),
        'create_worker'=>$service->createWorker($input),
        'pause','resume','retry','release_review','worker_toggle','reset','expected','edit_campaign'=>$service->adminAction($action,$input),
        'logout'=>null,'password'=>null,
        default=>throw new ApiError('Perintah tidak dikenal.',404,'ACTION')
    };
    if($action==='password'){
        $q=$db->prepare('SELECT password_hash FROM admins WHERE id=?');$q->execute([$adminId]);
        if(!password_verify((string)($input['oldPassword']??''),$q->fetchColumn()))throw new ApiError('Password lama salah.',401,'AUTH');
        $password=(string)($input['newPassword']??'');if(strlen($password)<12)throw new ApiError('Password baru minimal 12 karakter.');
        $q=$db->prepare('UPDATE admins SET password_hash=? WHERE id=?');$q->execute([password_hash($password,PASSWORD_DEFAULT),$adminId]);$value=['changed'=>true];
    }
    if($action==='logout'){startAdminSession();$_SESSION=[];session_destroy();}
    jsonReply(['ok'=>true,'value'=>$value]);
}catch(ApiError $e){jsonReply(['ok'=>false,'error'=>$e->getMessage(),'code'=>$e->kind],$e->status);}
catch(JsonException $e){jsonReply(['ok'=>false,'error'=>'JSON tidak valid.','code'=>'JSON'],400);}
catch(PDOException $e){
    if($db->inTransaction())$db->rollBack();
    if($e->getCode()==='23000')jsonReply(['ok'=>false,'error'=>'Identitas, scope, atau link sudah terdaftar. Periksa duplikasi sebelum melanjutkan.','code'=>'DUPLICATE'],409);
    jsonReply(['ok'=>false,'error'=>'Operasi database gagal. Coba ulang; jika berulang periksa log hosting.','code'=>'DATABASE'],503);
}
catch(Throwable $e){jsonReply(['ok'=>false,'error'=>'Operasi server gagal. Periksa konfigurasi atau log hosting.','code'=>'SERVER'],500);}
