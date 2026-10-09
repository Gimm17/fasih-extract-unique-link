<?php
declare(strict_types=1);

final class TerritoryService extends Service {
    protected function publicCampaign(array $c): array {
        $owner=$c['import_worker']?$this->one('SELECT id,name,enabled FROM workers WHERE id=? AND campaign_id=?',[$c['import_worker'],$c['id']]):null;
        if($owner)$owner['enabled']=(bool)$owner['enabled'];
        return parent::publicCampaign($c)+['inventoryMode'=>$c['inventory_mode']??'LEGACY','catalogComplete'=>(bool)($c['catalog_complete']??false),'minimumProtocol'=>($c['inventory_mode']??'LEGACY')==='TERRITORY'?3:1,'inventoryOwner'=>$owner,'territoryDepth'=>'SUBSLS','splitAt'=>1000];
    }
    public function createCampaign(array $input): array {
        if(($input['territoryMode']??false)&&($input['prefix']??'')!=='7271')throw new ApiError('Mode wilayah awal memakai awalan Kota Palu 7271.');
        $c=parent::createCampaign($input);
        if($input['territoryMode']??false) {
            if($c['prefix']!=='7271')throw new ApiError('Mode wilayah awal memakai awalan Kota Palu 7271.');
            $this->query("UPDATE campaigns SET inventory_mode='TERRITORY' WHERE id=?",[$c['id']]);
        }
        return $this->publicCampaign($this->campaign($c['id']));
    }
    public function requireProtocol(array $w,array $input,string $action): void {
        $c=$this->campaign($w['campaign_id']);
        if(($c['inventory_mode']??'LEGACY')==='TERRITORY' && $action!=='worker_info') {
            if((int)($input['protocol']??0)<3)throw new ApiError('Proyek wilayah memerlukan ekstensi v0.3.0 atau lebih baru.',409,'PROTOCOL');
            if(in_array($action,['import_begin','import_page','import_finish','claim'],true))throw new ApiError('Gunakan inventaris dan tugas melalui filter wilayah.',409,'TERRITORY');
        }
    }
    private function recipe(array $recipe): array {
        $levels=['PROVINSI','KABUPATEN/KOTA','KECAMATAN','DESA','SLS','SUBSLS'];$out=[];
        if(count($recipe)<2||count($recipe)>6)throw new ApiError('Resep filter wilayah tidak lengkap.');
        foreach($recipe as $i=>$r) {
            $code=(string)($r['code']??'');$name=self::text($r['name']??'');
            if(($r['level']??'')!==$levels[$i]||!preg_match('/^[a-zA-Z0-9_-]{1,32}$/',$code)||$name===''||strlen($name)>160)throw new ApiError('Kode/nama/urutan wilayah tidak valid.');
            $out[]=['level'=>$levels[$i],'code'=>$code,'name'=>$name,'value'=>substr((string)($r['value']??($code.' '.$name)),0,200)];
        }
        if($out[0]['code']!=='72'||$out[1]['code']!=='71')throw new ApiError('Inventaris wilayah saat ini dibatasi Kota Palu [72]/[71].');
        return $out;
    }
    private function rid(array $recipe): string { return md5(json_encode(array_map(fn($r)=>[$r['level'],$r['code']],$recipe),JSON_THROW_ON_ERROR)); }
    private function validVillage(array $recipe): bool {
        return count($recipe)===4&&$this->validPartition($recipe);
    }
    private function validPartition(array $recipe): bool {
        if(count($recipe)<4||count($recipe)>6)return false;
        foreach($recipe as $r)if(preg_match('/^0+$/',(string)$r['code'])||preg_match('/^[-–—]+$/u',self::text($r['name'])))return false;
        return true;
    }
    private function needsVillageCatalog(string $id): bool {
        foreach($this->partitionList($id) as $p)if(!$this->validPartition($p['recipe']))return true;
        return false;
    }
    private function repairVillageCatalog(string $id): void {
        $active=(int)$this->query("SELECT COUNT(*) FROM pages WHERE campaign_id=? AND state IN ('RUNNING','REVIEW') AND lease_until>UTC_TIMESTAMP(6)",[$id])->fetchColumn();
        if($active)throw new ApiError('Hentikan semua komputer, sinkronkan hasil, lalu tunggu kunci berakhir sebelum memetakan ulang inventaris sampai desa.',409,'LEASE');
        foreach($this->partitionList($id) as $p){
            if(!$this->validPartition($p['recipe'])){
                // Keep every identity/result/link; only its obsolete filter
                // location is removed, to be mapped again to a real village.
                $this->query("UPDATE records SET partition_id=NULL,worker_id=IF(result='RUNNING',NULL,worker_id),result=IF(result='RUNNING','PENDING',result) WHERE campaign_id=? AND partition_id=?",[$id,$p['id']]);
                $this->query('DELETE FROM record_locations WHERE campaign_id=? AND partition_id=?',[$id,$p['id']]);
                $this->query("UPDATE pages a JOIN territory_pages g ON g.campaign_id=a.campaign_id AND g.page_no=a.page_no SET a.state='DONE',a.worker_id=NULL,a.session_id=NULL,a.claim_token=NULL WHERE a.campaign_id=? AND g.partition_id=?",[$id,$p['id']]);
                $this->query('DELETE FROM territory_pages WHERE campaign_id=? AND partition_id=?',[$id,$p['id']]);
                $this->query('DELETE FROM partitions WHERE campaign_id=? AND id=?',[$id,$p['id']]);
            }
        }
        foreach($this->partitionList($id) as $p){
            $children=(int)$this->query('SELECT COUNT(*) FROM partitions WHERE campaign_id=? AND parent_id=?',[$id,$p['id']])->fetchColumn();
            if($p['state']==='SPLIT'&&$children)continue;
            $this->query("UPDATE partitions SET state='NEW',source_total=NULL,observed_total=0,boundary=NULL,sample_json=NULL,worker_id=NULL,session_id=NULL,lease_until=NULL WHERE campaign_id=? AND id=?",[$id,$p['id']]);
            $this->query("UPDATE pages a JOIN territory_pages g ON g.campaign_id=a.campaign_id AND g.page_no=a.page_no SET a.state='PENDING',a.worker_id=NULL,a.session_id=NULL,a.claim_token=NULL WHERE a.campaign_id=? AND g.partition_id=?",[$id,$p['id']]);
        }
        foreach($this->query('SELECT id,recipe_json FROM regions WHERE campaign_id=?',[$id])->fetchAll(PDO::FETCH_ASSOC) as $r){
            $recipe=json_decode($r['recipe_json'],true);$placeholder=false;
            foreach($recipe as $v)if(preg_match('/^0+$/',(string)$v['code'])||preg_match('/^[-–—]+$/u',self::text($v['name'])))$placeholder=true;
            if($placeholder)$this->query('DELETE FROM regions WHERE campaign_id=? AND id=?',[$id,$r['id']]);
        }
        $this->query('UPDATE campaigns SET catalog_complete=0 WHERE id=?',[$id]);
        $this->event($id,null,'VILLAGE_CATALOG','Resep kosong (-) dilepas; inventaris dipetakan ulang ke wilayah valid. Pemecahan SLS/SUBSLS valid, identitas, hasil, link, dan token dipertahankan.');
    }
    private function register(string $campaign,array $recipe): string {
        $parent=null;
        foreach($recipe as $i=>$r) {
            $path=array_slice($recipe,0,$i+1);$id=$this->rid($path);
            $old=$this->one('SELECT * FROM regions WHERE campaign_id=? AND id=?',[$campaign,$id]);
            if($old && ($old['name']!==$r['name']||$old['parent_id']!==$parent))throw new ApiError('Master wilayah berubah. Periksa nama/kode sebelum melanjutkan.',409,'CATALOG');
            $this->query('INSERT IGNORE INTO regions(campaign_id,id,parent_id,level,code,name,recipe_json) VALUES(?,?,?,?,?,?,?)',[$campaign,$id,$parent,$r['level'],$r['code'],$r['name'],json_encode($path,JSON_THROW_ON_ERROR)]);$parent=$id;
        }
        return $parent;
    }
    private function importer(array $w): array {
        $c=$this->campaign($w['campaign_id'],true);
        $this->enabledCoordinator($w);
        if($w['role']!=='COORDINATOR'||$c['import_worker']!==$w['id']||$c['inventory_mode']!=='TERRITORY'||$c['state']!=='IMPORTING')throw new ApiError('Inventaris wilayah tidak aktif untuk koordinator ini.',409,'IMPORT');
        return $c;
    }
    private function enabledCoordinator(array $w): void {
        // Recheck after acquiring the campaign lock: an authenticated request
        // can have waited behind the admin action that disabled its token.
        $current=$this->one('SELECT role,enabled FROM workers WHERE id=? AND campaign_id=?',[$w['id'],$w['campaign_id']]);
        if(!$current||!$current['enabled'])throw new ApiError('Token komputer sudah dinonaktifkan.',401,'AUTH');
        if($current['role']!=='COORDINATOR')throw new ApiError('Gunakan token Koordinator untuk inventaris.',403,'ROLE');
    }
    private function part(string $campaign,string $id): array {
        $p=$this->one('SELECT * FROM partitions WHERE campaign_id=? AND id=? FOR UPDATE',[$campaign,$id]);
        if(!$p)throw new ApiError('Partisi wilayah tidak ditemukan.',404,'PARTITION');return $p;
    }
    public function territory(array $w,string $action,array $in): array {
        return $this->tx(function()use($w,$action,$in){
            $id=$w['campaign_id'];
            if($action==='geo_begin') {
                $c=$this->campaign($id,true);
                $this->enabledCoordinator($w);
                if($w['role']!=='COORDINATOR'||$c['inventory_mode']!=='TERRITORY')throw new ApiError('Aktifkan mode wilayah dan gunakan token Koordinator.',403,'ROLE');
                $repair=$this->needsVillageCatalog($id);
                if(!$repair&&in_array($c['state'],['READY','RUNNING','PAUSED'],true))return ['finished'=>true,'catalogComplete'=>true,'partitions'=>$this->partitionList($id)];
                if(!in_array($c['state'],['CREATED','IMPORTING','READY','RUNNING','PAUSED'],true))throw new ApiError('Inventaris sudah ditutup.',409,'IMPORT');
                $ctx=self::context((string)($in['url']??''));$expected=json_decode($c['context_json'],true);
                if($ctx!=$expected)throw new ApiError('URL awal inventaris harus sama dengan URL proyek.',409,'CONTEXT');
                $recovered=false;
                if($c['import_worker']&&$c['import_worker']!==$w['id']){
                    $owner=$this->one('SELECT id,name,enabled FROM workers WHERE id=? AND campaign_id=?',[$c['import_worker'],$id]);
                    if($owner&&$owner['enabled'])throw new ApiError('Inventaris dimiliki '.$owner['name'].' (ID '.substr($owner['id'],0,8).'). Gunakan token pemilik, atau hentikan prosesnya lalu nonaktifkan pemilik di dashboard sebelum memakai Koordinator pengganti.',409,'IMPORT');
                    $recovered=true;
                    $this->event($id,$w['id'],'IMPORT_RECOVERY','Inventaris dilanjutkan oleh '.$w['name'].' (ID '.substr($w['id'],0,8).') dari pemilik nonaktif/tidak tersedia (ID '.substr($c['import_worker'],0,8).'). Master, halaman, hasil, dan link dipertahankan.');
                }
                if($repair){$this->repairVillageCatalog($id);$c['catalog_complete']=0;}
                $this->touch($w,(string)$in['session'],'IMPORTING','Menemukan wilayah Kota Palu');
                $this->query("UPDATE campaigns SET state='IMPORTING',import_worker=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$w['id'],$id]);
                return ['partitions'=>$this->partitionList($id),'catalogComplete'=>(bool)$c['catalog_complete'],'recovered'=>$recovered,'catalogChanged'=>$repair];
            }
            if($action==='geo_claim')return $this->claimTerritory($w,$in);
            $c=$this->importer($w);
            if($action==='geo_filter_stamp'){
                $stamp=(string)($in['filterStamp']??'');if(strlen($stamp)>4000||($c['filter_stamp']!==null&&$c['filter_stamp']!==$stamp))throw new ApiError('Filter non-wilayah berubah.',409,'FILTER');$this->query('UPDATE campaigns SET filter_stamp=? WHERE id=?',[$stamp,$id]);return ['saved'=>true];
            }
            if($action==='geo_catalog') {
                $recipes=$in['recipes']??[];if(!is_array($recipes)||!$recipes||count($recipes)>1000)throw new ApiError('Katalog wilayah kosong/terlalu besar.');
                $ids=[];
                foreach($recipes as $raw) {
                    $recipe=$this->recipe($raw);$region=$this->register($id,$recipe);
                    if(!$this->validVillage($recipe))throw new ApiError('Katalog awal hanya berisi desa valid. SLS/SUBSLS dibuat melalui pemecahan batas 1.000; opsi - tidak digunakan.',409,'CATALOG');
                    $ids[]=$region;
                    $this->query('INSERT IGNORE INTO partitions(campaign_id,id,region_id,recipe_json) VALUES(?,?,?,?)',[$id,$region,$region,json_encode($recipe,JSON_THROW_ON_ERROR)]);
                }
                if($in['complete']??false) {
                    $all=$this->query('SELECT id FROM partitions WHERE campaign_id=? AND parent_id IS NULL ORDER BY id',[$id])->fetchAll(PDO::FETCH_COLUMN);sort($ids);
                    if(!$ids||$all!==array_values(array_unique($ids)))throw new ApiError('Daftar desa belum lengkap atau berubah dari katalog tersimpan.',409,'CATALOG');
                    $this->query('UPDATE campaigns SET catalog_complete=1 WHERE id=?',[$id]);
                }
                return ['partitions'=>$this->partitionList($id)];
            }
            if($action==='geo_split') {
                $p=$this->part($id,(string)($in['partitionId']??''));$base=json_decode($p['recipe_json'],true);
                if(!$this->validPartition($base)||!in_array($p['state'],['NEW','SPLIT'],true)||count($base)>=6)throw new ApiError('Wilayah tidak dapat dipecah lagi; perlu pemeriksaan manual.',409,'CAP');
                $sample=$in['sampleKeys']??[];
                if(!is_array($sample)||count($sample)!==1000||count(array_unique($sample))!==1000)throw new ApiError('Pemecahan harus menyertakan tepat 1.000 identitas unik batas.',409,'CAP');
                foreach($sample as $key)if(!is_string($key)||self::key($key)!==$key||!str_starts_with($key,$c['prefix']))throw new ApiError('Identitas contoh pemecahan tidak valid.');
                $uploaded=(int)$this->query('SELECT COUNT(*) FROM territory_pages WHERE campaign_id=? AND partition_id=?',[$id,$p['id']])->fetchColumn();
                if($uploaded)throw new ApiError('Induk yang terpotong tidak boleh diunggah sebelum pemecahan.',409,'CAP');
                $children=$in['recipes']??[];if(!is_array($children)||!$children||count($children)>1000)throw new ApiError('Pilihan wilayah lebih kecil tidak tersedia.',409,'CAP');
                $recipes=[];
                foreach($children as $raw){
                    $r=$this->recipe($raw);$rid=$this->rid($r);
                    if(!$this->validPartition($r)||count($r)!==count($base)+1||array_slice($r,0,count($base))!==$base||isset($recipes[$rid]))throw new ApiError('Anak wilayah harus valid, unik, dan cocok dengan induknya.',409,'CATALOG');
                    $recipes[$rid]=$r;
                }
                $source=isset($in['sourceTotal'])?(int)$in['sourceTotal']:null;if($source!==null&&$source<1000)throw new ApiError('Total sumber pemecahan kurang dari batas.',409,'COUNT');
                if($p['state']==='SPLIT'){
                    $old=$this->query('SELECT id FROM partitions WHERE campaign_id=? AND parent_id=? ORDER BY id',[$id,$p['id']])->fetchAll(PDO::FETCH_COLUMN);$ids=array_keys($recipes);sort($ids);$prior=json_decode($p['sample_json'],true);sort($prior);$sorted=$sample;sort($sorted);
                    if($old!==$ids||$prior!==$sorted||($p['source_total']===null?null:(int)$p['source_total'])!==$source)throw new ApiError('Resep/contoh pemecahan berubah sejak checkpoint.',409,'CATALOG');
                }
                foreach($recipes as $rid=>$r){$this->register($id,$r);$this->query('INSERT IGNORE INTO partitions(campaign_id,id,region_id,parent_id,recipe_json) VALUES(?,?,?,?,?)',[$id,$rid,$rid,$p['id'],json_encode($r,JSON_THROW_ON_ERROR)]);}
                $this->query("UPDATE partitions SET state='SPLIT',source_total=?,observed_total=1000,sample_json=?,boundary='CAP_1000' WHERE campaign_id=? AND id=?",[$source,json_encode($sample,JSON_THROW_ON_ERROR),$id,$p['id']]);
                return ['partitions'=>$this->partitionList($id)];
            }
            if($action==='geo_page')return $this->importTerritoryPage($w,$in,$c);
            if($action==='geo_finish_partition') {
                $p=$this->part($id,(string)$in['partitionId']);
                if($p['state']==='VERIFIED')return ['verified'=>true];
                if($p['state']!=='NEW')throw new ApiError('Partisi bukan daun inventaris.');
                $pages=$this->query('SELECT local_page FROM territory_pages WHERE campaign_id=? AND partition_id=? ORDER BY local_page',[$id,$p['id']])->fetchAll(PDO::FETCH_COLUMN);
                $n=(int)$this->query('SELECT COUNT(*) FROM record_locations WHERE campaign_id=? AND partition_id=?',[$id,$p['id']])->fetchColumn();
                $last=(int)($in['lastPage']??0);$source=isset($in['sourceTotal'])?(int)$in['sourceTotal']:null;
                if($n>=1000||($source!==null&&$source!==$n)||$last!==count($pages)||($pages&&array_map('intval',$pages)!==range(1,count($pages)))||!in_array($in['boundary']??'', ['NEXT_DISABLED','EMPTY_PAGE'],true))throw new ApiError('Jumlah/akhir halaman wilayah belum terverifikasi. Pecah wilayah jika mencapai 1.000.',409,'COUNT');
                $this->query("UPDATE partitions SET state='VERIFIED',observed_total=?,source_total=?,boundary=? WHERE campaign_id=? AND id=?",[$n,$source,$in['boundary'],$id,$p['id']]);return ['verified'=>true,'total'=>$n];
            }
            if($action==='geo_finish') {
                if(!$c['catalog_complete'])throw new ApiError('Penemuan wilayah belum lengkap.',409,'CATALOG');
                $left=(int)$this->query("SELECT COUNT(*) FROM partitions WHERE campaign_id=? AND state NOT IN ('VERIFIED','SPLIT')",[$id])->fetchColumn();
                $unmapped=(int)$this->query('SELECT COUNT(*) FROM records WHERE campaign_id=? AND partition_id IS NULL',[$id])->fetchColumn();
                $n=$this->counts($id)['total'];
                $allParts=$this->partitionList($id,true);
                foreach($allParts as $part){
                    if(!$this->validPartition($part['recipe']))throw new ApiError('Katalog lama perlu dipetakan ulang ke wilayah valid. Jalankan Inventaris ke server.',409,'CATALOG');
                    if($part['state']!=='SPLIT')continue;
                    $known=[];$base=array_column($part['recipe'],'code');
                    foreach($allParts as $child)if($child['state']!=='SPLIT'&&count($child['recipe'])>count($base)&&array_slice(array_column($child['recipe'],'code'),0,count($base))===$base)foreach($this->query('SELECT identity_key FROM record_locations WHERE campaign_id=? AND partition_id=?',[$id,$child['id']])->fetchAll(PDO::FETCH_COLUMN) as $key)$known[$key]=true;
                    foreach(json_decode($part['sample_json']??'[]',true) as $key)if(!isset($known[$key]))throw new ApiError('Pemecahan SLS/SUBSLS kehilangan identitas yang terlihat di induk. Periksa opsi kosong/tidak teralokasi.',409,'COVERAGE');
                    if($part['source_total']!==null&&count($known)!==(int)$part['source_total'])throw new ApiError('Total pemecahan tidak cocok dengan sumber induk.',409,'COUNT');
                }
                if($left||$unmapped||($c['expected_total']&&(int)$c['expected_total']!==$n))throw new ApiError("Inventaris belum siap: $left wilayah belum terverifikasi, $unmapped data lama belum terpetakan; total $n / target ".$c['expected_total'].'. Jangan turunkan target untuk melewati selisih.',409,'COUNT');
                $this->query("UPDATE pages p JOIN territory_pages g ON g.campaign_id=p.campaign_id AND g.page_no=p.page_no SET p.state='DONE' WHERE p.campaign_id=? AND NOT EXISTS(SELECT 1 FROM records r WHERE r.campaign_id=p.campaign_id AND r.page_no=p.page_no AND r.result='PENDING')",[$id]);
                $this->query("UPDATE partitions t SET state=IF(EXISTS(SELECT 1 FROM records r WHERE r.campaign_id=t.campaign_id AND r.partition_id=t.id AND r.result='PENDING'),'PENDING','DONE') WHERE campaign_id=? AND state='VERIFIED'",[$id]);
                $this->query("UPDATE campaigns SET state='READY' WHERE id=?",[$id]);$this->event($id,$w['id'],'INVENTORY',"Inventaris per wilayah terverifikasi: $n identitas unik.");return $this->info($w);
            }
            throw new ApiError('Aksi wilayah tidak dikenal.');
        });
    }
    private function importTerritoryPage(array $w,array $in,array $c): array {
        $id=$c['id'];$p=$this->part($id,(string)($in['partitionId']??''));$page=(int)($in['localPage']??0);$rows=$in['rows']??[];
        if(!$this->validPartition(json_decode($p['recipe_json'],true)))throw new ApiError('Halaman harus berasal dari resep desa/SLS/SUBSLS valid, bukan opsi -.',409,'CATALOG');
        if(!in_array($p['state'],['NEW','VERIFIED'],true)||$page<1||$page>10||!is_array($rows)||count($rows)<1||count($rows)>100)throw new ApiError('Halaman wilayah tidak valid.');
        $keys=[];foreach($rows as $r) {
            $f=$r['fields']??[];$key=self::key((string)($f['Kode Identitas']??''));
            if(($r['key']??'')!==$key||!str_starts_with($key,$c['prefix'])||isset($keys[$key])||self::text($f['Status']??'')===''||!in_array(strtoupper(self::text($f['Mode']??'')),['CAWI','CAPI','PAPI'],true))throw new ApiError('Kartu wilayah/identitas/status/mode tidak valid.');$keys[$key]=true;
        }
        $signature=json_encode(array_keys($keys),JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        $g=$this->one('SELECT * FROM territory_pages WHERE campaign_id=? AND partition_id=? AND revision=? AND local_page=?',[$id,$p['id'],$c['generation'],$page]);
        if($g) {
            $old=$this->one('SELECT signature_json FROM pages WHERE campaign_id=? AND page_no=?',[$id,$g['page_no']]);
            if($old['signature_json']!==$signature)throw new ApiError('Isi halaman wilayah berubah; inventaris dihentikan.',409,'INVENTORY');
            foreach($rows as $i=>$r){$record=$this->one('SELECT * FROM records WHERE campaign_id=? AND identity_key=?',[$id,$r['key']]);if($record&&$record['partition_id']===null)$this->remapRecord($record,$r['fields'],$p,(int)$g['page_no'],$i);}
            return ['accepted'=>count($rows),'page'=>(int)$g['page_no'],'reused'=>true];
        }
        if($p['state']!=='NEW')throw new ApiError('Wilayah sudah terverifikasi.');
        $global=1+(int)$this->query('SELECT COALESCE(MAX(page_no),0) FROM pages WHERE campaign_id=?',[$id])->fetchColumn();
        $this->query('INSERT INTO pages(campaign_id,page_no,signature_json) VALUES(?,?,?)',[$id,$global,$signature]);
        $this->query('INSERT INTO territory_pages VALUES(?,?,?,?,?)',[$id,$p['id'],$c['generation'],$page,$global]);
        foreach($rows as $i=>$r) {
            $f=$r['fields'];$key=$r['key'];$old=$this->one('SELECT * FROM records WHERE campaign_id=? AND identity_key=?',[$id,$key]);
            $prior=$this->one('SELECT local_page FROM record_locations WHERE campaign_id=? AND partition_id=? AND identity_key=?',[$id,$p['id'],$key]);
            if($prior)throw new ApiError('Identitas berulang pada dua halaman dalam wilayah yang sama.',409,'PAGINATION');
            $this->query('INSERT INTO record_locations VALUES(?,?,?,?)',[$id,$key,$p['id'],$page]);
            $recipe=json_decode($p['recipe_json'],true);foreach($recipe as $region)$f[$region['level']]=$region['code'].' '.$region['name'];
            if($old) {
                if($old['partition_id']===null)$this->remapRecord($old,$f,$p,$global,$i);
                continue;
            }
            $eligible=strtoupper(self::text($f['Status']))==='OPEN'&&strtoupper(self::text($f['Mode']))==='CAWI';
            $this->query('INSERT INTO records(campaign_id,identity_key,page_no,ordinal_no,partition_id,fields_json,initial_mode,result,error,captured_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))',[$id,$key,$global,$i,$p['id'],json_encode($f,JSON_THROW_ON_ERROR),$f['Mode'],$eligible?'PENDING':'SKIPPED',$eligible?'':'Bukan OPEN/CAWI']);
        }
        $this->touch($w,$in['session'],'IMPORTING','Wilayah '.$p['id'].' halaman '.$page);return ['accepted'=>count($rows),'page'=>$global,'reused'=>false];
    }
    private function remapRecord(array $old,array $fields,array $part,int $page,int $ordinal): void {
        $fields=array_merge(json_decode($old['fields_json'],true),$fields);unset($fields['SLS'],$fields['SUBSLS']);
        foreach(json_decode($part['recipe_json'],true) as $r)$fields[$r['level']]=$r['code'].' '.$r['name'];
        $this->query('UPDATE records SET partition_id=?,page_no=?,ordinal_no=?,fields_json=? WHERE campaign_id=? AND identity_key=?',[$part['id'],$page,$ordinal,json_encode($fields,JSON_THROW_ON_ERROR),$old['campaign_id'],$old['identity_key']]);
    }
    private function partitionList(string $id,bool $samples=false): array {
        return array_map(function($p)use($samples){if(!$samples)unset($p['sample_json']);$p['recipe']=json_decode($p['recipe_json'],true);unset($p['recipe_json'],$p['session_id']);return $p;},$this->query('SELECT * FROM partitions WHERE campaign_id=? ORDER BY recipe_json',[$id])->fetchAll(PDO::FETCH_ASSOC));
    }
    private function claimTerritory(array $w,array $in): array {
        $c=$this->campaign($w['campaign_id'],true);$id=$c['id'];$session=(string)($in['session']??'');
        if($c['inventory_mode']!=='TERRITORY'||!in_array($c['state'],['READY','RUNNING'],true))throw new ApiError('Inventaris wilayah belum siap atau proyek dijeda.',409,'PAUSED');
        $this->query("UPDATE partitions SET state='REVIEW' WHERE campaign_id=? AND state='RUNNING' AND lease_until<=UTC_TIMESTAMP(6)",[$id]);$this->expire($id);
        $p=$this->one("SELECT * FROM partitions WHERE campaign_id=? AND worker_id=? AND state IN ('RUNNING','REVIEW') LIMIT 1 FOR UPDATE",[$id,$w['id']]);
        if($p&&$p['session_id']!==$session)throw new ApiError('Token masih memiliki wilayah dari sesi lain. Lanjutkan sesi lama.',409,'SESSION');
        if(!$p)$p=$this->one("SELECT * FROM partitions WHERE campaign_id=? AND state='PENDING' ORDER BY recipe_json LIMIT 1 FOR UPDATE",[$id]);
        if(!$p)return ['empty'=>true,'counts'=>$this->counts($id)];
        if(!$this->validPartition(json_decode($p['recipe_json'],true)))throw new ApiError('Inventaris lama memakai opsi -. Koordinator perlu menjalankan Inventaris ke server untuk pemetaan ulang.',409,'CATALOG');
        $this->query("UPDATE partitions SET state='RUNNING',worker_id=?,session_id=?,lease_until=? WHERE campaign_id=? AND id=?",[$w['id'],$session,$this->lease(),$id,$p['id']]);
        $page=$this->one("SELECT a.* FROM pages a JOIN territory_pages g ON g.campaign_id=a.campaign_id AND g.page_no=a.page_no WHERE a.campaign_id=? AND g.partition_id=? AND a.state IN ('RUNNING','REVIEW','PENDING') ORDER BY g.local_page LIMIT 1 FOR UPDATE",[$id,$p['id']]);
        if(!$page) {
            $this->query("UPDATE partitions SET state='DONE' WHERE campaign_id=? AND id=?",[$id,$p['id']]);return $this->claimTerritory($w,$in);
        }
        if($page['worker_id']&&$page['worker_id']!==$w['id']&&in_array($page['state'],['RUNNING','REVIEW'],true))throw new ApiError('Halaman wilayah dimiliki komputer lain.',409,'OWNERSHIP');
        $page['claim_token']=$page['claim_token']&&$page['session_id']===$session&&in_array($page['state'],['RUNNING','REVIEW'],true)?$page['claim_token']:bin2hex(random_bytes(24));$page['lease_until']=$this->lease();
        $this->query("UPDATE pages SET state='RUNNING',worker_id=?,session_id=?,claim_token=?,lease_until=? WHERE campaign_id=? AND page_no=?",[$w['id'],$session,$page['claim_token'],$page['lease_until'],$id,$page['page_no']]);
        $this->query("UPDATE campaigns SET state='RUNNING' WHERE id=?",[$id]);$this->touch($w,$session,'RUNNING','Filter '.implode(' / ',array_column(json_decode($p['recipe_json'],true),'name')));
        $pack=$this->pack($c,$page);$g=$this->one('SELECT local_page FROM territory_pages WHERE campaign_id=? AND page_no=?',[$id,$page['page_no']]);
        return $pack+['partitionId'=>$p['id'],'localPage'=>(int)$g['local_page'],'recipe'=>json_decode($p['recipe_json'],true)];
    }
    public function heartbeat(array $w,array $in): array {
        $r=parent::heartbeat($w,$in);if(!$r['paused'])$this->query('UPDATE partitions t JOIN territory_pages g ON g.campaign_id=t.campaign_id AND g.partition_id=t.id SET t.lease_until=? WHERE t.campaign_id=? AND g.page_no=? AND t.worker_id=? AND t.session_id=?',[$this->lease(),$w['campaign_id'],$in['page'],$w['id'],$in['session']]);return $r;
    }
    public function closePage(array $w,array $in): array {
        $reply=parent::closePage($w,$in);
        $this->query("UPDATE partitions t JOIN territory_pages g ON g.campaign_id=t.campaign_id AND g.partition_id=t.id SET t.state='DONE' WHERE t.campaign_id=? AND g.page_no=? AND NOT EXISTS(SELECT 1 FROM pages a JOIN territory_pages b ON b.campaign_id=a.campaign_id AND b.page_no=a.page_no WHERE a.campaign_id=t.campaign_id AND b.partition_id=t.id AND a.state<>'DONE')",[$w['campaign_id'],$in['page']]);
        return $reply;
    }
    protected function expire(string $campaign): void {
        parent::expire($campaign);
        $this->query("UPDATE partitions SET state='REVIEW' WHERE campaign_id=? AND state='RUNNING' AND lease_until<=UTC_TIMESTAMP(6)",[$campaign]);
    }
    public function overview(string $campaign): array {
        $data=parent::overview($campaign);$mapping=[];
        foreach($this->query('SELECT page_no,local_page,partition_id FROM territory_pages WHERE campaign_id=?',[$campaign])->fetchAll(PDO::FETCH_ASSOC) as $g)$mapping[$g['page_no']]=$g;
        foreach($data['packages'] as &$p){$p['partition_id']=$mapping[$p['page_no']]['partition_id']??null;$p['local_page']=$mapping[$p['page_no']]['local_page']??$p['page_no'];}unset($p);
        return $data+['territories'=>$this->territoryOverview($campaign)];
    }
    public function territoryOverview(string $id): array {
        $parts=$this->partitionList($id);
        $regions=$this->query('SELECT * FROM regions WHERE campaign_id=? ORDER BY recipe_json',[$id])->fetchAll(PDO::FETCH_ASSOC);
        $order=function($a,$b){$left=array_column(json_decode($a['recipe_json'],true),'code');$right=array_column(json_decode($b['recipe_json'],true),'code');for($i=0;$i<min(count($left),count($right));$i++){if($left[$i]!==$right[$i])return strcmp($left[$i],$right[$i]);}return count($left)<=>count($right);};usort($regions,$order);
        $locations=$this->query("SELECT l.partition_id,COUNT(*) total,SUM(r.result='DONE') done,SUM(r.result='ERROR') errors,SUM(r.result='PENDING') pending,SUM(r.result='RUNNING') running,SUM(r.result='SKIPPED') skipped FROM record_locations l JOIN records r ON r.campaign_id=l.campaign_id AND r.identity_key=l.identity_key WHERE l.campaign_id=? GROUP BY l.partition_id",[$id])->fetchAll(PDO::FETCH_ASSOC);
        $duplicates=$this->query('SELECT identity_key,COUNT(*) locations FROM record_locations WHERE campaign_id=? GROUP BY identity_key HAVING COUNT(*)>1',[$id])->fetchAll(PDO::FETCH_ASSOC);
        $ancestors=[];foreach($parts as $p){$ancestors[$p['id']]=[];for($i=1;$i<=count($p['recipe']);$i++)$ancestors[$p['id']][]=$this->rid(array_slice($p['recipe'],0,$i));}
        $seen=[];foreach($this->query('SELECT l.partition_id,l.identity_key,r.result FROM record_locations l JOIN records r ON r.campaign_id=l.campaign_id AND r.identity_key=l.identity_key WHERE l.campaign_id=?',[$id])->fetchAll(PDO::FETCH_ASSOC) as $loc)foreach($ancestors[$loc['partition_id']]??[] as $rid)$seen[$rid][$loc['identity_key']]=$loc['result'];
        $regionCounts=[];foreach($seen as $rid=>$keys){$c=['regionId'=>$rid,'total'=>count($keys),'done'=>0,'errors'=>0,'pending'=>0,'running'=>0,'skipped'=>0];foreach($keys as $result){$k=$result==='ERROR'?'errors':strtolower($result);if(isset($c[$k]))$c[$k]++;}$regionCounts[]=$c;}
        return ['regions'=>array_map(function($r){$r['recipe']=json_decode($r['recipe_json'],true);unset($r['recipe_json']);return $r;},$regions),'partitions'=>$parts,'counts'=>$locations,'regionCounts'=>$regionCounts,'duplicates'=>$duplicates,'unmapped'=>(int)$this->query('SELECT COUNT(*) FROM records WHERE campaign_id=? AND partition_id IS NULL',[$id])->fetchColumn()];
    }
    public function adminAction(string $action,array $in): array {
        $id=(string)($in['campaignId']??'');$c=$this->campaign($id);
        if($action==='enable_territories')return $this->tx(function()use($id){
            $c=$this->campaign($id,true);$active=(int)$this->query("SELECT COUNT(*) FROM pages WHERE campaign_id=? AND state IN ('RUNNING','REVIEW') AND lease_until>UTC_TIMESTAMP(6)",[$id])->fetchColumn();
            if($active)throw new ApiError('Hentikan komputer dan tunggu kunci aktif berakhir sebelum beralih.',409,'LEASE');
            if($c['inventory_mode']==='TERRITORY')return $this->overview($id);
            if($c['prefix']!=='7271')$this->query("UPDATE campaigns SET prefix='7271' WHERE id=?",[$id]);
            $this->query("UPDATE campaigns SET inventory_mode='TERRITORY',catalog_complete=0,state='CREATED',generation=generation+1,import_worker=NULL,filter_stamp=NULL WHERE id=?",[$id]);
            $this->event($id,null,'MIGRATION','Mode wilayah Kota Palu diaktifkan; hasil dan identitas lama dipertahankan untuk pemetaan ulang.');return $this->overview($id);
        });
        if($c['inventory_mode']!=='TERRITORY')return parent::adminAction($action,$in);
        if($action==='release_review') {
            return $this->tx(function()use($id,$in){
                $c=$this->campaign($id,true);$g=$this->one('SELECT partition_id FROM territory_pages WHERE campaign_id=? AND page_no=?',[$id,(int)($in['page']??0)]);
                if(!$g||($in['confirm']??'')!=='REQUEUE')throw new ApiError('Paket tidak ditemukan/konfirmasi belum sesuai.');
                $p=$this->part($id,$g['partition_id']);
                if(strtotime(($p['lease_until']??'').' UTC')>time())throw new ApiError('Wilayah masih memiliki kunci aktif.',409,'LEASE');
                $this->query("UPDATE records SET result='PENDING',error='' WHERE campaign_id=? AND partition_id=? AND result IN ('RUNNING','ERROR')",[$id,$p['id']]);
                $this->query("UPDATE pages a JOIN territory_pages g ON g.campaign_id=a.campaign_id AND g.page_no=a.page_no SET a.state=IF(EXISTS(SELECT 1 FROM records r WHERE r.campaign_id=a.campaign_id AND r.page_no=a.page_no AND r.result='PENDING'),'PENDING','DONE'),a.worker_id=NULL,a.session_id=NULL,a.claim_token=NULL WHERE a.campaign_id=? AND g.partition_id=?",[$id,$p['id']]);
                $this->query("UPDATE partitions SET state='PENDING',worker_id=NULL,session_id=NULL WHERE campaign_id=? AND id=?",[$id,$p['id']]);return $this->overview($id);
            });
        }
        $r=parent::adminAction($action,$in);
        if($action==='retry')$this->requeuePartitions($id);
        if($action==='worker_toggle'&&!($in['enabled']??false))$this->query("UPDATE partitions SET state='REVIEW' WHERE campaign_id=? AND worker_id=? AND state='RUNNING'",[$id,$in['workerId']??'']);
        if($action==='reset') {foreach(['record_locations','territory_pages','partitions','regions'] as $t)$this->query('DELETE FROM '.$t.' WHERE campaign_id=?',[$id]);$this->query('UPDATE campaigns SET catalog_complete=0 WHERE id=?',[$id]);}
        return $this->overview($id);
    }
    private function requeuePartitions(string $id): void {
        $this->query("UPDATE partitions t SET state='PENDING' WHERE campaign_id=? AND state='DONE' AND EXISTS(SELECT 1 FROM records r WHERE r.campaign_id=t.campaign_id AND r.partition_id=t.id AND r.result='PENDING')",[$id]);
    }
    public function retryOwn(array $w,array $in): array { $r=parent::retryOwn($w,$in);$this->requeuePartitions($w['campaign_id']);return $r; }
    public function rows(string $campaign,?string $result=null,?int $page=null,int $offset=0,int $limit=500,string $search=''): array {
        $rows=parent::rows($campaign,$result,$page,$offset,$limit,$search);
        $mapping=[];$numbers=array_values(array_unique(array_column($rows,'page')));
        if($numbers)foreach($this->query('SELECT partition_id,local_page,page_no FROM territory_pages WHERE campaign_id=? AND page_no IN ('.implode(',',array_fill(0,count($numbers),'?')).')',[$campaign,...$numbers])->fetchAll(PDO::FETCH_ASSOC) as $g)$mapping[$g['page_no']]=$g;
        foreach($rows as &$r) {
            $g=$mapping[$r['page']]??null;
            $r['partitionId']=$g['partition_id']??null;$r['localPage']=isset($g['local_page'])?(int)$g['local_page']:null;
            if($g){$r['serverPage']=$r['page'];$r['page']=(int)$g['local_page'];}
        }return $rows;
    }
}
