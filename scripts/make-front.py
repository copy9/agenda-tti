#!/usr/bin/env python3
"""Gera public/index.html (front em MODO SERVIDOR) a partir do front de demonstração.
Se window.TTI_BOOT.api não existir (arquivo aberto direto), o front continua funcionando em modo demonstração."""
import sys, re
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf8').read()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# 0) variável de inicialização (o servidor troca "window.TTI_BOOT=null;" pelos dados da sessão)
rep('<script>try{var _t=localStorage.getItem("tti-theme")', '<script>window.TTI_BOOT=null;</script>\n<script>try{var _t=localStorage.getItem("tti-theme")')
# idioma da página pública /c/<slug>?lg=en
rep("||location.search.match(/[?&]c=[^&]+&lg=(pt|en|es)/);if(_h)", "||location.search.match(/[?&]c=[^&]+&lg=(pt|en|es)/)||(/^\\/c\\//.test(location.pathname)&&location.search.match(/[?&]lg=(pt|en|es)/));if(_h)")

# 1) modo servidor + dados de demonstração desligados
rep("const $=id=>document.getElementById(id);\nconst USER=", "const $=id=>document.getElementById(id);\nconst SRV=!!(window.TTI_BOOT&&window.TTI_BOOT.api);let SRVU=SRV?(window.TTI_BOOT.user||null):null;\nconst USER=")
rep("const USER={email:'teste@teste.com',pass:'123456',name:'Proprietário Teste',wa:'51999990001'};", "const USER={email:'teste@teste.com',pass:'123456',name:'Proprietário Teste',wa:'51999990001'};if(SRV){USER.email='@';USER.name='';USER.pass='';USER.wa=''}")
rep("let blocks={h1:[add(10),add(11),add(12)],h2:[add(5)],h3:[]};", "let blocks={h1:[add(10),add(11),add(12)],h2:[add(5)],h3:[]};if(SRV)blocks={};")
rep("H.forEach(h=>{h.rules=RULES0;h.acc='Retirar as chaves com o zelador na portaria da casa.';h.wfn=h.name.split(' ')[0]+'-WiFi';h.wfp='bemvindo2026'});", "H.forEach(h=>{h.rules=RULES0;h.acc='Retirar as chaves com o zelador na portaria da casa.';h.wfn=h.name.split(' ')[0]+'-WiFi';h.wfp='bemvindo2026'});if(SRV)H.length=0;")
for fn in ['seedTester', 'seedDemo', 'seedChat', 'seedAg', 'seed5']:
    rep('function %s(){' % fn, 'function %s(){if(SRV)return;' % fn)

# 2) camada de dados: no servidor fica só na memória; ganha load() e wipe()
rep("catch(e){ok=false}\n const ADAPTER", "catch(e){ok=false}if(SRV)ok=false;\n const ADAPTER")
rep("  onChange(f){subs.push(f)}}})();", "  load(o){Object.keys(o).forEach(k=>{mem[P+k]=JSON.stringify(o[k])})},wipe(){Object.keys(mem).forEach(k=>delete mem[k])},\n  onChange(f){subs.push(f)}}})();")

# 3) login / cadastro / convite / sair
rep("$('go').onclick=()=>{const e=$('e').value.trim().toLowerCase(),p=$('p').value", "$('go').onclick=SRV?srvGo:()=>{const e=$('e').value.trim().toLowerCase(),p=$('p').value")
rep("$('out').onclick=()=>{try{sessionStorage.removeItem('tti-auth')}catch(x){}AUTH=null;", "$('out').onclick=()=>{if(SRV)srvLogout();try{sessionStorage.removeItem('tti-auth')}catch(x){}AUTH=null;")
rep("$('hint').hidden=r!=='owner'||su;", "$('hint').hidden=SRV||r!=='owner'||su;")
rep("const ex=!!BR()[iv.email];$('nmw')", "const ex=SRV?!!iv.exists:!!BR()[iv.email];$('nmw')")
rep("function readInvite(){const m=", "function readInvite(){if(SRV)return null;const m=")
rep("function readPub(){try{", "function readPub(){if(SRV)return null;try{")
rep("if(pv0)showPub(pv0,false);else if(iv0)", "if(SRV)srvBoot();else if(pv0)showPub(pv0,false);else if(iv0)")

