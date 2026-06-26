// Fond d'écran — 5 styles dispo, switcher en haut à droite, choix mémorisé dans localStorage.
import { useState } from 'react';

function generateDotShadows(count, colorFn, spread = 0, minOpacity = 0.25, opacityRange = 0.7) {
  const shadows = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 100).toFixed(2);
    const o = (Math.random() * opacityRange + minOpacity).toFixed(2);
    shadows.push(`${x}vw ${y}vh 0 ${spread}px ${colorFn(o)}`);
  }
  return shadows.join(', ');
}

const white  = o => `rgba(255,255,255,${o})`;
const bubble = o => `rgba(165,243,252,${o})`;
const ember  = o => `rgba(249,115,22,${o})`;
const violet = o => `rgba(167,139,250,${o})`;

const STARS_A   = generateDotShadows(70, white,  0.5, 0.18, 0.42);
const STARS_B   = generateDotShadows(60, white,  0.5, 0.18, 0.42);
const BUBBLES   = generateDotShadows(70, bubble, 0.5, 0.18, 0.42);
const BUBBLES_2 = generateDotShadows(60, bubble, 0.5, 0.18, 0.42);
const EMBERS_A  = generateDotShadows(70, ember,  0.5, 0.18, 0.42);
const EMBERS_B  = generateDotShadows(60, ember,  0.5, 0.18, 0.42);
const VIOLETS_A = generateDotShadows(80, violet, 0.5, 0.15, 0.50);
const VIOLETS_B = generateDotShadows(70, violet, 0.5, 0.15, 0.50);

const Wrap = ({ bg, children }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden', background: bg }}>
    {children}
  </div>
);

// ── 1. Nébuleuse spatiale ────────────────────────────────────────────────────
function NebulaBackground() {
  return (
    <Wrap bg="radial-gradient(ellipse at 50% 30%, #0c0a1a 0%, #05050b 70%)">
      <style>{`
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; } 100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
        @keyframes nebulaDrift1 { 0%,100% { transform: translate(-8%, -6%) scale(1); } 50% { transform: translate(6%, 4%) scale(1.12); } }
        @keyframes nebulaDrift2 { 0%,100% { transform: translate(6%, 8%) scale(1.05); } 50% { transform: translate(-6%, -4%) scale(0.92); } }
        @keyframes nebulaDrift3 { 0%,100% { transform: translate(-4%, 4%) scale(0.95); } 50% { transform: translate(4%, -8%) scale(1.1); } }
      `}</style>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: STARS_A, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: STARS_B, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
      <div style={{ position: 'absolute', top: '8%', left: '12%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,70,239,0.32), transparent 70%)', filter: 'blur(70px)', mixBlendMode: 'lighten', animation: 'nebulaDrift1 30s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', bottom: '5%', right: '8%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.34), transparent 70%)', filter: 'blur(70px)', mixBlendMode: 'lighten', animation: 'nebulaDrift2 36s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: '35%', left: '50%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.22), transparent 70%)', filter: 'blur(80px)', mixBlendMode: 'lighten', animation: 'nebulaDrift3 42s ease-in-out infinite', willChange: 'transform' }} />
    </Wrap>
  );
}

