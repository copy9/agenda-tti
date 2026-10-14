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
 const d=$('mydata');
 const draw=st=>{
  d.innerHTML='<div class="fh"><h2 id="mdt">'+xt('md')+'</h2><button class="fx" id="mdx" type="button" aria-label="'+xt('cl')+'">×</button></div><div class="xd"><p>'+xt('mi')+'</p>'
   +'<h3>'+xt('dl')+'</h3><p>'+xt('dlp')+'</p><div class="row"><a class="btn o" href="/api/me/export" download>'+xt('dlb')+'</a></div>'
   +'<h3>'+xt('del')+'</h3>'
   +(st.pending?'<p>'+xt('pend',{d:xdate(st.due)})+'</p><div class="row"><button class="btn o" id="mdc" type="button">'+xt('can')+'</button></div>'
    :'<p>'+xt('delp',{n:st.grace})+'</p><div class="row"><input id="mdp" type="password" autocomplete="current-password" placeholder="'+xt('pw')+'" aria-label="'+xt('pw')+'"><button class="btn o" id="mdb" type="button">'+xt('delb')+'</button></div><div class="err" id="mde" hidden role="alert"></div>')
   +'<p class="lk"><a href="/termos" data-legal="terms">'+xt('terms')+'</a> · <a href="/privacidade" data-legal="privacy">'+xt('priv')+'</a></p></div>';
  $('mdx').onclick=()=>d.close();
  const c=$('mdc');if(c)c.onclick=async()=>{MO.busy(c,true);try{const r=await api('/api/me/delete/cancel',{});draw(r);toast(xt('canned'))}catch(x){toast(x.message);MO.busy(c,false)}};
  const b=$('mdb');if(b)b.onclick=async()=>{const p=$('mdp').value;if(!p){$('mde').hidden=false;$('mde').textContent=xt('nopw');return}
   MO.busy(b,true);try{const r=await api('/api/me/delete',{pass:p});draw(r);toast(xt('req'))}catch(x){$('mde').hidden=false;$('mde').textContent=x.message;MO.busy(b,false)}}};
 draw({pending:false,grace:7});
 d.showModal();
 try{draw(await api0('/api/me/delete'))}catch(x){toast(x.message)}}
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#fdata'))openMyData()});
