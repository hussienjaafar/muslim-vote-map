import { useRef, useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Map, Users, BarChart3, ShoppingCart, Shield, Database, ArrowRight,
  Megaphone, Building2, Vote, Target, ChevronDown,
} from 'lucide-react';

const MapFlyover = lazy(() => import('@/components/landing/MapFlyover').then(m => ({ default: m.MapFlyover })));
const ParticleField = lazy(() => import('@/components/landing/ParticleField').then(m => ({ default: m.ParticleField })));
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ReactLenis, useLenis } from 'lenis/react';

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────────────────────────────────── */
/*  Static Data                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Map,
    title: 'Issue-Mapped Choropleth',
    description: 'Switch between issues and instantly see which districts have the deepest donor pools. State and congressional-district granularity in one map.',
    accent: 'bg-blue-500/20 text-blue-400',
  },
  {
    icon: BarChart3,
    title: 'Donor & Activist Intelligence',
    description: 'Gold and silver donor counts, mailable addresses, and cell phones — segmented by issue and rolled up to the geographies your campaign actually plans against.',
    accent: 'bg-violet-500/20 text-violet-400',
  },
  {
    icon: Shield,
    title: 'Vetted Access',
    description: 'Built for advocacy organizations, issue PACs, and campaign consultants. Access is reviewed before activation to keep the data inside trusted hands.',
    accent: 'bg-amber-500/20 text-amber-400',
  },
  {
    icon: Users,
    title: 'Per-Issue Audiences',
    description: 'Every record is tagged to an issue. Build audiences that align with what your supporters actually care about — not generic universe files.',
    accent: 'bg-blue-400/20 text-blue-300',
  },
  {
    icon: ShoppingCart,
    title: 'Activate & Reach',
    description: 'Pick issues, geographies, and record types. Request a quote and activate SMS, email, CTV, or Meta campaigns powered by the audiences you assembled.',
    accent: 'bg-red-500/20 text-red-400',
  },
  {
    icon: Database,
    title: 'Nationwide Coverage',
    description: 'All 50 states and 435 congressional districts. Issue donor data is layered with election context — winners, margins, and turnout — for every region.',
    accent: 'bg-muted/20 text-muted-foreground',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Pick an Issue',
    description: 'Choose the issue that maps to your campaign. The map instantly recolors to show donor depth, district by district, with a sidebar of state and CD detail.',
  },
  {
    step: '02',
    title: 'Identify Your Districts',
    description: 'Compare donor counts, addresses, and cell-phone reach across districts. Pull in election context — winner, margin, turnout — to qualify each opportunity.',
  },
  {
    step: '03',
    title: 'Activate Your Campaign',
    description: 'Send the geographies and record types you need to your cart, request a quote, and activate outreach across SMS, email, CTV, or digital ads.',
  },
];

const USE_CASES = [
  {
    icon: Megaphone,
    role: 'Advocacy Organizations',
    stat: 'Per-issue',
    statLabel: 'Donor footprints by district',
    description: 'Stop running national lists for hyperlocal fights. See where your issue resonates strongest and concentrate spend in the districts most likely to give and act.',
    accent: 'blue',
  },
  {
    icon: Vote,
    role: 'Issue-Based PACs',
    stat: '435',
    statLabel: 'Districts to prioritize',
    description: 'Stack-rank congressional districts by gold donor count for your issue, layer in margin-of-victory, and route IE budget to the highest-leverage races.',
    accent: 'emerald',
  },
  {
    icon: Building2,
    role: 'Campaign Consultants',
    stat: 'State + CD',
    statLabel: 'Geographies in one view',
    description: 'Pitch clients with concrete, district-level evidence: who cares, how many of them there are, and how to reach them across the channels you already deploy.',
    accent: 'violet',
  },
  {
    icon: Target,
    role: 'IE Groups',
    stat: '2024',
    statLabel: 'Election context current',
    description: 'Pair issue donor density with current election results. Find the districts where a small persuasion or turnout lift on your issue can swing the outcome.',
    accent: 'amber',
  },
];

const FAQS = [
  {
    q: 'How do I get access?',
    a: 'Campaign Data Solutions is invite-only. Submit a short application describing your organization and intended use. We approve advocacy groups, issue PACs, campaign consultants, and IE groups.',
  },
  {
    q: 'What data is included?',
    a: 'Per-issue donor data — gold and silver donors, mailable addresses, and cell phones — at the state and congressional-district level, layered with election context (winner, margin, turnout) for all 50 states and 435 districts.',
  },
  {
    q: 'How often is the data updated?',
    a: 'Election context refreshes after each election cycle. Issue donor files are refreshed on a rolling basis as new modeling and contact data lands.',
  },
  {
    q: 'How can I use the data?',
    a: 'Audiences power SMS, email, CTV, and Meta activations through our team. You define the issue, geographies, and record types — we handle the activation pipeline.',
  },
  {
    q: 'Is access vetted?',
    a: 'Every applicant is reviewed before activation. Data stays inside a trusted network of campaign-side organizations and is never shared between unrelated accounts.',
  },
  {
    q: 'How does pricing work?',
    a: 'We work request-by-request. Add the issues, geographies, and record types you need to your cart and request a quote — pricing depends on scope and channels.',
  },
];

const MAP_PREVIEW_STATS = [
  { value: 'Per-issue', label: 'Donor data tagged to each issue' },
  { value: '441', label: 'Congressional districts' },
  { value: '50', label: 'States + territories' },
  { value: '2024', label: 'Election context current' },
];

const HERO_STATS = [
  { target: 435, suffix: '', decimals: 0, label: 'Congressional Districts' },
  { target: 50, suffix: '', decimals: 0, label: 'States & Territories' },
  { target: 2024, suffix: '', decimals: 0, label: 'Election Context' },
];

const WHY_HEADLINE_1 = 'Campaigns spend on districts they can\'t actually move.';
const WHY_HEADLINE_2 = 'Issue-based donor intelligence fixes that.';


/* ────────────────────────────────────────────────────────────────────────── */
/*  FAQ Accordion Item                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className={`w-full text-left group transition-all duration-300 rounded-lg p-5 sm:p-6 ${
        open
          ? 'bg-[rgba(28,28,30,0.6)] backdrop-blur-md border border-blue-500/20'
          : 'bg-transparent border border-white/5 hover:border-white/10 hover:bg-[rgba(28,28,30,0.3)]'
      }`}
    >
      <div className="flex items-start gap-4">
        <span className={`font-display text-sm font-bold tabular-nums shrink-0 mt-0.5 transition-colors duration-300 ${
          open ? 'text-blue-400' : 'text-white/20 group-hover:text-white/40'
        }`}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <span className={`font-display text-base sm:text-lg font-semibold transition-colors duration-300 ${
              open ? 'text-blue-400' : 'text-foreground group-hover:text-blue-400'
            }`}>
              {q}
            </span>
            <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center border transition-all duration-300 ${
              open ? 'border-blue-500/30 bg-blue-500/10 rotate-180' : 'border-white/10'
            }`}>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className={`overflow-hidden transition-all duration-400 ease-out ${open ? 'max-h-48 mt-3 opacity-100' : 'max-h-0 mt-0 opacity-0'}`}>
            <p className="text-muted-foreground leading-relaxed text-sm sm:text-base pr-8">{a}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Word Span Helper                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function WordSpans({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span key={i} className={`why-word inline-block ${className || ''}`} style={{ opacity: 0.15 }}>
          {word}&nbsp;
        </span>
      ))}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Landing Content                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function LandingContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  useLenis(() => { ScrollTrigger.update(); });

  // Force scroll to top on mount so hero animations play correctly
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useGSAP(() => {
    const mm = gsap.matchMedia();

    // ════════════════════════════════════════════════════════════════════════
    // 1. HERO — CSS-driven entrance (avoids Lenis/ScrollTrigger conflicts)
    //    + GSAP scrubbed parallax on scroll
    // ════════════════════════════════════════════════════════════════════════

    // Hero entrance is handled by CSS animations (.hero-fade-in class)
    // to avoid conflicts with Lenis scroll-restore and ScrollTrigger parallax.
    // See the CSS keyframes defined inline on the elements.

    // Parallax — elements drift at different speeds as user scrolls past hero
    mm.add('(min-width: 768px)', () => {
      const heroParallax = { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1.5 };
      gsap.to('.hero-pill', { yPercent: -50, opacity: 0, ease: 'none', scrollTrigger: { ...heroParallax, end: '40% top' } });
      gsap.to('.hero-line', { yPercent: -30, ease: 'none', scrollTrigger: heroParallax });
      gsap.to('.hero-body', { yPercent: -15, ease: 'none', scrollTrigger: heroParallax });
      gsap.to('.hero-stats', { yPercent: 20, ease: 'none', scrollTrigger: { ...heroParallax, scrub: 1 } });
      gsap.to('.hero-orb', { scale: 2.5, opacity: 0.3, ease: 'none', scrollTrigger: { ...heroParallax, scrub: 1 } });
    });

    mm.add('(max-width: 767px)', () => {
      const heroParallax = { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1 };
      gsap.to('.hero-line', { yPercent: -10, ease: 'none', scrollTrigger: heroParallax });
      gsap.to('.hero-stats', { yPercent: 8, ease: 'none', scrollTrigger: heroParallax });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 2. STATS COUNTER — count up from 0 (one-shot)
    // ════════════════════════════════════════════════════════════════════════

    document.querySelectorAll('.stat-counter').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-target') || '0');
      const suffix = el.getAttribute('data-suffix') || '';
      const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      const obj = { val: 0 };

      ScrollTrigger.create({
        trigger: '.hero-stats',
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(obj, {
            val: target,
            duration: 2,
            ease: 'power2.out',
            onUpdate: () => {
              (el as HTMLElement).textContent =
                (decimals > 0 ? obj.val.toFixed(decimals) : Math.round(obj.val).toLocaleString()) + suffix;
            },
          });
        },
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 3. WHY SECTION — word-by-word scrubbed reveal + clip-path body
    // ════════════════════════════════════════════════════════════════════════

    const whyWords = gsap.utils.toArray('.why-word');
    if (whyWords.length > 0) {
      gsap.to(whyWords, {
        opacity: 1,
        stagger: 0.05,
        ease: 'none',
        scrollTrigger: {
          trigger: '.why-section',
          start: 'top 70%',
          end: 'top 20%',
          scrub: 1,
        },
      });
    }

    gsap.utils.toArray('.why-body-p').forEach((el: any) => {
      gsap.fromTo(el,
        { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
        {
          clipPath: 'inset(0 0 0% 0)',
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            end: 'top 50%',
            scrub: 1,
          },
        }
      );
    });

    // ════════════════════════════════════════════════════════════════════════
    // 4. MAP PREVIEW — parallax shift + scrubbed stat reveals
    // ════════════════════════════════════════════════════════════════════════

    // Map heading — one-shot (not scrubbed) for cleaner feel
    gsap.set('.map-preview-heading', { opacity: 0, y: 20 });
    ScrollTrigger.create({
      trigger: '.map-preview-section',
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to('.map-preview-heading', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' });
      },
    });

    mm.add('(min-width: 768px)', () => {
      gsap.fromTo('.map-parallax-wrapper',
        { yPercent: 5 },
        { yPercent: -5, ease: 'none',
          scrollTrigger: { trigger: '.map-preview-section', start: 'top bottom', end: 'bottom top', scrub: 1.5 } }
      );
    });

    // Map stats — batch reveal so all 4 cards animate together
    gsap.set('.map-stat-card', { opacity: 0, y: 20 });
    ScrollTrigger.batch('.map-stat-card', {
      start: 'top 92%',
      onEnter: (batch) => {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', overwrite: true });
      },
      onLeaveBack: (batch) => {
        gsap.to(batch, { opacity: 0, y: 20, duration: 0.4, stagger: 0.04, ease: 'power2.in', overwrite: true });
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // 5. FEATURE CARDS — IntersectionObserver-triggered (Lenis-safe)
    // ════════════════════════════════════════════════════════════════════════

    // Use native IntersectionObserver instead of ScrollTrigger for one-shot
    // reveals. ScrollTrigger's position calculations desync with Lenis smooth
    // scroll, causing elements to stay hidden. IO is browser-native and reliable.
    const observeOnce = (selector: string, callback: () => void, threshold = 0.1) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          callback();
        }
      }, { threshold });
      io.observe(el);
    };

    gsap.set(['.features-heading', '.feature-card'], { opacity: 0, y: 20 });
    observeOnce('.features-section', () => {
      gsap.to('.features-heading', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      gsap.to('.feature-card', { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', delay: 0.15 });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 6. USE CASES — horizontal scroll (desktop) / stacked scrub (mobile)
    // ════════════════════════════════════════════════════════════════════════

    // Use cases: scrollytelling — each card fades in/out as user scrolls
    gsap.set('.use-cases-heading', { opacity: 0, y: 20 });
    observeOnce('.use-cases-section', () => {
      gsap.to('.use-cases-heading', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
    });

    // Each trigger panel controls its corresponding card's opacity.
    // Timing is designed so transitions overlap: one card fades out
    // while the next fades in, creating a smooth crossfade with no dead zones.
    document.querySelectorAll('.uc-trigger').forEach((trigger, i) => {
      const card = document.querySelector(`.uc-card-${i}`);
      if (!card) return;

      // First card starts visible, others fade in
      if (i > 0) {
        gsap.fromTo(card,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, ease: 'power1.out',
            scrollTrigger: { trigger, start: 'top 65%', end: 'top 35%', scrub: 0.5 } }
        );
      }

      // All cards except last fade out as their trigger scrolls past
      if (i < USE_CASES.length - 1) {
        gsap.to(card,
          { opacity: 0, y: -10, ease: 'power1.in',
            scrollTrigger: { trigger, start: 'bottom 65%', end: 'bottom 35%', scrub: 0.5 } }
        );
      }

      // Activate progress dot
      const dot = document.querySelector(`.uc-dot-${i}`);
      if (dot) {
        ScrollTrigger.create({
          trigger,
          start: 'top 50%',
          end: 'bottom 50%',
          onEnter: () => dot.classList.replace('bg-white/10', 'bg-blue-400'),
          onLeave: () => dot.classList.replace('bg-blue-400', 'bg-white/10'),
          onEnterBack: () => dot.classList.replace('bg-white/10', 'bg-blue-400'),
          onLeaveBack: () => dot.classList.replace('bg-blue-400', 'bg-white/10'),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // 7. HOW IT WORKS — pinned title + scrubbed step cards
    // ════════════════════════════════════════════════════════════════════════

    // Pin title removed — using CSS sticky instead (avoids ScrollTrigger/Lenis
    // desync that caused layout glitch when pin activated/deactivated)

    // Step cards: IO-triggered fade-in (no scrub, no Lenis desync)
    gsap.set('.step-card', { opacity: 0, y: 25 });
    observeOnce('.how-it-works', () => {
      gsap.utils.toArray('.step-card').forEach((card: any, i: number) => {
        gsap.to(card, { opacity: 1, y: 0, duration: 0.6, delay: i * 0.15, ease: 'power2.out' });
        const stepNum = card.querySelector('.step-num');
        if (stepNum) {
          gsap.to(stepNum, { opacity: 0.2, duration: 0.8, delay: i * 0.15, ease: 'power2.out' });
        }
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // 8. CTA — scale zoom-in with expanding glow
    // ════════════════════════════════════════════════════════════════════════

    gsap.fromTo('.cta-card',
      { scale: 0.85, opacity: 0.6 },
      { scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '.cta-card', start: 'top 90%', end: 'top 40%', scrub: 1 } }
    );

    gsap.fromTo('.cta-glow',
      { opacity: 0.02, scale: 0.8 },
      { opacity: 0.15, scale: 1.3, ease: 'none',
        scrollTrigger: { trigger: '.cta-card', start: 'top 90%', end: 'top 40%', scrub: 1 } }
    );

    // ════════════════════════════════════════════════════════════════════════
    // FAQ + FOOTER — light scrubbed fades
    // ════════════════════════════════════════════════════════════════════════

    // FAQ heading — one-shot
    // FAQ — IO-triggered (Lenis-safe)
    gsap.set(['.faq-heading', '.faq-item'], { opacity: 0, y: 15 });
    observeOnce('.faq-section', () => {
      gsap.to('.faq-heading', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      gsap.to('.faq-item', { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', delay: 0.15 });
    });

    gsap.fromTo('.landing-footer',
      { opacity: 0 },
      { opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '.landing-footer', start: 'top 95%', end: 'top 80%', scrub: 1 } }
    );

  }, { scope: containerRef });

  const ctaClick = () => navigate(user ? '/map' : '/request-access');

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#0e0e0e] text-foreground"
      style={{
        backgroundImage:
          'radial-gradient(at 0% 0%, rgba(59,130,246,0.05) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(77,142,255,0.05) 0px, transparent 50%)',
      }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50">
        {/* Glassmorphic backdrop with subtle bottom glow */}
        <div className="absolute inset-0 bg-[#0d0d0d]/70 backdrop-blur-2xl" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

        <div className="relative max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <span className="font-display text-sm font-bold text-blue-400">C</span>
            </div>
            <span className="font-display text-base sm:text-lg font-bold tracking-tight text-foreground hidden sm:block">
              Campaign Data Solutions
            </span>
          </div>

          {/* Center nav links — anchor to sections */}
          <div className="hidden md:flex items-center gap-1 bg-white/[0.03] rounded-full px-1 py-1 border border-white/[0.04]">
            {[
              { label: 'Data', target: '.map-preview-section' },
              { label: 'Platform', target: '.features-section' },
              { label: 'Use Cases', target: '.use-cases-section' },
              { label: 'How It Works', target: '.how-it-works' },
              { label: 'FAQ', target: '.faq-section' },
            ].map(link => (
              <button
                key={link.label}
                onClick={() => document.querySelector(link.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="px-4 py-1.5 text-[11px] font-medium tracking-wide text-white/50 hover:text-white hover:bg-white/[0.06] rounded-full transition-all duration-200 uppercase"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Auth actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={async () => { const { supabase } = await import('@/integrations/supabase/client'); await supabase.auth.signOut(); navigate('/'); }}
                  className="text-white/40 font-display text-[11px] font-medium tracking-wide hover:text-white/70 transition-colors"
                >
                  Sign Out
                </button>
                <button
                  onClick={() => navigate('/map')}
                  className="group inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-display text-xs font-semibold tracking-wide hover:bg-blue-500/20 hover:border-blue-400/40 hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.3)] active:scale-[0.97] transition-all duration-200"
                >
                  Open Map
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="group inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-display text-xs font-semibold tracking-wide hover:bg-blue-500/20 hover:border-blue-400/40 hover:shadow-[0_0_20px_-4px_rgba(59,130,246,0.3)] active:scale-[0.97] transition-all duration-200"
              >
                Sign In
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="hero-section relative px-6 py-20 md:py-32 max-w-[1440px] mx-auto">
          {/* Interactive particle constellation background */}
          <Suspense fallback={null}>
            <ParticleField className="!absolute inset-0 w-full h-full" />
          </Suspense>
          <div className="max-w-4xl relative z-10">
            <div className="hero-pill inline-flex items-center gap-3 px-3 py-1 rounded-full mb-8 animate-hero-fade-in surgical-glass" style={{ animationDelay: '0.1s' }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-blue-300 font-display">
                Invite-Only Platform
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl md:text-8xl font-bold tracking-tighter text-foreground mb-8 leading-[0.9]">
              <span className="hero-line block animate-hero-fade-up" style={{ animationDelay: '0.3s' }}>Issue-based donor intelligence,</span>
              <span className="hero-line block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 animate-hero-fade-up" style={{ animationDelay: '0.5s' }}>
                district by district.
              </span>
            </h1>

            <p className="hero-body text-base sm:text-lg text-muted-foreground max-w-2xl mb-12 leading-relaxed animate-hero-fade-up" style={{ animationDelay: '0.7s' }}>
              See which congressional districts care about the issues you campaign on, and who funds
              them there. Pick an issue, scan donor depth across all 435 districts, and activate the
              audiences that move your campaign.
            </p>

            <div className="flex items-center gap-5 mb-20 animate-hero-fade-up" style={{ animationDelay: '0.9s' }}>
              {user ? (
                <button onClick={() => navigate('/map')} className="hero-cta group inline-flex items-center gap-2 text-blue-400 font-display text-sm font-semibold tracking-wide hover:text-blue-300 transition-colors">
                  <span className="px-4 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 group-hover:bg-blue-500/20 group-hover:border-blue-400/40 transition-all">
                    Open Issue Map
                  </span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <>
                  <button onClick={() => navigate('/request-access')} className="hero-cta group inline-flex items-center gap-2 text-blue-400 font-display text-sm font-semibold tracking-wide hover:text-blue-300 transition-colors">
                    <span className="px-5 py-2.5 rounded-full border border-blue-500/30 bg-blue-500/10 group-hover:bg-blue-500/20 group-hover:border-blue-400/40 group-hover:shadow-[0_0_24px_-6px_rgba(59,130,246,0.3)] transition-all">
                      Request Access
                    </span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <button onClick={() => navigate('/login')} className="hero-cta text-white/40 font-display text-sm font-medium tracking-wide hover:text-white/70 transition-colors inline-flex items-center gap-1.5">
                    See How It Works
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Stats with counter animation */}
            <div className="hero-stats grid grid-cols-1 md:grid-cols-3 animate-hero-fade-up surgical-glass" style={{ animationDelay: '1.1s' }}>
              {HERO_STATS.map((s, i) => (
                <div key={s.label} className={`p-8 flex flex-col gap-1${i === 1 ? ' border-y border-white/10 md:border-y-0 md:border-x md:border-white/10' : ''}`}>
                  <span
                    className="stat-counter font-display text-4xl font-bold tabular-nums text-blue-400"
                    data-target={s.target}
                    data-suffix={s.suffix}
                    data-decimals={s.decimals}
                  >
                    0{s.suffix}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-display">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Ambient glow orb (behind particles, no overflow clip) */}
          <div className="hero-orb absolute -right-20 top-20 w-[500px] h-[500px] bg-blue-500/[0.07] blur-[150px] rounded-full pointer-events-none" />
        </section>

        {/* ── The Why — word-by-word reveal ──────────────────────────── */}
        <section className="why-section px-6 py-24 max-w-[1440px] mx-auto">
          <div className="max-w-3xl">
            <h2 className="why-headline font-display text-3xl sm:text-5xl font-bold tracking-tighter mb-10 leading-[1.1]">
              <WordSpans text={WHY_HEADLINE_1} />
              <span className="text-muted-foreground">
                <WordSpans text={WHY_HEADLINE_2} />
              </span>
            </h2>
            <div className="space-y-6">
              <p className="why-body-p text-lg text-muted-foreground leading-relaxed">
                Most donor and voter files are sold as one universe — every name in a state, lightly
                segmented at best. That forces campaigns to pay for reach they can't convert and
                spray messages across districts where the issue doesn't actually move people.
              </p>
              <p className="why-body-p text-lg text-muted-foreground leading-relaxed">
                Campaign Data Solutions inverts that. Every donor record is tagged to an issue and
                rolled up to the congressional districts and states you actually plan against, so
                you can see — at a glance — where your issue has weight and where it doesn't.
              </p>
              <p className="why-body-p text-lg text-foreground font-semibold">
                Spend where the issue lands. Skip the rest.
              </p>
            </div>
          </div>
        </section>

        {/* ── Map Preview / Data Showcase ─────────────────────────── */}
        <section className="map-preview-section px-6 py-24 bg-[#0a0a0c]">
          <div className="max-w-[1440px] mx-auto">
            <div className="map-preview-heading mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-4">See the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">Data</span></h2>
              <div className="h-1 w-20 bg-blue-500" />
            </div>

            {/* Live animated flyover map with parallax wrapper */}
            <div className="map-parallax-wrapper relative rounded-lg overflow-hidden mb-12 surgical-glass">
              <Suspense fallback={
                <div className="aspect-[16/7] bg-[#0a0a0c] flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                </div>
              }>
                <MapFlyover />
              </Suspense>
              {/* Overlay CTA */}
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <button
                  onClick={ctaClick}
                  className="pointer-events-auto bg-[rgba(13,13,13,0.8)] backdrop-blur-md border border-blue-500/30 px-6 py-3 font-bold text-sm text-blue-400 inline-flex items-center gap-2 hover:bg-[rgba(13,13,13,0.9)] hover:border-blue-400/50 hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)] transition-all"
                >
                  {user ? 'Open Issue Map' : 'Sign In to Explore'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Data stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {MAP_PREVIEW_STATS.map((s) => (
                <div key={s.label} className="map-stat-card p-6 surgical-glass">
                  <span className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-blue-400 block mb-1">{s.value}</span>
                  <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature Cards — waterfall cascade ────────────────────── */}
        <section className="features-section px-6 py-24 bg-[#0e0e0e]">
          <div className="max-w-[1440px] mx-auto">
            <div className="features-heading mb-16">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-4">Platform <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">Capabilities</span></h2>
              <div className="h-1 w-20 bg-blue-500" />
            </div>
            <div className="features-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="feature-card p-8 group hover:bg-[#201f1f] transition-all duration-300 cursor-default surgical-glass">
                  <div className={`w-12 h-12 rounded-lg ${f.accent} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold mb-3 text-foreground">{f.title}</h3>
                  <p className="text-sm sm:text-[15px] leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Use Cases — scrollytelling with sticky cards ─────────── */}
        <section className="use-cases-section px-6">
          <div className="max-w-[1440px] mx-auto">
            <div className="flex flex-col md:flex-row gap-12 md:gap-20">
              {/* Left: sticky title — stays pinned through entire section */}
              <div className="use-cases-heading md:w-1/3 md:sticky md:top-24 md:self-start pt-24">
                <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tighter mb-4">
                  Built For Teams That
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600"> Take Action</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Whether you're an advocacy org, an issue PAC, a campaign consultant, or an IE
                  group — the data you need to spend smarter is here.
                </p>
                {/* Progress dots */}
                <div className="hidden md:flex gap-2 mt-8">
                  {USE_CASES.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full bg-white/10 uc-dot-${i}`} />
                  ))}
                </div>
              </div>

              {/* Right: scroll triggers + sticky card display */}
              <div className="md:w-2/3 relative">
                {/* Sticky card container — cards stack here */}
                <div className="md:sticky md:top-24 md:h-[70vh] md:flex md:items-center">
                  <div className="relative w-full">
                    {USE_CASES.map((uc, i) => {
                      const accentMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
                        blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400',    glow: 'shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)]' },
                        emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-[0_0_40px_-10px_rgba(16,185,129,0.15)]' },
                        violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  text: 'text-violet-400',  glow: 'shadow-[0_0_40px_-10px_rgba(139,92,246,0.15)]' },
                        amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   glow: 'shadow-[0_0_40px_-10px_rgba(245,158,11,0.15)]' },
                      };
                      const a = accentMap[uc.accent] || accentMap.blue;

                      return (
                        <div
                          key={uc.role}
                          className={`uc-card-${i} ${i === 0 ? '' : 'md:absolute md:inset-0'} rounded-lg border ${a.border} ${a.glow} overflow-hidden`}
                          style={{ background: 'rgba(28, 28, 30, 0.5)', backdropFilter: 'blur(20px)', ...(i > 0 ? { opacity: 0 } : {}) }}
                        >
                          {/* Top accent line */}
                          <div className={`h-px w-full ${a.bg}`} style={{ background: `linear-gradient(to right, transparent, ${a.text === 'text-blue-400' ? 'rgba(59,130,246,0.4)' : a.text === 'text-emerald-400' ? 'rgba(16,185,129,0.4)' : a.text === 'text-violet-400' ? 'rgba(139,92,246,0.4)' : 'rgba(245,158,11,0.4)'}, transparent)` }} />

                          <div className="p-8 sm:p-10">
                            {/* Counter + Icon row */}
                            <div className="flex items-center justify-between mb-8">
                              <div className="flex items-center gap-3">
                                <div className={`w-11 h-11 rounded-lg ${a.bg} flex items-center justify-center border ${a.border}`}>
                                  <uc.icon className={`w-5 h-5 ${a.text}`} />
                                </div>
                                <span className={`text-[10px] font-display font-bold ${a.text} uppercase tracking-[0.2em]`}>
                                  {String(i + 1).padStart(2, '0')} / {String(USE_CASES.length).padStart(2, '0')}
                                </span>
                              </div>
                            </div>

                            {/* Big stat */}
                            <div className="mb-6">
                              <div className={`font-display text-4xl sm:text-5xl font-bold tabular-nums ${a.text} mb-1`}>{uc.stat}</div>
                              <div className="text-xs text-white/30 font-display uppercase tracking-[0.15em]">{uc.statLabel}</div>
                            </div>

                            {/* Title + description */}
                            <h3 className="font-display text-xl sm:text-2xl font-bold text-foreground mb-3">{uc.role}</h3>
                            <p className="text-sm sm:text-[15px] text-muted-foreground leading-relaxed max-w-lg">{uc.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Invisible trigger spacers — each one is 100vh tall */}
                <div className="hidden md:block" style={{ marginTop: '-70vh' }}>
                  {USE_CASES.map((_, i) => (
                    <div key={i} className={`uc-trigger h-screen`} />
                  ))}
                </div>

                {/* Mobile: simple stacked cards (no scrollytelling) */}
                <div className="md:hidden flex flex-col gap-5 py-12">
                  {USE_CASES.map((uc, i) => (
                    <div key={uc.role} className="use-case-card p-6 rounded-lg border border-white/[0.06]" style={{ background: 'rgba(28, 28, 30, 0.5)', backdropFilter: 'blur(20px)' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                          <uc.icon className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="font-display text-2xl font-bold tabular-nums text-blue-400">{uc.stat}</span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-foreground mb-2">{uc.role}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{uc.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works (Pinned Split + Scrubbed Steps) ──────────── */}
        <section className="how-it-works px-6 py-32 max-w-[1440px] mx-auto">
          <div className="flex flex-col md:flex-row gap-20">
            <div className="how-it-works-title md:w-1/3 md:sticky md:top-24 md:self-start">
              <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tighter mb-6">
                Three Steps to<br />
                <span className="text-blue-400">Targeted Audiences</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Go from picking an issue to activating audiences in the districts that matter —
                in minutes, not weeks.
              </p>
            </div>
            <div className="md:w-2/3 flex flex-col gap-16">
              {STEPS.map((s) => (
                <div key={s.step} className="step-card relative pl-16">
                  <span className="step-num absolute left-0 top-[-16px] sm:top-[-20px] font-display text-6xl sm:text-8xl font-black text-blue-500 select-none tabular-nums leading-none" style={{ opacity: 0.15 }}>
                    {s.step}
                  </span>
                  <h3 className="font-display text-xl sm:text-2xl font-bold mb-4 relative z-10">{s.title}</h3>
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────── */}
        <section className="faq-section px-6 py-24 bg-[#0a0a0c]">
          <div className="max-w-3xl mx-auto">
            <div className="faq-heading mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-4">Frequently Asked <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">Questions</span></h2>
              <div className="h-1 w-20 bg-blue-500" />
            </div>
            <div className="faq-list flex flex-col gap-3">
              {FAQS.map((faq, i) => (
                <div key={faq.q} className="faq-item">
                  <FaqItem q={faq.q} a={faq.a} index={i} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA — zoom-in with glow ────────────────────────────── */}
        <section className="px-6 py-32">
          <div className="cta-card max-w-4xl mx-auto p-8 sm:p-16 text-center rounded-lg relative overflow-hidden surgical-glass">
            <div className="cta-glow absolute inset-0 bg-blue-500/5 pointer-events-none" />
            <h2 className="font-display text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 relative z-10">
              Ready to See Where Your Issue Lands?
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto relative z-10">
              Advocacy organizations, issue PACs, campaign consultants, and IE groups already use
              Campaign Data Solutions to spend where the data points.
            </p>
            <div className="relative z-10 flex flex-col items-center gap-5">
              <button
                onClick={ctaClick}
                className="group inline-flex items-center gap-2 px-7 py-3 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-display text-base font-semibold tracking-wide hover:bg-blue-500/20 hover:border-blue-400/40 hover:shadow-[0_0_32px_-6px_rgba(59,130,246,0.35)] active:scale-[0.97] transition-all duration-200"
              >
                {user ? 'Open Map' : 'Request Access'}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <span className="text-[10px] text-white/30 font-display uppercase tracking-[0.2em]">Invite-only · Verified organizations</span>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="landing-footer bg-[#0e0e0e] border-t border-white/5 w-full py-12 px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full max-w-[1440px] mx-auto">
          <span className="text-[10px] uppercase tracking-[0.2em] font-light text-muted-foreground">
            © {new Date().getFullYear()} Campaign Data Solutions. All Rights Reserved.
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] font-light text-muted-foreground">
            Invite-only platform
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function Index() {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
      <LandingContent />
    </ReactLenis>
  );
}
