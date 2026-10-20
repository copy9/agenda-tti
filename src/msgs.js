'use strict';
// Textos dos avisos por e-mail e push, nos 3 idiomas. Módulo puro (sem banco, sem rede).
// REGRA DE PRIVACIDADE: avisos para CORRETOR nunca citam outro corretor. Só o aviso ao proprietário pode usar {broker}.

const LANGS = ['pt', 'en', 'es'];
const MONTHS = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};
const pickLang = (l) => (LANGS.includes(l) ? l : 'pt');

function fmtDate(k, lang) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(k || ''));
  if (!m) return '';
  const mon = MONTHS[lang][Number(m[2]) - 1] || '';
  return lang === 'en' ? `${mon} ${Number(m[3])}, ${m[1]}` : `${Number(m[3])} ${mon} ${m[1]}`;
}
function fmtMoney(v, lang) {
  const n = Math.round(Number(v) || 0);
  return 'R$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
}

// grp = grupo de preferência. to = para quem o aviso é (owner | broker | both), só documentação e testes.
const KINDS = {
  invite: { grp: 'invite', to: 'broker',
    pt: ['{owner} convidou você para a casa {house}', 'Você foi convidado para ver e propor datas da casa {house} na Agenda TTI. Abra o link para criar sua conta ou entrar: {url}'],
    en: ['{owner} invited you to the house {house}', 'You were invited to view and propose dates for the house {house} on Agenda TTI. Open the link to create your account or sign in: {url}'],
    es: ['{owner} lo invitó a la casa {house}', 'Lo invitaron a ver y proponer fechas de la casa {house} en Agenda TTI. Abra el enlace para crear su cuenta o entrar: {url}'] },
  invite_accepted: { grp: 'invite', to: 'owner',
    pt: ['{broker} aceitou o convite para {house}', '{broker} agora vê a casa {house} na própria agenda.'],
    en: ['{broker} accepted the invitation to {house}', '{broker} can now see the house {house} in their calendar.'],
    es: ['{broker} aceptó la invitación a {house}', '{broker} ahora ve la casa {house} en su agenda.'] },
  proposal_new: { grp: 'proposal', to: 'owner',
    pt: ['Nova proposta para {house}', '{broker} enviou uma proposta para {house}, de {in} a {out}, no valor de {value}. Responda em até {hours} horas.'],
    en: ['New proposal for {house}', '{broker} sent a proposal for {house}, from {in} to {out}, for {value}. Reply within {hours} hours.'],
    es: ['Nueva propuesta para {house}', '{broker} envió una propuesta para {house}, del {in} al {out}, por {value}. Responda en un plazo de {hours} horas.'] },
  proposal_cancelled: { grp: 'proposal', to: 'owner',
    pt: ['{broker} cancelou a proposta para {house}', 'A proposta de {in} a {out} foi cancelada. As datas voltaram a ficar livres.'],
    en: ['{broker} canceled the proposal for {house}', 'The proposal from {in} to {out} was canceled. The dates are free again.'],
    es: ['{broker} canceló la propuesta para {house}', 'La propuesta del {in} al {out} fue cancelada. Las fechas volvieron a quedar libres.'] },
  counter_accepted: { grp: 'proposal', to: 'owner',
    pt: ['{broker} aceitou sua contraproposta', '{broker} aceitou {value} para {house}, de {in} a {out}. As datas foram bloqueadas para toda a rede.'],
    en: ['{broker} accepted your counteroffer', '{broker} accepted {value} for {house}, from {in} to {out}. The dates were blocked for the whole network.'],
    es: ['{broker} aceptó su contraoferta', '{broker} aceptó {value} para {house}, del {in} al {out}. Las fechas se bloquearon para toda la red.'] },
  counter_declined: { grp: 'proposal', to: 'owner',
    pt: ['{broker} recusou sua contraproposta', 'A contraproposta para {house}, de {in} a {out}, foi recusada. As datas voltaram a ficar livres.'],
    en: ['{broker} declined your counteroffer', 'The counteroffer for {house}, from {in} to {out}, was declined. The dates are free again.'],
    es: ['{broker} rechazó su contraoferta', 'La contraoferta para {house}, del {in} al {out}, fue rechazada. Las fechas volvieron a quedar libres.'] },
  proposal_accepted: { grp: 'answer', to: 'broker',
    pt: ['Sua proposta para {house} foi aceita', 'O proprietário aceitou sua proposta de {in} a {out} por {value}. As datas foram bloqueadas para toda a rede. Próximo passo: pague o adiantamento ao proprietário e informe o pagamento na reserva.'],
    en: ['Your proposal for {house} was accepted', 'The owner accepted your proposal from {in} to {out} for {value}. The dates were blocked for the whole network. Next step: pay the advance to the owner and report the payment in the booking.'],
    es: ['Su propuesta para {house} fue aceptada', 'El propietario aceptó su propuesta del {in} al {out} por {value}. Las fechas se bloquearon para toda la red. Siguiente paso: pague el anticipo al propietario e informe el pago en la reserva.'] },
  proposal_declined: { grp: 'answer', to: 'broker',
    pt: ['Sua proposta para {house} foi recusada', 'O proprietário recusou a proposta de {in} a {out}. As datas continuam livres para novas propostas.'],
    en: ['Your proposal for {house} was declined', 'The owner declined the proposal from {in} to {out}. The dates remain open for new proposals.'],
    es: ['Su propuesta para {house} fue rechazada', 'El propietario rechazó la propuesta del {in} al {out}. Las fechas siguen libres para nuevas propuestas.'] },
  proposal_countered: { grp: 'answer', to: 'broker',
    pt: ['Contraproposta para {house}', 'O proprietário respondeu com {value} para {in} a {out}. Responda em até {hours} horas.'],
    en: ['Counteroffer for {house}', 'The owner replied with {value} for {in} to {out}. Reply within {hours} hours.'],
    es: ['Contraoferta para {house}', 'El propietario respondió con {value} para el {in} al {out}. Responda en un plazo de {hours} horas.'] },
  proposal_closed: { grp: 'answer', to: 'broker',
    pt: ['Sua proposta para {house} foi encerrada', 'As datas de {in} a {out} foram reservadas por outra proposta.'],
    en: ['Your proposal for {house} was closed', 'The dates from {in} to {out} were booked by another proposal.'],
    es: ['Su propuesta para {house} fue cerrada', 'Las fechas del {in} al {out} fueron reservadas por otra propuesta.'] },
  admin_cancelled: { grp: 'answer', to: 'both',
    pt: ['A administração cancelou a proposta para {house}', 'A proposta de {in} a {out} foi cancelada pela administração. As datas voltaram a ficar livres.'],
    en: ['The administration canceled the proposal for {house}', 'The proposal from {in} to {out} was canceled by the administration. The dates are free again.'],
    es: ['La administración canceló la propuesta para {house}', 'La propuesta del {in} al {out} fue cancelada por la administración. Las fechas volvieron a quedar libres.'] },
  proposal_expiring: { grp: 'expiring', to: 'both',
    pt: ['A proposta para {house} vence em {hours} h', 'A proposta de {in} a {out} ainda aguarda resposta e vence em cerca de {hours} horas.'],
    en: ['The proposal for {house} expires in {hours} h', 'The proposal from {in} to {out} still awaits a reply and expires in about {hours} hours.'],
    es: ['La propuesta para {house} vence en {hours} h', 'La propuesta del {in} al {out} aún espera respuesta y vence en unas {hours} horas.'] },
  proposal_expired: { grp: 'expiring', to: 'both',
    pt: ['A proposta para {house} expirou', 'A proposta de {in} a {out} expirou sem resposta. As datas voltaram a ficar livres.'],
    en: ['The proposal for {house} expired', 'The proposal from {in} to {out} expired without a reply. The dates are free again.'],
    es: ['La propuesta para {house} venció', 'La propuesta del {in} al {out} venció sin respuesta. Las fechas volvieron a quedar libres.'] },
};
KINDS.password_reset = { grp: 'security', to: 'both',
  pt: ['Redefinir sua senha da Agenda TTI', 'Recebemos um pedido para redefinir a sua senha. Abra o link em até 30 minutos: {url}\n\nSe não foi você, ignore este e-mail: nada muda na sua conta.'],
  en: ['Reset your Agenda TTI password', 'We received a request to reset your password. Open the link within 30 minutes: {url}\n\nIf it was not you, ignore this email: nothing changes in your account.'],
  es: ['Restablecer su contraseña de Agenda TTI', 'Recibimos una solicitud para restablecer su contraseña. Abra el enlace en un plazo de 30 minutos: {url}\n\nSi no fue usted, ignore este correo: su cuenta no cambia.'] };