# 4) convites pelo servidor
rep("const ok=((B[v.email]||{}).houses||[]).some(x=>x.id==='r'+h.id);", "const ok=SRV?!!v.ok:((B[v.email]||{}).houses||[]).some(x=>x.id==='r'+h.id);")
rep("function linkFor(h,email){const {id,custom,photos,...rest}=h;", "function linkFor(h,email){if(SRV){const v=(INV[h.id]||[]).find(x=>x.email===email);return location.origin+'/?convite='+(v&&v.tok||'')}const {id,custom,photos,...rest}=h;")
rep(" const a=INV[h.id]||(INV[h.id]=[]);if(!a.some(x=>x.email===e))a.push({email:e,at:today});saveInv();\n showLink(", " if(SRV)return srvInvite(h,e);\n const a=INV[h.id]||(INV[h.id]=[]);if(!a.some(x=>x.email===e))a.push({email:e,at:today});saveInv();\n showLink(")

# 5) página pública da casa
rep("const PUBBASE=()=>location.href.split('#')[0].split('?')[0];", "const PUBBASE=()=>SRV?location.origin:location.href.split('#')[0].split('?')[0];")
rep("const pubLink=(h,g)=>PUBBASE()+'?c='+b64u(pubShort(h))+'&lg='+(g||PLG||TTI_LANG);", "const pubLink=(h,g)=>SRV?location.origin+'/c/'+(h.pg||'')+'?'+(SRVU&&SRVU.role==='broker'&&SRVU.code?'b='+SRVU.code+'&':'')+'lg='+(g||PLG||TTI_LANG):PUBBASE()+'?c='+b64u(pubShort(h))+'&lg='+(g||PLG||TTI_LANG);")
rep("ph=(L&&L.photos&&L.photos.length)?L.photos.map(", "ph=(p.ph&&p.ph.length)?p.ph:(L&&L.photos&&L.photos.length)?L.photos.map(")

# 6) administração pelo servidor
rep("const ADM=()=>{try{return DB.get('admin',null)", "const ADM=()=>{if(SRV)return{email:(SRVU&&SRVU.email)||'',pass:''};try{return DB.get('admin',null)")
rep("const OWNERS=()=>[{e:USER.email,n:USER.name,core:true,role:'Proprietário'}].concat(", "const OWNERS=()=>(SRV?[]:[{e:USER.email,n:USER.name,core:true,role:'Proprietário'}]).concat(")
rep("try{ok=sessionStorage.getItem('tti-admin')==='1'}catch(e){}\n if(ok)return showAdmin();", "try{ok=SRV?!!(SRVU&&SRVU.role==='admin'):sessionStorage.getItem('tti-admin')==='1'}catch(e){}\n if(ok)return showAdmin();")
rep("$('ago').onclick=()=>{const c=ADM()", "$('ago').onclick=SRV?srvAdminGo:()=>{const c=ADM()")
rep("$('aout').onclick=()=>{try{sessionStorage.removeItem('tti-admin')}catch(e){}showHome()};", "$('aout').onclick=()=>{if(SRV)srvLogout();try{sessionStorage.removeItem('tti-admin')}catch(e){}showHome()};")
rep("if(AT==='cf'){$('cbk').onclick=()=>{const d=DB.dump(['admin']);", "if(AT==='cf'){$('cbk').onclick=()=>{if(SRV){location.href='/api/admin/backup';return}const d=DB.dump(['admin']);")
rep("$('cps').onclick=()=>{const e=m=>{$('cpe').hidden=false;$('cpe').textContent=m};", "$('cps').onclick=()=>{const e=m=>{$('cpe').hidden=false;$('cpe').textContent=m};if(SRV){api('/api/admin/password',{old:$('cp0').value,new:$('cp1').value}).then(()=>{toast('Senha alterada');arender()},x=>e(x.message));return}")
rep("if(a==='susp'){const S=SUSP();", "if(a==='susp'&&SRV)return srvAdm('suspend',{email:id,on:!SUSP()[id]},SUSP()[id]?'Conta reativada':'Conta suspensa');\n if(a==='susp'){const S=SUSP();")
rep("if(ARM!==k){ARM=k;return arender()}ARM=null;", "if(ARM!==k){ARM=k;return arender()}ARM=null;\n if(SRV){if(a==='du')return srvAdm('delete-user',{email:id},'Usuário excluído');if(a==='dh')return srvAdm('delete-house',{id},'Casa excluída');if(a==='cp')return srvAdm('cancel-proposal',{id},'Proposta cancelada');return toast('Indisponível no servidor')}")

