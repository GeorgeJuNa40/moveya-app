import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { PLANS, PROMO_PRICE, PROMO_TRIAL_DAYS, FOUNDER_PRICE_USD } from '../../lib/plans';

// Landing pública (cara comercial) — estilo "Premium Zen Tech": claro, sereno,
// con fotos y transiciones suaves. Vive en el dominio, sin login. Los botones
// llevan al registro real; los links de invitación con ?ceu= NO pasan por aquí
// (App.tsx los manda al onboarding).

const REGISTRO = '/entrar?nuevo=1';
const LOGIN = '/entrar';

// Marca de loto (outline salvia) para la barra superior y el pie.
function LotusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth={16} strokeLinejoin="round" strokeLinecap="round">
      <g>
        <path d="M256,382 C 320,300 322,196 256,132 C 190,196 192,300 256,382 Z" transform="rotate(-64 256 382)" />
        <path d="M256,382 C 320,300 322,196 256,132 C 190,196 192,300 256,382 Z" transform="rotate(64 256 382)" />
        <path d="M256,382 C 306,306 306,214 256,158 C 206,214 206,306 256,382 Z" transform="rotate(-32 256 382)" />
        <path d="M256,382 C 306,306 306,214 256,158 C 206,214 206,306 256,382 Z" transform="rotate(32 256 382)" />
        <path d="M256,382 C 300,300 300,200 256,138 C 212,200 212,300 256,382 Z" />
      </g>
    </svg>
  );
}

