// Root app — routing, top nav, drawer/modal orchestration, tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "rowDensity": "regular",
  "timelineDensity": "compact",
  "stateIntensity": "mid",
  "attentionTreatment": "strong",
  "bgWarmth": "warm",
  "bgFamily": "gray",
  "bgShade": 900,
  "useCustomBg": true,
  "rowTexture": "gradient",
  "pillPaddingStep": 6,
  "maxEventsPerSegment": 15,
  "accentSaturation": 0.16,
  "monoFont": "Fira Code",
  "sansFont": "Hanken Grotesk",
  "pillFont": "mono",
  "viewportWidth": "desktop",
  "liveDemo": true
}/*EDITMODE-END*/;

// Tailwind spacing scale (rem * 16 = px). px-N maps to N*4 px,
// except the small steps 0/0.5/1/1.5/2.
const TW_SPACING = [
  { step: 0,    px: 0,  label: 'px-0'   },
  { step: 0.5,  px: 2,  label: 'px-0.5' },
  { step: 1,    px: 4,  label: 'px-1'   },
  { step: 1.5,  px: 6,  label: 'px-1.5' },
  { step: 2,    px: 8,  label: 'px-2'   },
  { step: 2.5,  px: 10, label: 'px-2.5' },
  { step: 3,    px: 12, label: 'px-3'   },
  { step: 3.5,  px: 14, label: 'px-3.5' },
  { step: 4,    px: 16, label: 'px-4'   },
  { step: 5,    px: 20, label: 'px-5'   },
  { step: 6,    px: 24, label: 'px-6'   },
  { step: 8,    px: 32, label: 'px-8'   },
];

// Tailwind neutral background palettes — darkest → 950, lightest 50.
// We expose 700/800/900/950 (dashboard is dark-first).
const TW_BG_FAMILIES = ['slate', 'zinc', 'neutral', 'stone', 'gray'];
const TW_BG_SHADES = [700, 800, 900, 950];
const TW_BG_HEX = {
  slate:   { 700:'#334155', 800:'#1e293b', 900:'#0f172a', 950:'#020617' },
  zinc:    { 700:'#3f3f46', 800:'#27272a', 900:'#18181b', 950:'#09090b' },
  neutral: { 700:'#404040', 800:'#262626', 900:'#171717', 950:'#0a0a0a' },
  stone:   { 700:'#44403c', 800:'#292524', 900:'#1c1917', 950:'#0c0a09' },
  gray:    { 700:'#374151', 800:'#1f2937', 900:'#111827', 950:'#030712' },
};

const SANS_FONT_OPTIONS = [
  'Geist Sans', 'Inter', 'Manrope', 'Satoshi', 'General Sans', 'Switzer',
  'Plus Jakarta Sans', 'Public Sans', 'Hanken Grotesk', 'Space Grotesk',
  'Outfit', 'Sora', 'Nunito Sans',
];
const MONO_FONT_OPTIONS = ['Fira Code', 'JetBrains Mono', 'IBM Plex Mono', 'Geist Mono'];
const VIEWPORT_OPTIONS = ['desktop', 'vertical', 'mobile'];
const VIEWPORT_PX = { desktop: 1440, vertical: 820, mobile: 390 };