# 7) bloco do modo servidor (antes do restante do script terminar)
SRV_JS = r"""
/* ===== observabilidade do navegador: erros e Web Vitals ===== */
(function(){if(!SRV)return;const sent=new Set();let n=0;
 const send=(p,b)=>{try{const body=JSON.stringify(b);if(navigator.sendBeacon&&navigator.sendBeacon(p,new Blob([body],{type:'application/json'})))return;fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})}catch(e){}};
 const rep=(m,st)=>{m=String(m||'').slice(0,300);if(!m||sent.has(m)||n>=10)return;sent.add(m);n++;send('/api/telemetry/error',{message:m,stack:String(st||'').slice(0,2500)})};
 addEventListener('error',e=>rep(e.message,(e.error&&e.error.stack)||((e.filename||'')+':'+e.lineno+':'+e.colno)));
 addEventListener('unhandledrejection',e=>rep('Promise: '+((e.reason&&e.reason.message)||e.reason),e.reason&&e.reason.stack));
 const v={};try{new PerformanceObserver(l=>{for(const x of l.getEntries()){if(x.entryType==='largest-contentful-paint')v.LCP=x.startTime;if(x.entryType==='layout-shift'&&!x.hadRecentInput)v.CLS=(v.CLS||0)+x.value;if(x.entryType==='paint'&&x.name==='first-contentful-paint')v.FCP=x.startTime}}).observe({entryTypes:['largest-contentful-paint','layout-shift','paint'],buffered:true})}catch(e){}
 addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden'||v._s)return;v._s=1;try{const nv=performance.getEntriesByType('navigation')[0];if(nv)v.TTFB=nv.responseStart}catch(e){}['LCP','CLS','FCP','TTFB'].forEach(k=>{if(v[k]!=null)send('/api/telemetry/vitals',{name:k,value:Math.round(v[k]*1000)/1000})})});
})();
/* ===================== MODO SERVIDOR ===================== */
async function api(path,body){const o={credentials:'same-origin',headers:{}};if(body!==undefined){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(body)}
 let r;try{r=await fetch(path,o)}catch(e){throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')}
 let j=null;try{j=await r.json()}catch(e){}
 if(!r.ok){const e=new Error((j&&j.error)||'Erro do servidor ('+r.status+').');e.status=r.status;throw e}return j}
const SRVK=['edits','susp','owners','brokers','houses','blocks','props','inv','chat','noti','prof','tour','remx','rems'];
const PUSHK=['houses','props','blocks','noti','chat','prof','inv','tour','remx','rems'];
let SREV=0,SNAP={},SDIRTY=new Set(),SBUSY=false,STMR=null,SPOLL=null,SPEND=false;
const KEYF={houses:h=>h.id,props:p=>p.id,chat:t=>t.id,noti:n=>n.to+'|'+n.at};
function sidx(name,val){if(KEYF[name]&&Array.isArray(val)){const m={};val.forEach(x=>{m[KEYF[name](x)]=JSON.stringify(x)});return m}
 if(name==='blocks'&&val&&typeof val==='object'){const m={};Object.keys(val).forEach(k=>{m[k]=JSON.stringify(val[k])});return m}
 return JSON.stringify(val==null?null:val)}
function sops(name,val,snap){
 if(KEYF[name]){const up=[],del=[],cur={};(val||[]).forEach(x=>{const k=KEYF[name](x);cur[k]=1;if(name==='houses'&&x.owner!==ME)return;if(snap[k]!==JSON.stringify(x))up.push(x)});
  if(name==='houses')Object.keys(snap).forEach(k=>{if(!cur[k])del.push(k)});
  return up.length||del.length?{c:name,up,del}:null}
 if(name==='blocks'){if(!SRVU||SRVU.role!=='owner')return null;const own=new Set((DB.get('houses',[])||[]).map(h=>h.id)),up={},del=[];val=val||{};
  Object.keys(val).forEach(k=>{if(own.has(k)&&snap[k]!==JSON.stringify(val[k]))up[k]=val[k]});Object.keys(snap).forEach(k=>{if(own.has(k)&&!(k in val))del.push(k)});
  return Object.keys(up).length||del.length?{c:'blocks',up,del}:null}
 if(sidx(name,val)===snap)return null;
 return name==='prof'?{c:'prof',up:val}:{c:name,set:val}}
function srvQueue(name){if(!SRVU||SRVU.role==='admin'||!PUSHK.includes(name))return;SDIRTY.add(name);clearTimeout(STMR);STMR=setTimeout(srvFlush,200)}
async function srvFlush(){
 if(SBUSY){STMR=setTimeout(srvFlush,300);return}
 const names=[...SDIRTY];SDIRTY.clear();
 const ops=names.map(n=>sops(n,DB.get(n,null),SNAP[n])).filter(Boolean);if(!ops.length)return;
 SBUSY=true;
 try{const r=await api('/api/sync',{ops});SREV=r.rev;if(!SDIRTY.size)srvApply(r.view)}
 catch(e){if(e.status===401)srvExpired();else{toast(e.message);try{const r=await api('/api/sync');SREV=r.rev;srvApply(r.view,true)}catch(x){}}}
 finally{SBUSY=false;if(SDIRTY.size){clearTimeout(STMR);STMR=setTimeout(srvFlush,50)}}}
function srvLoad(view){DB.load(view);SNAP={};SRVK.forEach(k=>{SNAP[k]=sidx(k,view[k])});
 try{CUS=view.houses||[];OVR={};Object.keys(INV).forEach(k=>delete INV[k]);Object.assign(INV,view.inv||{});HAS_B=true;blocks=view.blocks||{};reload()}catch(e){}}
function srvRender(){
 if(document.querySelector('dialog[open]')||(/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||'')&&AUTH&&!$('app').hidden)){SPEND=true;return}
 SPEND=false;
 try{if(SRVU&&SRVU.role==='admin'){if(!$('adm').hidden){aload();arender()}}else if(AUTH&&!$('app').hidden)render()}catch(e){console.error(e)}}
function srvApply(view,force){
 let changed=!!force;if(!changed)for(const k of SRVK){if(view[k]!==undefined&&JSON.stringify(view[k])!==JSON.stringify(DB.get(k,null))){changed=true;break}}
 srvLoad(view);if(changed)srvRender()}
async function srvPull(){const r=await api('/api/sync');SREV=r.rev;srvLoad(r.view)}
function srvPoll(){clearInterval(SPOLL);SPOLL=setInterval(async()=>{
  if(!SRVU||SBUSY||SDIRTY.size||document.hidden)return;
  try{const r=await api('/api/sync?since='+SREV);if(r.same){if(SPEND)srvRender();return}SREV=r.rev;srvApply(r.view)}catch(e){if(e.status===401)srvExpired()}},5000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&SRVU&&!SBUSY)api('/api/sync?since='+SREV).then(r=>{if(!r.same){SREV=r.rev;srvApply(r.view)}},()=>{})});
function srvExpired(){SRVU=null;clearInterval(SPOLL);SDIRTY.clear();DB.wipe();AUTH=null;try{resetLogin()}catch(e){}showHome();toast('Sua sessão expirou. Entre de novo.')}
function srvLogout(){api('/api/logout',{}).catch(()=>{});SRVU=null;clearInterval(SPOLL);clearTimeout(STMR);SDIRTY.clear();DB.wipe();CUS=[];PROP=[];NOTI=[];CHAT=[];blocks={};Object.keys(INV).forEach(k=>delete INV[k])}
DB.onChange((n)=>{if(SRV)srvQueue(n)});

async function srvGo(){
 const e=$('e').value.trim().toLowerCase(),p=$('p').value,nm=$('nm').value.trim().replace(/[<>"'&]/g,''),wa=$('wa').value.replace(/\D/g,'');
 const bad=m=>{$('err').hidden=false;$('err').textContent=m},btn=$('go');
 if(btn.disabled)return;btn.disabled=true;$('err').hidden=true;
 const inv=INVT,su=SU,lr=LR;let logged=false;
 try{
  let r;
  if(inv){
   if(inv.exists)r=await api('/api/login',{email:e,pass:p,role:'broker'});
   else r=await api('/api/register',{role:'broker',email:e,name:nm,wa,pass:p});
   SRVU=r.user;logged=true;
   await api('/api/invites/accept',{token:inv.token});
  }else if(su){r=await api('/api/register',{role:lr,email:e,name:nm,wa,pass:p});SRVU=r.user;logged=true}
  else{r=await api('/api/login',{email:e,pass:p,role:lr});SRVU=r.user;logged=true}
  await srvPull();
  try{history.replaceState(null,'','/')}catch(x){}
  resetLogin();enter(SRVU.role,SRVU.email);srvPoll();
  toast(inv?'Casa adicionada à sua agenda':su?(lr==='owner'?'Conta criada. Cadastre sua primeira casa.':'Conta criada. Peça ao proprietário para convidar você.'):'Bem-vindo de volta');
 }catch(x){
  if(logged&&inv){api('/api/logout',{}).catch(()=>{});SRVU=null}
  bad(x.message);
 }finally{btn.disabled=false}}
async function srvAdminGo(){
 const e=$('ae').value.trim().toLowerCase(),btn=$('ago');if(btn.disabled)return;btn.disabled=true;$('aerr').hidden=true;
 try{await api('/api/admin/login',{email:e,pass:$('ap').value});SRVU={role:'admin',email:e,name:'Administração'};await srvPull();showAdmin();srvPoll()}
 catch(x){$('aerr').hidden=false;$('aerr').textContent=x.message}finally{btn.disabled=false}}
async function srvAdm(act,body,msg){
 try{const r=await api('/api/admin/'+act,body);SREV=r.rev;srvLoad(r.view);toast(msg)}catch(x){toast(x.message)}
 try{aload();arender()}catch(e){}}
async function srvInvite(h,e){
 try{const r=await api('/api/invites',{hid:h.id,email:e});SREV=r.rev;srvLoad(r.view);showLink(r.url,h,e);$('iv-e').value='';invs(h);toast('Convite criado. Link copiado, envie ao corretor')}
 catch(x){toast(x.message)}}
async function srvBoot(){
 const B=window.TTI_BOOT||{},q=new URLSearchParams(location.search);
 if(B.slug){
  try{const p=await api('/api/public/house/'+encodeURIComponent(B.slug)+(B.b?'?b='+encodeURIComponent(B.b):''));showPub(p,false)}
  catch(x){const el=$('pub');$('home').hidden=true;el.hidden=false;el.innerHTML='<div class="pv" style="text-align:center;padding:90px 20px"><h1>Esta casa não está disponível</h1><p class="loc">O link pode ter sido removido pelo proprietário.</p></div>'}
  return}
 const tk=q.get('convite');
 if(tk){
  try{const i=await api('/api/invites/'+encodeURIComponent(tk));showInvite({token:tk,email:i.email,owner:i.owner,h:{name:i.house},exists:i.exists});
   if(i.otherRole){$('err').hidden=false;$('err').textContent='Este e-mail pertence a uma conta de proprietário. Peça um novo convite com outro e-mail.'}}
  catch(x){toast(x.message)}
  return}
 if(SRVU){try{await srvPull();if(SRVU.role==='admin'){srvPoll();return}enter(SRVU.role,SRVU.email);srvPoll()}catch(x){if(x.status===401){SRVU=null}}}}
/* ========================================================= */
"""
marker = "const iv0=readInvite(),pv0=readPub();"
assert s.count(marker) == 1
s = s.replace(marker, SRV_JS + marker)

open(dst, 'w', encoding='utf8').write(s)
print('ok', len(s))
