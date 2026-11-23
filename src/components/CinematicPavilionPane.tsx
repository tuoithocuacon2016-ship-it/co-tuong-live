import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Coffee, Megaphone, Sparkles } from 'lucide-react';
import { BoardState } from '../engine/xiangqi';
import { WuxiaCharacterProfile } from '../data/characters';
import { CharacterMood } from '../scene/characters3d';
import { ZoomFocus } from '../scene/XiangqiStage';
import { BoardFocusSignal, HostEmotion } from '../scene/portraitKinematics';
import {
  ACTION_LABELS_VI,
  ActionCuePayload,
  CINEMA_SHOT_LABELS_VI,
  CharacterActionType,
  CinemaCameraAngle,
  CinemaVisualPlate,
  MoveChoreoPayload,
  createInitialCinemaDirector,
  resolveCinemaVisualPlate,
  stepCinemaDirector,
} from '../scene/cinemaDirector';
import { LiveHostPortraitPane } from './LiveHostPortraitPane';
import { wuxiaAudio } from '../utils/wuxiaAudio';

import wideMoonlitImg from '../assets/images/pavilion_wide_moonlit_1795427810070.jpg';
import brideTeaImg from '../assets/images/pavilion_bride_tea_1795427810130.jpg';
import brideTeaseImg from '../assets/images/pavilion_bride_tease_1795427811778.jpg';
import movePieceImg from '../assets/images/pavilion_move_piece_1795427808626.jpg';
import groomReactionImg from '../assets/images/pavilion_groom_reaction_1795427810131.jpg';

interface CinematicPavilionPaneProps {
  board: BoardState;
  guestProfile: WuxiaCharacterProfile;
  guestName: string;
  zoomFocus: ZoomFocus;
  mood: CharacterMood;
  emotion?: HostEmotion;
  emotionLabel?: string;
  isSpeaking: boolean;
  inCheck: boolean;
  botThinking?: boolean;
  boardFocus?: BoardFocusSignal | null;
  moveEvent: MoveChoreoPayload | null;
  actionCue: ActionCuePayload | null;
  cinemaAngle: CinemaCameraAngle;
  onSelectCinemaAngle: (angle: CinemaCameraAngle) => void;
  onTriggerActionCue: (
    type: 'sip_tea' | 'tease' | 'think_fan' | 'audience_call',
    actor?: 'bride' | 'groom',
  ) => void;
  onSelectZoomFocus?: (focus: ZoomFocus) => void;
  variant: 'widescreen' | 'tiktok';
  hideControls?: boolean;
}

const ANGLE_OPTIONS: Array<{ id: CinemaCameraAngle; label: string }> = [
  { id: 'auto', label: 'Đạo Diễn' },
  { id: 'wide_pavilion', label: 'Hồ Sen' },
  { id: 'medium_bride', label: 'Uống Trà' },
  { id: 'over_shoulder', label: 'Chọc Ghẹo' },
  { id: 'table_hands', label: 'Nhấc Quân' },
  { id: 'dramatic_orbit', label: 'Tân Lang' },
  { id: 'closeup_cgi', label: 'Cận Mặt' },
];

type StaticPlateKey = Exclude<CinemaVisualPlate, 'closeup_cgi'>;

interface PlateSpec {
  id: StaticPlateKey;
  src: string;
  alt: string;
  objectPos: string;
  baseScale: number;
  zoomAmp: number;
  panX: number;
  panY: number;
  hasSteam: boolean;
  hasGoldAura: boolean;
}

