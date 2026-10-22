/**
 * LoadingScreen — the full-page splash shown while Lacentra signs you in and loads your data.
 * Brand shield with a self-drawing check, a soft breathing glow, a rotating status line and a slim progress bar.
 * Large, high-contrast text. Respects "reduce motion". No images to download, so it paints instantly.
 */
import { useEffect, useState } from 'react'

const LINES = [
  'Securing your session…',
  'Loading your providers…',
  'Checking credentials and expirations…',
  'Almost ready…',
]

export function LoadingScreen({ label }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(n => Math.min(n + 1, LINES.length - 1)), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="ls-wrap" role="status" aria-live="polite" aria-label="Loading Lacentra">
      <style>{CSS}</style>
      <div className="ls-glow" aria-hidden="true" />
      <div className="ls-card">
        <div className="ls-mark" aria-hidden="true">
          <span className="ls-ring" />
          <span className="ls-ring ls-ring-2" />
          <svg viewBox="0 0 48 50" width="92" height="96" className="ls-shield">
            <defs>
              <linearGradient id="lsInd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6A62F2" /><stop offset="1" stopColor="#4338CA" /></linearGradient>
              <linearGradient id="lsGrn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#74CC74" /><stop offset="1" stopColor="#4BAA4B" /></linearGradient>
            </defs>
            <path d="M24 3L5 11V27C5 37 13 44 24 47V3Z" fill="url(#lsInd)" />
            <path d="M24 3L43 11V27C43 37 35 44 24 47V3Z" fill="url(#lsGrn)" />
            <polyline className="ls-check" points="13,26 21,34 35,18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <div className="ls-name"><span>LAC</span><b>entra</b></div>
        <div className="ls-tag">Credentialing, handled.</div>
        <div className="ls-line" key={i}>{label || LINES[i]}</div>
        <div className="ls-bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  )
}

const CSS = `
.ls-wrap{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#F8F9FD 0%,#EEF1FA 100%);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
.ls-glow{position:absolute;width:560px;height:560px;max-width:120vw;max-height:120vw;border-radius:50%;background:radial-gradient(circle,rgba(79,70,229,.16),rgba(92,184,92,.11) 45%,transparent 70%);animation:lsBreath 4.2s ease-in-out infinite}
.ls-card{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 24px;animation:lsIn .6s cubic-bezier(.2,.7,.2,1) both}
.ls-mark{position:relative;width:132px;height:132px;display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.ls-shield{filter:drop-shadow(0 10px 18px rgba(67,56,202,.30));animation:lsFloat 3.6s ease-in-out infinite}
.ls-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(79,70,229,.38);animation:lsRing 2.6s ease-out infinite}
.ls-ring-2{animation-delay:1.3s;border-color:rgba(92,184,92,.40)}
.ls-check{stroke-dasharray:44;stroke-dashoffset:44;animation:lsDraw 1.1s .35s cubic-bezier(.6,.1,.2,1) forwards,lsPulseCheck 2.8s 1.6s ease-in-out infinite}
.ls-name{font-size:32px;font-weight:800;letter-spacing:-.02em}.ls-name span{color:#4F46E5}.ls-name b{color:#4BAA4B;font-weight:800}
.ls-tag{font-size:14.5px;color:#4B556B;margin-top:4px}
.ls-line{margin-top:22px;min-height:22px;font-size:15px;font-weight:600;color:#26314F;animation:lsLine .5s ease both}
.ls-bar{width:min(260px,70vw);height:5px;border-radius:99px;background:rgba(15,27,61,.10);margin-top:14px;overflow:hidden}
.ls-bar span{display:block;height:100%;width:40%;border-radius:99px;background:linear-gradient(90deg,#4F46E5,#5CB85C);animation:lsSlide 1.5s ease-in-out infinite}
@keyframes lsIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes lsFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes lsBreath{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.07)}}
@keyframes lsRing{0%{transform:scale(.62);opacity:.9}100%{transform:scale(1.25);opacity:0}}
@keyframes lsDraw{to{stroke-dashoffset:0}}
@keyframes lsPulseCheck{0%,100%{opacity:1}50%{opacity:.78}}
@keyframes lsLine{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes lsSlide{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
@media (prefers-reduced-motion:reduce){.ls-wrap *{animation-duration:.01ms!important;animation-iteration-count:1!important}.ls-check{stroke-dashoffset:0}}
`
