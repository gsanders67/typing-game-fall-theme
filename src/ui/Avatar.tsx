import type { AvatarConfig } from '../tournament/model';
import { motion } from 'motion/react';
import { usePartyMotion } from './Party';
import { memo } from 'react';

const colors = { orange: '#f5a257', green: '#a9ca75', purple: '#bc9ad8', blue: '#84bac9' };
export const Avatar = memo(function Avatar({ config, size = 72, champion = false, celebrating = false }: { config: AvatarConfig; size?: number; champion?: boolean; celebrating?: boolean }) {
  const fill = colors[config.color];
  const reduced = usePartyMotion();
  return <motion.svg className={celebrating && !reduced ? 'avatar-celebrating' : undefined} width={size} height={size} viewBox="0 0 100 110" role="img" aria-label={`${config.color} ${config.animal} with ${champion ? 'crown' : config.hat}`}
    animate={reduced ? { y: 0, rotate: 0 } : size >= 100 ? { y: [0, -3, 0], rotate: [-1, 1, -1] } : undefined}
    transition={reduced ? { duration: 0 } : { duration: 3 + size / 200, repeat: Infinity, ease: 'easeInOut' }}
    whileHover={reduced ? undefined : { scale: 1.1, rotate: -5, transition: { type: 'spring', stiffness: 400, damping: 20, repeat: 0 } }}
    whileTap={reduced ? undefined : { scale: .92, transition: { duration: .1, repeat: 0 } }}>
    <ellipse cx="50" cy="102" rx="29" ry="5" fill="#000" opacity=".14" />
    <path d="M25 86 Q22 64 50 61 Q78 64 75 86 L72 98 H28Z" fill={fill} />
    <path className="avatar-arm-left" d="M23 70 Q8 67 15 89" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" />
    <path className="avatar-arm-right" d="M77 70 Q92 67 85 89" fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" />
    {config.animal === 'fox' ? <path d="M19 48 L15 12 L42 30 M81 48 L85 12 L58 30" fill={fill} stroke="#3d4333" strokeWidth="2" /> :
      config.animal === 'frog' ? <><circle cx="27" cy="29" r="13" fill={fill}/><circle cx="73" cy="29" r="13" fill={fill}/></> :
        <><circle cx="22" cy="27" r="13" fill={fill}/><circle cx="78" cy="27" r="13" fill={fill}/></>}
    <path d="M17 49 Q15 23 50 24 Q85 23 83 49 Q84 76 50 78 Q16 76 17 49" fill={fill} />
    {config.animal === 'fox' && <path d="M18 45 L50 59 L82 45 Q80 74 50 76 Q20 74 18 45" fill="#ffedc8" />}
    {config.animal === 'owl' && <><circle cx="34" cy="46" r="17" fill="#ffedc8"/><circle cx="66" cy="46" r="17" fill="#ffedc8"/></>}
    {config.face === 'cool' ? <g fill="#27382c"><path d="M22 40 H47 L44 52 H27Z M53 40 H78 L73 52 H56Z"/><path d="M43 43 H57" stroke="#27382c" strokeWidth="4"/></g> :
      config.face === 'sleepy' ? <path d="M28 45 Q34 50 40 45 M60 45 Q66 50 72 45" fill="none" stroke="#27382c" strokeWidth="3" strokeLinecap="round"/> :
        <g fill="#27382c"><ellipse cx="34" cy="45" rx="3.5" ry="5"/><ellipse cx="66" cy="45" rx="3.5" ry="5"/></g>}
    <path d="M45 59 Q50 65 55 59" stroke="#27382c" fill="none" strokeWidth="2.5" strokeLinecap="round"/>
    <ellipse cx="25" cy="56" rx="5" ry="3" fill="#ef7d74" opacity=".6"/><ellipse cx="75" cy="56" rx="5" ry="3" fill="#ef7d74" opacity=".6"/>
    {(champion || config.hat === 'crown') && <path d="M28 24 L24 7 L40 16 L50 3 L60 16 L76 7 L72 24Z" fill="#f1ca62" stroke="#806132" strokeWidth="2"/>}
    {!champion && config.hat === 'beanie' && <><path d="M25 26 Q23 4 50 4 Q77 4 75 26" fill="#b95542"/><rect x="22" y="21" width="56" height="10" rx="4" fill="#d67057"/><circle cx="50" cy="5" r="6" fill="#d67057"/></>}
    {!champion && config.hat === 'leaf' && <><path d="M50 25 Q32 -4 65 6 Q78 24 50 25" fill="#95b953"/><path d="M50 25 L61 10" stroke="#567233" strokeWidth="2"/></>}
    <path d="M43 88 H57 M50 81 V95" stroke="#fff7df" strokeWidth="3" opacity=".7"/>
  </motion.svg>;
}, (before, after) => before.size === after.size && before.champion === after.champion && before.celebrating === after.celebrating &&
  before.config.animal === after.config.animal && before.config.color === after.config.color &&
  before.config.hat === after.config.hat && before.config.face === after.config.face);