const CGI_PLATES: PlateSpec[] = [
  {
    id: 'wide_pavilion',
    src: wideMoonlitImg,
    alt: 'Chòi cổ giữa hồ sen dưới ánh trăng tròn với Tân Nương áo đỏ và Tân Lang đánh cờ tướng',
    objectPos: '50% 42%',
    baseScale: 1.045,
    zoomAmp: 0.032,
    panX: 1.1,
    panY: 0.55,
    hasSteam: true,
    hasGoldAura: false,
  },
  {
    id: 'medium_bride',
    src: brideTeaImg,
    alt: 'Kỳ Ma Điêu Nguyệt mặc hỷ phục đỏ thưởng trà hoa sen trong chòi cổ ánh trăng',
    objectPos: '50% 22%',
    baseScale: 1.04,
    zoomAmp: 0.028,
    panX: 0.75,
    panY: 0.5,
    hasSteam: true,
    hasGoldAura: false,
  },
  {
    id: 'over_shoulder',
    src: brideTeaseImg,
    alt: 'Góc quay qua vai Tân Lang nhìn Kỳ Ma Điêu Nguyệt che quạt lụa đỏ mỉm cười chọc ghẹo',
    objectPos: '52% 24%',
    baseScale: 1.05,
    zoomAmp: 0.03,
    panX: 0.95,
    panY: 0.45,
    hasSteam: false,
    hasGoldAura: false,
  },
  {
    id: 'table_hands',
    src: movePieceImg,
    alt: 'Cận cảnh bàn tay thon trong tay áo hỷ phục thêu vàng nhấc quân cờ tướng phát ánh kim',
    objectPos: '46% 45%',
    baseScale: 1.06,
    zoomAmp: 0.04,
    panX: 0.85,
    panY: 0.65,
    hasSteam: true,
    hasGoldAura: true,
  },
  {
    id: 'dramatic_orbit',
    src: groomReactionImg,
    alt: 'Tân Lang áo trắng thêu vàng ngồi bên bàn cờ tướng mỉm cười suy tư dưới ánh trăng hồ sen',
    objectPos: '60% 24%',
    baseScale: 1.045,
    zoomAmp: 0.028,
    panX: 0.85,
    panY: 0.45,
    hasSteam: true,
    hasGoldAura: false,
  },
];

interface FireflyParticle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  kind: 'firefly' | 'petal' | 'steam';
}

interface CinemaHudState {
  visualPlate: CinemaVisualPlate;
  shotLabelVi: string;
  actionLabelVi: string;
  brideAction: CharacterActionType;
  groomAction: CharacterActionType;
}

