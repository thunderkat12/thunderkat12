// scripts/build-battle.js
// Node >= 18 (usa fetch nativo)
const fs = require('fs');
const path = require('path');

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('✖ Falta o token. Defina GH_TOKEN ou use secrets.GITHUB_TOKEN no workflow.');
  process.exit(1);
}

const login = process.env.GITHUB_REPOSITORY_OWNER || process.env.BATTLE_LOGIN || 'thunderkat12';

const GQL = `
  query($login: String!) {
    user(login: $login) {
      name
      login
      followers { totalCount }
      contributionsCollection {
        contributionCalendar { totalContributions }
      }
      pullRequests(states: MERGED) { totalCount }
      issues(states: CLOSED) { totalCount }
      repositories(privacy: PUBLIC, isFork: false, first: 100, orderBy: {field: STARGAZERS, direction: DESC}) {
        nodes {
          name
          stargazerCount
          primaryLanguage { name color }
        }
      }
    }
  }
`;

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `bearer ${token}`,
      'User-Agent': 'github-battle-arena'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

function toInt(n, fallback = 0) {
  return Number.isFinite(+n) ? Math.max(0, Math.floor(+n)) : fallback;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function k(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n/1_000).toFixed(1) + 'k';
  return String(n);
}

function buildSVG(model) {
  const W = 1200; const H = 420; const pad = 24;
  const barW = 420; const barH = 18; const gap = 20;
  const title = `${model.name || model.login} Battle Arena`;

  // Escalas simples
  const hpMax = clamp(model.totalContrib * 1.2, 100, 20000);
  const atkMax = Math.max(model.mergedPRs * 1.2, 10);
  const defMax = Math.max(model.closedIssues * 1.2, 10);
  const spcMax = Math.max(model.totalStars * 1.2, 10);

  function bar(x, y, value, vmax, label) {
    const p = vmax > 0 ? clamp(value / vmax, 0, 1) : 0;
    const w = Math.round(barW * p);
    return `
      <g font-family='Inter,Segoe UI,Roboto,Arial' font-size='14'>
        <text x='${x}' y='${y-6}' fill='#c7d2fe'>${label}: <tspan fill='#fff'>${k(value)}</tspan></text>
        <rect x='${x}' y='${y}' rx='9' ry='9' width='${barW}' height='${barH}' fill='#1f2937' stroke='#374151'/>
        <rect x='${x}' y='${y}' rx='9' ry='9' width='${w}' height='${barH}' fill='url(#grad)'/>
      </g>`;
  }

  // Fighters (linguagens por estrelas)
  const fx = W - pad - 520; // bloco à direita
  const fy = pad + 70;
  const fighterRowH = 34;
  const fighters = model.langTop.map((l, i) => {
    const y = fy + i * fighterRowH;
    const share = model.starTotal > 0 ? (l.stars / model.starTotal) : 0;
    const fw = Math.round(360 * share);
    const color = l.color || '#94a3b8';
    const pct = Math.round(share * 100);
    return `
      <g transform='translate(${fx},${y})' font-family='Inter,Segoe UI,Roboto,Arial' font-size='14'>
        <circle cx='12' cy='12' r='10' fill='${color}' />
        <text x='30' y='16' fill='#e5e7eb'>${l.name}</text>
        <rect x='160' y='4' rx='8' ry='8' width='360' height='16' fill='#111827' stroke='#374151'/>
        <rect x='160' y='4' rx='8' ry='8' width='${fw}' height='16' fill='${color}'/>
        <text x='530' y='16' fill='#9ca3af' text-anchor='end'>${pct}%</text>
      </g>`
  }).join('');

  // Arena estilizada (decorativa)
  const arena = `
    <g opacity='0.7'>
      <ellipse cx='${pad + 220}' cy='${H - 70}' rx='190' ry='22' fill='#0b1220'/>
      <ellipse cx='${W - pad - 260}' cy='${H - 70}' rx='190' ry='22' fill='#0b1220'/>
    </g>
  `;

  return `
  <svg width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' xmlns='http://www.w3.org/2000/svg' role='img' aria-label='${title}'>
    <defs>
      <linearGradient id='grad' x1='0' x2='1' y1='0' y2='0'>
        <stop offset='0%' stop-color='#22d3ee'/>
        <stop offset='100%' stop-color='#8b5cf6'/>
      </linearGradient>
      <filter id='card' x='-10%' y='-10%' width='120%' height='120%'>
        <feDropShadow dx='0' dy='8' stdDeviation='10' flood-color='#0b1220' flood-opacity='0.8'/>
      </filter>
    </defs>

    <rect x='0' y='0' width='100%' height='100%' fill='#0b1220'/>

    <!-- Card principal -->
    <g filter='url(#card)'>
      <rect x='${pad}' y='${pad}' width='${W - pad*2}' height='${H - pad*2}' rx='18' fill='#0f172a' stroke='#1f2937'/>
    </g>

    <g transform='translate(${pad*2},${pad*2})'>
      <text x='0' y='0' fill='#e5e7eb' font-family='Inter,Segoe UI,Roboto,Arial' font-size='28' font-weight='600'>⚡ ${title}</text>
      <text x='0' y='28' fill='#94a3b8' font-family='Inter,Segoe UI,Roboto,Arial' font-size='14'>Followers: ${k(model.followers)} · Repos analisados: ${model.repoCount}</text>

      ${bar(0, 70, model.totalContrib, hpMax, 'HP (Contribuições/ano)')}
      ${bar(0, 70 + (barH+gap), model.mergedPRs, atkMax, 'Ataque (PRs merged)')}
      ${bar(0, 70 + 2*(barH+gap), model.closedIssues, defMax, 'Defesa (Issues fechadas)')}
      ${bar(0, 70 + 3*(barH+gap), model.totalStars, spcMax, 'Especial (Estrelas)')}
    </g>

    <!-- Fighters por linguagem (lado direito) -->
    <g>
      <text x='${W - pad - 520}' y='${pad*2 + 12}' fill='#e5e7eb' font-family='Inter,Segoe UI,Roboto,Arial' font-size='18' font-weight='600'>Fighters por Linguagem</text>
      <text x='${W - pad - 520}' y='${pad*2 + 32}' fill='#94a3b8' font-family='Inter,Segoe UI,Roboto,Arial' font-size='12'>Proporcional às estrelas dos repositórios</text>
      ${fighters}
    </g>

    ${arena}
  </svg>`;
}

