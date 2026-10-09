<?php
declare(strict_types=1);

final class ApiError extends RuntimeException {
    public function __construct(string $message, public int $status=400, public string $kind='VALIDATION') { parent::__construct($message); }
}

final class Service {
    public function __construct(public PDO $db, private array $config) {}
    public static function now(): string { return gmdate('Y-m-d H:i:s'); }
    private function query(string $sql, array $args=[]): PDOStatement { $q=$this->db->prepare($sql);$q->execute($args);return $q; }
    private function one(string $sql,array $args=[]): ?array { return $this->query($sql,$args)->fetch(PDO::FETCH_ASSOC) ?: null; }
    private function tx(callable $fn): mixed {
        $this->db->beginTransaction();
        try { $value=$fn();$this->db->commit();return $value; }
        catch(Throwable $e) { if($this->db->inTransaction())$this->db->rollBack();throw $e; }
    }
    private function event(string $campaign,?string $worker,string $kind,string $message): void {
        $this->query('INSERT INTO events(campaign_id,worker_id,kind,message,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6))',[$campaign,$worker,$kind,substr($message,0,600)]);
    }
    public static function text(mixed $value): string { return trim(preg_replace('/\s+/u',' ',(string)($value??''))??''); }
    public static function key(string $value): string {
        $value=self::text($value);
        if(!preg_match('/^\d{16}\s*-\s*\S.+$/u',$value)||str_contains($value,'…')||str_ends_with($value,'...'))throw new ApiError('Kode identitas lengkap tidak valid.');
        $key=preg_replace('/\s*-\s*/u','-',$value);
        if(strlen($key)>250)throw new ApiError('Kode identitas terlalu panjang.');return $key;
    }
    public static function context(string $url): array {
        $u=parse_url($url);
        if(!$u||($u['scheme']??'')!=='https'||($u['host']??'')!=='fasih-sm.bps.go.id'||isset($u['user'])||isset($u['pass'])||isset($u['port'])||!preg_match('~^/app/surveys/([^/]+)/([^/]+)/data/?$~',$u['path']??'',$m))throw new ApiError('URL harus halaman Data FASIH.');
        parse_str($u['query']??'',$params);$params['perPage']='100';$params['view']='list';$params['page']='1';
        $source='https://fasih-sm.bps.go.id'.$u['path'].'?'.http_build_query($params);
        unset($params['page'],$params['view']);ksort($params);
        return ['scope'=>$m[1].'/'.$m[2],'path'=>$u['path'],'params'=>$params,'url'=>$source];
    }
    public static function validLink(string $url,string $host): bool {
        $u=parse_url(trim($url));return $u&&($u['scheme']??'')==='https'&&($u['host']??'')===$host&&!isset($u['user'])&&!isset($u['pass'])&&!isset($u['port'])&&($u['path']??'/')!=='/'&&!str_contains(urldecode($url),'…')&&!str_contains($url,'...');
    }
    public function worker(string $token): array {
        $w=$this->one('SELECT * FROM workers WHERE token_hash=? AND enabled=1',[hash('sha256',$token)]);
        if(!$w)throw new ApiError('Token komputer tidak valid atau sudah dinonaktifkan.',401,'AUTH');return $w;
    }
    private function campaign(string $id,bool $lock=false): array {
        $c=$this->one('SELECT * FROM campaigns WHERE id=?'.($lock?' FOR UPDATE':''),[$id]);
        if(!$c)throw new ApiError('Proyek tidak ditemukan.',404,'NOT_FOUND');return $c;
    }
    private function expire(string $campaign): void {
        $this->query("UPDATE pages SET state='REVIEW' WHERE campaign_id=? AND state='RUNNING' AND lease_until<=UTC_TIMESTAMP(6)",[$campaign]);
    }
    private function lease(): string { return gmdate('Y-m-d H:i:s',time()+max(60,min(1800,(int)($this->config['lease_seconds']??300)))); }
    private function touch(array $w,string $session,string $state,string $activity=''): void {
        if(!preg_match('/^[a-zA-Z0-9_-]{1,80}$/',$session))throw new ApiError('Session komputer tidak valid.');
        $this->query('UPDATE workers SET last_seen=UTC_TIMESTAMP(6),session_id=?,state=?,activity=? WHERE id=?',[$session,$state,substr($activity,0,255),$w['id']]);
    }
    private function owned(array $w,array $input,bool $recover=false): array {
        $p=$this->one('SELECT * FROM pages WHERE campaign_id=? AND page_no=? FOR UPDATE',[$w['campaign_id'],(int)($input['page']??0)]);
        if(!$p||$p['worker_id']!==$w['id']||$p['session_id']!==($input['session']??'')||!hash_equals($p['claim_token']??'',(string)($input['claimToken']??'')))throw new ApiError('Kepemilikan tugas berubah. Hentikan tindakan pada data ini.',409,'OWNERSHIP');
        if(!in_array($p['state'],['RUNNING','REVIEW'],true))throw new ApiError('Paket tugas sudah ditutup.',409,'OWNERSHIP');
        if(!$recover&&($p['state']!=='RUNNING'||strtotime($p['lease_until'].' UTC')<=time()))throw new ApiError('Kunci tugas kedaluwarsa. Lanjutkan dari komputer pemilik untuk pemulihan.',409,'LEASE');
        return $p;
    }
    private function pack(array $c,array $p): array {
        return ['campaign'=>$this->publicCampaign($c),'page'=>(int)$p['page_no'],'keys'=>json_decode($p['signature_json'],true),
            'claimToken'=>$p['claim_token'],'leaseSeconds'=>max(0,strtotime($p['lease_until'].' UTC')-time()),'rows'=>$this->rows($c['id'],null,(int)$p['page_no'])];
    }
    private function publicCampaign(array $c): array {
        return ['id'=>$c['id'],'name'=>$c['name'],'scope'=>$c['scope'],'sourceUrl'=>$c['source_url'],'context'=>json_decode($c['context_json'],true),
            'prefix'=>$c['prefix'],'linkHost'=>$c['link_host'],'expectedTotal'=>(int)$c['expected_total'],'state'=>$c['state'],'filterStamp'=>$c['filter_stamp'],'generation'=>(int)$c['generation']];
    }
    public function info(array $w): array {
        $this->query('UPDATE workers SET last_seen=UTC_TIMESTAMP(6) WHERE id=?',[$w['id']]);
        return ['worker'=>['id'=>$w['id'],'name'=>$w['name'],'role'=>$w['role']],'campaign'=>$this->publicCampaign($this->campaign($w['campaign_id'])),'counts'=>$this->counts($w['campaign_id'])];
    }
    public function beginImport(array $w,array $input): array {
        if($w['role']!=='COORDINATOR')throw new ApiError('Gunakan token komputer Koordinator untuk inventaris.',403,'ROLE');
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);
            if(($c['import_worker']&&$c['import_worker']!==$w['id']))throw new ApiError('Inventaris dimiliki komputer lain.',409,'IMPORT');
            $ctx=self::context((string)($input['url']??''));$expected=json_decode($c['context_json'],true);
            if($ctx['scope']!==$expected['scope']||$ctx['path']!==$expected['path']||$ctx['params']!=$expected['params']||($input['prefix']??'')!==$c['prefix'])throw new ApiError('URL/pencarian/prefix tidak cocok dengan proyek dashboard.',409,'CONTEXT');
            $stamp=(string)($input['filterStamp']??'');
            if($c['filter_stamp']!==null&&$c['filter_stamp']!==$stamp)throw new ApiError('Filter berbeda dari inventaris awal.',409,'FILTER');
            if(in_array($c['state'],['READY','RUNNING','PAUSED'],true))return $this->info($w);
            if(!in_array($c['state'],['CREATED','IMPORTING'],true))throw new ApiError('Inventaris tidak aktif.',409,'IMPORT');
            $this->query("UPDATE campaigns SET state='IMPORTING',import_worker=?,filter_stamp=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$w['id'],$stamp,$c['id']]);
            return $this->info($w);
        });
    }
    public function importPage(array $w,array $input): array {
        if($w['role']!=='COORDINATOR')throw new ApiError('Token tidak mempunyai hak inventaris.',403,'ROLE');
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);
            if(!in_array($c['state'],['IMPORTING','READY','RUNNING','PAUSED'],true)||$c['import_worker']!==$w['id'])throw new ApiError('Inventaris tidak aktif untuk komputer ini.',409,'IMPORT');
            $page=(int)($input['page']??0);$rows=$input['rows']??[];
            if($page<1||$page>10000||!is_array($rows)||count($rows)<1||count($rows)>100)throw new ApiError('Halaman inventaris harus berisi 1–100 kartu.');
            $keys=[];foreach($rows as $r){
                $f=$r['fields']??[];$k=self::key((string)($f['Kode Identitas']??''));
                if(($r['key']??'')!==$k||!str_starts_with($f['Kode Identitas'],$c['prefix'])||self::text($f['Status']??'')===''||!in_array(strtoupper(self::text($f['Mode']??'')),['CAWI','CAPI','PAPI'],true))throw new ApiError('Identitas, status, mode, atau cakupan kartu tidak valid.');
                if(isset($keys[$k]))throw new ApiError('Identitas berulang dalam satu halaman.');$keys[$k]=true;
            }
            $signature=json_encode(array_keys($keys),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
            $old=$this->one('SELECT * FROM pages WHERE campaign_id=? AND page_no=?',[$c['id'],$page]);
            if($old){if($old['signature_json']!==$signature)throw new ApiError('Isi halaman inventaris berubah.',409,'INVENTORY');return ['accepted'=>count($rows),'reused'=>true];}
            if($c['state']!=='IMPORTING')throw new ApiError('Inventaris sudah ditutup; halaman baru tidak boleh ditambahkan.',409,'IMPORT');
            $this->query('INSERT INTO pages(campaign_id,page_no,signature_json) VALUES(?,?,?)',[$c['id'],$page,$signature]);
            foreach($rows as $i=>$r){$f=$r['fields'];$eligible=strtoupper(self::text($f['Status']))==='OPEN';
                $this->query('INSERT INTO records(campaign_id,identity_key,page_no,ordinal_no,fields_json,initial_mode,result,error,captured_at,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))',
                    [$c['id'],$r['key'],$page,$i,json_encode($f,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$f['Mode'],$eligible?'PENDING':'SKIPPED',$eligible?'':'Status bukan OPEN: '.$f['Status']]);
            }
            return ['accepted'=>count($rows),'reused'=>false];
        });
    }
    public function finishImport(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);
            if($w['role']!=='COORDINATOR'||$c['import_worker']!==$w['id'])throw new ApiError('Inventaris bukan milik koordinator ini.',403,'ROLE');
            if(in_array($c['state'],['READY','RUNNING','PAUSED'],true))return $this->info($w);
            if($c['state']!=='IMPORTING')throw new ApiError('Inventaris tidak aktif.');
            $pages=$this->query('SELECT page_no FROM pages WHERE campaign_id=? ORDER BY page_no',[$c['id']])->fetchAll(PDO::FETCH_COLUMN);
            $count=$this->counts($c['id'])['total'];
            if(!$pages||array_map('intval',$pages)!==range(1,count($pages))||(int)($input['lastPage']??0)!==count($pages))throw new ApiError('Halaman inventaris belum lengkap/berurutan.',409,'INVENTORY');
            if($c['expected_total']&&$count!==(int)$c['expected_total'])throw new ApiError('Total inventaris '.$count.' berbeda dari target '.$c['expected_total'].'. Periksa filter atau ubah target melalui dashboard.',409,'COUNT');
            $this->query("UPDATE pages p SET state='DONE' WHERE campaign_id=? AND NOT EXISTS(SELECT 1 FROM records r WHERE r.campaign_id=p.campaign_id AND r.page_no=p.page_no AND r.result='PENDING')",[$c['id']]);
            $this->query("UPDATE campaigns SET state='READY',updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$c['id']]);
            $this->event($c['id'],$w['id'],'INVENTORY','Inventaris lengkap: '.$count.' identitas.');return $this->info($w);
        });
    }
    public function claim(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);$this->expire($c['id']);
            if(!in_array($c['state'],['READY','RUNNING'],true))throw new ApiError('Proyek belum siap atau sedang dijeda di dashboard.',409,'PAUSED');
            $session=(string)($input['session']??'');
            $existing=$this->one("SELECT * FROM pages WHERE campaign_id=? AND worker_id=? AND state IN ('RUNNING','REVIEW') ORDER BY page_no LIMIT 1 FOR UPDATE",[$c['id'],$w['id']]);
            if($existing){
                if($existing['session_id']!==$session)throw new ApiError('Token komputer ini masih mempunyai tugas dari proses lain. Lanjutkan proses lama; jangan gunakan token yang sama pada dua komputer.',409,'SESSION');
                $this->query("UPDATE pages SET state='RUNNING',lease_until=? WHERE campaign_id=? AND page_no=?",[$this->lease(),$c['id'],$existing['page_no']]);
                $existing['lease_until']=$this->lease();$existing['state']='RUNNING';$this->touch($w,$session,'RUNNING','Halaman '.$existing['page_no']);return $this->pack($c,$existing);
            }
            $p=$this->one("SELECT * FROM pages WHERE campaign_id=? AND state='PENDING' ORDER BY page_no LIMIT 1 FOR UPDATE",[$c['id']]);
            if(!$p){$this->touch($w,$session,'IDLE','Tidak ada paket siap');return ['empty'=>true,'counts'=>$this->counts($c['id'])];}
            $p['worker_id']=$w['id'];$p['session_id']=$session;$p['claim_token']=bin2hex(random_bytes(24));$p['lease_until']=$this->lease();
            $this->query("UPDATE pages SET state='RUNNING',worker_id=?,session_id=?,claim_token=?,lease_until=?,working_key=NULL WHERE campaign_id=? AND page_no=?",[$w['id'],$session,$p['claim_token'],$p['lease_until'],$c['id'],$p['page_no']]);
            $this->query("UPDATE campaigns SET state='RUNNING',updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$c['id']]);
            $this->touch($w,$session,'RUNNING','Halaman '.$p['page_no']);$this->event($c['id'],$w['id'],'CLAIM','Paket halaman '.$p['page_no'].' diberikan.');return $this->pack($c,$p);
        });
    }
    public function heartbeat(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);$this->expire($c['id']);
            $p=$this->owned($w,$input);
            $this->touch($w,$input['session'],$c['state']==='PAUSED'?'PAUSED':'RUNNING',self::text($input['activity']??'Halaman '.$p['page_no']));
            if($c['state']!=='PAUSED')$this->query('UPDATE pages SET lease_until=? WHERE campaign_id=? AND page_no=?',[$this->lease(),$c['id'],$p['page_no']]);
            return ['paused'=>$c['state']==='PAUSED','leaseSeconds'=>max(0,strtotime(($c['state']==='PAUSED'?$p['lease_until']:$this->lease()).' UTC')-time()),'counts'=>$this->counts($c['id'])];
        });
    }
    public function beginRecord(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);if($c['state']==='PAUSED')throw new ApiError('Proyek dijeda oleh administrator.',409,'PAUSED');
            $p=$this->owned($w,$input);$key=(string)($input['key']??'');
            $r=$this->one('SELECT * FROM records WHERE campaign_id=? AND identity_key=? AND page_no=? FOR UPDATE',[$c['id'],$key,$p['page_no']]);
            if(!$r)throw new ApiError('Identitas bukan anggota paket.',409,'IDENTITY');
            if(in_array($r['result'],['DONE','SKIPPED','ERROR'],true))return ['skip'=>true,'row'=>$this->row($r)];
            if($r['result']!=='RUNNING')$this->query("UPDATE records SET result='RUNNING',worker_id=?,attempts=attempts+1,stage='LINK_DICOBA',updated_at=UTC_TIMESTAMP(6) WHERE campaign_id=? AND identity_key=?",[$w['id'],$c['id'],$key]);
            $this->query('UPDATE pages SET working_key=?,lease_until=? WHERE campaign_id=? AND page_no=?',[$key,$this->lease(),$c['id'],$p['page_no']]);
            $this->touch($w,$input['session'],'RUNNING',self::text($r['identity_key']));return ['skip'=>false,'leaseSeconds'=>(int)($this->config['lease_seconds']??300)];
        });
    }
    public function checkpoint(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);$p=$this->owned($w,$input,true);$r=$input['record']??[];$key=(string)($r['key']??'');
            $old=$this->one('SELECT * FROM records WHERE campaign_id=? AND identity_key=? AND page_no=? FOR UPDATE',[$c['id'],$key,$p['page_no']]);
            if(!$old)throw new ApiError('Hasil bukan anggota paket.',409,'IDENTITY');
            $result=(string)($r['result']??'PENDING');if(!in_array($result,['PENDING','DONE','ERROR','SKIPPED'],true))throw new ApiError('Status hasil tidak valid.');
            $f=$r['fields']??[];if(self::key((string)($f['Kode Identitas']??''))!==$key)throw new ApiError('Identitas hasil tidak cocok.');
            $link=(string)($r['link']??$old['link']??'');
            if($link!==''&&!self::validLink($link,$c['link_host']))throw new ApiError('URL Unique Link tidak valid.');
            if($old['link']&&$link!==$old['link'])throw new ApiError('Link tersimpan berbeda; perlu pemeriksaan.',409,'LINK');
            if($result==='DONE'&&$link==='')throw new ApiError('Hasil selesai harus mempunyai link valid.');
            if(in_array($old['result'],['DONE','SKIPPED'],true)){
                if($result!==$old['result']||($old['link']??'')!==$link)throw new ApiError('Hasil final tidak boleh diturunkan.',409,'FINAL');return ['saved'=>true,'reused'=>true];
            }
            $stage=substr((string)($r['stage']??''),0,40);$storedResult=$result==='PENDING'?'RUNNING':$result;
            $this->query('UPDATE records SET fields_json=?,result=?,stage=?,link=?,link_hash=?,error=?,worker_id=?,link_at=IF(?<>\'\',COALESCE(link_at,UTC_TIMESTAMP(6)),link_at),finished_at=IF(? IN (\'DONE\',\'SKIPPED\'),UTC_TIMESTAMP(6),NULL),updated_at=UTC_TIMESTAMP(6) WHERE campaign_id=? AND identity_key=?',
                [json_encode(array_merge(json_decode($old['fields_json'],true),$f),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$storedResult,$stage,$link?:null,$link?hash('sha256',$link):null,substr((string)($r['error']??''),0,3000),$w['id'],$link,$storedResult,$c['id'],$key]);
            if($result==='ERROR')$this->event($c['id'],$w['id'],'ERROR',$key.': '.substr((string)($r['error']??''),0,400));
            $this->touch($w,$input['session'],'RUNNING',$key);return ['saved'=>true,'reused'=>false];
        });
    }
    public function closePage(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);$p=$this->owned($w,$input,true);
            $running=(int)$this->query("SELECT COUNT(*) FROM records WHERE campaign_id=? AND page_no=? AND result='RUNNING'",[$c['id'],$p['page_no']])->fetchColumn();
            $pending=(int)$this->query("SELECT COUNT(*) FROM records WHERE campaign_id=? AND page_no=? AND result='PENDING'",[$c['id'],$p['page_no']])->fetchColumn();
            $state=$running?'REVIEW':($pending?'PENDING':'DONE');
            if(($input['complete']??false)&&($running||$pending))throw new ApiError('Paket belum selesai; data masih tertunda.',409,'INCOMPLETE');
            $this->query('UPDATE pages SET state=?,working_key=NULL WHERE campaign_id=? AND page_no=?',[$state,$c['id'],$p['page_no']]);
            $this->touch($w,$input['session'],$running?'REVIEW':'IDLE','Paket '.$p['page_no'].' '.$state);
            $this->event($c['id'],$w['id'],'PACKAGE',$p['page_no'].' → '.$state);return ['state'=>$state,'counts'=>$this->counts($c['id'])];
        });
    }
    public function counts(string $campaign): array {
        $counts=['total'=>0,'done'=>0,'error'=>0,'pending'=>0,'running'=>0,'skipped'=>0,'review'=>0];
        foreach($this->query('SELECT result,COUNT(*) n FROM records WHERE campaign_id=? GROUP BY result',[$campaign])->fetchAll(PDO::FETCH_ASSOC) as $r){$counts['total']+=(int)$r['n'];$counts[strtolower($r['result'])]=(int)$r['n'];}
        $counts['review']=(int)$this->query("SELECT COUNT(*) FROM records r JOIN pages p ON p.campaign_id=r.campaign_id AND p.page_no=r.page_no WHERE r.campaign_id=? AND p.state='REVIEW' AND r.result NOT IN ('DONE','SKIPPED')",[$campaign])->fetchColumn();return $counts;
    }
    public function retryOwn(array $w,array $input): array {
        return $this->tx(function()use($w,$input){
            $c=$this->campaign($w['campaign_id'],true);
            $this->query("UPDATE records r JOIN pages p ON p.campaign_id=r.campaign_id AND p.page_no=r.page_no SET r.result='PENDING',r.error='',r.stage=IF(r.link IS NULL,'DATA_TERSIMPAN','LINK_TERSIMPAN'),p.state=IF(p.state='DONE','PENDING',p.state) WHERE r.campaign_id=? AND r.worker_id=? AND r.result='ERROR' AND (p.state IN ('DONE','PENDING') OR (p.worker_id=? AND p.session_id=?))",[$c['id'],$w['id'],$w['id'],$input['session']??'']);
            $this->event($c['id'],$w['id'],'RETRY','Data gagal komputer ini diaktifkan kembali.');return ['counts'=>$this->counts($c['id'])];
        });
    }
    private function row(array $r): array {
        $iso=fn($v)=>$v?gmdate('c',strtotime($v.' UTC')):null;
        return ['key'=>$r['identity_key'],'fields'=>json_decode($r['fields_json'],true),'initialMode'=>$r['initial_mode'],'finalMode'=>$r['link']?'CAWI':'',
            'page'=>(int)$r['page_no'],'result'=>$r['result']==='RUNNING'?'PENDING':$r['result'],'serverResult'=>$r['result'],'stage'=>$r['stage'],'link'=>$r['link']??'',
            'error'=>$r['error']??'','attempts'=>(int)$r['attempts'],'capturedAt'=>$iso($r['captured_at']),'linkAt'=>$iso($r['link_at']),
            'workerId'=>$r['worker_id'],'workerName'=>$r['worker_name']??'','finishedAt'=>$iso($r['finished_at'])];
    }
    public function rows(string $campaign,?string $result=null,?int $page=null,int $offset=0,int $limit=500,string $search=''): array {
        $sql='SELECT r.*,w.name worker_name FROM records r LEFT JOIN workers w ON w.id=r.worker_id WHERE r.campaign_id=?';$args=[$campaign];
        if($result==='REVIEW')$sql.=" AND EXISTS(SELECT 1 FROM pages p WHERE p.campaign_id=r.campaign_id AND p.page_no=r.page_no AND p.state='REVIEW') AND r.result NOT IN ('DONE','SKIPPED')";
        elseif($result){$sql.=' AND r.result=?';$args[]=$result;}
        if($page){$sql.=' AND r.page_no=?';$args[]=$page;}
        if($search!==''){$sql.=' AND (r.identity_key LIKE ? OR r.fields_json LIKE ?)';$args[]='%'.$search.'%';$args[]='%'.$search.'%';}
        $sql.=' ORDER BY r.page_no,r.ordinal_no LIMIT '.max(1,min(500,$limit)).' OFFSET '.max(0,$offset);
        return array_map(fn($r)=>$this->row($r),$this->query($sql,$args)->fetchAll(PDO::FETCH_ASSOC));
    }
    public function createCampaign(array $input): array {
        $ctx=self::context((string)($input['url']??''));$prefix=(string)($input['prefix']??'');$host=(string)($input['linkHost']??'esurvey.bps.go.id');$name=self::text($input['name']??'');
        if(!preg_match('/^\d{2,16}$/',$prefix)||!preg_match('/^[a-z0-9.-]+\.bps\.go\.id$/',$host)||$name===''||strlen($name)>160)throw new ApiError('Nama, prefix, atau domain link tidak valid.');
        $id=bin2hex(random_bytes(16));$total=(int)($input['expectedTotal']??0);if($total<0||$total>1000000)throw new ApiError('Target total tidak valid.');
        $this->query('INSERT INTO campaigns(id,scope,name,source_url,context_json,prefix,link_host,expected_total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))',[$id,$ctx['scope'],$name,$ctx['url'],json_encode($ctx,JSON_THROW_ON_ERROR),$prefix,$host,$total]);
        $this->event($id,null,'PROJECT','Proyek dibuat.');return $this->publicCampaign($this->campaign($id));
    }
    public function createWorker(array $input): array {
        $c=$this->campaign((string)($input['campaignId']??''));$name=self::text($input['name']??'');$role=($input['role']??'WORKER')==='COORDINATOR'?'COORDINATOR':'WORKER';
        if($name===''||strlen($name)>100)throw new ApiError('Nama komputer wajib diisi, maksimal 100 karakter.');
        $id=bin2hex(random_bytes(16));$token=bin2hex(random_bytes(32));
        $this->query('INSERT INTO workers(id,campaign_id,name,token_hash,role) VALUES(?,?,?,?,?)',[$id,$c['id'],$name,hash('sha256',$token),$role]);
        $this->event($c['id'],$id,'WORKER','Komputer '.$name.' dibuat.');return ['id'=>$id,'name'=>$name,'role'=>$role,'token'=>$token];
    }
    public function overview(string $campaign): array {
        $this->expire($campaign);$c=$this->campaign($campaign);
        $workers=$this->query("SELECT w.id,w.name,w.role,w.enabled,w.state,w.activity,w.last_seen,
            TIMESTAMPDIFF(SECOND,w.last_seen,UTC_TIMESTAMP()) seconds_ago,
            SUM(r.result='DONE') done,SUM(r.result='ERROR') errors FROM workers w LEFT JOIN records r ON r.worker_id=w.id AND r.campaign_id=w.campaign_id WHERE w.campaign_id=? GROUP BY w.id,w.name,w.role,w.enabled,w.state,w.activity,w.last_seen ORDER BY w.name",[$campaign])->fetchAll(PDO::FETCH_ASSOC);
        $pages=$this->query("SELECT p.page_no,p.state,p.worker_id,w.name worker_name,p.working_key,p.lease_until FROM pages p LEFT JOIN workers w ON w.id=p.worker_id WHERE p.campaign_id=? AND p.state IN ('RUNNING','REVIEW') ORDER BY p.page_no LIMIT 100",[$campaign])->fetchAll(PDO::FETCH_ASSOC);
        $events=$this->query('SELECT e.kind,e.message,e.created_at,w.name worker_name FROM events e LEFT JOIN workers w ON w.id=e.worker_id WHERE e.campaign_id=? ORDER BY e.id DESC LIMIT 30',[$campaign])->fetchAll(PDO::FETCH_ASSOC);
        $recent=(int)$this->query("SELECT COUNT(*) FROM records WHERE campaign_id=? AND result='DONE' AND finished_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)",[$campaign])->fetchColumn();
        return ['campaign'=>$this->publicCampaign($c),'counts'=>$this->counts($campaign),'workers'=>$workers,'packages'=>$pages,'events'=>$events,'perMinute'=>$recent/10,'serverTime'=>gmdate('c')];
    }
    public function adminAction(string $action,array $input): array {
        $id=(string)($input['campaignId']??'');
        return $this->tx(function()use($action,$input,$id){
            $c=$this->campaign($id,true);$this->expire($id);
            if($action==='pause'||$action==='resume'){
                if(!in_array($c['state'],['READY','RUNNING','PAUSED'],true))throw new ApiError('Inventaris belum siap.');
                $this->query('UPDATE campaigns SET state=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[$action==='pause'?'PAUSED':'READY',$id]);
            }elseif($action==='edit_campaign'){
                if($c['state']!=='CREATED')throw new ApiError('URL/cakupan proyek hanya dapat diubah sebelum inventaris atau setelah reset pusat.',409,'INVENTORY');
                $ctx=self::context((string)($input['url']??''));$prefix=(string)($input['prefix']??'');$host=(string)($input['linkHost']??'');$name=self::text($input['name']??'');$n=(int)($input['expectedTotal']??0);
                if(!preg_match('/^\d{2,16}$/',$prefix)||!preg_match('/^[a-z0-9.-]+\.bps\.go\.id$/',$host)||$name===''||strlen($name)>160||$n<0||$n>1000000)throw new ApiError('Nama, prefix, domain link, atau target tidak valid.');
                $this->query('UPDATE campaigns SET name=?,scope=?,source_url=?,context_json=?,prefix=?,link_host=?,expected_total=?,generation=generation+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[$name,$ctx['scope'],$ctx['url'],json_encode($ctx,JSON_THROW_ON_ERROR),$prefix,$host,$n,$id]);
            }elseif($action==='expected'){
                if(!in_array($c['state'],['CREATED','IMPORTING'],true))throw new ApiError('Target hanya dapat diubah sebelum inventaris selesai.');
                $n=(int)($input['expectedTotal']??0);if($n<0||$n>1000000)throw new ApiError('Target tidak valid.');$this->query('UPDATE campaigns SET expected_total=? WHERE id=?',[$n,$id]);
            }elseif($action==='retry'){
                $this->query("UPDATE records r JOIN pages p ON p.campaign_id=r.campaign_id AND p.page_no=r.page_no SET r.result='PENDING',r.error='',r.stage='DATA_TERSIMPAN',p.state='PENDING' WHERE r.campaign_id=? AND r.result='ERROR' AND p.state NOT IN ('RUNNING','REVIEW')",[$id]);
            }elseif($action==='release_review'){
                $page=(int)($input['page']??0);$p=$this->one('SELECT * FROM pages WHERE campaign_id=? AND page_no=? FOR UPDATE',[$id,$page]);
                if(!$p||$p['state']!=='REVIEW'||strtotime($p['lease_until'].' UTC')>time()||($input['confirm']??'')!=='REQUEUE')throw new ApiError('Paket review hanya boleh diantrikan setelah kunci berakhir dan konfirmasi REQUEUE.',409,'LEASE');
                $this->query("UPDATE records SET result='PENDING',error='',stage=IF(link IS NULL,'DATA_TERSIMPAN','LINK_TERSIMPAN') WHERE campaign_id=? AND page_no=? AND result IN ('RUNNING','ERROR')",[$id,$page]);
                $this->query("UPDATE pages SET state='PENDING',claim_token=NULL,session_id=NULL,worker_id=NULL WHERE campaign_id=? AND page_no=?",[$id,$page]);
            }elseif($action==='worker_toggle'){
                $this->query('UPDATE workers SET enabled=? WHERE id=? AND campaign_id=?',[(int)(bool)($input['enabled']??false),$input['workerId']??'',$id]);
                if(!($input['enabled']??false))$this->query("UPDATE pages SET state='REVIEW' WHERE campaign_id=? AND worker_id=? AND state='RUNNING'",[$id,$input['workerId']??'']);
            }elseif($action==='reset'){
                if(($input['confirm']??'')!==$c['name'])throw new ApiError('Ketik nama proyek untuk reset data pusat.');
                $active=(int)$this->query("SELECT COUNT(*) FROM pages WHERE campaign_id=? AND state IN ('RUNNING','REVIEW') AND lease_until>UTC_TIMESTAMP(6)",[$id])->fetchColumn();
                if($active)throw new ApiError('Masih ada kunci aktif. Jeda semua komputer dan tunggu kunci berakhir sebelum reset pusat.',409,'LEASE');
                foreach(['records','pages','events'] as $table)$this->query('DELETE FROM '.$table.' WHERE campaign_id=?',[$id]);
                $this->query("UPDATE campaigns SET state='CREATED',generation=generation+1,filter_stamp=NULL,import_worker=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[$id]);
                $this->query("UPDATE workers SET state='IDLE',session_id=NULL,activity='' WHERE campaign_id=?",[$id]);
            }else throw new ApiError('Aksi admin tidak dikenal.');
            $this->event($id,null,strtoupper($action),'Aksi dashboard: '.$action);return $this->overview($id);
        });
    }
    public function campaigns(): array { return array_map(fn($c)=>$this->publicCampaign($c),$this->query('SELECT * FROM campaigns ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC)); }
}
