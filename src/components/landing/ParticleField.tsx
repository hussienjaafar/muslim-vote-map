import { useRef, useEffect } from 'react';

/**
 * Animated Data Stream — floating numbers, percentages, district codes,
 * and data fragments that drift upward like a live civic data feed.
 * Creates an ambient "data is alive" effect tied to voter analytics.
 */

const DATA_FRAGMENTS = [
  // Voter counts
  '3,215', '605,819', '57,353', '234,112', '41,781', '12,916',
  '8,122', '47,949', '353,515', '124,388', '19,497', '15,686',
  // Percentages
  '92%', '85%', '71%', '48%', '91%', '64%', '53%', '88%',
  // District codes
  'CA-34', 'NY-12', 'TX-29', 'MI-13', 'IL-03', 'NJ-08',
  'VA-08', 'FL-24', 'PA-03', 'MN-05', 'GA-05', 'OH-11',
  // Micro labels
  '435', '50', '441', '2024', '2022',
  // Abstract data
  '↑12.4%', '↑8.7%', '→', '●', '◆', '▲',
];

interface DataParticle {
  x: number;
  y: number;
  text: string;
  speed: number;
  opacity: number;
  maxOpacity: number;
  size: number;
  isHighlight: boolean; // blue accent vs gray
  fadeZone: number; // y position where fade starts
}

const PARTICLE_COUNT = 35;
const ACCENT = 'rgba(59, 130, 246,'; // blue-500
const MUTED = 'rgba(100, 116, 139,'; // slate-500

export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<DataParticle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;

    const createParticle = (startY?: number): DataParticle => {
      const isHighlight = Math.random() < 0.3;
      const isNumber = Math.random() < 0.6;
      return {
        x: Math.random() * (w || 1400),
        y: startY ?? Math.random() * (h || 800),
        text: DATA_FRAGMENTS[Math.floor(Math.random() * DATA_FRAGMENTS.length)],
        speed: 0.15 + Math.random() * 0.4,
        opacity: 0,
        maxOpacity: isHighlight ? (0.15 + Math.random() * 0.2) : (0.06 + Math.random() * 0.08),
        size: isNumber ? (9 + Math.random() * 4) : (11 + Math.random() * 3),
        isHighlight,
        fadeZone: 0.15 + Math.random() * 0.2, // top 15-35% is fade-out zone
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (particlesRef.current.length === 0) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          particlesRef.current.push(createParticle());
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleMouseLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Move upward
        p.y -= p.speed;

        // Slight horizontal drift
        p.x += Math.sin(p.y * 0.005 + i) * 0.15;

        // Fade logic: fade in from bottom, full in middle, fade out at top
        const normalizedY = p.y / h; // 0 = top, 1 = bottom
        if (normalizedY > 0.85) {
          // Fading in from bottom
          p.opacity = Math.min(p.maxOpacity, p.opacity + 0.003);
        } else if (normalizedY < p.fadeZone) {
          // Fading out at top
          p.opacity = Math.max(0, p.maxOpacity * (normalizedY / p.fadeZone));
        } else {
          // Full opacity zone
          p.opacity = p.maxOpacity;
        }

        // Mouse proximity boost
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mouseBoost = dist < 150 ? (1 - dist / 150) * 0.25 : 0;
        const finalOpacity = Math.min(p.opacity + mouseBoost, 0.5);

        // Recycle particle when it goes above the canvas
        if (p.y < -30) {
          particles[i] = createParticle(h + 20 + Math.random() * 50);
          continue;
        }

        // Draw text
        const color = p.isHighlight ? ACCENT : MUTED;
        ctx.font = `${p.isHighlight ? '600' : '400'} ${p.size}px "Space Grotesk", "Manrope", monospace`;
        ctx.fillStyle = `${color} ${finalOpacity})`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      }

      // Subtle scan line effect (horizontal line sweeping down)
      const scanY = (Date.now() * 0.02) % (h * 1.5) - h * 0.25;
      if (scanY > 0 && scanY < h) {
        const grad = ctx.createLinearGradient(0, scanY - 2, 0, scanY + 2);
        grad.addColorStop(0, 'rgba(59, 130, 246, 0)');
        grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.03)');
        grad.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, scanY - 2, w, 4);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-auto ${className || ''}`}
      style={{ zIndex: 0 }}
    />
  );
}