KINDS.password_changed = { grp: 'security', to: 'both',
  pt: ['Sua senha da Agenda TTI foi alterada', 'A senha da sua conta acabou de ser redefinida e todos os acessos abertos foram encerrados. Se não foi você, fale com a administração agora.'],
  en: ['Your Agenda TTI password was changed', 'Your account password was just reset and all open sessions were ended. If it was not you, contact the administration now.'],
  es: ['Su contraseña de Agenda TTI fue cambiada', 'La contraseña de su cuenta acaba de ser restablecida y se cerraron todas las sesiones abiertas. Si no fue usted, contacte a la administración ahora.'] };
KINDS.advance_informed = { grp: 'proposal', to: 'owner',
  pt: ['{broker} informou o pagamento do adiantamento', 'O adiantamento de {house}, de {in} a {out}, foi informado como pago. Confira o recebimento e confirme na Agenda TTI.'],
  en: ['{broker} reported the advance payment', 'The advance for {house}, from {in} to {out}, was reported as paid. Check that you received it and confirm on Agenda TTI.'],
  es: ['{broker} informó el pago del anticipo', 'El anticipo de {house}, del {in} al {out}, fue informado como pagado. Verifique que lo recibió y confirme en Agenda TTI.'] };
KINDS.advance_confirmed = { grp: 'answer', to: 'broker',
  pt: ['Casa liberada: adiantamento confirmado', 'O proprietário confirmou o adiantamento de {house}, de {in} a {out}. Agora aguarde a página de check-in da família.'],
  en: ['House released: advance confirmed', 'The owner confirmed the advance for {house}, from {in} to {out}. Now wait for the guest check-in page.'],
  es: ['Casa liberada: anticipo confirmado', 'El propietario confirmó el anticipo de {house}, del {in} al {out}. Ahora espere la página de check-in de la familia.'] };
