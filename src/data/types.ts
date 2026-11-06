/**
 * TrackingOpsControl — sample-data contract.
 *
 * A dataset is a folder under public/data/<name>/ with these files:
 *   game.json      -> GameFile
 *   cameras.json   -> CameraFile[]
 *   pitches.json   -> PitchFile[]   (oldest first)
 *   status.json    -> StatusMessage[] (raw BMCC/BMCA status-box lines)
 *   images/...     -> any images referenced by relative path
 *
 * Load a dataset with ?data=<name> (default "demo"). See DATA.md for the full guide.
 * Alerts are NOT authored here: src/alerts/engine.ts derives them from these files.
 */

export type CameraGroup = 'pitchToPlate' | 'fullField' | 'biomechanics';
export type SessionMode = 'none' | 'out' | 'in';

/** Image paths are relative to the dataset folder, e.g. "images/cameras/P1/live.jpg". */
export type ImagePath = string;

export interface GameFile {
  venue: string;                       // shown under the app name
  gamePk: number | null;               // MLB GamePK (from BDS). null -> Session ID is shown
  sessionId: string;                   // Hawk-Eye session ID (from GroundControl)
  gameMode: 'LIVE' | 'PRACTICE' | 'TEST' | string;
  session: SessionMode;
  /**
   * Dataset clock. Either a full timestamp ("2026-11-04T05:10:14Z", preferred) or a clock time
   * ("05:10:14") read together with `date`. See "Times" in DATA.md.
   */
  now: string;
  /** UTC date ("YYYY-MM-DD") that a clock-only `now` falls on. Ignored when `now` is a full timestamp. */
  date?: string;
  redundancy: { role: 'MAIN' | 'BACKUP'; btcConnected: boolean; bdsConnected: boolean; peers: number };
  timing: { latencyMs: number; tssOffsetMs: number };
  thresholds?: Partial<Thresholds>;
  /** Defaults used when a camera or pitch has no image of its own. */
  defaultImages?: Partial<Record<'live' | 'tracking' | 'mosaic' | 'still' | 'hit' | 'spinStrip', ImagePath>>;
}

export interface Thresholds {
  targetFps: number;                   // full frame rate (600)
  confidencePass: number;              // pitch confidence pass line (7)
  strikeZoneTolerance: number;         // |Δ| above this is out of tolerance: amber (0.005)
  strikeZoneCritical: number;          // PitchToPlate |Δ| above this is red, on the card and the pitch timeline (0.008)
  /** PitchToPlate cameras between tolerance and critical on one pitch: this many make it amber (2), this many red (3). */
  strikeZoneBandAmber: number;
  strikeZoneBandRed: number;
  spinFitErrorReview: number;          // spin fit error review line (0.25)
  tssOffsetMaxMs: number;              // TSS offset above this raises a timing warning (10)
  latencyMaxMs: number;                // pitch latency above this raises a timing warning (400)
  hitTrackGoodPct: number;             // hit tracked % at or above this is green (80)
  hitTrackPoorPct: number;             // hit tracked % below this is red; between the two is amber (50)
}

export interface CameraFile {
  /** Stable id used everywhere, e.g. "P1".."P6", "F1".."F8", "B1".."B16". */
  id: string;
  group: CameraGroup;
  number: number;                      // 1-based within its group
  /** BMCC numbering: tracking camera 1-14 (P2P 1-6, FF 7-14). Omit for biomechanics. */
  bmccTrackingNumber?: number;
  /** BMCA capture host, e.g. "BMCA27". Used to match status messages and for "Open in BMCA". */
  host?: string;
  /** Name BMCC uses in the monitored-camera list, e.g. "Camera 15". */
  bmccName?: string;
  running: boolean;
  fps: number;
  targetFps?: number;                  // defaults to thresholds.targetFps
  tracking?: { multicamPresent: boolean; playerTracking: boolean };
  images?: Partial<Record<'live' | 'tracking' | 'mosaic' | 'still', ImagePath>>;
  /** Calibration overlay for the Control live image, in the live image's pixel space. */
  calibration?: CalibrationFile;
  /** Current BMCA control values. Omitted keys fall back to DEFAULT_SETTINGS. */
  settings?: Partial<CameraSettings>;
  /** Latest ball candidate (BMCA "Selected" column) for the Ball tuning check. */
  lastBall?: { strength: number; perimeter: number; area: number; boxes?: BallBox[] };
  /** Antiwobble match counts, e.g. { linesMatched: 11, linesTotal: 14, ... } */
  antiwobble?: { linesMatched: number; linesTotal: number; patchesMatched: number; patchesTotal: number };
}

