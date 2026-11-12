import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from 'react';
import { advance, DURATION, input, multiplier, newBoard, PRESETS, stats, type Board, type Difficulty } from './game/engine';
import { defaultAvatar, placement, resolvePlayers, type AvatarConfig, type Match, type Room } from './tournament/model';
import { session } from './state/session';
import { Avatar } from './ui/Avatar';
import { Icon } from './ui/Icon';
import { ambientMusic, playTone } from './ui/sound';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Pager, PartyMotion, Screen, ToolsDialog } from './ui/Party';

function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function useClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), active ? 50 : 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
function getSettings() {
  try {
    return {
      muted: localStorage.getItem('leaf-muted') !== 'false',
      reduced: localStorage.getItem('leaf-motion') === 'true',
      music: localStorage.getItem('leaf-music') === 'true',
      volume: Number(localStorage.getItem('leaf-volume') || '0.6'),
    };
  } catch (error) {
    console.error('Could not read preferences:', error);
    return { muted: true, reduced: false, music: false, volume: 0.6 };
  }
}
export function App() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [settings, setSettings] = useState(getSettings);
  const [view, setView] = useState<'home' | 'join'>('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get('room') || '');
  const [avatar, setAvatar] = useState<AvatarConfig>(defaultAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'bracket' | 'leaderboard'>('bracket');
  const [practice, setPractice] = useState<{ board: Board; start: number; preset: Difficulty }>();
  const [practicePreset, setPracticePreset] = useState<Difficulty>('Acorn');
  const room = state.room;
  const me = room?.players.find((player) => player.id === state.playerId);
  const match = room?.matches.find((item) => item.players.includes(state.playerId || '') &&
    (item.status === 'arming' || item.status === 'scheduled' || item.status === 'playing'));
  const eliminated = !!(room && state.playerId && placement(room, state.playerId));
  const competitive = !!match && !eliminated;
  const now = useClock(competitive || !!practice);
  const board = competitive ? session.predicted() : practice?.board;
  if (practice && !competitive) advance(practice.board, now - practice.start, practice.preset);
  const gameStart = competitive ? match.startAt - state.offset : practice?.start || 0;
  const gamePreset = competitive ? match.preset : practice?.preset || 'Acorn';
  const showGame = !!board && (!!practice || competitive);
  const previous = useRef({ score: 0, lives: 3, champion: '' });
  const activeChampion = room?.phase === 'finished' ? room.matches.at(-1)?.winner || '' : '';
  useEffect(() => {
    if (board && !settings.muted) {
      if (board.score > previous.current.score) playTone('clear', settings.volume);
      if (board.lives < previous.current.lives) playTone('miss', settings.volume);
    }
    if (activeChampion && activeChampion !== previous.current.champion && !settings.muted) playTone('win', settings.volume);
    previous.current = { score: board?.score || 0, lives: board?.lives ?? 3, champion: activeChampion };
  }, [board?.score, board?.lives, activeChampion, settings.muted, settings.volume]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings.music && !settings.muted && settings.volume) return ambientMusic(settings.volume);
  }, [settings.music, settings.muted, settings.volume]);
  useEffect(() => {
    document.documentElement.dataset.motion = settings.reduced ? 'reduced' : 'full';
    try {
      localStorage.setItem('leaf-muted', String(settings.muted));
      localStorage.setItem('leaf-motion', String(settings.reduced));
      localStorage.setItem('leaf-music', String(settings.music));
      localStorage.setItem('leaf-volume', String(settings.volume));
    } catch (storageError) { console.error('Could not save preferences:', storageError); }
  }, [settings]);
  async function run(action: () => void | Promise<void>) {
    setBusy(true); setError(''); session.clearError();
    try { await action(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : String(actionError)); }
    finally { setBusy(false); }
  }
  function startPractice() {
    previous.current.score = 0;
    setPractice({ board: newBoard(crypto.randomUUID()), start: Date.now() + 3000, preset: practicePreset });
  }
  function type(key: string) {
    if (now < gameStart || !board || board.ended) return;
    if (competitive) session.key(key, Date.now() + state.offset - match.startAt);
    else if (practice) input(practice.board, key, Date.now() - practice.start, practice.preset);
  }
  function join(event: FormEvent) {
    event.preventDefault();
    void run(() => session.join(code.trim().toUpperCase(), name.trim(), avatar));
  }
  const connectionError = error || state.error;
  return <PartyMotion reduced={settings.reduced}><div className={`app ${showGame ? 'is-playing' : ''}`}>
    <div className="grain" aria-hidden="true" />
    <div className="settings-menu">
      <ToolsDialog label="Settings"><div className="settings-controls">
        <Button className="secondary" onClick={() => setSettings({ ...settings, muted: !settings.muted })}><Icon name={settings.muted ? 'mute' : 'sound'}/>{settings.muted ? 'Enable sound' : 'Mute sound'}</Button>
        <label>Volume<input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(event) => setSettings({ ...settings, volume: Number(event.target.value) })}/></label>
        <label className="music-toggle"><input type="checkbox" checked={settings.music} onChange={(event) => setSettings({ ...settings, music: event.target.checked, muted: event.target.checked ? false : settings.muted })}/> Cozy music</label>
        <label className="motion-toggle"><input type="checkbox" checked={settings.reduced} onChange={(event) => setSettings({ ...settings, reduced: event.target.checked })}/> Less motion</label>
      </div></ToolsDialog>
    </div>
    {(connectionError || state.notice) && <div className={`notice ${connectionError ? 'danger' : ''}`} role={connectionError ? 'alert' : 'status'}>
      <span>{connectionError || state.notice}</span>
      {connectionError && <Button className="text-button" onClick={() => { setError(''); session.clearError(); }}>Dismiss</Button>}
    </div>}
    {state.role === 'player' && !state.connected && room && <div className="notice danger reconnect-strip"><span>You are offline. Time and lives continue.</span><label>Room code (change if restored)<input maxLength={6} value={code || room.code} onChange={(event) => setCode(event.target.value.toUpperCase())}/></label><Button className="secondary" onClick={() => void run(() => session.reconnect(code || room.code))} disabled={busy}>Reconnect</Button></div>}

    <AnimatePresence mode="wait" initial={false}>
    {!room && !showGame && (view === 'home' && !code ? <Screen key="landing" className="landing">
      <section className="hero-copy">
        <div className="eyebrow"><span className="live-dot"/> A LITTLE FRIENDLY KEYBOARD CHAOS</div>
        <h1>Big fall energy.<br/>Fast fingers.<br/><em>One champion.</em></h1>
        <p className="hero-description">The leaves are falling. So are the words.<br/>Outtype your teammates in a cozy, chaotic<br className="desktop-break"/> race for the autumn crown.</p>
        <div className="hero-actions"><Button className="primary large" onClick={() => setView('join')}>Join the fun <Icon name="arrow"/></Button><Button className="secondary large" disabled={busy} onClick={() => void run(() => session.host())}>{busy ? 'Connecting...' : 'Host a game'}</Button></div>
        <div className="hero-facts"><span><Icon name="bolt" size={16}/> 60-second showdowns</span><span><Icon name="crown" size={16}/> Up to 25 players</span></div>
        <Button className="text-button practice-link" onClick={startPractice}>Just warming up? Try a practice round <span aria-hidden="true">&#8599;</span></Button>
      </section>
      <section className="hero-art" aria-label="Autumn woodland typing party">
        <span className="orbit orbit-one"/><span className="orbit orbit-two"/>
        <span className="floating-leaf leaf-one"><Icon name="leaf" size={62}/></span><span className="floating-leaf leaf-two"><Icon name="leaf" size={38}/></span><span className="floating-leaf leaf-three"><Icon name="leaf" size={48}/></span>
        <div className="art-tag tag-top"><span className="live-dot"/> THE COZIEST COMPETITION</div>
        <div className="word-chip chip-one"><span className="typed">aut</span>umn <kbd>+60</kbd></div>
        <div className="word-chip chip-two">one more round <span className="tiny-spark">+</span></div>
        <div className="mascot-platform">
          <div className="hero-mascot friend"><Avatar config={{ ...defaultAvatar, animal: 'frog', color: 'green', hat: 'beanie' }} size={150}/></div>
          <div className="hero-mascot main-mascot"><Avatar config={defaultAvatar} size={230} champion/></div>
          <div className="hero-mascot friend"><Avatar config={{ ...defaultAvatar, animal: 'bear', color: 'purple', hat: 'none', face: 'cool' }} size={150}/></div>
        </div>
        <div className="platform-shadow"/>
        <div className="combo-sticker"><Icon name="bolt" size={27}/><div>COZY COMBO<span>FALL HARD. TYPE FAST.</span></div></div>
        <div className="key-row" aria-hidden="true">{['F', 'A', 'L', 'L'].map((key, index) => <kbd key={index}>{key}</kbd>)}</div>
      </section>
      <section className="how-strip"><div><b>01</b><span>Pick your woodland alter ego<small>A tiny face. A big competitive streak.</small></span></div><div><b>02</b><span>Catch words. Stack combos.<small>Three lives. Sixty seconds. No pressure.</small></span></div><div><b>03</b><span>Climb the bracket<small>One final crown. Endless bragging rights.</small></span></div></section>
      <Restore onRestore={(value) => void run(() => session.host(value))} busy={busy}/>
    </Screen> : <Screen key="join" className="join-layout">
      <section className="join-intro"><div className="eyebrow">YOUR AUTUMN ALTER EGO</div><h1>Small creature.<br/><em>Big type energy.</em></h1><p>Build your character, grab your room code,<br/>and settle into the lobby.</p><div className="avatar-preview"><Avatar config={avatar} size={230}/><span className="preview-shadow"/></div><span className="name-tag">{name || 'Your future champion'}</span></section>
      <form className="panel join-form" onSubmit={join}>
        <div className="section-heading"><span className="step-number">01</span><div><h2>Make an entrance</h2><p>No accounts. Just good company.</p></div></div>
        <label>Your name<input autoComplete="nickname" autoFocus maxLength={20} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Speedy Acorn"/></label>
        <label>Room code<input className="code-input" autoComplete="off" maxLength={6} minLength={6} required pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC234"/></label>
        <fieldset><legend>Your woodland crew</legend><div className="animal-options">{(['fox', 'bear', 'frog', 'owl'] as const).map((animal) => <Button key={animal} type="button" className={`avatar-option ${avatar.animal === animal ? 'selected' : ''}`} aria-pressed={avatar.animal === animal} aria-label={animal} onClick={() => setAvatar({ ...avatar, animal })}><Avatar config={{ ...avatar, animal }} size={55}/><span>{animal}</span></Button>)}</div></fieldset>
        <div className="customize-grid"><fieldset><legend>Color</legend><div className="swatches">{(['orange', 'green', 'purple', 'blue'] as const).map((color) => <Button type="button" key={color} className={`swatch ${color} ${avatar.color === color ? 'selected' : ''}`} aria-label={color} aria-pressed={avatar.color === color} onClick={() => setAvatar({ ...avatar, color })}/>)}</div></fieldset>
          <label>Headwear<select value={avatar.hat} onChange={(event) => setAvatar({ ...avatar, hat: event.target.value as AvatarConfig['hat'] })}>{['none', 'beanie', 'crown', 'leaf'].map((hat) => <option key={hat}>{hat}</option>)}</select></label>
          <label>Expression<select value={avatar.face} onChange={(event) => setAvatar({ ...avatar, face: event.target.value as AvatarConfig['face'] })}>{['happy', 'cool', 'sleepy'].map((face) => <option key={face}>{face}</option>)}</select></label></div>
        <Button className="primary large full" disabled={busy || !name.trim()}>{busy ? 'Finding your forest...' : 'Let me in'}<Icon name="arrow"/></Button>
        <p className="form-note">Desktop keyboard required. Edge or Chrome recommended.</p>
        <Button type="button" className="text-button" onClick={() => { setCode(''); setView('home'); }}>Back to the campfire</Button>
      </form>
    </Screen>)}

    {room && !showGame && <Screen key="room" className="room-main">
      <div className="room-title"><div><div className="eyebrow">{state.role === 'host' ? 'PRESENTER DESK' : `WELCOME, ${me?.name.toUpperCase() || 'FRIEND'}`}</div><h1>{room.phase === 'lobby' ? 'The gathering place.' : room.phase === 'finished' ? 'All hail the fast fingers.' : 'The race for the crown.'}</h1></div><div className="room-code"><small>JOIN AT THIS SITE WITH CODE</small><strong>{room.code}</strong><Button className="text-button" onClick={() => void run(() => navigator.clipboard.writeText(`${location.origin}${location.pathname}#room=${room.code}`))}>Copy invite link</Button></div></div>
      {room.phase === 'lobby' ? <div className="lobby-grid">
        <Roster room={room} host={state.role === 'host'} run={run}/>
        <aside className="sidebar">
          <section className="panel rules-panel"><div className="mini-icon"><Icon name="leaf" size={26}/></div><h2>Here's the short version.</h2><p>Type falling words before they cross the line. Clear targets to build your combo. Keep your three lives.</p><ul><li><b>60 seconds</b> to make it count</li><li><b>Top score</b> advances from each match</li><li><b>Tied?</b> Let the d20 decide</li><li><b>One crown.</b> Bring your best keyboard.</li></ul>
            {state.role === 'host' ? <Button className="primary full" disabled={busy || room.players.length < 2 || room.players.some((player) => !player.ready || !player.connected)} onClick={() => void run(() => session.draw())}>Lock roster & draw bracket<Icon name="arrow"/></Button> : <Button className="primary full" disabled={!state.connected} onClick={() => session.ready(!me?.ready)}>{me?.ready ? 'Actually, one moment...' : "I'm ready!"}</Button>}
            <p className="form-note">{state.role === 'host' ? 'Everyone must be connected and ready. Drawing locks the roster.' : 'The presenter starts the round. Stay on this tab.'}</p>
          </section><PracticeCard preset={practicePreset} setPreset={setPracticePreset} start={startPractice}/>{state.role === 'host' && <Backups room={room}/>}
        </aside>
      </div> : <>
        {room.phase === 'finished' && <Champion room={room}/>}
        {state.role === 'host' && room.phase === 'tournament' && <HostControls room={room} busy={busy} run={run}/>}
        {state.role === 'player' && <div className="player-status-strip"><Avatar config={me?.avatar || defaultAvatar} size={60}/><div><strong>{eliminated ? 'Your typing run is complete. Your cheering run starts now.' : 'Your next showdown is getting ready.'}</strong><p>{eliminated ? 'Follow the bracket or warm up in practice. Your tournament scores are locked.' : 'Keep this tab open. The presenter will launch your next match.'}</p></div>{!competitive && <Button className="secondary" onClick={startPractice}>Practice round</Button>}</div>}
        <div className="tournament-grid"><section>
          <div className="tabs" role="tablist" aria-label="Tournament views"><Button role="tab" aria-selected={tab === 'bracket'} className={tab === 'bracket' ? 'active' : ''} onClick={() => setTab('bracket')}>The bracket</Button><Button role="tab" aria-selected={tab === 'leaderboard'} className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}>Leaderboard</Button></div>
          {tab === 'bracket' ? <Bracket key={room.round} room={room} host={state.role === 'host'} now={now} run={run}/> : <Leaderboard room={room}/>}
        </section><aside className="sidebar"><section className="panel"><div className="eyebrow">THE ROAD TO GLORY</div><h2>{room.players.length} players.<br/>One autumn crown.</h2><p className="muted">Identical challenges within every match. No second chances, except when the dice say so.</p><div className="stage-list">{Array.from(new Set(room.matches.map((item) => item.round))).map((round) => <div key={round} className={round === room.round ? 'current' : ''}><span>Stage {round + 1}</span><b>{room.matches.filter((item) => item.round === round).length} {round === room.matches.at(-1)?.round ? 'final' : 'matches'}</b></div>)}</div></section>{state.role === 'host' && <Backups room={room}/>}<ToolsDialog label="Event history"><History room={room}/></ToolsDialog></aside></div>
      </>}
    </Screen>}

    {showGame && board && <Screen key={`game-${board.seed}`} className="game-main">
      <div className="game-title"><div><div className="eyebrow">{competitive ? `STAGE ${match.round + 1} / ${gamePreset.toUpperCase()}` : 'NO STAKES. JUST WARM FINGERS.'}</div><h1>{competitive ? 'Make it rain.' : 'A little pre-game rust removal.'}</h1></div>{!competitive && <Button className="secondary" onClick={() => setPractice(undefined)}>Leave practice</Button>}</div>
      {competitive && <div className="opponents">{match.players.map((id) => {
        const player = room!.players.find((item) => item.id === id)!;
        const live = state.live?.[id];
        return <div className={id === me?.id ? 'you' : ''} key={id}><Avatar config={player.avatar} size={45}/><span>{player.name}{id === me?.id ? ' (you)' : ''}<small>{live?.score || 0} pts {!player.connected && ' / offline'}</small></span></div>;
      })}</div>}
      <GameBoard board={board} elapsed={now - gameStart} onKey={type} connected={!competitive || state.connected} preset={gamePreset} arming={match?.status === 'arming'}/>
      {board.ended && <div className="result-banner"><Icon name="crown" size={28}/><div><h2>{board.lives === 0 ? 'Out of leaves. Still full of spirit.' : 'And... keyboards down!'}</h2><p>{board.score} points / {stats(board).wpm} WPM / {stats(board).accuracy ?? '--'}% accuracy. {competitive ? 'Your score is locked. The match ends at 60 seconds.' : 'Practice scores never affect the tournament.'}</p></div>{!competitive && <Button className="primary" onClick={startPractice}>One more round</Button>}</div>}
      {!competitive && <div className="practice-presets"><label>Next practice difficulty<select value={practicePreset} onChange={(event) => setPracticePreset(event.target.value as Difficulty)}>{PRESETS.map((preset) => <option key={preset}>{preset}</option>)}</select></label></div>}
    </Screen>}
    </AnimatePresence>
    <footer><span><Icon name="leaf" size={14}/> MADE FOR A LITTLE FRIENDLY COMPETITION</span>{room ? <Button className="text-button small" onClick={() => {
      if (!confirm('Leave this room? Presenter: export a private backup first.')) return;
      session.close(); setPractice(undefined); setView('home');
    }}>Leave room</Button> : <span>Good company. Great keystrokes.</span>}</footer>
  </div></PartyMotion>;
}