export const CinematicPavilionPane: React.FC<CinematicPavilionPaneProps> = ({
  guestProfile,
  guestName,
  zoomFocus,
  mood,
  emotion = 'amused',
  emotionLabel,
  isSpeaking,
  inCheck,
  botThinking = false,
  boardFocus = null,
  moveEvent,
  actionCue,
  cinemaAngle,
  onSelectCinemaAngle,
  onTriggerActionCue,
  onSelectZoomFocus,
  variant,
  hideControls = false,
}) => {
  const directorRef = useRef(createInitialCinemaDirector());
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const plateImgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const eqBarsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const latestPropsRef = useRef({
    cinemaAngle,
    emotion,
    isSpeaking,
    botThinking,
    inCheck,
    moveEvent,
    actionCue,
  });

  latestPropsRef.current = {
    cinemaAngle,
    emotion,
    isSpeaking,
    botThinking,
    inCheck,
    moveEvent,
    actionCue,
  };

  const [hud, setHud] = useState<CinemaHudState>({
    visualPlate: cinemaAngle === 'auto' ? 'wide_pavilion' : cinemaAngle,
    shotLabelVi:
      CINEMA_SHOT_LABELS_VI[cinemaAngle === 'auto' ? 'wide_pavilion' : cinemaAngle],
    actionLabelVi: ACTION_LABELS_VI.idle,
    brideAction: 'idle',
    groomAction: 'idle',
  });
  const hudRef = useRef(hud);
  hudRef.current = hud;

  // Deterministic seed for floating moonlit fireflies, lotus petals & tea-steam wisps
  const particles = useMemo<FireflyParticle[]>(() => {
    const list: FireflyParticle[] = [];
    for (let i = 0; i < 24; i++) {
      list.push({
        x: ((i * 37 + 13) % 100) / 100,
        y: ((i * 53 + 7) % 100) / 100,
        r: 1.4 + (i % 4) * 0.75,
        vx: ((i % 2 === 0 ? 1 : -1) * (0.008 + (i % 5) * 0.003)),
        vy: -(0.012 + (i % 6) * 0.004),
        phase: i * 0.7,
        kind: 'firefly',
      });
    }
    for (let i = 0; i < 9; i++) {
      list.push({
        x: ((i * 41 + 19) % 100) / 100,
        y: ((i * 29 + 5) % 100) / 100,
        r: 3.2 + (i % 3) * 1.3,
        vx: 0.018 + (i % 3) * 0.006,
        vy: 0.022 + (i % 4) * 0.005,
        phase: i * 1.15,
        kind: 'petal',
      });
    }
    for (let i = 0; i < 8; i++) {
      list.push({
        x: 0.42 + ((i * 17) % 24) / 100,
        y: 0.52 + ((i * 19) % 26) / 100,
        r: 18 + (i % 4) * 8,
        vx: (i % 2 === 0 ? 1 : -1) * 0.007,
        vy: -(0.032 + (i % 3) * 0.008),
        phase: i * 0.9,
        kind: 'steam',
      });
    }
    return list;
  }, []);

  // Main 60fps Cinema Director Loop: drives smooth Ken Burns motion, atmospheric FX canvas, EQ bars, and shot cuts
  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    const weights = [0.55, 0.9, 1.0, 0.82, 0.5];

    const resizeCanvas = () => {
      const canvas = fxCanvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (fxCanvasRef.current?.parentElement) {
      ro.observe(fxCanvasRef.current.parentElement);
    }

    const tick = (now: number) => {
      const dt = Math.min(0.06, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const props = latestPropsRef.current;

      const step = stepCinemaDirector(directorRef.current, {
        dt,
        requestedAngle: props.cinemaAngle,
        emotion: props.emotion,
        isSpeaking: props.isSpeaking,
        botThinking: props.botThinking,
        inCheck: props.inCheck,
        moveEvent: props.moveEvent,
        actionCue: props.actionCue,
      });

      const nextPlate = resolveCinemaVisualPlate({
        requestedAngle: props.cinemaAngle,
        directorShot: step.camera.shot,
        brideAction: step.bridePose.action,
        groomAction: step.groomPose.action,
        isSpeaking: props.isSpeaking,
      });

      const nextShotLabel = CINEMA_SHOT_LABELS_VI[nextPlate];
      const nextActionLabel =
        nextPlate === 'closeup_cgi' &&
        props.isSpeaking &&
        step.camera.actionLabelVi === ACTION_LABELS_VI.idle
          ? 'Đang đối đáp trực tiếp'
          : step.camera.actionLabelVi;

      const prevHud = hudRef.current;
      if (
        prevHud.visualPlate !== nextPlate ||
        prevHud.actionLabelVi !== nextActionLabel ||
        prevHud.brideAction !== step.bridePose.action ||
        prevHud.groomAction !== step.groomPose.action
      ) {
        setHud({
          visualPlate: nextPlate,
          shotLabelVi: nextShotLabel,
          actionLabelVi: nextActionLabel,
          brideAction: step.bridePose.action,
          groomAction: step.groomPose.action,
        });
      }

      // Smooth GPU-composited Ken Burns camera motion on the active 8K CGI plate
      const t = directorRef.current.elapsed;
      for (const spec of CGI_PLATES) {
        const img = plateImgRefs.current[spec.id];
        if (!img) continue;
        if (spec.id === nextPlate) {
          const zoom =
            spec.baseScale +
            Math.sin(t * 0.42 + spec.baseScale * 3) * spec.zoomAmp * 0.5 +
            spec.zoomAmp * 0.5;
          const tx = Math.sin(t * 0.28) * spec.panX;
          const ty = Math.cos(t * 0.34) * spec.panY;
          const breatheRoll = Math.sin(t * 0.5) * 0.22;
          img.style.transform = `translate3d(${tx.toFixed(2)}%, ${ty.toFixed(2)}%, 0) scale(${zoom.toFixed(4)}) rotate(${breatheRoll.toFixed(2)}deg)`;
        }
      }

      // Live 5-bar voice level meter synced to wuxiaAudio.getVoiceLevel()
      const level = props.isSpeaking ? wuxiaAudio.getVoiceLevel() : 0;
      for (let i = 0; i < 5; i++) {
        const bar = eqBarsRef.current[i];
        if (bar) {
          const h =
            props.isSpeaking && level > 0.02
              ? Math.max(3, Math.min(13, Math.round(3 + level * 10 * weights[i])))
              : 2;
          bar.style.height = `${h}px`;
        }
      }

      // Atmospheric 2D Canvas FX over CGI plates (fireflies, pink lotus petals, tea steam & gold qi)
      const canvas = fxCanvasRef.current;
      if (canvas && nextPlate !== 'closeup_cgi') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const activeSpec = CGI_PLATES.find((p) => p.id === nextPlate) ?? CGI_PLATES[0];

          // Subtle warm bridal lantern breathing shimmer at top corners
          const lanternPulse = 0.08 + 0.035 * Math.sin(t * 3.1) + (props.inCheck ? 0.08 : 0);
          const warmGrad = ctx.createRadialGradient(
            w * 0.16,
            h * 0.18,
            w * 0.02,
            w * 0.16,
            h * 0.18,
            w * 0.42,
          );
          warmGrad.addColorStop(
            0,
            props.inCheck
              ? `rgba(255, 76, 56, ${lanternPulse.toFixed(3)})`
              : `rgba(255, 168, 76, ${lanternPulse.toFixed(3)})`,
          );
          warmGrad.addColorStop(1, 'rgba(255, 140, 60, 0)');
          ctx.fillStyle = warmGrad;
          ctx.fillRect(0, 0, w, h);

          // Render particles
          for (const p of particles) {
            if (p.kind === 'steam' && !activeSpec.hasSteam) continue;

            p.x += (p.vx + Math.sin(t * 1.1 + p.phase) * 0.004) * dt;
            p.y += p.vy * dt;

            if (p.y < -0.08) {
              p.y = p.kind === 'steam' ? 0.72 : 1.06;
              p.x =
                p.kind === 'steam'
                  ? 0.44 + ((p.phase * 0.19) % 0.16)
                  : ((p.x + 0.37) % 1 + 1) % 1;
            }
            if (p.y > 1.08) {
              p.y = -0.05;
              p.x = ((p.x + 0.23) % 1 + 1) % 1;
            }
            if (p.x < -0.05) p.x = 1.05;
            if (p.x > 1.05) p.x = -0.05;

            const px = p.x * w;
            const py = p.y * h;

            if (p.kind === 'firefly') {
              const twinkle = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(t * 2.6 + p.phase));
              const rad = p.r * (activeSpec.hasGoldAura ? 1.5 : 1.15) * (w / 620);
              const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 3.8);
              g.addColorStop(0, `rgba(255, 232, 166, ${(twinkle * 0.92).toFixed(3)})`);
              g.addColorStop(0.45, `rgba(246, 184, 88, ${(twinkle * 0.42).toFixed(3)})`);
              g.addColorStop(1, 'rgba(246, 184, 88, 0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(px, py, rad * 3.8, 0, Math.PI * 2);
              ctx.fill();
            } else if (p.kind === 'petal') {
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(t * 0.8 + p.phase);
              const pr = p.r * (w / 640);
              ctx.fillStyle = 'rgba(255, 192, 208, 0.42)';
              ctx.beginPath();
              ctx.ellipse(0, 0, pr * 1.4, pr * 0.7, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            } else if (p.kind === 'steam') {
              const lifeFade = Math.max(0, Math.min(1, (p.y - 0.15) * 1.6)) * 0.12;
              const sr = p.r * (w / 560);
              const sg = ctx.createRadialGradient(px, py, 0, px, py, sr);
              sg.addColorStop(0, `rgba(232, 236, 244, ${lifeFade.toFixed(3)})`);
              sg.addColorStop(1, 'rgba(232, 236, 244, 0)');
              ctx.fillStyle = sg;
              ctx.beginPath();
              ctx.arc(px, py, sr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [particles]);

  const isLive2dCloseup = hud.visualPlate === 'closeup_cgi';

  return (
    <div
      data-testid="cinematic-pavilion-pane"
      data-cinema-mode={isLive2dCloseup ? 'closeup_cgi' : 'pavilion_cgi'}
      data-cinema-shot={hud.visualPlate}
      data-bride-action={hud.brideAction}
      data-groom-action={hud.groomAction}
      data-speaking={isSpeaking ? '1' : '0'}
      className="relative w-full h-full overflow-hidden bg-[#0c0d18]"
    >
      {/* 1. Five Identity-Locked 8K AAA CGI Moonlit Lotus-Lake Pavilion Film Plates (Silky 550ms Cinema Dissolve) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {CGI_PLATES.map((plate) => {
          const isActive = hud.visualPlate === plate.id;
          return (
            <img
              key={plate.id}
              ref={(el) => {
                plateImgRefs.current[plate.id] = el;
              }}
              src={plate.src}
              alt={plate.alt}
              draggable={false}
              className={`absolute inset-0 w-full h-full object-cover will-change-transform transition-opacity duration-500 ease-out ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                objectPosition: plate.objectPos,
                transform: `scale(${plate.baseScale})`,
              }}
            />
          );
        })}

        {/* 2. Live 60fps Atmospheric Moonlit Fireflies, Lotus Petals & Rising Tea-Steam Canvas */}
        <canvas
          ref={fxCanvasRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 w-full h-full transition-opacity duration-500 ${
            isLive2dCloseup ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>

      {/* 3. Seamless Cut to Beloved 8K Live2D GLSL Lip-Sync Close-Up when Speaking or on 'Cận Mặt' */}
      {isLive2dCloseup && (
        <div className="absolute inset-0 z-10 w-full h-full">
          <LiveHostPortraitPane
            zoomFocus={zoomFocus}
            guestGender={guestProfile.gender}
            guestName={guestName}
            guestTitle={guestProfile.title}
            mood={mood}
            emotion={emotion}
            emotionLabel={emotionLabel}
            isSpeaking={isSpeaking}
            inCheck={inCheck}
            botThinking={botThinking}
            boardFocus={boardFocus}
            variant={variant}
            hideControls
            onSelectZoomFocus={onSelectZoomFocus}
          />
        </div>
      )}

      {/* 4. Subtle Cinema Edge Vignette (preserves 100% crispness of faces & crown) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,10,18,0.42) 0%, rgba(8,10,18,0) 22%, rgba(8,10,18,0) 76%, rgba(8,10,18,0.62) 100%)',
        }}
      />

      {/* 5. TikTok 9:16 Mode: Minimal Bottom-Left Shot/Action Telemetry Chip (clears 42% seam bar!) */}
      {variant === 'tiktok' && (
        <div
          className="pointer-events-none absolute bottom-7 left-2.5 z-20 flex items-center gap-2 px-2 py-1 rounded border border-[#d4a44e]/35"
          style={{ backgroundColor: 'rgba(12, 13, 22, 0.82)' }}
        >
          <div className="flex items-end gap-[2px] h-3.5 w-4 shrink-0" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((idx) => (
              <span
                key={idx}
                ref={(el) => {
                  eqBarsRef.current[idx] = el;
                }}
                className="w-[2px] rounded-full transition-[height] duration-75"
                style={{
                  height: '2px',
                  backgroundColor: isSpeaking ? '#f3c674' : '#5f554b',
                }}
              />
            ))}
          </div>
          <div className="leading-tight">
            <div className="text-[10px] font-semibold text-[#f5dfb2] flex items-center gap-1.5">
              <span>{hud.shotLabelVi}</span>
              {inCheck && (
                <span className="px-1 py-0.2 rounded bg-[#a92620] text-[#fff1dc] text-[8px] uppercase tracking-wider">
                  Chiếu!
                </span>
              )}
            </div>
            <div className="text-[9px] text-[#c7baa6]">{hud.actionLabelVi}</div>
          </div>
        </div>
      )}

      {/* 6. Widescreen Mode: Minimal Top Corner Header + Lower Camera Ribbon (Keeps Phoenix Crown, Face & Full Moon 100% Clear!) */}
      {variant === 'widescreen' && (
        <>
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
            {/* Shot & Live Audio Telemetry Badge */}
            <div
              className="pointer-events-none flex items-center gap-2 px-2.5 py-1 rounded border border-[#d4a44e]/35 min-w-0"
              style={{ backgroundColor: 'rgba(12, 13, 22, 0.84)' }}
            >
              <div className="flex items-end gap-[2px] h-3.5 w-4 shrink-0" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <span
                    key={idx}
                    ref={(el) => {
                      eqBarsRef.current[idx] = el;
                    }}
                    className="w-[2px] rounded-full transition-[height] duration-75"
                    style={{
                      height: '2px',
                      backgroundColor: isSpeaking ? '#f3c674' : '#5f554b',
                    }}
                  />
                ))}
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-[11px] font-semibold text-[#f5dfb2] flex items-center gap-1.5 truncate">
                  <span className="truncate">{hud.shotLabelVi}</span>
                  {inCheck && (
                    <span className="px-1.5 py-0.2 rounded bg-[#a92620] text-[#fff1dc] text-[9px] uppercase tracking-wider shrink-0">
                      Chiếu!
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#c7baa6] truncate">{hud.actionLabelVi}</div>
              </div>
            </div>

            {/* Interactive Movie Gestures & Live Host Callout */}
            {!hideControls && (
              <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-cinema-cue="sip_tea"
                  onClick={() => onTriggerActionCue('sip_tea', 'bride')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#1a2c2b]/92 hover:bg-[#243d3b] text-[#c2f0e6] border border-[#72c4b4]/40 text-[11px] font-medium cursor-pointer transition-colors"
                >
                  <Coffee className="w-3.5 h-3.5" />
                  <span>Uống Trà</span>
                </button>
                <button
                  type="button"
                  data-cinema-cue="tease"
                  onClick={() => onTriggerActionCue('tease', 'bride')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#421825]/92 hover:bg-[#592032] text-[#ffd6da] border border-[#e88a96]/45 text-[11px] font-medium cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Chọc Ghẹo</span>
                </button>
                <button
                  type="button"
                  data-cinema-cue="audience_call"
                  onClick={() => onTriggerActionCue('audience_call', 'bride')}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#3b2514]/92 hover:bg-[#52331b] text-[#fde4b4] border border-[#e5b864]/45 text-[11px] font-medium cursor-pointer transition-colors"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Gọi Kèo</span>
                </button>
              </div>
            )}
          </div>

          {/* Multi-Camera Director Angles Ribbon (positioned cleanly above CommentaryBanner) */}
          {!hideControls && (
            <div className="absolute bottom-[92px] left-3 right-3 z-20 flex justify-start pointer-events-none">
              <div
                className="pointer-events-auto flex flex-wrap items-center gap-1 px-2 py-1 rounded border border-[#d4a44e]/35"
                style={{ backgroundColor: 'rgba(13, 12, 20, 0.86)' }}
              >
                <Camera className="w-3 h-3 text-[#d9b673] mr-0.5 shrink-0" />
                {ANGLE_OPTIONS.map((opt) => {
                  const active = cinemaAngle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-cinema-angle={opt.id}
                      onClick={() => onSelectCinemaAngle(opt.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#a92620] text-[#fff5e4] border border-[#e5b864]/55'
                          : 'bg-[#1c1824] text-[#cfc0a8] hover:text-[#fff2d6] border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
