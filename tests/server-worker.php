<?php
// Only the disposable loopback database is accepted by this integration helper.
declare(strict_types=1);
$path=getenv('FASIH_CONFIG');$c=require $path;
if(!str_contains($c['dsn'],'host=127.0.0.1;port=3319;dbname=fulx_test;'))throw new RuntimeException('Refusing non-test database.');
require dirname(__DIR__).'/server/private/Service.php';
require dirname(__DIR__).'/server/private/migrate.php';
require dirname(__DIR__).'/server/private/TerritoryService.php';
$db=new PDO($c['dsn'],$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);$db->exec("SET time_zone='+00:00'");
$s=new TerritoryService($db,$c);$in=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);
try{
    if($in['action']==='__reset'){
        $db->exec('SET FOREIGN_KEY_CHECKS=0');foreach(['record_locations','territory_pages','partitions','regions','schema_migrations','records','pages','events','workers','campaigns','admins','login_limits'] as $t)$db->exec('DROP TABLE IF EXISTS '.$t);$db->exec('SET FOREIGN_KEY_CHECKS=1');$value=true;
    }elseif($in['action']==='__expire'){
        $q=$db->prepare('UPDATE pages SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 SECOND) WHERE campaign_id=? AND page_no=?');$q->execute([$in['campaignId'],$in['page']]);
        $q=$db->prepare('UPDATE partitions p JOIN territory_pages g ON g.campaign_id=p.campaign_id AND g.partition_id=p.id SET p.lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 SECOND) WHERE p.campaign_id=? AND g.page_no=?');$q->execute([$in['campaignId'],$in['page']]);$value=true;
    }elseif($in['action']==='__obsolete_geo'){
        // Seed only the loopback fixture with the catalog saved by v0.3.3.
        $id=$in['campaignId'];$recipe=$in['recipe'];$parent=null;$leaf=null;
        foreach($recipe as $i=>$r){$path=array_slice($recipe,0,$i+1);$leaf=md5(json_encode(array_map(fn($v)=>[$v['level'],$v['code']],$path)));$json=json_encode($path);
            $q=$db->prepare('INSERT IGNORE INTO regions(campaign_id,id,parent_id,level,code,name,recipe_json) VALUES(?,?,?,?,?,?,?)');$q->execute([$id,$leaf,$parent,$r['level'],$r['code'],$r['name'],$json]);
            if($i>=2){$q=$db->prepare('INSERT INTO partitions(campaign_id,id,region_id,parent_id,recipe_json,state) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state)');$q->execute([$id,$leaf,$leaf,$i===2?null:$parent,$json,$i===count($recipe)-1?'VERIFIED':'SPLIT']);}$parent=$leaf;
        }
        if(!empty($in['keys'])){
            $q=$db->prepare('SELECT COALESCE(MAX(page_no),0)+1 FROM pages WHERE campaign_id=?');$q->execute([$id]);$page=(int)$q->fetchColumn();
            $q=$db->prepare("INSERT INTO pages(campaign_id,page_no,signature_json,state) VALUES(?,?,?,'DONE')");$q->execute([$id,$page,json_encode($in['keys'])]);
            if($in['active']??false){$q=$db->prepare("UPDATE pages SET state='RUNNING',worker_id=?,session_id='obsolete-session',claim_token='obsolete-claim',lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 300 SECOND) WHERE campaign_id=? AND page_no=?");$q->execute([$in['workerId'],$id,$page]);}
            $q=$db->prepare('INSERT INTO territory_pages VALUES(?,?,(SELECT generation FROM campaigns WHERE id=?),1,?)');$q->execute([$id,$leaf,$id,$page]);
            foreach($in['keys'] as $key){$q=$db->prepare('INSERT INTO record_locations VALUES(?,?,?,1)');$q->execute([$id,$key,$leaf]);$q=$db->prepare('UPDATE records SET partition_id=?,page_no=? WHERE campaign_id=? AND identity_key=?');$q->execute([$leaf,$page,$id,$key]);}
        }
        $value=$leaf;
    }else{
        migrateTerritories($db);$w=$s->worker($in['token']);$value=match($in['action']){'geo_begin'=>$s->territory($w,'geo_begin',$in),'geo_claim'=>$s->territory($w,'geo_claim',$in),'claim'=>$s->claim($w,$in),'checkpoint'=>$s->checkpoint($w,$in),'heartbeat'=>$s->heartbeat($w,$in),default=>throw new RuntimeException('Unknown fixture action')};
    }
    echo json_encode(['ok'=>true,'value'=>$value],JSON_THROW_ON_ERROR);
}catch(ApiError $e){echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'code'=>$e->kind]);exit(2);}