function Roster({ room, host, run }: { room: Room; host: boolean; run: (action: () => void) => Promise<void> }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(room.players.length / 8);
  const current = Math.min(page, Math.max(0, pages - 1));
  return <section className="panel lobby-panel"><div className="panel-heading"><h2>Campfire crew <span className="count-pill">{room.players.length}/25</span></h2><span className="muted">{room.players.filter((player) => player.ready && player.connected).length} ready</span></div>
    {!room.players.length && <div className="empty-lobby"><Avatar config={defaultAvatar} size={110}/><h3>The forest is quiet... for now.</h3><p>Share the code to bring your crew together.</p></div>}
    <motion.div key={current} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="player-grid">{room.players.slice(current * 8, current * 8 + 8).map((player, index) => <motion.div initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * .035 }} className={`player-card ${player.ready ? 'is-ready' : ''}`} key={player.id}><Avatar config={player.avatar}/><strong>{player.name}</strong><span className={`status-pill ${player.ready && player.connected ? 'ready' : ''}`}>{!player.connected ? 'Offline' : player.ready ? 'Ready to rain' : 'Getting cozy'}</span>{host && <Button className="text-button small" onClick={() => confirm(`Remove ${player.name} from the lobby?`) && void run(() => session.remove(player.id))}>Remove</Button>}</motion.div>)}</motion.div>
    <Pager page={current} pages={pages} onPage={setPage}/>
  </section>;
}
function History({ room }: { room: Room }) {
  const [page, setPage] = useState(0);
  return <><div className="history-entries">{room.audit.slice().reverse().slice(page * 6, page * 6 + 6).map((entry, index) => <p key={index}>{entry}</p>)}</div><Pager page={page} pages={Math.ceil(room.audit.length / 6)} onPage={setPage} label="events"/></>;
}
function PracticeCard({ preset, setPreset, start }: { preset: Difficulty; setPreset: (value: Difficulty) => void; start: () => void }) {
  return <section className="panel practice-card"><h3>Warm up by the fire</h3><p className="muted">Shake off the rust. Practice won't affect the bracket.</p><label>Difficulty<select value={preset} onChange={(event) => setPreset(event.target.value as Difficulty)}>{PRESETS.map((item) => <option key={item}>{item}</option>)}</select></label><Button className="secondary full" onClick={start}>Practice round <Icon name="bolt"/></Button></section>;
}
function Restore({ onRestore, busy }: { onRestore: (value: unknown) => void; busy: boolean }) {
  const [error, setError] = useState('');
  return <ToolsDialog label="Returning presenter? Restore your event"><div className="restore-options"><Button className="text-button" disabled={busy} onClick={() => {
    try {
      const value = localStorage.getItem('leaf-host-checkpoint');
      if (!value) throw new Error('No saved event in this browser.');
      onRestore(JSON.parse(value));
    } catch (restoreError) { setError(String(restoreError)); }
  }}>Restore last browser checkpoint</Button><label className="file-button">Import private backup<input type="file" accept=".json,application/json" onChange={(event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { setError('Backup is too large (maximum 2 MB).'); return; }
    void file.text().then((text) => onRestore(JSON.parse(text))).catch((fileError: unknown) => setError(String(fileError)));
  }}/></label></div>{error && <p role="alert">{error}</p>}</ToolsDialog>;
}
function Backups({ room }: { room: Room }) {
  return <ToolsDialog label="Event backups"><section className="backup-panel"><h3>Keep the campfire going</h3><p>Checkpoints save in this browser. Download a private backup before closing the presenter tab.</p><Button className="secondary full" onClick={() => download(`leaf-private-${room.code}.json`, session.exportPrivate())}>Save private backup</Button><Button className="text-button" onClick={() => download(`leaf-results-${room.code}.json`, session.exportResults())}>Export public results</Button><small>Private backups contain reconnect credentials. Don't share them on screen or with players.</small></section></ToolsDialog>;
}
function HostControls({ room, busy, run }: { room: Room; busy: boolean; run: (action: () => void) => Promise<void> }) {
  const current = room.matches.filter((match) => match.round === room.round);
  const allDone = current.every((match) => match.status === 'done');
  const pending = current.some((match) => match.status === 'pending');
  const active = current.some((match) => match.status === 'playing' || match.status === 'scheduled' || match.status === 'arming' || match.status === 'tie');
  const next = room.matches.find((match) => match.round === room.round + (allDone ? 1 : 0));
  return <section className="host-controls panel"><div><span className="eyebrow">YOU'RE RUNNING THE SHOW</span><h2>{allDone ? 'Ready for the next chapter?' : `Stage ${room.round + 1}: ${active ? 'the leaves are flying' : 'ready when you are'}`}</h2></div>
    {(allDone || pending) && !active && next && <label>Stage difficulty<select aria-label="Stage difficulty" value={next.preset} onChange={(event) => void run(() => session.setPreset(event.target.value as Difficulty, next.round))}>{PRESETS.map((item) => <option key={item}>{item}</option>)}</select></label>}
    <Button className="primary" disabled={busy || (!allDone && !pending) || !next} onClick={() => void run(() => session.start())}>{allDone ? 'Start next stage' : 'Start pending matches'}<Icon name="arrow"/></Button>
  </section>;
}
function Bracket({ room, host, now, run }: { room: Room; host: boolean; now: number; run: (action: () => void) => Promise<void> }) {
  const rounds = Array.from(new Set(room.matches.map((match) => match.round)));
  const [stage, setStage] = useState(room.round);
  const [page, setPage] = useState(0);
  return <div className="bracket-board" aria-label="Tournament bracket"><nav className="stage-selector" aria-label="Bracket stages">{rounds.map((round) => <Button key={round} aria-pressed={stage === round} onClick={() => { setStage(round); setPage(0); }}>{round === rounds.at(-1) ? 'The finale' : `Stage ${round + 1}`}<small>{room.matches.filter((match) => match.round === round).length} {round === rounds.at(-1) ? 'crown' : 'matches'}</small></Button>)}</nav><div className="bracket">{rounds.map((round) => <section className="bracket-round" key={round} hidden={round !== stage}><motion.div key={`${stage}-${page}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="round-matches">{room.matches.filter((match) => match.round === round).map((match, index) => <div key={match.id} hidden={index < page * 6 || index >= page * 6 + 6}><MatchCard room={room} match={match} host={host} now={now} run={run}/></div>)}</motion.div></section>)}</div><Pager page={page} pages={Math.ceil(room.matches.filter((match) => match.round === stage).length / 6)} onPage={setPage} label="matches"/></div>;
}
function MatchCard({ room, match, host, now, run }: { room: Room; match: Match; host: boolean; now: number; run: (action: () => void) => Promise<void> }) {
  const ids = match.players.length ? match.players : resolvePlayers(room, match);
  const roll = match.rolls.at(-1);
  return <article className={`match-card ${match.status}`} aria-label={`Match ${match.id}`}>
    <div className="match-meta"><span>{match.id.toUpperCase()} {match.sources.length === 3 && <b>TRIO</b>}</span><span>{match.status === 'playing' ? `${Math.max(0, Math.ceil((match.startAt + DURATION - now) / 1000))}s / LIVE` : match.status === 'arming' ? 'CONNECTING' : match.status === 'scheduled' ? 'GET READY' : match.status === 'tie' ? 'D20 TIE-BREAK' : match.status === 'done' ? 'FINAL' : 'UP NEXT'}</span></div>
    {Array.from({ length: match.sources.length }, (_, index) => {
      const player = room.players.find((item) => item.id === ids[index]);
      const score = player ? match.results[player.id]?.score ?? session.liveStats(player.id)?.score ?? session.getSnapshot().live?.[player.id]?.score : undefined;
      return <div className={`match-player ${player && match.winner === player.id ? 'winner' : ''}`} key={index}>{player ? <><Avatar config={player.avatar} size={39}/><span>{player.name}<small>{!player.connected && match.status !== 'done' ? 'offline' : match.winner === player.id ? 'advances' : ''}</small></span><b>{score ?? '--'}</b>{match.winner === player.id && <Icon name="crown" size={16}/>}</> : <><div className="unknown-avatar">?</div><span>Winner of {match.sources[index].replace('winner:', '').toUpperCase()}</span></>}</div>;
    })}
    {roll && <div className="dice-results" key={match.rolls.length}>{Object.entries(roll).map(([id, value]) => <span key={id}><Icon name="dice" size={17}/>{room.players.find((player) => player.id === id)?.name}: <b>{value}</b></span>)}</div>}
    {host && match.status === 'tie' && <Button className="dice-button" onClick={() => void run(() => session.dice(match.id))}><Icon name="dice"/>{roll ? 'Reroll tied leaders' : 'Roll for the crown'}</Button>}
    {host && match.status !== 'pending' && <Button className="text-button replay" onClick={() => {
      if (confirm(`Void ${match.id} and dependent results? This also resets all unfinished matches. Everyone in affected matches replays with a fresh seed.`)) void run(() => session.replay(match.id));
    }}>Void & replay</Button>}
  </article>;
}
function Leaderboard({ room }: { room: Room }) {
  const [page, setPage] = useState(0);
  const players = room.players.slice().sort((a, b) => (placement(room, a.id) || 0) - (placement(room, b.id) || 0) || a.name.localeCompare(b.name));
  return <section className="panel leaderboard"><div className="panel-heading"><h2>The forest standings</h2><span className="muted">{players.length} players / placement first</span></div><div className="table-scroll"><table><thead><tr><th>Place</th><th>Player</th><th>Round scores</th><th>Best WPM</th><th>Accuracy</th><th>Best streak</th></tr></thead><tbody>{players.slice(page * 5, page * 5 + 5).map((player) => {
    const results = room.matches.flatMap((match) => match.results[player.id] ? [match.results[player.id]] : []);
    const ranked = placement(room, player.id);
    return <tr key={player.id}><td>{ranked ? `#${ranked}` : 'In play'}</td><td><span className="table-player"><Avatar config={player.avatar} size={42}/>{player.name}</span></td><td>{results.map((result) => result.score).join(' / ') || '--'}</td><td>{results.length ? Math.max(...results.map((result) => result.wpm)) : '--'}</td><td>{results.at(-1)?.accuracy != null ? `${results.at(-1)!.accuracy}%` : '--'}</td><td>{results.length ? Math.max(...results.map((result) => result.best)) : '--'}</td></tr>;
  })}</tbody></table></div><Pager page={page} pages={Math.ceil(players.length / 5)} onPage={setPage}/><p className="form-note">Same-stage eliminations share placement. Accuracy: last round. WPM: full minute.</p></section>;
}
function Champion({ room }: { room: Room }) {
  const player = room.players.find((item) => item.id === room.matches.at(-1)?.winner);
  if (!player) return null;
  return <section className="champion-banner"><div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${i * 6}%`, animationDelay: `${(i % 5) * -0.5}s` }}/>)}</div><Avatar config={player.avatar} size={135} champion/><div><div className="eyebrow"><Icon name="crown" size={16}/> THE AUTUMN CROWN HAS A NEW HOME</div><h2>{player.name}</h2><p>Fast fingers. Legendary fall energy. Your Type Night champion.</p></div><Icon name="crown" size={68}/></section>;
}
function GameBoard({ board, elapsed, onKey, connected, preset, arming = false }: { board: Board; elapsed: number; onKey: (key: string) => void; connected: boolean; preset: Difficulty; arming?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const time = Math.max(0, Math.ceil((DURATION - Math.max(0, elapsed)) / 1000));
  useEffect(() => { ref.current?.focus(); }, [preset, board.seed]);
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing || event.repeat) return;
    if (/^[a-zA-Z ]$/.test(event.key) || event.key === 'Backspace') {
      event.preventDefault();
      if (connected) onKey(event.key);
    }
  }
  const selected = board.targets.find((target) => target.id === board.selected);
  const invalid = !!board.buffer && (!selected || !selected.text.startsWith(board.buffer));
  return <section className="game-shell">
    <div className="game-hud"><div><small>SCORE</small><strong key={board.score} className="score-pop">{board.score.toLocaleString()}</strong></div><div className={`combo-display ${board.streak >= 5 ? 'hot' : ''}`}><small><Icon name="bolt" size={14}/> COMBO</small><strong>{multiplier(board.streak)}<span>x</span><em>{board.streak} streak</em></strong></div><div className={time <= 10 ? 'urgent' : ''}><small>TIME LEFT</small><strong>{time}<span>s</span></strong></div><div className="lives-display"><small>LEAVES LEFT</small><div aria-label={`${board.lives} lives`}>{[0, 1, 2].map((life) => <span key={life} className={life < board.lives ? '' : 'lost'}><Icon name="leaf" size={25}/></span>)}</div></div></div>
    <div className="playfield" onClick={() => ref.current?.focus()} aria-label="Falling word playfield">
      <div className="forest-backdrop" aria-hidden="true"><span/><span/><span/><span/><span/></div>
      <div className="lane-lines" aria-hidden="true"/>
      {board.targets.map((target) => {
        const progress = Math.max(0, Math.min(1, (board.now - target.born) / target.fall));
        const active = selected?.id === target.id;
        return <div data-testid="falling-target" data-target-id={target.id} key={`${board.seed}-${target.id}`}
          className={`falling-word ${active ? 'targeted' : ''} ${progress > .8 ? 'near-line' : ''}`}
          style={{ left: `${8 + target.lane * 84}%`, transform: `translateX(-${target.lane * 100}%) translateY(calc(${progress * 85}cqh - ${progress * 38}px))` }}>
          {active && !invalid ? <><span className="typed">{board.buffer}</span>{target.text.slice(board.buffer.length)}</> : target.text}
        </div>;
      })}
      <div className="kill-line"><span>THE NO-WORD ZONE</span></div>
      {(elapsed < 0 || !connected) && <div className="game-overlay"><small>{connected ? arming ? 'GATHERING YOUR MATCH' : 'FINGERS ON KEYS' : 'CONNECTION LOST'}</small><strong key={Math.ceil(-elapsed / 1000)}>{connected ? arming ? '...' : Math.max(1, Math.ceil(-elapsed / 1000)) : 'Offline'}</strong><p>{connected ? arming ? 'Waiting for every keyboard to connect.' : 'Same words. Same chance. Your moment.' : 'Timer continues. Reconnect to return.'}</p></div>}
      {board.ended && <div className="game-overlay finished-overlay"><Icon name="leaf" size={45}/><h2>Keyboards down.</h2><p>{board.score} points in the bag.</p></div>}
    </div>
    <div className={`typing-bar ${invalid ? 'typo' : ''}`}><span className="typing-prompt"><Icon name="bolt" size={20}/></span><input ref={ref} aria-label="Type falling words" spellCheck={false} autoComplete="off" autoCapitalize="off" value={board.buffer} onChange={() => { /* Key events are validated by the simulation. */ }} onKeyDown={keyboard} onPaste={(event) => event.preventDefault()} placeholder="Type a falling word to catch it..." disabled={board.ended || !connected}/><span className="typing-hint">{invalid ? 'Backspace to correct' : 'NO ENTER NEEDED'}</span></div>
    <p className="game-help">Type the whole target, including phrase spaces. Typos reset combos, not lives. Only missed targets cost a leaf.</p>
  </section>;
}
