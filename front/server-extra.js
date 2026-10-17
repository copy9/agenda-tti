/* ===== termos, privacidade e meus dados (#23) ===== */
const XT={
 pt:{tt:'Termos e privacidade atualizados',tp:'Atualizamos os Termos de uso e a Política de privacidade. Leia e aceite para continuar usando a Agenda TTI.',acc:'Aceitar e continuar',out:'Sair',terms:'Termos de uso',priv:'Política de privacidade',
  md:'Meus dados',cl:'Fechar',mi:'Você controla os dados da sua conta: pode baixar uma cópia ou pedir a exclusão.',dl:'Baixar uma cópia',dlp:'Um arquivo com os dados da sua conta, das suas casas e propostas, e dos seus aceites.',dlb:'Baixar meus dados',
  del:'Excluir minha conta',delp:'A conta e os dados ligados a ela são apagados depois de {n} dias. Nesse prazo você pode cancelar. Conversas e propostas com outras pessoas deixam de existir para elas também.',pw:'Sua senha',delb:'Pedir exclusão da conta',
  pend:'Exclusão agendada para {d}. Até lá, você pode cancelar.',can:'Cancelar a exclusão',req:'Exclusão agendada',canned:'Exclusão cancelada',nopw:'Digite sua senha para confirmar.'},
 en:{tt:'Updated terms and privacy',tp:'We updated the Terms of use and the Privacy policy. Read and accept to keep using Agenda TTI.',acc:'Accept and continue',out:'Sign out',terms:'Terms of use',priv:'Privacy policy',
  md:'My data',cl:'Close',mi:'You control your account data: you can download a copy or ask for deletion.',dl:'Download a copy',dlp:'A file with your account data, your houses and proposals, and your acceptances.',dlb:'Download my data',
  del:'Delete my account',delp:'The account and the data linked to it are erased after {n} days. Until then you can cancel. Conversations and proposals with other people stop existing for them too.',pw:'Your password',delb:'Request account deletion',
  pend:'Deletion scheduled for {d}. Until then you can cancel.',can:'Cancel deletion',req:'Deletion scheduled',canned:'Deletion canceled',nopw:'Enter your password to confirm.'},
 es:{tt:'Términos y privacidad actualizados',tp:'Actualizamos los Términos de uso y la Política de privacidad. Lea y acepte para seguir usando Agenda TTI.',acc:'Aceptar y continuar',out:'Salir',terms:'Términos de uso',priv:'Política de privacidad',
  md:'Mis datos',cl:'Cerrar',mi:'Usted controla los datos de su cuenta: puede descargar una copia o pedir la eliminación.',dl:'Descargar una copia',dlp:'Un archivo con los datos de su cuenta, sus casas y propuestas, y sus aceptaciones.',dlb:'Descargar mis datos',
  del:'Eliminar mi cuenta',delp:'La cuenta y los datos vinculados se borran después de {n} días. Hasta entonces puede cancelar. Las conversaciones y propuestas con otras personas también dejan de existir para ellas.',pw:'Su contraseña',delb:'Pedir eliminación de la cuenta',
  pend:'Eliminación programada para el {d}. Hasta entonces puede cancelar.',can:'Cancelar la eliminación',req:'Eliminación programada',canned:'Eliminación cancelada',nopw:'Escriba su contraseña para confirmar.'}};
const xt=(k,v)=>{let s=(XT[TTI_LANG]||XT.pt)[k]||XT.pt[k];if(v)Object.keys(v).forEach(n=>{s=s.replace('{'+n+'}',v[n])});return s};
const xdate=ms=>new Date(ms).toLocaleDateString(LNAMES[TTI_LANG]||'pt-BR',{day:'2-digit',month:'long',year:'numeric'});
const legalUrl=k=>(k==='terms'?'/termos':'/privacidade')+'?lg='+TTI_LANG;
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[data-legal]');if(!a)return;e.preventDefault();window.open(legalUrl(a.dataset.legal),'_blank','noopener')});

