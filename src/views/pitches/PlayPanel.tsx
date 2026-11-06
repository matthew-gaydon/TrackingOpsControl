import type { PitchFile, PlayInfo } from '../../data/types';

const CALL: Record<string, string> = {
  BallCalled: 'Ball', StrikeCalled: 'Called strike', StrikeSwinging: 'Swinging strike', FoulBall: 'Foul', InPlay: 'In play', HitByPitch: 'Hit by pitch',
};
const SPLIT = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');   // "GroundBall" -> "Ground Ball"
const LONG: Record<string, string> = { IVB: 'Induced vertical break', HB: 'Horizontal break', 'Plate h / side': 'Plate location: height / side', Hang: 'Hang time' };
const f1 = (v?: number) => (v === undefined ? undefined : v.toFixed(1));
const sign = (v?: number, d = 1) => (v === undefined ? undefined : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
const hand = (v?: string) => (v ? v[0] : undefined);   // Right -> R

const Stat = ({ k, v, unit, strong, span = 1 }: { k: string; v?: string | number; unit?: string; strong?: boolean; span?: number }) => (
  <span className="col" style={{ gap: 0, minWidth: 0, gridColumn: `span ${span}` }} title={`${LONG[k] ?? k}${v !== undefined ? `: ${v}${unit ? ' ' + unit : ''}` : ''}`}>
    <span className="lbl" style={{ fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span>
    <span className={typeof v === 'string' && /[a-z]{3}/i.test(v) ? '' : 'mono'} style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 600, color: v === undefined ? 'var(--faint)' : 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {v ?? '—'}{v !== undefined && unit && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> {unit}</span>}
    </span>
  </span>
);
const Group = ({ title, cols = 3, children }: { title: string; cols?: number; children: React.ReactNode }) => (
  <div className="col" style={{ gap: 6, padding: '8px 10px', borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--border)', minWidth: 0 }}>
    <span className="small" style={{ fontWeight: 600, color: 'var(--text-3)' }}>{title}</span>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '6px 10px' }}>{children}</div>
  </div>
);

/**
 * Play metadata for a pitch: situation, matchup, pitch, result and batted ball. It arrives shortly
 * after the pitch (MLB StatsAPI in production; the pitch export here), so it lives on the Pitches
 * tab, not the live Game view.
 */
export function PlayPanel({ p }: { p: PitchFile }) {
  const i: PlayInfo | undefined = p.play;
  if (!i) return (
    <section className="panel row small muted" style={{ flex: '0 0 auto', padding: '10px 14px' }}>Play · Pitch {p.num}: no play data in this dataset.</section>
  );
  const result = i.result && i.result !== 'Undefined' ? SPLIT(i.result) : i.korbb && i.korbb !== 'Undefined' ? i.korbb : undefined;
  const contact = i.exitSpeed !== undefined;
  return (
    <section className="panel col" aria-label={`Play for pitch ${p.num}`} style={{ flex: '0 0 auto', gap: 8, padding: '10px 12px' }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Play · Pitch {p.num}</h2>
        <span className="row mono small" style={{ gap: 8, color: 'var(--text-2)' }}>
          {i.inning !== undefined && <span style={{ fontWeight: 700 }}>{i.half === 'Bottom' ? 'Bot' : 'Top'} {i.inning}</span>}
          {i.outs !== undefined && <span>{i.outs} out</span>}
          {i.balls !== undefined && i.strikes !== undefined && <span>Count {i.balls}-{i.strikes}</span>}
          {i.paOfInning !== undefined && <span className="muted">PA {i.paOfInning}{i.pitchOfPa !== undefined && `, pitch ${i.pitchOfPa}`}</span>}
        </span>
        <span className="grow" />
        <span className="tiny muted" title="In production this comes from MLB StatsAPI shortly after each pitch">After the pitch · MLB StatsAPI</span>
      </div>
      <div className="small" style={{ lineHeight: 1.35 }}>
        <span style={{ fontWeight: 700 }}>{i.pitcher ?? '—'}</span>
        <span className="muted"> ({[i.pitcherTeam, hand(i.pitcherThrows) && `${hand(i.pitcherThrows)}HP`].filter(Boolean).join(', ')})</span>
        <span className="muted"> pitching to </span>
        <span style={{ fontWeight: 700 }}>{i.batter ?? '—'}</span>
        <span className="muted"> ({[i.batterTeam, hand(i.batterSide) && `bats ${hand(i.batterSide)}`].filter(Boolean).join(', ')})</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1.2fr) minmax(0, 1fr)', gap: 8 }}>
        <Group title="Pitch" cols={5}>
          <Stat k="Type" v={i.pitchType} strong />
          <Stat k="Velocity" v={f1(i.relSpeed)} unit="mph" strong />
          <Stat k="Spin" v={i.spinRate} unit="rpm" />
          <Stat k="Tilt" v={i.tilt} />
          <Stat k="IVB" v={sign(i.inducedVertBreak)} unit="in" />
          <Stat k="HB" v={sign(i.horzBreak)} unit="in" />
          <Stat k="Extension" v={f1(i.extension)} unit="ft" />
          <Stat k="Zone speed" v={f1(i.zoneSpeed)} unit="mph" />
          <Stat k="Plate h / side" v={i.plateHeight !== undefined ? `${i.plateHeight.toFixed(2)} / ${sign(i.plateSide, 2)}` : undefined} unit="ft" span={2} />
        </Group>
        <Group title="Result" cols={6}>
          <Stat k="Call" v={i.call ? CALL[i.call] ?? SPLIT(i.call) : undefined} strong span={3} />
          <Stat k="Play result" v={result} strong span={3} />
          <Stat k="Hit type" v={i.hitType && i.hitType !== 'Undefined' ? SPLIT(i.hitType) : undefined} span={2} />
          <Stat k="Outs" v={i.outsOnPlay} span={2} />
          <Stat k="Runs" v={i.runsScored} span={2} />
        </Group>
        <Group title="Batted ball" cols={6}>
          {contact ? <>
            <Stat k="Exit velo" v={f1(i.exitSpeed)} unit="mph" strong span={3} />
            <Stat k="Launch angle" v={i.launchAngle !== undefined ? `${Math.round(i.launchAngle)}°` : undefined} strong span={3} />
            <Stat k="Direction" v={i.direction !== undefined ? `${Math.round(i.direction)}°` : undefined} span={2} />
            <Stat k="Distance" v={i.distance !== undefined ? Math.round(i.distance) : undefined} unit="ft" span={2} />
            <Stat k="Hang" v={i.hangTime !== undefined ? i.hangTime.toFixed(2) : undefined} unit="s" span={2} />
          </> : <span className="small muted" style={{ gridColumn: '1 / -1' }}>No contact on this pitch</span>}
        </Group>
      </div>
    </section>
  );
}
