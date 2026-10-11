'use strict';
// Publica no GitHub o que está em docs/issues e docs/prs: labels, issues e PRs empilhados.
// Uso: node scripts/publish-github.js dono/repo [--dry-run] [--public]
// Requer: gh autenticado (gh auth status) e as branches locais já criadas.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const repo = args.find((a) => /^[\w.-]+\/[\w.-]+$/.test(a));
const dry = args.includes('--dry-run');
const visibility = args.includes('--public') ? '--public' : '--private';
if (!repo) { console.error('Uso: npm run publish:github -- dono/repo [--dry-run] [--public]'); process.exit(2); }

const LABELS = {
  'correção': ['tipo: correção', 'd73a4a'],
  melhoria: ['tipo: melhoria', '1d76db'],
  'nova função': ['tipo: nova função', '0e8a16'],
};
const PREFIX = { 'correção': 'fix', melhoria: 'chore', 'nova função': 'feat' };

function run(cmd, a, opt = {}) {
  if (dry && !opt.readonly) { console.log('[dry-run]', cmd, a.join(' ')); return ''; }
  return execFileSync(cmd, a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}
function fm(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('Sem frontmatter: ' + file);
  const meta = {};
  m[1].split('\n').forEach((l) => { const k = /^(\w+):\s*(.*?)\s*(#.*)?$/.exec(l); if (k) meta[k[1]] = k[2].replace(/^"|"$/g, ''); });
  return { meta, body: m[2].trim() };
}
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort().map((f) => path.join(dir, f)) : []);

const issues = list(path.join(root, 'docs/issues')).map((f) => ({ file: f, ...fm(f) }));
for (const i of issues) if (!LABELS[i.meta.type]) throw new Error(`Tipo inválido em ${i.file}: ${i.meta.type}`);

// 1) repositório
let exists = true;
try { run('gh', ['api', `repos/${repo}`, '--silent'], { readonly: true }); } catch (e) { exists = false; }
if (!exists) run('gh', ['repo', 'create', repo, visibility, '--source', '.', '--remote', 'origin']);
else if (!dry) { try { run('git', ['remote', 'get-url', 'origin'], { readonly: true }); } catch (e) { run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`]); } }

// 2) labels
for (const [name, color] of Object.values(LABELS)) run('gh', ['label', 'create', name, '--color', color, '--force', '--repo', repo]);

// 3) issues
const map = {};
const out = path.join(root, 'docs/issues/.published.json');
const done = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
for (const i of issues) {
  const key = path.basename(i.file);
  if (done[key]) { map[key] = done[key]; console.log('já publicada:', key, '#' + done[key]); continue; }
  const url = run('gh', ['api', '-X', 'POST', `repos/${repo}/issues`, '-f', `title=${i.meta.title}`, '-f', `body=${i.body}`, '-f', `labels[]=${LABELS[i.meta.type][0]}`, '--jq', '.html_url']);
  const n = dry ? 0 : Number(url.split('/').pop());
  map[key] = n; console.log('issue', key, '->', dry ? '(dry-run)' : '#' + n);
}
if (!dry) fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n');

// 4) branches e PRs empilhados (na ordem das issues que têm branch)
run('git', ['push', '-u', 'origin', 'main']);
let base = 'main'; let prevPR = null;
for (const i of issues.filter((x) => x.meta.branch)) {
  const n = map[path.basename(i.file)];
  const old = i.meta.branch;
  const [type, ...rest] = old.split('/');
  const next = `${type}/${n}-${rest.join('-')}`;
  const cur = (() => { try { return run('git', ['rev-parse', '--verify', old], { readonly: true }); } catch (e) { return ''; } })();
  const already = (() => { try { return run('git', ['rev-parse', '--verify', next], { readonly: true }); } catch (e) { return ''; } })();
  if (cur && !already && !dry) run('git', ['branch', '-m', old, next]);
  const draft = path.join(root, 'docs/prs', old.replace(/\//g, '-') + '.md');
  if (!fs.existsSync(draft)) { console.log('sem rascunho de PR para', old, '(pulando)'); continue; }
  const pr = fm(draft);
  const body = (prevPR ? `> PR empilhado: depende de #${prevPR}. Faça o merge na ordem.\n\n` : '') + pr.body.replace(/\{\{ISSUE\}\}/g, '#' + n);
  const bodyFile = path.join(require('os').tmpdir(), 'pr-' + path.basename(draft));
  fs.writeFileSync(bodyFile, body);
  run('git', ['push', '-u', 'origin', next]);
  const url = run('gh', ['api', '-X', 'POST', `repos/${repo}/pulls`, '-f', `base=${base}`, '-f', `head=${next}`, '-f', `title=${pr.meta.title}`, '-F', `body=@${bodyFile}`, '--jq', '.html_url']);
  console.log('PR', next, '->', dry ? '(dry-run)' : url);
  prevPR = dry ? 0 : Number(url.split('/').pop());
  base = next;
}
console.log(dry ? 'Dry-run concluído.' : 'Publicado.');
