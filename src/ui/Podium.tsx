import { useRef, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { finalStandings, podiumContenders, type Room } from '../tournament/model';
import { Avatar } from './Avatar';
import { Button, ToolsDialog, usePartyMotion } from './Party';
import { AWARD_TITLE, EVENT_NAME, awardFilename, badgePng, certificateHtml, downloadFile } from './awards';
import { session } from '../state/session';
import { Icon } from './Icon';

type Run = (action: () => void | Promise<void>) => Promise<void>;

export function Podium({ room, host, playerId, run }: { room: Room; host: boolean; playerId?: string; run: Run }) {
  const reduced = usePartyMotion();
  const [paused, setPaused] = useState(false);
  const still = reduced || paused;
  const standings = finalStandings(room);
  const tied = podiumContenders(room);
  const champion = standings[0];
  if (!champion) return null;
  const pending = tied.length > 0;
  const visible = pending ? [champion] : standings.slice(0, 3);
  const order = [1, 0, 2].filter((index) => index < visible.length);
  return <section className="championship-results" aria-label="Championship results" data-celebrating={!still}>
    <Celebration animated={!still}/>
    <div className="podium-heading"><div><div className="eyebrow">{EVENT_NAME}</div><h2>{pending ? 'A champion crowned. Podium places pending.' : 'Tiny paws. Huge victory!'}</h2><p>{AWARD_TITLE}: <strong>{champion.name}</strong></p></div>
      <div className="podium-actions">{!reduced && <Button className="secondary" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Keep partying' : 'Pause party'}</Button>}
        {(host || playerId === champion.id) && <WinnerAwards name={champion.name} run={run}/>}
      </div>
    </div>
    <div className="celebration-callout"><span><Icon name="crown" size={18}/> GG, keyboard legends!</span><p>{champion.name} takes the crown. Victory wiggles all around!</p></div>
    <div className={`podium ${pending ? 'podium-pending' : ''}`}>
      {order.map((index) => {
        const player = visible[index];
        const result = room.matches.filter((match) => match.players.includes(player.id) && match.status === 'done').at(-1)?.results[player.id];
        return <motion.article key={player.id} className={`podium-place place-${index + 1}`} aria-label={`Place ${index + 1}: ${player.name}`}
          initial={still ? false : { opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: still ? 0 : index === 0 ? 1 : index === 1 ? .5 : 0, duration: .35 }}>
          <div className="podium-mascot">
            {index === 0 && <><span className="champion-halo" aria-hidden="true"/><span className="champion-sticker" aria-hidden="true">YOU DID IT!</span></>}
            <div className="mascot-dancer"><Avatar config={player.avatar} size={index === 0 ? 96 : 80} champion={index === 0} celebrating={!still}/></div>
          </div>
          <strong className="podium-name">{player.name}</strong>
          <span>{result?.score ?? 0} pts / {result?.wpm ?? 0} WPM</span>
          <div className="podium-step"><b>#{index + 1}</b><small>{index === 0 ? 'CHAMPION' : index === 1 ? 'SILVER' : 'BRONZE'}</small></div>
        </motion.article>;
      })}
    </div>
    {pending && <div className="podium-tie" role="status"><p><b>Podium tie:</b> {tied.map((id) => room.players.find((player) => player.id === id)!.name).join(', ')}. {host ? 'Roll to lock the remaining places.' : 'The presenter is resolving the remaining places.'}</p>
      {host && <Button className="primary" onClick={() => void run(() => session.podiumDice())}>{room.podiumRolls.length ? 'Reroll podium tie' : 'Roll for podium'}</Button>}
    </div>}
    {room.podiumRolls.length > 0 && <p className="podium-rolls">Latest podium d20: {Object.entries(room.podiumRolls.at(-1)!).map(([id, value]) => `${room.players.find((player) => player.id === id)!.name}: ${value}`).join(' / ')}</p>}
  </section>;
}

function Celebration({ animated }: { animated: boolean }) {
  const colors = ['#edda8f', '#e8a060', '#a9ca75', '#bc9ad8', '#84bac9', '#ef9d9b'];
  return <div className="celebration-sky" aria-hidden="true">
    <div className="celebration-rays"/>
    {Array.from({ length: 10 }, (_, i) => <i className="party-sparkle" key={`star-${i}`} style={{ left: `${5 + (i * 31) % 90}%`, top: `${12 + (i * 23) % 76}%`, animationDelay: `${i * -.3}s` }}/>)}
    {animated && Array.from({ length: 60 }, (_, i) => {
      const style: CSSProperties & Record<'--drift' | '--spin', string> = {
        left: `${(i * 37) % 100}%`, backgroundColor: colors[i % colors.length],
        animationDelay: `${(i % 15) * -.5}s`, animationDuration: `${6 + (i % 5) * .8}s`,
        '--drift': `${(i % 2 ? 1 : -1) * (20 + (i % 6) * 12)}px`, '--spin': `${360 + (i % 5) * 90}deg`,
      };
      return <i className={`party-confetti confetti-shape-${i % 3}`} key={i} style={style}/>;
    })}
  </div>;
}

function WinnerAwards({ name, run }: { name: string; run: Run }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const html = certificateHtml(name);
  return <ToolsDialog label="Winner awards"><div className="award-actions">
    <p>{AWARD_TITLE}<br/><b>{name}</b></p>
    <Button className="primary" onClick={() => void run(async () => downloadFile(awardFilename(name, 'png'), await badgePng(name)))}>Download email badge</Button>
    <p className="form-note">Insert this PNG into your email signature. Nothing is emailed or uploaded.</p>
    <Button className="secondary" onClick={() => void run(() => downloadFile(awardFilename(name, 'html'), new Blob([html], { type: 'text/html;charset=utf-8' })))}>Download certificate</Button>
    <Button className="secondary" disabled={!ready} onClick={() => void run(() => {
      if (!frame.current?.contentWindow) throw new Error('Certificate preview is not ready.');
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    })}>Print / Save as PDF</Button>
    <p className="form-note">Choose Save as PDF in your browser's print dialog.</p>
    <iframe ref={frame} title="Winner certificate preview" className="certificate-preview" srcDoc={html} sandbox="allow-same-origin allow-modals" onLoad={() => setReady(true)}/>
  </div></ToolsDialog>;
}
