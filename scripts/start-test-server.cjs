// Disposable loopback-only PHP/MariaDB development services; no Windows service is installed.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),tools=path.join(root,'.tools'),php=path.join(tools,'php/php.exe'),dbBin=path.join(tools,'mariadb/mariadb-10.11.14-winx64/bin');
const stateFile=path.join(tools,'test-state.json'),state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)): {password:crypto.randomBytes(24).toString('hex')};
const datadir=path.join(tools,'test-mysql-data');
if(!fs.existsSync(datadir)){
  const r=spawnSync(path.join(dbBin,'mariadb-install-db.exe'),['--datadir='+datadir,'--password='+state.password,'--port=3319','--silent'],{encoding:'utf8',windowsHide:true});
  if(r.status)throw new Error('MariaDB init failed: '+r.stdout+r.stderr);
}
fs.writeFileSync(stateFile,JSON.stringify(state));
const config={dsn:'mysql:host=127.0.0.1;port=3319;dbname=fulx_test;charset=utf8mb4',db_user:'root',db_password:state.password,setup_key:'fulx-local-install-fixture-only-2026-key',allow_http:true,lease_seconds:90};
const configFile=path.join(tools,'fulx-test.php');
fs.writeFileSync(configFile,'<?php return json_decode('+JSON.stringify(JSON.stringify(config))+',true);');
const log=fs.openSync(path.join(tools,'test-services.log'),'a');
function background(exe,args,env={}){const p=spawn(exe,args,{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log],env:{...process.env,...env}});p.unref();return p.pid;}
state.dbPid=background(path.join(dbBin,'mariadbd.exe'),['--no-defaults','--datadir='+datadir,'--port=3319','--bind-address=127.0.0.1','--console','--skip-log-bin']);
const phpArgs=['-d','extension_dir='+path.join(tools,'php/ext'),'-d','extension=pdo_mysql'];
(async()=>{
  const code='$c=require getenv("FASIH_CONFIG");$d=new PDO(str_replace(";dbname=fulx_test","",$c["dsn"]),$c["db_user"],$c["db_password"]);$d->exec("CREATE DATABASE IF NOT EXISTS fulx_test CHARACTER SET utf8mb4");';
  for(let i=0;i<30;i++){const r=spawnSync(php,[...phpArgs,'-r',code],{env:{...process.env,FASIH_CONFIG:configFile},windowsHide:true,encoding:'utf8'});if(!r.status)break;if(i===29)throw new Error(r.stderr);await new Promise(r=>setTimeout(r,200));}
  state.phpPid=background(php,[...phpArgs,'-S','127.0.0.1:9079','-t',path.join(root,'server/public')],{FASIH_CONFIG:configFile});
  fs.writeFileSync(stateFile,JSON.stringify(state));console.log('Local FULX test services ready: http://127.0.0.1:9079 (loopback only).');
})();