/* Aceite obrigatório quando a versão dos termos muda (o servidor responde 403 com code "terms"). */
let TERMP=null;
function srvTerms(){
 if(TERMP)return TERMP;
 TERMP=new Promise(ok=>{
  const d=$('tmod'),acc=$('tma'),ex=$('tmx');
  $('tmt').textContent=xt('tt');$('tmp').textContent=xt('tp');$('tml1').textContent=xt('terms');$('tml2').textContent=xt('priv');acc.textContent=xt('acc');ex.textContent=xt('out');$('tme').hidden=true;
  d.oncancel=e=>e.preventDefault();
  acc.onclick=async()=>{MO.busy(acc,true);$('tme').hidden=true;
   try{await api0('/api/terms/accept',{version:(window.TTI_BOOT||{}).terms});if(SRVU)SRVU.needTerms=false;d.close();TERMP=null;ok()}
   catch(x){$('tme').hidden=false;$('tme').textContent=x.message}finally{MO.busy(acc,false)}};
  ex.onclick=()=>{api0('/api/logout',{}).catch(()=>{}).then(()=>location.reload())};
  if(!d.open)d.showModal()});
 return TERMP}

/* Meus dados: baixar uma cópia e pedir a exclusão da conta (direitos do titular). */
async function openMyData(){
 const d=$('mydata');let ACTED=false;d.oninput=()=>{ACTED=true};
 const draw=st=>{
  d.innerHTML='<div class="fh"><h2 id="mdt">'+xt('md')+'</h2><button class="fx" id="mdx" type="button" aria-label="'+xt('cl')+'">×</button></div><div class="xd"><p>'+xt('mi')+'</p>'
   +'<h3>'+xt('dl')+'</h3><p>'+xt('dlp')+'</p><div class="row"><a class="btn o" href="/api/me/export" download>'+xt('dlb')+'</a></div>'
   +'<h3>'+xt('del')+'</h3>'
   +(st.pending?'<p>'+xt('pend',{d:xdate(st.due)})+'</p><div class="row"><button class="btn o" id="mdc" type="button">'+xt('can')+'</button></div>'
    :'<p>'+xt('delp',{n:st.grace})+'</p><div class="row"><input id="mdp" type="password" autocomplete="current-password" placeholder="'+xt('pw')+'" aria-label="'+xt('pw')+'"><button class="btn o" id="mdb" type="button">'+xt('delb')+'</button></div><div class="err" id="mde" hidden role="alert"></div>')
   +'<p class="lk"><a href="/termos" data-legal="terms">'+xt('terms')+'</a> · <a href="/privacidade" data-legal="privacy">'+xt('priv')+'</a></p></div>';
  $('mdx').onclick=()=>d.close();
  const c=$('mdc');if(c)c.onclick=async()=>{MO.busy(c,true);try{const r=await api('/api/me/delete/cancel',{});ACTED=true;draw(r);toast(xt('canned'))}catch(x){toast(x.message);MO.busy(c,false)}};
  const b=$('mdb');if(b)b.onclick=async()=>{const p=$('mdp').value;if(!p){$('mde').hidden=false;$('mde').textContent=xt('nopw');return}
   MO.busy(b,true);try{const r=await api('/api/me/delete',{pass:p});ACTED=true;draw(r);toast(xt('req'))}catch(x){$('mde').hidden=false;$('mde').textContent=x.message;MO.busy(b,false)}}};
 draw({pending:false,grace:7});
 d.showModal();
 try{const st0=await api0('/api/me/delete');if(!ACTED)draw(st0)}catch(x){toast(x.message)}}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#fdata'))openMyData()});

/* ===== avisos por e-mail e push (#11) ===== */
Object.assign(XT.pt,{nt:'Avisos por e-mail e push',ni:'Escolha como e quando a Agenda TTI avisa você fora do site.',cht:'Onde receber',c_both:'E-mail e push',c_email:'Só e-mail',c_push:'Só push',c_none:'Nenhum',
 evt:'Quais avisos',e_invite:'Convites',e_proposal:'Propostas recebidas e cancelamentos',e_answer:'Respostas às minhas propostas',e_expiring:'Prazos: lembrete e vencimento',
 mailoff:'O envio de e-mail ainda não está ligado neste servidor.',pusht:'Push neste aparelho',pon:'Ativado neste aparelho.',poff:'Desativado neste aparelho.',pno:'Este navegador não oferece push.',pden:'A permissão foi negada. Libere nas configurações do navegador.',
 pen:'Ativar neste aparelho',pdis:'Desativar neste aparelho',saved:'Preferências salvas',ask:'Quer ser avisado de novas propostas mesmo com o site fechado?',asky:'Ativar avisos',askn:'Agora não',pdone:'Avisos ativados neste aparelho'});
