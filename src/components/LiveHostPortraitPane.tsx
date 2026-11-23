import React, { useEffect, useRef, useState } from 'react';
import { BOT_MASTER_PROFILE, GuestGender } from '../data/characters';
import { CharacterMood } from '../scene/characters3d';
import { ZoomFocus } from '../scene/XiangqiStage';
import {
  BoardFocusSignal,
  HostEmotion,
  createInitialPortraitKinematics,
  stepPortraitKinematics,
} from '../scene/portraitKinematics';
import { PORTRAIT_CONFIGS, PortraitId, PortraitLive2DRig } from '../scene/PortraitLive2DRig';
import { EMOTION_LABELS_VI } from '../engine/matchmaker';
import { wuxiaAudio } from '../utils/wuxiaAudio';

export const PORTRAIT_ASSETS = {
  botCalm: PORTRAIT_CONFIGS.botCalm.src,
  botFierce: PORTRAIT_CONFIGS.botCalm.src,
  guestMale: PORTRAIT_CONFIGS.guestMale.src,
  guestFemale: PORTRAIT_CONFIGS.guestFemale.src,
} as const;

interface LiveHostPortraitPaneProps {
  zoomFocus: ZoomFocus;
  guestGender: GuestGender;
  guestName: string;
  guestTitle: string;
  mood: CharacterMood;
  emotion?: HostEmotion;
  emotionLabel?: string;
  isSpeaking: boolean;
  inCheck: boolean;
  botThinking?: boolean;
  boardFocus?: BoardFocusSignal | null;
  variant: 'widescreen' | 'tiktok';
  hideControls?: boolean;
  onSelectZoomFocus?: (focus: ZoomFocus) => void;
}

interface EmberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  maxLife: number;
  hue: 'gold' | 'crimson' | 'jade';
}

const EMOTION_BADGE_STYLE: Record<HostEmotion, { bg: string; border: string; text: string }> = {
  calm: {
    bg: 'rgba(16, 13, 20, 0.78)',
    border: 'rgba(212, 164, 78, 0.42)',
    text: '#f3d9a0',
  },
  amused: {
    bg: 'rgba(42, 20, 32, 0.84)',
    border: 'rgba(244, 178, 120, 0.58)',
    text: '#ffdcb4',
  },
  surprised: {
    bg: 'rgba(22, 34, 42, 0.84)',
    border: 'rgba(126, 224, 208, 0.56)',
    text: '#c7faf0',
  },
  thinking: {
    bg: 'rgba(18, 22, 34, 0.84)',
    border: 'rgba(148, 184, 232, 0.5)',
    text: '#d6e6ff',
  },
  fierce: {
    bg: 'rgba(62, 16, 18, 0.86)',
    border: 'rgba(242, 102, 74, 0.65)',
    text: '#ffd4c7',
  },
  check: {
    bg: 'rgba(98, 16, 18, 0.92)',
    border: 'rgba(255, 118, 86, 0.82)',
    text: '#ffe8df',
  },
  victory: {
    bg: 'rgba(56, 36, 12, 0.88)',
    border: 'rgba(246, 202, 102, 0.78)',
    text: '#fff0c4',
  },
};

/**
 * Broadcast-Studio Live2D WebGL Virtual Host Pane:
 * - Maintains ONE 100% consistent master character identity for Kỳ Ma Điêu Nguyệt
 *   (NEVER hard-swaps photos between calm/fierce!).
 * - Morphs eyebrows, smile, eye focus, lip-sync, board-tracking gaze, and 3-point
 *   studio lighting at 60fps inside a single unified critically-damped WebGL shader.
 * - Crossfades smoothly over 420ms ONLY when user explicitly switches Kỳ Ma <-> Khách.
 */