// ── 2. Profondeurs océan ─────────────────────────────────────────────────────
function OceanDepthBackground() {
  return (
    <Wrap bg="linear-gradient(180deg, #0d2636 0%, #091a26 70%, #050f16 100%)">
      <style>{`
        @keyframes rayDrift1 { 0%,100% { transform: translateX(-4%) rotate(8deg); opacity: 0.5; } 50% { transform: translateX(4%) rotate(8deg); opacity: 0.85; } }
        @keyframes rayDrift2 { 0%,100% { transform: translateX(4%) rotate(-6deg); opacity: 0.4; } 50% { transform: translateX(-4%) rotate(-6deg); opacity: 0.7; } }
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; } 100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
      `}</style>
      <div style={{ position: 'absolute', top: '-20%', left: '15%', width: '25vw', height: '120vh', background: 'linear-gradient(180deg, rgba(56,189,248,0.18), transparent 75%)', filter: 'blur(40px)', animation: 'rayDrift1 14s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: '-20%', left: '55%', width: '30vw', height: '120vh', background: 'linear-gradient(180deg, rgba(34,211,238,0.14), transparent 75%)', filter: 'blur(40px)', animation: 'rayDrift2 18s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: BUBBLES, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: BUBBLES_2, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
    </Wrap>
  );
}

// ── 3. Aurora boréale ────────────────────────────────────────────────────────
function AuroraBackground() {
  return (
    <Wrap bg="linear-gradient(180deg, #010a08 0%, #020e0b 60%, #010806 100%)">
      <style>{`
        @keyframes auroraDrift1 { 0%,100% { transform: translateX(-8%) scaleY(1);   opacity: 0.55; } 50% { transform: translateX(8%) scaleY(1.3);  opacity: 0.9; } }
        @keyframes auroraDrift2 { 0%,100% { transform: translateX(6%) scaleY(0.9);  opacity: 0.4;  } 50% { transform: translateX(-6%) scaleY(1.2); opacity: 0.7; } }
        @keyframes auroraDrift3 { 0%,100% { transform: translateX(-4%) scaleY(1.1); opacity: 0.35; } 50% { transform: translateX(5%) scaleY(0.85); opacity: 0.6; } }
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; }  100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
      `}</style>
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '45vw', height: '80vh', background: 'linear-gradient(180deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.28) 40%, transparent 80%)', filter: 'blur(50px)', animation: 'auroraDrift1 12s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: '-15%', left: '30%', width: '50vw', height: '90vh', background: 'linear-gradient(180deg, rgba(99,102,241,0.45) 0%, rgba(139,92,246,0.22) 40%, transparent 80%)', filter: 'blur(60px)', animation: 'auroraDrift2 16s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: '-5%', left: '60%', width: '40vw', height: '75vh', background: 'linear-gradient(180deg, rgba(34,211,238,0.38) 0%, rgba(6,182,212,0.18) 40%, transparent 80%)', filter: 'blur(50px)', animation: 'auroraDrift3 20s ease-in-out infinite', willChange: 'transform' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: STARS_A, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: STARS_B, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
    </Wrap>
  );
}

// ── 4. Braises rouges ────────────────────────────────────────────────────────
function EmberBackground() {
  return (
    <Wrap bg="radial-gradient(ellipse at 50% 100%, #1a0a05 0%, #0d0504 60%, #080202 100%)">
      <style>{`
        @keyframes emberPulse  { 0%,100% { opacity: 0.4; } 50% { opacity: 0.72; } }
        @keyframes emberPulse2 { 0%,100% { opacity: 0.3; } 50% { opacity: 0.6;  } }
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; }  100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
      `}</style>
      <div style={{ position: 'absolute', bottom: '-20%', left: '20%', width: '70vw', height: '70vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.22), rgba(249,115,22,0.12), transparent 70%)', filter: 'blur(80px)', animation: 'emberPulse 6s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '5%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,38,38,0.28), transparent 70%)', filter: 'blur(60px)', animation: 'emberPulse2 9s ease-in-out infinite', animationDelay: '-3s' }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '5%', width: '30vw', height: '30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.2), transparent 70%)', filter: 'blur(50px)', animation: 'emberPulse 11s ease-in-out infinite', animationDelay: '-5s' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: EMBERS_A, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: EMBERS_B, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
    </Wrap>
  );
}

// ── 5. Minuit violet ─────────────────────────────────────────────────────────
function MidnightVioletBackground() {
  return (
    <Wrap bg="radial-gradient(ellipse at 50% 50%, #0a0514 0%, #060310 55%, #030208 100%)">
      <style>{`
        @keyframes orbPulse  { 0%,100% { transform: scale(1);    opacity: 0.28; } 50% { transform: scale(1.1);  opacity: 0.48; } }
        @keyframes orbPulse2 { 0%,100% { transform: scale(1.05); opacity: 0.18; } 50% { transform: scale(0.95); opacity: 0.32; } }
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; }  100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
      `}</style>
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translate(-50%,-10%)', width: '65vw', height: '65vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.3), rgba(109,40,217,0.14), transparent 65%)', filter: 'blur(65px)', animation: 'orbPulse 10s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '5%', right: '10%', width: '35vw', height: '35vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.18), transparent 70%)', filter: 'blur(55px)', animation: 'orbPulse2 14s ease-in-out infinite', animationDelay: '-5s' }} />
      <div style={{ position: 'absolute', bottom: '20%', left: '5%', width: '25vw', height: '25vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,181,253,0.14), transparent 70%)', filter: 'blur(45px)', animation: 'orbPulse 18s ease-in-out infinite', animationDelay: '-9s' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: VIOLETS_A, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: VIOLETS_B, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
    </Wrap>
  );
}

// ── Switcher ─────────────────────────────────────────────────────────────────
const VARIANTS = [
  { name: 'Nébuleuse spatiale', Comp: NebulaBackground },
  { name: 'Profondeurs océan',  Comp: OceanDepthBackground },
  { name: 'Aurora boréale',     Comp: AuroraBackground },
  { name: 'Braises rouges',     Comp: EmberBackground },
  { name: 'Minuit violet',      Comp: MidnightVioletBackground },
];

export default function StarField() {
  const [i, setI] = useState(() => {
    const saved = Number(localStorage.getItem('bg_preview_variant'));
    return Number.isInteger(saved) && saved >= 0 && saved < VARIANTS.length ? saved : 0;
  });

  const set = next => {
    setI(next);
    localStorage.setItem('bg_preview_variant', String(next));
  };

  const { name, Comp } = VARIANTS[i];

  return (
    <>
      <Comp />
      <div style={{
        position: 'fixed', top: 12, right: 12, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(7,9,15,0.85)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999,
        padding: '2px 10px', fontSize: 12, lineHeight: 1.2, color: '#e2e8f0', backdropFilter: 'blur(8px)',
      }}>
        <button onClick={() => set((i - 1 + VARIANTS.length) % VARIANTS.length)} style={{ background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>‹</button>
        <span style={{ minWidth: 160, textAlign: 'center' }}>{i + 1}/{VARIANTS.length} · {name}</span>
        <button onClick={() => set((i + 1) % VARIANTS.length)} style={{ background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>›</button>
      </div>
    </>
  );
}