KINDS.checkin_ready = { grp: 'answer', to: 'broker',
  pt: ['A página de check-in de {house} está pronta', 'O proprietário preencheu a página de check-in de {in} a {out}. Abra a reserva, copie o link e envie ao cliente.'],
  en: ['The check-in page for {house} is ready', 'The owner filled in the check-in page for {in} to {out}. Open the booking, copy the link and send it to your client.'],
  es: ['La página de check-in de {house} está lista', 'El propietario completó la página de check-in del {in} al {out}. Abra la reserva, copie el enlace y envíelo al cliente.'] };
KINDS.proposal_queued = { grp: 'answer', to: 'broker',
  pt: ['Sua proposta para {house} entrou na fila', 'As datas de {in} a {out} estão em análise. Sua proposta segue na fila e será enviada ao proprietário se as datas voltarem a ficar livres.'],
  en: ['Your proposal for {house} is in the queue', 'The dates from {in} to {out} are under review. Your proposal stays in the queue and goes to the owner if the dates become free again.'],
  es: ['Su propuesta para {house} entró en la fila', 'Las fechas del {in} al {out} están en análisis. Su propuesta sigue en la fila y irá al propietario si las fechas vuelven a quedar libres.'] };
// Aviso ao proprietário de que há oferta maior esperando. Nunca cita o corretor da fila: ele segue anônimo.
KINDS.queue_higher = { grp: 'proposal', to: 'owner',
  pt: ['Oferta maior aguardando para {house}', 'Chegou uma proposta de {value} para {in} a {out}, acima da que está esperando sua resposta. Ela assume o lugar se a atual for recusada ou expirar.'],
  en: ['Higher offer waiting for {house}', 'A proposal of {value} arrived for {in} to {out}, above the one awaiting your reply. It takes its place if the current one is rejected or expires.'],
  es: ['Oferta mayor en espera para {house}', 'Llegó una propuesta de {value} para el {in} al {out}, por encima de la que espera su respuesta. Ocupa su lugar si la actual es rechazada o expira.'] };
