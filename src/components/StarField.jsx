import { useEffect, useRef } from 'react';

export default function StarField() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const stars = [];

    const init = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;

      stars.length = 0;
      const count = Math.floor((canvas.width * canvas.height) / 6000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x:       Math.random() * canvas.width,
          y:       Math.random() * canvas.height,
          r:       Math.random() * 1.1 + 0.15,
          opacity: Math.random() * 0.6 + 0.1,
          twinkle: Math.random() * Math.PI * 2,
          speed:   Math.random() * 0.008 + 0.003,
        });
      }
    };

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Glow orbs
      const orbs = [
        { x: 0.18, y: 0.25, rx: 0.45, ry: 0.55, color: '59,130,246', a: 0.10 },
        { x: 0.82, y: 0.72, rx: 0.40, ry: 0.50, color: '139,92,246', a: 0.07 },
        { x: 0.65, y: 0.12, rx: 0.30, ry: 0.35, color: '59,130,246', a: 0.06 },
        { x: 0.30, y: 0.85, rx: 0.25, ry: 0.30, color: '99,102,241', a: 0.05 },
      ];
      orbs.forEach(({ x, y, rx, ry, color, a }) => {
        const g = ctx.createRadialGradient(
          canvas.width * x, canvas.height * y, 0,
          canvas.width * x, canvas.height * y,
          canvas.width * rx
        );
        g.addColorStop(0, `rgba(${color},${a})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      // Stars with twinkling
      const t = performance.now() / 1000;
      stars.forEach(s => {
        const alpha = s.opacity * (0.6 + 0.4 * Math.sin(t * s.speed * 60 + s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    init();
    draw();

    const onResize = () => { init(); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
