<?php
// Only the disposable loopback database is accepted by this integration helper.
declare(strict_types=1);
$path=getenv('FASIH_CONFIG');$c=require $path;
if(!str_contains($c['dsn'],'host=127.0.0.1;port=3319;dbname=fulx_test;'))throw new RuntimeException('Refusing non-test database.');
require dirname(__DIR__).'/server/private/Service.php';
$db=new PDO($c['dsn'],$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);$db->exec("SET time_zone='+00:00'");
$s=new Service($db,$c);$in=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);
try{
    if($in['action']==='__reset'){
        $db->exec('SET FOREIGN_KEY_CHECKS=0');foreach(['records','pages','events','workers','campaigns','admins','login_limits'] as $t)$db->exec('DROP TABLE IF EXISTS '.$t);$db->exec('SET FOREIGN_KEY_CHECKS=1');$value=true;
    }elseif($in['action']==='__expire'){
        $q=$db->prepare('UPDATE pages SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 SECOND) WHERE campaign_id=? AND page_no=?');$q->execute([$in['campaignId'],$in['page']]);$value=true;
    }else{
        $w=$s->worker($in['token']);$value=match($in['action']){'claim'=>$s->claim($w,$in),'checkpoint'=>$s->checkpoint($w,$in),'heartbeat'=>$s->heartbeat($w,$in),default=>throw new RuntimeException('Unknown fixture action')};
    }
    echo json_encode(['ok'=>true,'value'=>$value],JSON_THROW_ON_ERROR);
}catch(ApiError $e){echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'code'=>$e->kind]);exit(2);}