KINDS.proposal_promoted = { grp: 'answer', to: 'broker',
  pt: ['Sua proposta para {house} saiu da fila', 'As datas de {in} a {out} ficaram livres e sua proposta foi enviada ao proprietário.'],
  en: ['Your proposal for {house} left the queue', 'The dates from {in} to {out} became free and your proposal was sent to the owner.'],
  es: ['Su propuesta para {house} salió de la fila', 'Las fechas del {in} al {out} quedaron libres y su propuesta fue enviada al propietario.'] };
KINDS.advance_due = { grp: 'expiring', to: 'broker',
  pt: ['Informe o adiantamento de {house} em {hours} h', 'A reserva de {in} a {out} será liberada e você receberá uma ocorrência se o adiantamento não for informado em cerca de {hours} horas.'],
  en: ['Report the advance for {house} in {hours} h', 'The booking from {in} to {out} will be released and you will get a strike if the advance is not reported in about {hours} hours.'],
  es: ['Informe el anticipo de {house} en {hours} h', 'La reserva del {in} al {out} será liberada y recibirá una ocurrencia si el anticipo no se informa en unas {hours} horas.'] };
KINDS.proposal_released = { grp: 'expiring', to: 'both',
  pt: ['A reserva de {house} foi liberada', 'O adiantamento de {in} a {out} não foi informado no prazo. As datas voltaram à agenda e o corretor recebeu uma ocorrência.'],
  en: ['The booking for {house} was released', 'The advance for {in} to {out} was not reported in time. The dates are back on the calendar and the broker got a strike.'],
  es: ['La reserva de {house} fue liberada', 'El anticipo del {in} al {out} no se informó a tiempo. Las fechas volvieron a la agenda y el corredor recibió una ocurrencia.'] };
const GROUPS = ['invite', 'proposal', 'answer', 'expiring'];

const FOOT = {
  pt: 'Você recebe este aviso porque tem conta na Agenda TTI. Ajuste ou desligue os avisos em Conta, Avisos, dentro do site.',
  en: 'You receive this notice because you have an Agenda TTI account. Adjust or turn off notices under Account, Notices, inside the site.',
  es: 'Recibe este aviso porque tiene una cuenta en Agenda TTI. Ajuste o desactive los avisos en Cuenta, Avisos, dentro del sitio.',
};
const OPEN = { pt: 'Abrir a Agenda TTI', en: 'Open Agenda TTI', es: 'Abrir Agenda TTI' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();

// Monta o aviso pronto para enviar. vars: house, owner, broker, in, out (AAAA-MM-DD), value, hours, url.
function render(kind, langIn, vars, base) {
  const K = KINDS[kind];
  if (!K) throw new Error('Tipo de aviso desconhecido: ' + kind);
  const lang = pickLang(langIn);
  const v = vars || {};
  const pre = {
    house: oneLine(v.house), owner: oneLine(v.owner), broker: oneLine(v.broker),
    in: fmtDate(v.in, lang), out: fmtDate(v.out, lang), value: fmtMoney(v.value, lang), hours: String(v.hours == null ? '' : v.hours),
    url: v.url || base || '',
  };
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (k in pre ? pre[k] : ''));
  const [s, b] = K[lang];
  const subject = fill(s);
  const body = fill(b);
  const link = v.url || base || '';
  const text = body + '\n\n' + (v.url ? '' : link ? OPEN[lang] + ': ' + link + '\n\n' : '') + '--\n' + FOOT[lang] + '\n';
  const html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f4f1ea;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14212b">'
    + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">'
    + '<p style="margin:0 0 6px;font-weight:700;color:#0F4C5C">Agenda TTI</p>'
    + '<h1 style="font-size:20px;margin:0 0 14px">' + esc(subject) + '</h1>'
    + '<p style="margin:0 0 20px;line-height:1.55">' + esc(body).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>') + '</p>'
    + (link && !v.url ? '<p style="margin:0 0 22px"><a href="' + esc(link) + '" style="display:inline-block;background:#0F4C5C;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">' + esc(OPEN[lang]) + '</a></p>' : '')
    + '<p style="margin:0;font-size:12.5px;color:#5b6b78;line-height:1.5">' + esc(FOOT[lang]) + '</p></div></body></html>';
  return { subject, text, html, title: subject, body, url: link, lang };
}

module.exports = { KINDS, GROUPS, LANGS, pickLang, render, fmtDate, fmtMoney };