Object.assign(XT.en,{nt:'Email and push notices',ni:'Choose how and when Agenda TTI notifies you outside the site.',cht:'Where to receive',c_both:'Email and push',c_email:'Email only',c_push:'Push only',c_none:'None',
 evt:'Which notices',e_invite:'Invitations',e_proposal:'Proposals received and cancellations',e_answer:'Replies to my proposals',e_expiring:'Deadlines: reminder and expiry',
 mailoff:'Email sending is not turned on on this server yet.',pusht:'Push on this device',pon:'Enabled on this device.',poff:'Disabled on this device.',pno:'This browser does not support push.',pden:'Permission was denied. Allow it in the browser settings.',
 pen:'Enable on this device',pdis:'Disable on this device',saved:'Preferences saved',ask:'Want to be notified of new proposals even with the site closed?',asky:'Turn on notices',askn:'Not now',pdone:'Notices enabled on this device'});
Object.assign(XT.es,{nt:'Avisos por correo y push',ni:'Elija cómo y cuándo Agenda TTI le avisa fuera del sitio.',cht:'Dónde recibir',c_both:'Correo y push',c_email:'Solo correo',c_push:'Solo push',c_none:'Ninguno',
 evt:'Qué avisos',e_invite:'Invitaciones',e_proposal:'Propuestas recibidas y cancelaciones',e_answer:'Respuestas a mis propuestas',e_expiring:'Plazos: recordatorio y vencimiento',
 mailoff:'El envío de correo aún no está activado en este servidor.',pusht:'Push en este dispositivo',pon:'Activado en este dispositivo.',poff:'Desactivado en este dispositivo.',pno:'Este navegador no ofrece push.',pden:'Se negó el permiso. Permítalo en la configuración del navegador.',
 pen:'Activar en este dispositivo',pdis:'Desactivar en este dispositivo',saved:'Preferencias guardadas',ask:'¿Quiere recibir avisos de nuevas propuestas aunque el sitio esté cerrado?',asky:'Activar avisos',askn:'Ahora no',pdone:'Avisos activados en este dispositivo'});
const pushSupported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
const b64uToU8=s=>{const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function pushSub(){if(!pushSupported())return null;try{const reg=await navigator.serviceWorker.getRegistration('/');return reg?await reg.pushManager.getSubscription():null}catch(e){return null}}
async function pushEnable(){
 if(!pushSupported())throw new Error(xt('pno'));
 if(Notification.permission==='denied')throw new Error(xt('pden'));
 const perm=await Notification.requestPermission();       /* a permissão é pedida aqui, por um clique, nunca no primeiro acesso */
 if(perm!=='granted')throw new Error(xt('pden'));
 const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
 const {key}=await api0('/api/push/key');
 const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToU8(key)});
 return api('/api/push/subscribe',sub.toJSON())}
async function pushDisable(){const sub=await pushSub();const ep=sub&&sub.endpoint;if(sub)await sub.unsubscribe();return ep?api('/api/push/unsubscribe',{endpoint:ep}):api0('/api/me/prefs')}