function useHashRoute() {
  const [hash, setHash] = React.useState(window.location.hash || '#/');
  React.useEffect(() => {
    const h = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const path = hash.replace(/^#/, '') || '/';
  const navigate = (to) => { window.location.hash = '#' + to; };
  return [path, navigate];
}

function parseRoute(path) {
  // /                          -> { route: 'home' }
  // /agent/KAN-23              -> { route: 'home', agentKey, drawer: true }
  // /agent/KAN-23/full         -> { route: 'agent-full', agentKey }
  // /projects                  -> { route: 'projects' }
  // /projects/foo              -> { route: 'projects', sub: 'foo' }
  if (path.startsWith('/agent/')) {
    const parts = path.split('/').filter(Boolean); // ['agent', 'KEY', maybe 'full']
    const key = parts[1];
    if (parts[2] === 'full') return { route: 'agent-full', agentKey: key };
    return { route: 'home', agentKey: key, drawer: true };
  }
  if (path.startsWith('/projects')) {
    const parts = path.split('/').filter(Boolean);
    return { route: 'projects', sub: parts[1] };
  }
  return { route: 'home' };
}

function Favicon({ attentionCount, attentionColor }) {
  React.useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    // base
    ctx.fillStyle = '#1a1f2c';
    ctx.beginPath(); ctx.roundRect(2, 2, 28, 28, 6); ctx.fill();
    ctx.fillStyle = '#e5e7ec';
    ctx.font = 'bold 16px ui-sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('c', 16, 17);
    if (attentionCount > 0) {
      ctx.fillStyle = attentionColor;
      ctx.beginPath(); ctx.arc(24, 8, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0b10';
      ctx.font = 'bold 10px ui-sans-serif';
      ctx.fillText(String(attentionCount), 24, 9);
    }
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = c.toDataURL('image/png');
  }, [attentionCount, attentionColor]);
  return null;
}

function TopNav({ route, attentionCount, onNewRun, onClearAttention, onNavigate }) {
  return (
    <nav className="topnav">
      <div className="topnav__left">
        <div className="topnav__brand">
          <span className="topnav__brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <circle cx="7"  cy="7"  r="2.4" fill="currentColor" opacity="0.92" />
              <circle cx="17" cy="7"  r="2.4" fill="currentColor" opacity="0.55" />
              <circle cx="7"  cy="17" r="2.4" fill="currentColor" opacity="0.55" />
              <circle cx="17" cy="17" r="2.4" fill="currentColor" opacity="0.92" />
              <path d="M9 9 L15 15 M15 9 L9 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.32" />
            </svg>
          </span>
          <span className="topnav__brand-name">crew</span>
        </div>
        <div className="topnav__tabs">
          <a className={`topnav__tab ${route.route === 'home' || route.route === 'agent-full' ? 'on' : ''}`} href="#/">Agents</a>
          <a className={`topnav__tab ${route.route === 'projects' ? 'on' : ''}`} href="#/projects">Projects</a>
        </div>
      </div>
      <div className="topnav__right">
        {attentionCount > 0 && (
          <button className="btn btn--ghost btn--sm clear-attention" onClick={onClearAttention}>
            <span className="clear-attention__count">{attentionCount}</span>
            Clear attention
          </button>
        )}
        <button className="btn btn--accent" onClick={onNewRun}>
          <Icon.Plus size={12} /> New Run
        </button>
      </div>
    </nav>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [path, navigate] = useHashRoute();
  const route = parseRoute(path);
  const [newRunOpen, setNewRunOpen] = React.useState(false);
  const [attentionCleared, setAttentionCleared] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  // Apply tweaks to root element via CSS variables
  React.useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--font-sans', `"${t.sansFont}", ui-sans-serif, system-ui, sans-serif`);
    r.style.setProperty('--font-mono', `"${t.monoFont}", ui-monospace, monospace`);
    // Pill font — maps logical names to font-family
    const pillMap = {
      'mono':       `"${t.monoFont}", ui-monospace, monospace`,
      'sans':       `"${t.sansFont}", ui-sans-serif, system-ui, sans-serif`,
      'small-caps': `"${t.sansFont}", ui-sans-serif, system-ui, sans-serif`,
      'serif':      `"Iowan Old Style", "Charter", "Source Serif Pro", Georgia, serif`,
      'rounded':    `"SF Pro Rounded", "Nunito", "Manrope", system-ui, sans-serif`,
    };
    r.style.setProperty('--font-pill', pillMap[t.pillFont] || pillMap.mono);
    r.style.setProperty('--pill-variant', t.pillFont === 'small-caps' ? 'all-small-caps' : 'normal');
    r.style.setProperty('--pill-transform', t.pillFont === 'small-caps' ? 'none' : 'lowercase');
    r.style.setProperty('--pill-tracking', t.pillFont === 'small-caps' ? '0.04em' : '-0.005em');
    // Background warmth or Tailwind class
    if (t.useCustomBg) {
      const fam = TW_BG_HEX[t.bgFamily] || TW_BG_HEX.zinc;
      const baseHex = fam[t.bgShade] || fam[950];
      const num = parseInt(baseHex.slice(1), 16);
      const r0 = (num >> 16) & 255, g0 = (num >> 8) & 255, b0 = num & 255;
      const lift = (rr,gg,bb,amt) => `rgb(${Math.min(255,rr+amt)},${Math.min(255,gg+amt)},${Math.min(255,bb+amt)})`;
      r.style.setProperty('--bg', baseHex);
      r.style.setProperty('--surface', lift(r0,g0,b0,10));
      r.style.setProperty('--surface-2', lift(r0,g0,b0,20));
      r.style.setProperty('--border', 'rgba(255,255,255,0.07)');
    } else {
      const bgs = {
        'pitch':   { bg: '#0a0b0e', surface: '#101216', surface2: '#15181d', border: 'rgba(255,255,255,0.06)' },
        'slate':   { bg: '#0e1219', surface: '#141923', surface2: '#1a2030', border: 'rgba(255,255,255,0.07)' },
        'warm':    { bg: '#13141a', surface: '#1a1c24', surface2: '#21232d', border: 'rgba(255,255,255,0.07)' },
      };
      const b = bgs[t.bgWarmth] || bgs.warm;
      r.style.setProperty('--bg', b.bg);
      r.style.setProperty('--surface', b.surface);
      r.style.setProperty('--surface-2', b.surface2);
      r.style.setProperty('--border', b.border);
    }
    // Accent saturation — affects state colors
    r.style.setProperty('--chr', String(t.accentSaturation));
    // Pill horizontal padding — driven by Tailwind spacing step
    const stepIdx = Math.max(0, Math.min(TW_SPACING.length - 1, t.pillPaddingStep ?? 4));
    r.style.setProperty('--pill-px', `${TW_SPACING[stepIdx].px}px`);
  }, [t.sansFont, t.monoFont, t.pillFont, t.bgWarmth, t.useCustomBg, t.bgFamily, t.bgShade, t.accentSaturation, t.pillPaddingStep]);

  // Attention count
  const attentionAgents = MOCK_AGENTS.filter(a => STATE_META[a.state].attention);
  const attentionCount = attentionCleared ? 0 : attentionAgents.length;
  const attentionColor = attentionAgents.some(a => a.state === 'error') ? '#f87171'
    : attentionAgents.some(a => a.state === 'waiting') ? '#facc15'
    : '#a78bfa';

  // Drawer agent
  const drawerAgent = route.drawer && route.agentKey ? getAgent(route.agentKey) : null;
  const fullPageAgent = route.route === 'agent-full' && route.agentKey ? getAgent(route.agentKey) : null;

  const onAgentOpen = (key) => navigate(`/agent/${key}`);
  const onAgentClose = () => navigate('/');
  const onAgentAction = (action, agent) => {
    if (action === 'inspect') navigate(`/agent/${agent.key}`);
    else if (action === 'view-pr') window.open(agent.pr, '_blank');
    else setToast(`${action} → ${agent.key}`);
  };

  const onConfirmNewRun = (project, ticket) => {
    setNewRunOpen(false);
    setToast(`Spawning agent for ${ticket.key}…`);
  };

  React.useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 2400);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // Viewport simulation
  const vw = VIEWPORT_PX[t.viewportWidth];
  const isMobile = t.viewportWidth === 'mobile';
  const isVertical = t.viewportWidth === 'vertical';

  return (
    <div className={`app app--vw-${t.viewportWidth}`} style={{ '--app-vw': vw + 'px' }}>
      <Favicon attentionCount={attentionCount} attentionColor={attentionColor} />
      <div className="viewport-frame">
        <div className="viewport-frame__inner">
          <TopNav
            route={route}
            attentionCount={attentionCount}
            onNewRun={() => setNewRunOpen(true)}
            onClearAttention={() => setAttentionCleared(true)}
            onNavigate={navigate}
          />
          <main className="main-area">
            {route.route === 'home' && (
              <AgentsList
                onOpen={onAgentOpen}
                onAction={onAgentAction}
                onNewRun={() => setNewRunOpen(true)}
                tweaks={t}
                onOpenProject={(name) => navigate(`/projects/${name}`)}
              />
            )}
            {route.route === 'projects' && (
              <ProjectsRoute
                subRoute={route.sub}
                onNavigate={navigate}
                onAgentOpen={onAgentOpen}
                onAgentAction={onAgentAction}
                tweaks={t}
              />
            )}
            {route.route === 'agent-full' && fullPageAgent && (
              <AgentDetail agent={fullPageAgent} asPage onAction={onAgentAction} tweaks={t} />
            )}
          </main>

          {drawerAgent && (
            <>
              <div className="drawer-scrim" onClick={onAgentClose} />
              <AgentDetail agent={drawerAgent} onClose={onAgentClose} onAction={onAgentAction} tweaks={t} />
            </>
          )}

          {newRunOpen && <NewRunModal onClose={() => setNewRunOpen(false)} onConfirm={onConfirmNewRun} />}

          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Layout" />
        <TweakRadio label="Viewport" value={t.viewportWidth} options={VIEWPORT_OPTIONS}
                    onChange={v => setTweak('viewportWidth', v)} />
        <TweakRadio label="Row density" value={t.rowDensity} options={['tight','regular','comfy']}
                    onChange={v => setTweak('rowDensity', v)} />
        <TweakRadio label="Timeline density" value={t.timelineDensity} options={['compact','padded']}
                    onChange={v => setTweak('timelineDensity', v)} />

        <TweakSection label="State + attention" />
        <TweakRadio label="State intensity" value={t.stateIntensity} options={['muted','mid','loud']}
                    onChange={v => setTweak('stateIntensity', v)} />
        <TweakRadio label="Attention treatment" value={t.attentionTreatment} options={['subtle','medium','strong']}
                    onChange={v => setTweak('attentionTreatment', v)} />
        <TweakSlider label={`Pill padding (${TW_SPACING[t.pillPaddingStep]?.label || 'px-2'})`}
                     value={t.pillPaddingStep} min={0} max={TW_SPACING.length - 1} step={1}
                     onChange={v => setTweak('pillPaddingStep', v)} />
        <TweakSlider label={t.maxEventsPerSegment === 0 ? 'Max events / segment (unlimited)' : `Max events / segment (${t.maxEventsPerSegment})`}
                     value={t.maxEventsPerSegment} min={0} max={50} step={1}
                     onChange={v => setTweak('maxEventsPerSegment', v)} />
        <TweakSelect label="Pill font" value={t.pillFont}
                     options={['mono','sans','small-caps','serif','rounded']}
                     onChange={v => setTweak('pillFont', v)} />
        <TweakSelect label="Row texture" value={t.rowTexture}
                     options={['none','grid','dots','stripes','stripes-thick','triangles','noise','scanlines','gradient']}
                     onChange={v => setTweak('rowTexture', v)} />
        <TweakSlider label="Accent saturation" value={t.accentSaturation} min={0.04} max={0.24} step={0.01}
                     onChange={v => setTweak('accentSaturation', v)} />

        <TweakSection label="Theme + type" />
        <TweakToggle label="Tailwind palette" value={t.useCustomBg}
                     onChange={v => setTweak('useCustomBg', v)} />
        {t.useCustomBg ? (
          <>
            <TweakSelect label="bg- family" value={t.bgFamily} options={TW_BG_FAMILIES}
                         onChange={v => setTweak('bgFamily', v)} />
            <TweakRadio label={`bg-${t.bgFamily}-${t.bgShade}`} value={t.bgShade} options={TW_BG_SHADES}
                        onChange={v => setTweak('bgShade', v)} />
          </>
        ) : (
          <TweakRadio label="Background warmth" value={t.bgWarmth} options={['pitch','slate','warm']}
                      onChange={v => setTweak('bgWarmth', v)} />
        )}
        <TweakSelect label="Sans font" value={t.sansFont} options={SANS_FONT_OPTIONS}
                     onChange={v => setTweak('sansFont', v)} />
        <TweakSelect label="Mono font" value={t.monoFont} options={MONO_FONT_OPTIONS}
                     onChange={v => setTweak('monoFont', v)} />

        <TweakSection label="Demo" />
        <TweakToggle label="Live timeline streaming" value={t.liveDemo}
                     onChange={v => setTweak('liveDemo', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
