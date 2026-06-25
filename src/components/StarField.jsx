// Fond d'écran — 3 styles dispo (Nébuleuse / Poussière dorée / Océan), switcher en haut à
// droite pour changer à tout moment, le choix est mémorisé dans localStorage.
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

const white = o => `rgba(255,255,255,${o})`;
const gold = o => `rgba(251,191,36,${o})`;
const bubble = o => `rgba(165,243,252,${o})`;

// Même mécanique de particules (montée + fondu) sur les 3 fonds — seule la couleur change.
const STARS_A = generateDotShadows(70, white, 0.5, 0.18, 0.42);
const STARS_B = generateDotShadows(60, white, 0.5, 0.18, 0.42);
const GOLD_A = generateDotShadows(70, gold, 0.5, 0.18, 0.42);
const GOLD_B = generateDotShadows(60, gold, 0.5, 0.18, 0.42);
const BUBBLES = generateDotShadows(70, bubble, 0.5, 0.18, 0.42);
const BUBBLES_2 = generateDotShadows(60, bubble, 0.5, 0.18, 0.42);

const Wrap = ({ bg, children }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden', background: bg }}>
    {children}
  </div>
);

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

function GoldDustBackground() {
  return (
    <Wrap bg="radial-gradient(ellipse at 50% 100%, #2a2012 0%, #15100a 60%)">
      <style>{`
        @keyframes riseUp  { 0% { transform: translateY(10vh); opacity: 0.9; } 100% { transform: translateY(-30vh); opacity: 0; } }
        @keyframes riseUp2 { 0% { transform: translateY(15vh); opacity: 0.85; } 100% { transform: translateY(-35vh); opacity: 0; } }
        @keyframes glowPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
      `}</style>
      <div style={{ position: 'absolute', bottom: '-10%', left: '30%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.18), transparent 70%)', filter: 'blur(90px)', animation: 'glowPulse 8s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: GOLD_A, animation: 'riseUp 16s linear infinite' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', borderRadius: '50%', boxShadow: GOLD_B, animation: 'riseUp2 22s linear infinite', animationDelay: '-8s' }} />
    </Wrap>
  );
}

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

const VARIANTS = [
  { name: 'Nébuleuse spatiale', Comp: NebulaBackground },
  { name: 'Poussière dorée', Comp: GoldDustBackground },
  { name: 'Profondeurs océan', Comp: OceanDepthBackground },
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
        <span style={{ minWidth: 150, textAlign: 'center' }}>{i + 1}/{VARIANTS.length} · {name}</span>
        <button onClick={() => set((i + 1) % VARIANTS.length)} style={{ background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>›</button>
      </div>
    </>
  );
}