async function openNotif(){
 const d=$('notifd');
 let P;try{P=await api0('/api/me/prefs')}catch(x){toast(x.message);return}
 const draw=async()=>{
  const sub=await pushSub(),perm=pushSupported()?Notification.permission:'unsupported';
  const evs=['invite','proposal','answer','expiring'];
  d.innerHTML='<div class="fh"><h2 id="ntt">'+xt('nt')+'</h2><button class="fx" id="ntx" type="button" aria-label="'+xt('cl')+'">×</button></div><div class="xd"><p>'+xt('ni')+'</p>'
   +'<h3>'+xt('cht')+'</h3>'+['both','email','push','none'].map(c=>'<label class="tcw" style="margin:8px 0"><input type="radio" name="nch" value="'+c+'"'+(P.ch===c?' checked':'')+'><span>'+xt('c_'+c)+'</span></label>').join('')
   +(P.mail?'':'<p class="mute">'+xt('mailoff')+'</p>')
   +'<h3>'+xt('evt')+'</h3>'+evs.map(e=>'<label class="tcw" style="margin:8px 0"><input type="checkbox" data-ev="'+e+'"'+(P.ev[e]?' checked':'')+'><span>'+xt('e_'+e)+'</span></label>').join('')
   +'<h3>'+xt('pusht')+'</h3><p>'+(perm==='unsupported'?xt('pno'):perm==='denied'?xt('pden'):(sub&&P.push?xt('pon'):xt('poff')))+'</p>'
   +(perm==='unsupported'||perm==='denied'?'':'<div class="row"><button class="btn o" id="ntp" type="button">'+((sub&&P.push)?xt('pdis'):xt('pen'))+'</button></div><div class="err" id="nte" hidden role="alert"></div>')
   +'</div>';
  $('ntx').onclick=()=>d.close();
  const save=async body=>{try{P=await api('/api/me/prefs',body);toast(xt('saved'))}catch(x){toast(x.message)}};
  d.querySelectorAll('input[name=nch]').forEach(i=>i.onchange=()=>save({ch:i.value}));
  d.querySelectorAll('input[data-ev]').forEach(i=>i.onchange=()=>save({ev:{[i.dataset.ev]:i.checked}}));
  const b=$('ntp');if(b)b.onclick=async()=>{MO.busy(b,true);try{P=(sub&&P.push)?await pushDisable():await pushEnable();await draw();if(P.push)toast(xt('pdone'))}catch(x){const e=$('nte');if(e){e.hidden=false;e.textContent=x.message}MO.busy(b,false)}}};
 await draw();if(!d.open)d.showModal()}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#fnotif'))openNotif()});