export interface CalibrationFile {
  imageSize: [number, number];         // [width, height] of the live image the coordinates refer to
  lines: [number, number, number, number][];
  keyPoints: { id: string; label: string; x: number; y: number }[];
}

export interface BallBox { x: number; y: number; size: number }

export interface CameraSettings {
  autoExp: boolean; expTarget: number; exposure: number; maxExp: number;
  autoGain: boolean; aGain: number; autoDGain: boolean; dGain: number;
  lens: boolean; iris: number; focus: number;
  lmr: boolean; size: number; thresh: number; scale: number;
  strMin: number; perMin: number; perMax: number; areaMin: number; areaMax: number;
  nx: number; ny: number; rx: number; ry: number;
  awLines: boolean; awTpl: boolean; awScore: number;
}

export interface SzDelta { x: number; z: number }

export type PpResult = 'success' | 'failed';
export type AcsStatus = 'success' | 'noswing' | 'review' | 'fail';
export type TrackpacResult = 'valid' | 'validation_failed' | 'failed';
export type TrackpacCloud = 'queued' | 'processing' | 'successful' | 'needs_validation' | 'uploaded' | 'failed' | 'unknown';
export type CloudResult = 'queued' | 'processing' | 'success' | 'failed' | 'unknown';

export interface PitchFile {
  num: number;                         // 1-based pitch number in the game
  time: string;                        // full timestamp, or clock "HH:MM:SS" / BMCC style "05-09-23.565"
  /** Unique pitch ID (e.g. the export's PitchUID). Links ACS packets and images to the pitch. */
  uid?: string;
  /** Hawk-Eye track confidence score, judged against thresholds.confidencePass. Omitted = no data. */
  confidence?: number;
  /** Binary strike-zone confidence from BMCC (1 = PASS, 0 = FAIL). When set, it decides PASS/FAIL instead of `confidence`. */
  confidenceOk?: boolean;
  trackLength?: number;
  trackQuality?: number;
  /** ACS delivery: success (packet with data, green), noswing (packet with no swing, grey), review (amber), fail (no packet, red). Omitted = no data. */
  acs?: AcsStatus;
  /** Older datasets: true = success, false = fail. Read only when `acs` is missing. */
  acsDelivered?: boolean;
  /** Batted ball. trackPct = how much of the hit was tracked; null/omitted = unknown. */
  hit?: { trackPct?: number | null; distanceFt?: number | null } | null;
  /**
   * Strike-zone Δ per tracking camera id (P1..P6, F1..F8): { x, z } in the plate's X and Z.
   * null = no data from that camera. Older datasets give a single number (the worse axis).
   * Omitted entirely = the source has no strike-zone data. A camera with no key isn't part of the strike zone.
   */
  strikeZone?: Record<string, SzDelta | number | null>;

  pp: {
    release: { status: PpResult; mph?: number };
    spin: { status: PpResult; rpm?: number; fitError?: number };
    trackpac: { status: TrackpacResult };
  };
  /** Omitted = the source has no cloud processing state (shown as "No data"). */
  cloud?: { trackpac: TrackpacCloud; bat: CloudResult; pitcherBiomech: CloudResult; batterBiomech: CloudResult };
  /** Per-camera images for this pitch, keyed by camera id. */
  images?: Record<string, Partial<Record<'mosaic' | 'hit', ImagePath>>>;
  spinStrip?: ImagePath;
  /** Release post-processing result image (release camera). */
  releaseImage?: ImagePath;
  /**
   * Play metadata (in production from MLB StatsAPI, shortly after the pitch). Not available while
   * tracking, so it's shown on the Pitches tab only, never on the live Game view.
   */
  play?: PlayInfo;
}

export interface PlayInfo {
  inning?: number; half?: string; outs?: number; balls?: number; strikes?: number; paOfInning?: number; pitchOfPa?: number;
  pitcher?: string; pitcherTeam?: string; pitcherThrows?: string; batter?: string; batterTeam?: string; batterSide?: string;
  pitchType?: string; relSpeed?: number; spinRate?: number; tilt?: string;
  inducedVertBreak?: number; horzBreak?: number; extension?: number; zoneSpeed?: number; plateHeight?: number; plateSide?: number;   // in, in, ft, mph, ft, ft
  call?: string; korbb?: string; result?: string; hitType?: string; outsOnPlay?: number; runsScored?: number;
  exitSpeed?: number; launchAngle?: number; direction?: number; distance?: number; hangTime?: number;                           // mph, °, °, ft, s
}