export const LiveHostPortraitPane: React.FC<LiveHostPortraitPaneProps> = ({
  zoomFocus,
  guestGender,
  guestName,
  guestTitle,
  mood,
  emotion,
  emotionLabel,
  isSpeaking,
  inCheck,
  botThinking = false,
  boardFocus = null,
  variant,
  hideControls = false,
  onSelectZoomFocus,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const auraRef = useRef<HTMLDivElement | null>(null);
  const emberCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eqBarsRef = useRef<Array<HTMLSpanElement | null>>([]);

  const [rigReady, setRigReady] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const isBot = zoomFocus === 'bot';
  const resolvedEmotion: HostEmotion = inCheck
    ? 'check'
    : emotion
      ? emotion
      : botThinking
        ? 'thinking'
        : mood === 'victory'
          ? 'victory'
          : mood === 'fierce' || mood === 'check'
            ? 'fierce'
            : 'calm';

  const isDramatic =
    resolvedEmotion === 'check' || resolvedEmotion === 'fierce' || inCheck;

  // ALWAYS lock Kỳ Ma Điêu Nguyệt to ONE consistent master identity (`botCalm`)!
  let portraitId: PortraitId = 'botCalm';
  let imgPositionClass =
    variant === 'tiktok' ? 'object-[50%_2%] scale-100' : 'object-[50%_10%] scale-[1.03]';

  if (!isBot) {
    if (guestGender === 'nu') {
      portraitId = 'guestFemale';
      imgPositionClass = 'object-[50%_10%] scale-[1.24]';
    } else {
      portraitId = 'guestMale';
      imgPositionClass = 'object-[50%_15%] scale-[1.06]';
    }
  }

  const activeSrc = PORTRAIT_CONFIGS[portraitId].src;

  const livePropsRef = useRef({
    portraitId,
    variant,
    isSpeaking,
    botThinking,
    inCheck,
    isDramatic,
    emotion: resolvedEmotion,
    boardFocus,
  });
  livePropsRef.current = {
    portraitId,
    variant,
    isSpeaking,
    botThinking,
    inCheck,
    isDramatic,
    emotion: resolvedEmotion,
    boardFocus,
  };

  useEffect(() => {
    setImgBroken(false);
  }, [activeSrc]);

  // Unified 60fps WebGL Studio Rig + Critically-Damped Kinematics + Real Audio Waveform Loop
  useEffect(() => {
    const canvas = rigCanvasRef.current;
    if (!canvas) return;

    const rig = new PortraitLive2DRig(canvas);
    let disposed = false;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      rig.resize(rect.width || 420, rect.height || 640);
    };
    handleResize();

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);

    let kinematics = createInitialPortraitKinematics();
    let rafId = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastAttrUpdate = 0;
    let markedReady = false;

    const tick = (now: number) => {
      if (disposed) return;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      const p = livePropsRef.current;
      const voiceLevel = p.isSpeaking ? wuxiaAudio.getVoiceLevel() : 0;

      kinematics = stepPortraitKinematics(kinematics, {
        dt,
        elapsed,
        isSpeaking: p.isSpeaking,
        voiceLevel,
        botThinking: p.botThinking,
        inCheck: p.inCheck,
        isFierce: p.isDramatic,
        emotion: p.emotion,
        boardFocus: p.boardFocus,
      });

      if (rig.supported) {
        const rendered = rig.render(p.portraitId, p.variant, elapsed, dt, kinematics);
        if (rendered && !markedReady) {
          markedReady = true;
          setRigReady(true);
        }
      }

      // Smoothly pulse inner studio key-light frame with voice energy & battle drama
      if (auraRef.current) {
        const auraOpacity = Math.min(
          1,
          0.38 + kinematics.voiceEnergy * 0.48 + kinematics.dramaLight * 0.34 + kinematics.impactPulse * 0.3,
        );
        auraRef.current.style.opacity = auraOpacity.toFixed(2);
      }

      // Live 5-bar real Web Audio vocal meter (zero React re-renders!)
      const bars = eqBarsRef.current;
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i];
        if (!bar) continue;
        const harmonic = 0.55 + 0.45 * Math.sin(elapsed * (9.5 + i * 2.3) + i * 1.1);
        const h = p.isSpeaking
          ? Math.max(18, Math.min(100, (0.2 + kinematics.voiceEnergy * 0.85 * harmonic) * 100))
          : 16;
        bar.style.height = `${h.toFixed(0)}%`;
      }

      // Throttled DOM telemetry attributes (~10Hz)
      if (rootRef.current && now - lastAttrUpdate > 90) {
        lastAttrUpdate = now;
        rootRef.current.dataset.headYaw = kinematics.headYaw.toFixed(3);
        rootRef.current.dataset.headPitch = kinematics.headPitch.toFixed(3);
        rootRef.current.dataset.mouthOpen = kinematics.mouthOpen.toFixed(3);
        rootRef.current.dataset.smile = kinematics.smile.toFixed(3);
        rootRef.current.dataset.browFurrow = kinematics.browFurrow.toFixed(3);
        rootRef.current.dataset.emotion = p.emotion;
        rootRef.current.dataset.portraitId = p.portraitId;
        rootRef.current.dataset.speaking = p.isSpeaking ? '1' : '0';
        rootRef.current.dataset.trackingSquare = p.boardFocus
          ? `${p.boardFocus.col},${p.boardFocus.row}`
          : '';
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      rig.dispose();
    };
  }, []);

  // Subtle ambient golden-crimson studio bokeh embers
  useEffect(() => {
    const canvas = emberCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(120, Math.floor(rect.width));
      height = Math.max(120, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const count = variant === 'tiktok' ? 18 : 26;
    const spawn = (randomY: boolean): EmberParticle => {
      const rPick = Math.random();
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : height + 10 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 11,
        vy: -(14 + Math.random() * 24),
        r: 1.1 + Math.random() * 2.1,
        alpha: 0.28 + Math.random() * 0.44,
        life: randomY ? Math.random() * 4 : 0,
        maxLife: 3.8 + Math.random() * 3.8,
        hue: rPick < 0.68 ? 'gold' : rPick < 0.92 ? 'crimson' : 'jade',
      };
    };

    const particles: EmberParticle[] = Array.from({ length: count }, () => spawn(true));
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      ctx.clearRect(0, 0, width, height);

      const p = livePropsRef.current;
      const speedBoost = p.isDramatic ? 1.45 : p.isSpeaking ? 1.18 : 1.0;

      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.life += dt;
        pt.x += (pt.vx + Math.sin(now * 0.0012 + i) * 8) * dt * speedBoost;
        pt.y += pt.vy * dt * speedBoost;

        if (pt.life >= pt.maxLife || pt.y < -12) {
          particles[i] = spawn(false);
          continue;
        }

        const fade = Math.sin((pt.life / pt.maxLife) * Math.PI);
        const a = pt.alpha * fade;
        const fill =
          pt.hue === 'gold'
            ? `rgba(255, 214, 130, ${a.toFixed(3)})`
            : pt.hue === 'crimson'
              ? `rgba(255, 102, 74, ${a.toFixed(3)})`
              : `rgba(116, 224, 206, ${a.toFixed(3)})`;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [variant]);

  const activeEmotionLabel = emotionLabel || EMOTION_LABELS_VI[resolvedEmotion];
  const badgeStyle = EMOTION_BADGE_STYLE[resolvedEmotion] ?? EMOTION_BADGE_STYLE.calm;

  const statusSubtitle = isBot
    ? botThinking
      ? 'Đang suy ngẫm nước đối đáp...'
      : isSpeaking
        ? `Đang trò chuyện · ${activeEmotionLabel}`
        : boardFocus?.notation
          ? `Quan sát thế cờ · ${activeEmotionLabel}`
          : BOT_MASTER_PROFILE.title
    : guestTitle;

  return (
    <div
      ref={rootRef}
      data-testid="live-host-portrait"
      data-head-yaw="0.000"
      data-head-pitch="0.000"
      data-mouth-open="0.000"
      data-smile="0.140"
      data-brow-furrow="0.000"
      data-emotion={resolvedEmotion}
      data-portrait-id={portraitId}
      data-speaking={isSpeaking ? '1' : '0'}
      data-tracking-square={boardFocus ? `${boardFocus.col},${boardFocus.row}` : ''}
      className="relative w-full h-full overflow-hidden bg-[#120b0f]"
    >
      {/* Fallback Image (only visible for ~100ms before WebGL texture uploads) */}
      {!imgBroken ? (
        <img
          src={activeSrc}
          alt={
            isBot
              ? 'Kỳ Ma Điêu Nguyệt — Tân Nương Áo Đỏ Đêm Hoa Chúc'
              : `${guestName} — ${guestTitle}`
          }
          onError={() => setImgBroken(true)}
          className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity duration-300 ${imgPositionClass} ${
            rigReady ? 'opacity-0' : 'opacity-100'
          }`}
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-6 text-center"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, #4a151c 0%, #1d0e15 58%, #0e090d 100%)',
          }}
        >
          <div className="font-display text-2xl font-bold text-[#f4d48e]">
            {isBot ? BOT_MASTER_PROFILE.name : guestName}
          </div>
          <div className="text-xs text-[#cbb89a] mt-1">
            {isBot ? BOT_MASTER_PROFILE.title : guestTitle}
          </div>
        </div>
      )}

      {/* Unified 60fps Studio WebGL Live2D Canvas (zero competing CSS transforms!) */}
      <canvas
        ref={rigCanvasRef}
        aria-label={
          isBot
            ? 'Kỳ Ma Điêu Nguyệt — Nhân vật ảo Studio 3D chuyển động đồng bộ giọng nói và bàn cờ'
            : `${guestName} — Nhân vật khách mời 3D`
        }
        className={`absolute inset-0 w-full h-full block transition-opacity duration-300 ${
          rigReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Refined Studio Cinematic Vignette (keeps face & Phoenix Crown 100% luminous) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: isDramatic
            ? 'radial-gradient(circle at 50% 36%, rgba(255,100,70,0) 44%, rgba(68,12,16,0.48) 100%), linear-gradient(180deg, rgba(12,8,12,0.34) 0%, rgba(12,8,12,0) 18%, rgba(12,8,12,0) 72%, rgba(11,8,12,0.84) 100%)'
            : 'radial-gradient(circle at 50% 36%, rgba(255,205,130,0) 48%, rgba(12,8,13,0.42) 100%), linear-gradient(180deg, rgba(12,8,12,0.32) 0%, rgba(12,8,12,0) 18%, rgba(12,8,12,0) 74%, rgba(11,8,12,0.82) 100%)',
        }}
      />

      {/* Studio Rim Aura Pulse */}
      <div
        ref={auraRef}
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none transition-shadow duration-500"
        style={{
          opacity: 0.4,
          boxShadow: isDramatic
            ? 'inset 0 0 42px rgba(242, 78, 56, 0.52)'
            : isSpeaking
              ? 'inset 0 0 36px rgba(235, 190, 102, 0.48)'
              : 'inset 0 0 20px rgba(212, 164, 78, 0.18)',
        }}
      />

      {/* Subtle Ambient Floating Embers */}
      <canvas
        ref={emberCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* TikTok 9:16 Compact Studio Emotion Chip (bottom-left above seam, clear of face & crown) */}
      {variant === 'tiktok' && isBot && (
        <div
          className="absolute bottom-3 left-2.5 z-10 px-2 py-0.5 rounded border text-[10px] font-medium flex items-center gap-1.5 pointer-events-none transition-colors duration-300"
          style={{
            backgroundColor: badgeStyle.bg,
            borderColor: badgeStyle.border,
            color: badgeStyle.text,
          }}
        >
          {isSpeaking && (
            <div className="flex items-end gap-[2px] h-2.5 shrink-0" aria-hidden="true">
              {[0, 1, 2, 3].map((idx) => (
                <span
                  key={idx}
                  ref={(el) => {
                    eqBarsRef.current[idx] = el;
                  }}
                  className="w-[2px] rounded-full bg-[#f4c96b]"
                  style={{ height: '25%' }}
                />
              ))}
            </div>
          )}
          <span>{botThinking ? 'Đang suy tính...' : activeEmotionLabel}</span>
        </div>
      )}

      {/* Widescreen Mode: Clean Broadcast Studio Top Nameplate & Bot/Guest Switcher */}
      {variant === 'widescreen' && !hideControls && (
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <div
            className="px-3 py-1.5 rounded border border-[#d4a44e]/35 flex items-center gap-2.5 min-w-0"
            style={{ backgroundColor: 'rgba(13, 10, 15, 0.84)' }}
          >
            {/* Real-time 5-bar Studio Audio RMS Equalizer */}
            <div className="flex items-end gap-[2px] h-3.5 shrink-0" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((idx) => (
                <span
                  key={idx}
                  ref={(el) => {
                    eqBarsRef.current[idx] = el;
                  }}
                  className={`w-[2px] rounded-full transition-colors duration-200 ${
                    isSpeaking
                      ? idx % 2 === 1
                        ? 'bg-[#ff9473]'
                        : 'bg-[#f4c96b]'
                      : 'bg-[#806d54]/60'
                  }`}
                  style={{ height: '18%' }}
                />
              ))}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#f7e1b2] truncate">
                  {isBot ? BOT_MASTER_PROFILE.name : guestName}
                </span>
                {isBot && (
                  <span
                    className="px-1.5 py-[1px] rounded text-[9px] font-medium border shrink-0 transition-colors duration-300"
                    style={{
                      backgroundColor: badgeStyle.bg,
                      borderColor: badgeStyle.border,
                      color: badgeStyle.text,
                    }}
                  >
                    {activeEmotionLabel}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[#cbb796] truncate">{statusSubtitle}</div>
            </div>
          </div>

          {onSelectZoomFocus && (
            <div
              className="pointer-events-auto flex items-center gap-0.5 p-0.5 rounded border border-[#d4a44e]/35 shrink-0"
              style={{ backgroundColor: 'rgba(13, 10, 15, 0.86)' }}
            >
              <button
                type="button"
                onClick={() => onSelectZoomFocus('bot')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                  isBot
                    ? 'bg-[#8f261f] text-[#fdf4e3]'
                    : 'text-[#b7a892] hover:text-[#f5e7cb]'
                }`}
              >
                Kỳ Ma
              </button>
              <button
                type="button"
                onClick={() => onSelectZoomFocus('guest')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                  !isBot
                    ? 'bg-[#8f261f] text-[#fdf4e3]'
                    : 'text-[#b7a892] hover:text-[#f5e7cb]'
                }`}
              >
                Khách
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