/* Convite discreto para ligar o push, só depois de existir uma proposta e nunca antes de qualquer ação da pessoa. */
let NUDGED=false,LANGSYNC=false;
async function maybeNudge(){
 if(NUDGED||!SRVU||SRVU.role==='admin'||SRVU.needTerms||!pushSupported()||Notification.permission!=='default')return;
 try{const t=Number(localStorage.getItem('tti-pushask')||0);if(Date.now()-t<14*864e5)return}catch(e){}
 if(!(DB.get('props',[])||[]).some(p=>!p.ghost))return;
 NUDGED=true;
 const el=document.createElement('div');el.id='pushask';el.setAttribute('role','dialog');el.setAttribute('data-notr','');
 el.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:60;background:var(--surf,#fff);color:var(--ink,#14212b);border:1px solid var(--line,#dbe3e8);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;max-width:min(560px,92vw);font-size:14.5px';
 el.innerHTML='<span style="flex:1;min-width:200px">'+xt('ask')+'</span><button class="btn s" id="pa-y" type="button">'+xt('asky')+'</button><button class="btn o s" id="pa-n" type="button">'+xt('askn')+'</button>';
 document.body.appendChild(el);
 const close=()=>el.remove(),later=()=>{try{localStorage.setItem('tti-pushask',String(Date.now()))}catch(e){}close()};
 $('pa-n').onclick=later;
 $('pa-y').onclick=async()=>{MO.busy($('pa-y'),true);try{await pushEnable();toast(xt('pdone'));close()}catch(x){toast(x.message);later()}}}
/* Depois de cada atualização dos dados: sincroniza o idioma uma vez por sessão e avalia o convite do push. */
{const _sa=srvApply;srvApply=function(v,f){_sa(v,f);if(!LANGSYNC&&SRVU&&SRVU.role!=='admin'&&!SRVU.needTerms){LANGSYNC=true;api0('/api/me/prefs',{lang:TTI_LANG}).catch(()=>{})}maybeNudge()}}
{const _sl=setLang;setLang=function(l){_sl(l);if(SRVU&&SRVU.role!=='admin'&&!SRVU.needTerms)api0('/api/me/prefs',{lang:l}).catch(()=>{})}}

/* ===== recuperação de senha (#24) ===== */
Object.assign(XT.pt,{fgt:'Esqueci a senha',fgp:'Informe o e-mail da conta. Se ele existir, enviaremos um link para criar uma nova senha, válido por 30 minutos.',fgs:'Enviar link',fgd:'Se este e-mail tem conta, o link já está a caminho. Confira também a caixa de spam.',rst:'Criar nova senha',rsp:'Escolha uma senha nova, com pelo menos 6 caracteres.',rsb:'Salvar nova senha',rsok:'Senha alterada. Entre com a nova senha.',npw:'Nova senha',em:'E-mail',cl2:'Fechar'});
Object.assign(XT.en,{fgt:'Forgot password',fgp:'Enter the account email. If it exists, we will send a link to create a new password, valid for 30 minutes.',fgs:'Send link',fgd:'If this email has an account, the link is on its way. Check your spam folder too.',rst:'Create new password',rsp:'Choose a new password with at least 6 characters.',rsb:'Save new password',rsok:'Password changed. Sign in with the new password.',npw:'New password',em:'Email',cl2:'Close'});
Object.assign(XT.es,{fgt:'Olvidé mi contraseña',fgp:'Ingrese el correo de la cuenta. Si existe, enviaremos un enlace para crear una nueva contraseña, válido por 30 minutos.',fgs:'Enviar enlace',fgd:'Si este correo tiene cuenta, el enlace ya va en camino. Revise también el spam.',rst:'Crear nueva contraseña',rsp:'Elija una contraseña nueva de al menos 6 caracteres.',rsb:'Guardar nueva contraseña',rsok:'Contraseña cambiada. Entre con la nueva contraseña.',npw:'Nueva contraseña',em:'Correo',cl2:'Cerrar'});
function openReset(token){
 const d=$('rstd');
 d.innerHTML='<div class="fh"><h2 id="rtt">'+xt(token?'rst':'fgt')+'</h2><button class="fx" id="rtx" type="button" aria-label="'+xt('cl2')+'">×</button></div><div class="xd"><p>'+xt(token?'rsp':'fgp')+'</p>'
  +(token?'<input id="rtp" type="password" autocomplete="new-password" placeholder="'+xt('npw')+'" aria-label="'+xt('npw')+'">':'<input id="rte" type="email" autocomplete="email" placeholder="'+xt('em')+'" aria-label="'+xt('em')+'" value="'+($('e').value||'').replace(/[<>"'&]/g,'')+'">')
  +'<div class="err" id="rter" hidden role="alert"></div><div class="row" style="margin-top:16px"><button class="btn" id="rtb" type="button">'+xt(token?'rsb':'fgs')+'</button></div></div>';
 $('rtx').onclick=()=>d.close();
 $('rtb').onclick=async()=>{const b=$('rtb'),er=$('rter');er.hidden=true;MO.busy(b,true);
  try{
   if(token){await api('/api/reset',{token,pass:$('rtp').value});try{history.replaceState(null,'','/')}catch(x){}d.close();toast(xt('rsok'))}
   else{await api('/api/forgot',{email:$('rte').value.trim()});er.hidden=false;er.textContent=xt('fgd')}
  }catch(x){er.hidden=false;er.textContent=x.message}
  MO.busy(b,false)};
 if(!d.open)d.showModal()}
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('#fgl');if(a){e.preventDefault();openReset(null)}});
{const m=/[?&]redefinir=([a-f0-9]{64})/.exec(location.search);if(m)setTimeout(()=>openReset(m[1]),300)}

/* Perfil público do corretor (#54): a tela e o diálogo são compartilhados com a demonstração (source.html); aqui só a busca no servidor. */
async function showProfile(code){
 $('home').hidden=true;$('pub').hidden=false;$('pub').innerHTML=MO.skel('pub');
 try{const r=await api0('/api/public/broker/'+encodeURIComponent(code));
  showProfPage({bn:r.bn,wa:r.wa,av:r.av,c:r.c,r:r.r,bi:r.bi,hs:r.hs.map(h=>Object.assign({},h,{href:g=>'/c/'+encodeURIComponent(h.pg)+'?b='+encodeURIComponent(code)+'&lg='+g}))})}
 catch(x){$('pub').innerHTML='<div class="pv" style="text-align:center;padding:90px 20px"><h1>'+L3('Este perfil não está disponível','This profile is not available','Este perfil no está disponible')+'</h1></div>'}}
