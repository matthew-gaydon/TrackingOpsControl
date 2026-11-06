import type { PitchFile, PlayInfo } from '../../data/types';

const CALL: Record<string, string> = {
  BallCalled: 'Ball', StrikeCalled: 'Called strike', StrikeSwinging: 'Swinging strike', FoulBall: 'Foul', InPlay: 'In play', HitByPitch: 'Hit by pitch',
};
const SPLIT = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');   // "GroundBall" -> "Ground Ball"
const hand = (v?: string) => (v ? v[0] : undefined);                    // Right -> R
const known = (v?: string) => (v && v !== 'Undefined' ? v : undefined);

const Stat = ({ k, v, strong }: { k: string; v?: string | number; strong?: boolean }) => (
  <span className="col" style={{ gap: 0, minWidth: 0 }} title={`${k}${v !== undefined ? `: ${v}` : ''}`}>
    <span className="lbl" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>{k}</span>
    <span className={typeof v === 'number' ? 'mono' : ''} style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 600, color: v === undefined ? 'var(--faint)' : 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v ?? '—'}</span>
  </span>
);

/**
 * Play metadata for a pitch: situation, matchup and result. It arrives shortly after the pitch
 * (MLB StatsAPI in production; the pitch export here), so it lives on the Pitches tab, not the
 * live Game view. Tracking measurements stay in the views that own them.
 */
export function PlayPanel({ p }: { p: PitchFile }) {
  const i: PlayInfo | undefined = p.play;
  if (!i) return (
    <section className="panel row small muted" style={{ flex: '0 0 auto', padding: '10px 14px' }}>Play · Pitch {p.num}: no play data in this dataset.</section>
  );
  return (
    <section className="panel row wrap" aria-label={`Play for pitch ${p.num}`} style={{ flex: '0 0 auto', gap: 16, padding: '10px 12px', alignItems: 'stretch' }}>
      <div className="col" style={{ gap: 6, flex: '1 1 340px', minWidth: 0, justifyContent: 'center' }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Play · Pitch {p.num}</h2>
          <span className="row mono small" style={{ gap: 8, color: 'var(--text-2)' }}>
            {i.inning !== undefined && <span style={{ fontWeight: 700 }}>{i.half === 'Bottom' ? 'Bot' : 'Top'} {i.inning}</span>}
            {i.outs !== undefined && <span>{i.outs} out</span>}
            {i.balls !== undefined && i.strikes !== undefined && <span>Count {i.balls}-{i.strikes}</span>}
            {i.paOfInning !== undefined && <span className="muted">PA {i.paOfInning}{i.pitchOfPa !== undefined && `, pitch ${i.pitchOfPa}`}</span>}
          </span>
        </div>
        <div className="small" style={{ lineHeight: 1.35 }}>
          <span style={{ fontWeight: 700 }}>{i.pitcher ?? '—'}</span>
          <span className="muted"> ({[i.pitcherTeam, hand(i.pitcherThrows) && `${hand(i.pitcherThrows)}HP`].filter(Boolean).join(', ')})</span>
          <span className="muted"> pitching to </span>
          <span style={{ fontWeight: 700 }}>{i.batter ?? '—'}</span>
          <span className="muted"> ({[i.batterTeam, hand(i.batterSide) && `bats ${hand(i.batterSide)}`].filter(Boolean).join(', ')})</span>
        </div>
      </div>
      <div className="col" style={{ gap: 6, flex: '1 1 380px', minWidth: 0, padding: '8px 10px', borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="small grow" style={{ fontWeight: 600, color: 'var(--text-3)' }}>Result</span>
          {p.uid && <span className="mono tiny" title="Play ID (MLB playId / PitchUID). Click to select." style={{ color: 'var(--text-3)', userSelect: 'all', cursor: 'text' }}><span className="muted">Play ID </span>{p.uid}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.4fr) minmax(0, 1.2fr) minmax(0, .55fr) minmax(0, .55fr)', gap: 10 }}>
          <Stat k="Call" v={i.call ? CALL[i.call] ?? SPLIT(i.call) : undefined} strong />
          <Stat k="Play result" v={known(i.result) ? SPLIT(i.result!) : known(i.korbb)} strong />
          <Stat k="Hit type" v={known(i.hitType) && SPLIT(i.hitType!)} />
          <Stat k="Outs" v={i.outsOnPlay} />
          <Stat k="Runs" v={i.runsScored} />
        </div>
      </div>
    </section>
  );
}