// Imagen con fondo salvia de respaldo (si la foto aún no existe, se ve un panel
// suave en vez de un ícono roto) + reveal tipo "wipe" y ken-burns continuo.
function Shot({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={`shot reveal-img ${className ?? ''}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </figure>
  );
}

const FEATURES = [
  { ic: '▦', t: 'Reservas en línea', d: 'Tus alumnos agendan y cancelan solos; tú ves el cupo en tiempo real.' },
  { ic: '◈', t: 'Cobros con tarjeta', d: 'Vende paquetes y recibe el dinero directo en tu cuenta. Sin apps aparte.' },
  { ic: '✆', t: 'Recordatorios WhatsApp', d: 'Menos ausencias: la app recuerda la clase y avisa paquetes por vencer.' },
  { ic: '❏', t: 'Paquetes y créditos', d: 'Clases restantes y vigencias bajo control, sin cuentas a mano.' },
  { ic: '★', t: 'Recompensas y metas', d: 'Estrellas por asistir y metas que la app califica sola. Regresan más.' },
  { ic: '▤', t: 'Reportes claros', d: 'Ingresos y asistencia mes con mes. Sabes cómo va tu estudio de un vistazo.' },
];

const STEPS = [
  { n: '1', t: 'Crea tu estudio', d: 'Te registras en 2 minutos y pones tu marca, clases y paquetes.' },
  { n: '2', t: 'Invita a tus alumnos', d: 'Comparte tu código o QR. Reservan y pagan desde su celular.' },
  { n: '3', t: 'Llena tus clases', d: 'La app cobra, recuerda y fideliza por ti. Tú das clase.' },
];

const STAR_GOAL = 8;

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState(0);

  // Programa Fundador: abierto mientras queden lugares; al llenarse la barra
  // cambia sola a la promo de $1 · 14 días.
  const [founders, setFounders] = useState<{ taken: number; limit: number } | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('founders_status').then(
      ({ data, error }) => {
        if (!alive || error || !data) return;
        setFounders({ taken: Number(data.taken) || 0, limit: Number(data.limit) || 10 });
      },
      () => {},
    );
    return () => { alive = false; };
  }, []);
  const founderOpen = founders ? founders.taken < founders.limit : true;
  const remaining = founders ? Math.max(0, founders.limit - founders.taken) : null;

  // Efectos: reveal al hacer scroll (con stagger), conteo de números y un
  // parallax muy sutil en las manchas de fondo. Respeta "reduce motion".
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scope = root.current;
    if (!scope) return;

    const els = Array.from(scope.querySelectorAll<HTMLElement>('.reveal, .reveal-img, [data-count]'));

    // Las animaciones de entrada SOLO se activan si hay JS + IntersectionObserver
    // (clase .anim). Sin eso, todo queda visible por defecto — nunca se ocultan
    // las fotos ni los textos. Además, un temporizador de seguridad revela todo
    // por si el observer no dispara en algún navegador.
    const supportsIO = 'IntersectionObserver' in window;
    if (!reduce && supportsIO) scope.classList.add('anim');

    let safety = 0;
    if (supportsIO) {
      const io = new IntersectionObserver((es) => {
        es.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add('in');
          const el = en.target as HTMLElement;
          if (el.dataset.count) {
            const to = +el.dataset.count; const pre = el.dataset.pre ?? '';
            let i = 0; const step = () => {
              i++; el.textContent = pre + (i >= to ? to : i);
              if (i < to) setTimeout(step, 700 / Math.max(to, 1));
            };
            step();
          }
          io.unobserve(en.target);
        });
      }, { threshold: 0.15 });
      els.forEach((e) => io.observe(e));
      // Seguridad: si algo impide que el observer dispare, revela todo.
      safety = window.setTimeout(() => els.forEach((e) => e.classList.add('in')), 2500);
      // Guarda el observer para desconectarlo al limpiar.
      (scope as unknown as { _io?: IntersectionObserver })._io = io;
    }

    // Parallax suave de las manchas de fondo.
    let raf = 0;
    const blobs = Array.from(scope.querySelectorAll<HTMLElement>('.blob'));
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        blobs.forEach((b, i) => { b.style.transform = `translate3d(0, ${y * (0.04 + i * 0.02)}px, 0)`; });
      });
    };
    if (!reduce) window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      (scope as unknown as { _io?: IntersectionObserver })._io?.disconnect();
      clearTimeout(safety);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="mya-land" ref={root}>
      <div className="bg">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>

      <nav>
        <div className="wrap navin">
          <Link className="brand" to={REGISTRO} aria-label="Move yA">
            <LotusMark className="mark" />
            <span className="wordmark">move <i>yA</i></span>
          </Link>
          <div className="navbtns">
            <Link className="btn btn-ghost" to={LOGIN}>Entrar</Link>
            <Link className="btn btn-primary" to={REGISTRO}>Prueba ${PROMO_PRICE}</Link>
          </div>
        </div>
      </nav>

      <div className="promo">
        {founderOpen ? (
          <>
            <span className="chip">Programa Fundador</span> Los primeros 10 estudios conservan Premium a{' '}
            <b>${FOUNDER_PRICE_USD}/mes de por vida</b>{remaining !== null && <> · <b>quedan {remaining} de 10</b></>}.{' '}
            <Link to={REGISTRO}>Apartar mi lugar →</Link>
          </>
        ) : (
          <>
            <span className="chip">Oferta</span> Prueba Move yA completo por <b>${PROMO_PRICE}</b> · {PROMO_TRIAL_DAYS} días con acceso Premium.{' '}
            <Link to={REGISTRO}>Empezar →</Link>
          </>
        )}
      </div>

      <header className="wrap hero">
        <div className="hero-copy reveal">
          <span className="eyebrow"><span className="pulse" /> Para estudios y espacios de bienestar</span>
          <h1>Tu estudio,<br /><span className="ital">en su mejor forma.</span></h1>
          <p className="sub">Reservas, pagos con tarjeta, paquetes y recordatorios por WhatsApp — en una sola app con la cara de tu marca. Menos caos, más clases llenas.</p>
          <div className="cta">
            <Link className="btn btn-primary" to={REGISTRO}>Empieza por ${PROMO_PRICE} · {PROMO_TRIAL_DAYS} días</Link>
            <a className="btn btn-ghost" href="#como">Ver cómo funciona</a>
          </div>
          <div className="reassure">
            <span><span className="dot">◆</span> Sin permanencia</span>
            <span><span className="dot">◆</span> Cancela cuando quieras</span>
            <span><span className="dot">◆</span> Acceso Premium en la prueba</span>
          </div>
        </div>

        <div className="hero-visual">
          <Shot src="/landing/hero.jpg" alt="Clase de bienestar en un estudio luminoso" className="hero-shot" />
          <div className="fcard fcard-top">
            <span className="fc-ic">★</span>
            <div><b>+1 estrella</b><small>Ana asistió a Reformer</small></div>
          </div>
          <div className="fcard fcard-bot">
            <span className="fc-ic fc-pay">$</span>
            <div><b>Pago recibido</b><small>Paquete 8 clases · directo a tu cuenta</small></div>
          </div>
          <div className="fcard fcard-mid">
            <span className="fc-ic fc-wa">✆</span>
            <div><b>Recordatorio enviado</b><small>12 alumnos por WhatsApp</small></div>
          </div>
        </div>
      </header>

      <section>
        <div className="wrap center reveal">
          <h2>Una plataforma, muchas disciplinas</h2>
          <p className="lead">Si en tu espacio se dan clases con horario y cupo, Move yA es para ti.</p>
          <div className="disc">
            <span><b>Pilates</b> (reformer, mat, todos)</span>
            <span>Yoga</span><span>Barre</span><span>Gimnasios boutique</span><span>Disciplinas de bienestar</span>
          </div>
        </div>
        <div className="wrap gallery">
          <Shot src="/landing/disc-1.jpg" alt="Clase grupal en colchoneta" className="g-tall" />
          <Shot src="/landing/disc-2.jpg" alt="Pilates reformer con aro" className="g-wide" />
          <Shot src="/landing/disc-3.jpg" alt="Clase de pilates mat" className="g-wide" />
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="center reveal"><h2>Todo tu estudio, en un solo lugar</h2><p className="lead">Sin juntar cinco herramientas ni pelear con hojas de cálculo.</p></div>
          <div className="grid3">
            {FEATURES.map((f, i) => (
              <div className="feat reveal" key={f.t} style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                <div className="ic">{f.ic}</div><h3>{f.t}</h3><p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap game">
          <div className="game-media reveal-img">
            <Shot src="/landing/game.jpg" alt="Alumnas en clase de pilates" />
          </div>
          <div className="game-copy reveal">
            <h2>Gamificación que llena clases</h2>
            <p className="lead">Move yA premia la constancia: tus alumnos ganan estrellas por asistir y persiguen metas. Pruébalo 👉</p>
            <div className="kpis">
              <div className="kpi"><b data-count={PROMO_PRICE} data-pre="$">${PROMO_PRICE}</b><span>Primer mes</span></div>
              <div className="kpi"><b data-count={PROMO_TRIAL_DAYS}>{PROMO_TRIAL_DAYS}</b><span>Días Premium</span></div>
              <div className="kpi"><b data-count="10">10</b><span>Lugares Fundador</span></div>
            </div>
            <div className="starcard">
              <div className="ring" style={{ '--p': (stars / STAR_GOAL) * 100 } as React.CSSProperties}>
                <div className="rin"><div><div className="n">{stars}</div><small>/ {STAR_GOAL} clases</small></div></div>
              </div>
              <div className="starside">
                <button className="btn btn-primary starbtn" type="button" onClick={() => setStars((s) => Math.min(STAR_GOAL, s + 1))}>
                  ★ Asistí a una clase
                </button>
                <div className="win">{stars >= STAR_GOAL ? '¡Meta lograda! +5 ★' : 'Suma estrellas por asistir'}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como">
        <div className="wrap">
          <div className="center reveal"><h2>De 0 a tu estudio en la nube</h2><p className="lead">Tres pasos, sin instalar nada.</p></div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step reveal" key={s.n} style={{ transitionDelay: `${i * 110}ms` }}><div className="n">{s.n}</div><h3>{s.t}</h3><p>{s.d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="precios">
        <div className="wrap">
          <div className="center reveal">
            <h2>Precios simples, sin letras chiquitas</h2>
            <p className="lead">Empieza por <b className="hl">${PROMO_PRICE}</b> con {PROMO_TRIAL_DAYS} días de acceso <b className="hl">Premium</b>. Si no te suma, cancelas.</p>
          </div>
          <div className="prices">
            {PLANS.map((p, i) => (
              <div className={`price reveal${p.highlight ? ' hi' : ''}`} key={p.id} style={{ transitionDelay: `${i * 110}ms` }}>
                {p.highlight && <div className="badge">Más elegido</div>}
                <div className="pn">{p.name}</div>
                <div className="tl">{p.tagline}</div>
                <div className="amt">${p.priceUsd}<small> USD/mes</small></div>
                <ul>
                  {p.features.slice(0, 5).map((f) => (
                    <li key={f}><span className="ck">✓</span> {f}</li>
                  ))}
                </ul>
                <Link className={`btn ${p.highlight ? 'btn-primary' : 'btn-ghost'}`} to={REGISTRO}>Empezar por ${PROMO_PRICE}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="final">
        <div className="finalbox reveal">
          <LotusMark className="final-mark" />
          <h2>Tu próxima clase llena empieza hoy</h2>
          <p className="lead" style={{ marginTop: 14 }}>Prueba Move yA completo por ${PROMO_PRICE} · {PROMO_TRIAL_DAYS} días con acceso Premium. Con tu marca desde el primer día.</p>
          <Link className="btn btn-primary big" to={REGISTRO}>Crear mi estudio</Link>
        </div>
      </div>

      <footer>
        <div className="wrap footin">
          <div className="brand"><LotusMark className="mark" /><span className="wordmark">move <i>yA</i></span></div>
          <div className="foot-links">
            <a href="#precios">Precios</a>
            <Link to="/privacy">Privacidad</Link>
            <Link to="/terms">Términos</Link>
            <Link to={LOGIN}>Iniciar sesión</Link>
          </div>
        </div>
      </footer>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@property --p{syntax:'<number>';inherits:false;initial-value:0}
.mya-land{
  --cream:#FAF8F3;--cream2:#F4F1EA;--card:#FFFFFF;
  --sage:#4A5D55;--sage2:#5E7469;--mint:#88B8B7;--mint-soft:#AED0CB;
  --clay:#B5623F;--ink:#2A302C;--muted:#6E7A73;--line:rgba(74,93,85,.14);
  --shadow:0 24px 60px -34px rgba(43,58,50,.45);
  --serif:"Playfair Display",Georgia,"Times New Roman",serif;
  --sans:"Inter","DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  position:relative;width:100%;min-height:100vh;overflow-x:hidden;
  background:var(--cream);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;
}
.mya-land *{box-sizing:border-box}
.mya-land a{color:inherit;text-decoration:none}
.mya-land .wrap{max-width:1140px;margin:0 auto;padding:0 22px;position:relative;z-index:2}

/* Fondo: manchas botánicas suaves */
.mya-land .bg{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.mya-land .blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5}
.mya-land .b1{width:520px;height:520px;top:-120px;right:-120px;background:radial-gradient(circle,rgba(136,184,183,.45),transparent 70%)}
.mya-land .b2{width:460px;height:460px;top:38%;left:-160px;background:radial-gradient(circle,rgba(174,208,203,.40),transparent 70%)}
.mya-land .b3{width:520px;height:520px;bottom:-160px;right:-80px;background:radial-gradient(circle,rgba(181,98,63,.14),transparent 70%)}

/* Nav */
.mya-land nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);background:rgba(250,248,243,.82);border-bottom:1px solid var(--line)}
.mya-land .navin{display:flex;align-items:center;justify-content:space-between;padding:13px 22px}
.mya-land .brand{display:flex;align-items:center;gap:9px;min-width:0}
.mya-land .brand .mark{width:30px;height:30px;color:var(--sage);flex:none}
.mya-land .wordmark{font-family:var(--serif);font-size:23px;font-weight:600;color:var(--sage);line-height:1;white-space:nowrap}
.mya-land .wordmark i{font-style:italic;color:var(--clay)}
.mya-land .navbtns{display:flex;gap:10px;align-items:center;flex-shrink:0}
.mya-land .btn{border-radius:999px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer;border:1px solid transparent;transition:transform .15s,box-shadow .25s,background .2s,border-color .2s;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.mya-land .btn:active{transform:translateY(1px)}
.mya-land .btn-ghost{color:var(--sage);border-color:var(--line);background:transparent}
.mya-land .btn-ghost:hover{border-color:var(--mint);background:rgba(136,184,183,.08)}
.mya-land .btn-primary{color:#fff;background:linear-gradient(160deg,var(--sage2),var(--sage));box-shadow:0 14px 30px -14px rgba(74,93,85,.7)}
.mya-land .btn-primary:hover{box-shadow:0 20px 42px -14px rgba(74,93,85,.7);transform:translateY(-1px)}
.mya-land .btn.big{margin-top:26px;padding:16px 32px;font-size:16px}

/* Promo */
.mya-land .promo{position:relative;z-index:2;text-align:center;font-size:13.5px;padding:10px 16px;background:linear-gradient(90deg,rgba(136,184,183,.16),rgba(174,208,203,.12));border-bottom:1px solid var(--line);color:var(--sage)}
.mya-land .promo .chip{display:inline-block;background:var(--sage);color:var(--cream);font-weight:700;font-size:11px;padding:3px 9px;border-radius:999px;margin-right:8px;text-transform:uppercase;letter-spacing:.04em}
.mya-land .promo b{color:var(--clay)}
.mya-land .promo a{font-weight:700;color:var(--sage);text-decoration:underline;text-underline-offset:3px}

/* Hero */
.mya-land .hero{position:relative;z-index:2;padding:60px 22px 46px;display:grid;grid-template-columns:1.02fr .98fr;gap:48px;align-items:center}
.mya-land .eyebrow{display:inline-flex;align-items:center;gap:9px;font:600 12px/1.3 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--sage2);background:rgba(136,184,183,.12);border:1px solid var(--line);padding:8px 13px;border-radius:16px;max-width:100%;white-space:normal}
.mya-land .eyebrow .pulse{width:7px;height:7px;border-radius:50%;background:var(--mint);flex:none;animation:mya-pp 2s infinite}
@keyframes mya-pp{0%{box-shadow:0 0 0 0 rgba(136,184,183,.6)}70%{box-shadow:0 0 0 9px rgba(136,184,183,0)}100%{box-shadow:0 0 0 0 rgba(136,184,183,0)}}
.mya-land h1{font-family:var(--serif);font-size:clamp(40px,6.2vw,68px);line-height:1.04;letter-spacing:-.01em;font-weight:600;margin:22px 0 0;color:var(--sage);text-wrap:balance}
.mya-land h1 .ital{font-style:italic;color:var(--clay)}
.mya-land .sub{margin:20px 0 0;font-size:18px;line-height:1.6;color:var(--muted);max-width:30em}
.mya-land .cta{margin-top:30px;display:flex;gap:14px;flex-wrap:wrap}
.mya-land .cta .btn{padding:15px 26px;font-size:16px}
.mya-land .reassure{margin-top:18px;font-size:13.5px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap}
.mya-land .reassure span{display:inline-flex;gap:7px;align-items:center}
.mya-land .reassure .dot{color:var(--mint)}

.mya-land .hero-visual{position:relative;min-width:0}
.mya-land .hero-shot{aspect-ratio:4/5;border-radius:30px}
.mya-land .fcard{position:absolute;display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:11px 14px;box-shadow:var(--shadow);animation:mya-float 6s ease-in-out infinite}
.mya-land .fcard b{display:block;font-size:13.5px;color:var(--ink);line-height:1.1}
.mya-land .fcard small{font-size:11px;color:var(--muted)}
.mya-land .fc-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:15px;background:rgba(136,184,183,.18);color:var(--sage);flex:none}
.mya-land .fc-pay{background:rgba(181,98,63,.14);color:var(--clay)}
.mya-land .fc-wa{background:rgba(74,93,85,.12);color:var(--sage)}
.mya-land .fcard-top{top:18px;left:-22px;animation-delay:.2s}
.mya-land .fcard-mid{top:44%;right:-26px;animation-delay:1.4s}
.mya-land .fcard-bot{bottom:22px;left:-14px;animation-delay:.8s}
@keyframes mya-float{0%,100%{transform:translateY(-6px)}50%{transform:translateY(6px)}}

/* Fotos: reveal wipe + ken-burns */
.mya-land .shot{position:relative;overflow:hidden;border-radius:24px;background:linear-gradient(150deg,var(--mint-soft),var(--sage2));box-shadow:var(--shadow);width:100%;height:100%}
.mya-land .shot img{width:100%;height:100%;object-fit:cover;display:block;animation:mya-kb 20s ease-in-out infinite alternate}
@keyframes mya-kb{0%{transform:scale(1.03)}100%{transform:scale(1.13)}}
.mya-land .reveal-img{transition:clip-path 1.05s cubic-bezier(.2,.7,.2,1),opacity 1.05s}
.mya-land.anim .reveal-img{clip-path:inset(0 0 100% 0);opacity:.4}
.mya-land.anim .reveal-img.in{clip-path:inset(0 0 0 0);opacity:1}

/* Secciones */
.mya-land section{position:relative;z-index:2;padding:72px 0}
.mya-land .center{text-align:center;max-width:660px;margin:0 auto}
.mya-land h2{font-family:var(--serif);font-size:clamp(28px,4vw,42px);letter-spacing:-.01em;font-weight:600;margin:0;color:var(--sage);text-wrap:balance}
.mya-land .lead{color:var(--muted);margin-top:12px;font-size:16.5px;line-height:1.6}
.mya-land .hl{color:var(--clay)}
.mya-land .reveal{transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
.mya-land.anim .reveal{opacity:0;transform:translateY(28px)}
.mya-land.anim .reveal.in{opacity:1;transform:none}

.mya-land .disc{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:26px}
.mya-land .disc span{font-size:14px;font-weight:500;color:var(--sage);background:var(--card);border:1px solid var(--line);padding:9px 16px;border-radius:999px;min-width:0;box-shadow:0 8px 20px -16px rgba(43,58,50,.5)}
.mya-land .disc b{color:var(--clay);font-weight:700}

/* Galería de disciplinas */
.mya-land .gallery{display:grid;grid-template-columns:1fr 1fr 1fr;grid-auto-rows:210px;gap:16px;margin-top:40px}
.mya-land .gallery .g-tall{grid-row:span 2}
.mya-land .gallery .shot{border-radius:22px}

.mya-land .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:46px}
.mya-land .feat{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px;transition:transform .25s,border-color .25s,box-shadow .25s,opacity .8s,translate .8s;min-width:0;box-shadow:0 16px 40px -30px rgba(43,58,50,.5)}
.mya-land .feat:hover{transform:translateY(-6px);border-color:var(--mint);box-shadow:var(--shadow)}
.mya-land .feat .ic{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;font-size:20px;background:linear-gradient(160deg,rgba(136,184,183,.22),rgba(174,208,203,.14));color:var(--sage)}
.mya-land .feat h3{font-family:var(--serif);margin:16px 0 6px;font-size:19px;color:var(--sage);font-weight:600}
.mya-land .feat p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.55}

/* Gamificación */
.mya-land .game{display:grid;grid-template-columns:.92fr 1.08fr;gap:40px;align-items:center}
.mya-land .game-media{aspect-ratio:4/5;max-height:520px}
.mya-land .game-media .shot{border-radius:28px}
.mya-land .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px}
.mya-land .kpi{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;text-align:center;min-width:0;box-shadow:0 12px 30px -26px rgba(43,58,50,.5)}
.mya-land .kpi b{display:block;font-family:var(--serif);font-size:30px;font-weight:600;color:var(--sage);font-variant-numeric:tabular-nums}
.mya-land .kpi span{font-size:12px;color:var(--muted)}
.mya-land .starcard{display:flex;gap:22px;align-items:center;margin-top:24px;background:linear-gradient(160deg,rgba(136,184,183,.14),rgba(255,255,255,.5));border:1px solid var(--line);border-radius:24px;padding:22px}
.mya-land .ring{width:132px;height:132px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--mint) calc(var(--p)*1%),rgba(74,93,85,.12) 0);transition:--p .5s}
.mya-land .ring .rin{width:104px;height:104px;border-radius:50%;background:var(--cream);display:grid;place-items:center}
.mya-land .ring .n{font-family:var(--serif);font-size:32px;font-weight:600;color:var(--sage)}
.mya-land .ring small{font-size:11px;color:var(--muted)}
.mya-land .starside{min-width:0}
.mya-land .win{color:var(--sage2);font-weight:700;margin-top:12px;font-size:13.5px;min-height:20px}

/* Pasos */
.mya-land .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:46px}
.mya-land .step{position:relative;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:28px;min-width:0;box-shadow:0 16px 40px -30px rgba(43,58,50,.5)}
.mya-land .step .n{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-family:var(--serif);font-weight:600;font-size:18px;color:#fff;background:linear-gradient(160deg,var(--sage2),var(--sage))}
.mya-land .step h3{font-family:var(--serif);margin:16px 0 6px;font-size:19px;color:var(--sage);font-weight:600}
.mya-land .step p{margin:0;color:var(--muted);font-size:14.5px}

/* Precios */
.mya-land .prices{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:46px;align-items:stretch}
.mya-land .price{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:30px;position:relative;transition:transform .25s,box-shadow .25s,opacity .8s,translate .8s;min-width:0;box-shadow:0 16px 40px -30px rgba(43,58,50,.5)}
.mya-land .price:hover{transform:translateY(-6px);box-shadow:var(--shadow)}
.mya-land .price.hi{border-color:var(--mint);box-shadow:var(--shadow);background:linear-gradient(180deg,rgba(136,184,183,.10),var(--card))}
.mya-land .price .badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--sage);color:var(--cream);font-weight:700;font-size:12px;padding:5px 14px;border-radius:999px;white-space:nowrap}
.mya-land .price .pn{font-family:var(--serif);color:var(--sage);font-weight:600;font-size:22px}
.mya-land .price .tl{color:var(--muted);font-size:13px;margin-top:2px}
.mya-land .price .amt{font-family:var(--serif);margin:16px 0 2px;font-size:44px;font-weight:600;color:var(--sage)}
.mya-land .price .amt small{font-size:14px;color:var(--muted);font-weight:600;font-family:var(--sans)}
.mya-land .price ul{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px;flex:1}
.mya-land .price li{display:flex;gap:10px;font-size:13.5px;color:var(--ink)}
.mya-land .price li .ck{color:var(--mint);font-weight:800}
.mya-land .price .btn{margin-top:22px;justify-content:center}

/* Final */
.mya-land .final{position:relative;z-index:2;text-align:center;padding:20px 22px 88px}
.mya-land .finalbox{max-width:840px;margin:0 auto;background:linear-gradient(160deg,var(--sage),var(--sage2));color:var(--cream);border-radius:34px;padding:60px 28px;box-shadow:0 50px 100px -50px rgba(43,58,50,.7)}
.mya-land .finalbox h2{color:var(--cream)}
.mya-land .finalbox .lead{color:rgba(244,241,234,.85)}
.mya-land .final-mark{width:50px;height:50px;color:var(--mint-soft);margin:0 auto 14px}
.mya-land .finalbox .btn-primary{background:var(--cream);color:var(--sage)}
.mya-land .finalbox .btn-primary:hover{background:#fff}

/* Footer */
.mya-land footer{position:relative;z-index:2;border-top:1px solid var(--line);padding:28px 0;color:var(--muted);font-size:13px;background:var(--cream2)}
.mya-land .footin{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px}
.mya-land .footin .brand .mark{width:26px;height:26px}
.mya-land .footin .wordmark{font-size:19px}
.mya-land .foot-links a{margin-left:18px;color:var(--muted)}
.mya-land .foot-links a:hover{color:var(--sage)}

@media (max-width:900px){
  .mya-land .hero{grid-template-columns:1fr;padding:40px 22px}
  .mya-land .hero-visual{margin-top:20px;max-width:460px;margin-left:auto;margin-right:auto;width:100%}
  .mya-land .sub{max-width:100%}
  .mya-land .game{grid-template-columns:1fr;gap:26px}
  .mya-land .game-media{order:2;max-height:420px;aspect-ratio:16/11}
  .mya-land .grid3,.mya-land .steps,.mya-land .prices{grid-template-columns:1fr}
  .mya-land .gallery{grid-template-columns:1fr 1fr;grid-auto-rows:180px}
  .mya-land .gallery .g-tall{grid-row:span 2}
}
@media (max-width:520px){
  .mya-land .navin{padding:11px 18px}
  .mya-land .wordmark{font-size:19px}
  .mya-land .navbtns{gap:6px}
  .mya-land .navbtns .btn{padding:9px 13px;font-size:12.5px}
  .mya-land .promo{font-size:11.5px;padding:8px 14px}
  .mya-land .cta{flex-direction:column}
  .mya-land .cta .btn{width:100%;justify-content:center}
  .mya-land .fcard{transform:scale(.86)}
  .mya-land .fcard-top{left:-8px}
  .mya-land .fcard-mid{right:-8px}
  .mya-land .fcard-bot{left:-6px}
  .mya-land section{padding:54px 0}
  .mya-land .starcard{flex-direction:column;text-align:center}
  .mya-land .gallery{grid-template-columns:1fr;grid-auto-rows:200px}
  .mya-land .gallery .g-tall{grid-row:span 1}
}
@media (prefers-reduced-motion:reduce){
  .mya-land *{animation:none!important;transition:none!important}
  .mya-land .reveal{opacity:1;transform:none}
  .mya-land .reveal-img{clip-path:none;opacity:1}
}
`;