(async () => {
  const data = await gql(GQL, { login });
  const u = data.user;

  let stars = 0; const langMap = new Map(); const colorMap = new Map();
  const repos = u.repositories.nodes || [];
  for (const r of repos) {
    stars += toInt(r.stargazerCount, 0);
    if (r.primaryLanguage && r.primaryLanguage.name) {
      const name = r.primaryLanguage.name;
      langMap.set(name, (langMap.get(name) || 0) + toInt(r.stargazerCount, 0));
      if (r.primaryLanguage.color) colorMap.set(name, r.primaryLanguage.color);
    }
  }

  const langTop = Array.from(langMap.entries())
    .map(([name, s]) => ({ name, stars: s, color: colorMap.get(name) }))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 6);

  const model = {
    name: u.name,
    login: u.login,
    followers: toInt(u.followers.totalCount),
    totalContrib: toInt(u.contributionsCollection.contributionCalendar.totalContributions),
    mergedPRs: toInt(u.pullRequests.totalCount),
    closedIssues: toInt(u.issues.totalCount),
    totalStars: toInt(stars),
    repoCount: repos.length,
    langTop,
    starTotal: Math.max(1, stars)
  };

  const svg = buildSVG(model);
  const outDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'battle.svg'), svg, 'utf8');
  console.log('✔ Battle SVG gerado em assets/battle.svg');
})();
