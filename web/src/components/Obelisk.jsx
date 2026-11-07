import { useId } from 'react';
import { motion } from 'motion/react';
import { easeOut } from './ui.jsx';

/**
 * An ARK-style obelisk: a tapered crystal monolith with a light beam rising from its tip.
 * The beam shows the server state. info = stateInfo(server) -> { key, color, live }
 */
export default function Obelisk({ info, height = 120, width = 34, delay = 0, beam = true, pillar = 0.56 }) {
  const gid = useId();
  const lit = ['online', 'starting', 'stopping', 'busy', 'crashed'].includes(info.key);
  const pillarH = Math.round(height * pillar);
  const beamH = height - pillarH + 4;
  const strength = info.key === 'online' ? 1 : info.key === 'crashed' ? 0.5 : 0.8;
  return (
    <div className="relative" style={{ height, width }} aria-hidden="true">
      {beam && (
        <motion.div
          className="absolute left-1/2 origin-bottom -translate-x-1/2"
          style={{ bottom: pillarH - 4, height: beamH, width: Math.max(12, width * 0.75) }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: lit ? 1 : 0, opacity: lit ? strength : 0 }}
          transition={{ duration: 1.2, delay, ease: easeOut }}
        >
          <div className={info.key === 'online' ? 'beam-breathe absolute inset-0' : 'absolute inset-0'}>
            {/* halo */}
            <div className="absolute inset-y-0 left-1/2 w-full -translate-x-1/2 rounded-full blur-[7px]"
              style={{ background: `linear-gradient(to top, color-mix(in oklab, ${info.color} 85%, transparent), transparent 92%)` }} />
            {/* core */}
            <div className="absolute inset-y-0 left-1/2 w-[4px] -translate-x-1/2 rounded-full"
              style={{ background: `linear-gradient(to top, white, ${info.color} 10%, ${info.color} 45%, transparent 100%)` }} />
          </div>
          {info.live && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="beam-scan absolute inset-x-0 bottom-0 h-1/3" style={{ background: `linear-gradient(to top, transparent, color-mix(in oklab, ${info.color} 80%, white), transparent)` }} />
            </div>
          )}
        </motion.div>
      )}
      {lit && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 rounded-full blur-2xl"
          style={{ bottom: pillarH * 0.35, width: width * 2, height: width * 2, background: info.color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: info.key === 'online' ? 0.22 : 0.12 }}
          transition={{ duration: 1, delay: delay + 0.4 }}
        />
      )}
      <svg viewBox="0 0 34 100" preserveAspectRatio="none" className="absolute bottom-0 left-0" style={{ width, height: pillarH }}>
        <defs>
          <linearGradient id={`ob${gid}`} x1="0" x2="1">
            <stop offset="0" stopColor="#3b3f46" />
            <stop offset="0.5" stopColor="#24272c" />
            <stop offset="1" stopColor="#15171a" />
          </linearGradient>
        </defs>
        <path d="M17 0 L27 13 L31 100 L3 100 L7 13 Z" fill={`url(#ob${gid})`} stroke="#4a4f57" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M17 0 L17 100" stroke="#585e67" strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.5" />
        <motion.path
          d="M17 20 L22 32 L17 44 L12 32 Z"
          initial={false}
          animate={{ fill: lit ? info.color : '#31353b', opacity: lit ? 1 : 0.7 }}
          transition={{ duration: 0.6 }}
          style={{ filter: lit ? `drop-shadow(0 0 5px ${info.color})` : 'none' }}
        />
      </svg>
    </div>
  );
}