export interface StatusMessage {
  id?: string;
  at: string;                          // when it started: full timestamp or clock time
  clearedAt?: string;                  // when it stopped (still shown until acknowledged)
  level: 'CRITICAL ERROR' | 'ERROR' | 'Warning' | 'Info' | 'Debug' | string;
  source: string;                      // "BMCC", "BMCA1", "BMCA27", ...
  text: string;                        // the exact status-box text
  /** Demo only: hide this message until N seconds after load (simulates an alert arriving mid-session). */
  appearsAfterSec?: number;
}

/**
 * A session on the launch page, after loading. Sources (see loadSessions):
 *  - data/*sessions*.json (git-ignored, local): real GroundControl session records (MesaSession[])
 *  - public/data/sessions.json: the built-in placeholder list ({ sessions: SessionEntry[] })
 * `dataset` is what opens: a folder under public/data/, or "local.<folder>" for data/<folder>/.
 * `sample` = the session has no data of its own yet, so it opens the demo dataset as a stand-in.
 */
export interface SessionEntry {
  sessionId: string;                   // Hawk-Eye session ID (GroundControl)
  gamePk: number | null;               // MLB GamePK, if it's a game
  title: string;                       // e.g. "Away @ Home"
  venue: string;
  start: string;                       // full timestamp (UTC)
  gameMode: string;                    // placeholder: LIVE | PRACTICE | TEST; real: session type GAME | SIMULATION
  status: string;                      // placeholder: live | scheduled | final; real: opened | scheduled | closed
  league?: string;
  gameType?: string;                   // e.g. Regular Season, Spring Training
  dataset?: string;
  sample?: boolean;
  /** Created by the operator on the launch page (prototype: kept in this browser). */
  created?: boolean;
}
export interface SessionsFile { sessions: SessionEntry[] }

/** A real GroundControl session record (only the fields the app reads). */
export interface MesaSession {
  session: { id: string; mlbGamePk?: number; mlbGameType?: string; startTime: string; status: string; type: string; metadata?: { display_name?: string; alias?: string } };
  teams?: { home?: { name: string }; away?: { name: string } };
  venue?: { name?: string; surface?: { description?: string } };
  league?: { name?: string };
  competition?: { name?: string };
}

/** A pitch after loading: `atMs` is its absolute time and `time` is a display clock ("HH:MM:SS.mmm"). */
export interface Pitch extends PitchFile { atMs: number }
/** A status message after loading, with absolute times. */
export interface Status extends StatusMessage { id: string; atMs: number; clearedAtMs?: number }

export interface Dataset {
  name: string;
  base: string;                        // URL prefix for relative image paths
  game: GameFile;
  /** Absolute time of `game.now` (ms since epoch, UTC). */
  nowMs: number;
  cameras: CameraFile[];
  pitches: Pitch[];
  status: Status[];
  thresholds: Thresholds;
  /** True when this session has no data of its own and is showing the demo dataset. */
  sample?: boolean;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  targetFps: 600, confidencePass: 7, strikeZoneTolerance: 0.005, strikeZoneCritical: 0.008, strikeZoneBandAmber: 2, strikeZoneBandRed: 3, spinFitErrorReview: 0.25,
  tssOffsetMaxMs: 10, latencyMaxMs: 400, hitTrackGoodPct: 80, hitTrackPoorPct: 50,
};

/** Defaults from the BMCA screenshots (Camera / Installation / Operations tabs). */
export const DEFAULT_SETTINGS: CameraSettings = {
  autoExp: true, expTarget: 80, exposure: 252.37, maxExp: 1400,
  autoGain: false, aGain: 30, autoDGain: false, dGain: 0,
  lens: true, iris: 3.0, focus: 14028,
  lmr: true, size: 18, thresh: 14, scale: 1.0,
  strMin: 4, perMin: 25, perMax: 500, areaMin: 25, areaMax: 1500,
  nx: 0, ny: 0, rx: 0, ry: 0,
  awLines: true, awTpl: true, awScore: 0.5,
};
