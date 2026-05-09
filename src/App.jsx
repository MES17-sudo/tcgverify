// ═══════════════════════════════════════════════════════════════
//  TCGVerify v4
// ═══════════════════════════════════════════════════════════════
//  New in v4:
//  - Fixed header layout (no more logo overlap)
//  - Portrait camera orientation
//  - PDF bullet colour fix + text sanitisation
//  - Progress bar instead of dots
//  - Onboarding tour (first time users)
//  - Better error messages
//  - Scan history (Supabase scans table)
//  - Card identification (name, set, rarity)
//  - Condition grading (NM/LP/MP/HP/DMG)
//  - Estimated card value
//  - Example scans page
//  - Shorter system prompt, max_tokens 600
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── TIERS ─── */
const TIERS = {
  free:     { label:"Free",     limit:3,   price:null,     period:null },
  starter:  { label:"Starter",  limit:50,  price:"£3.99",  period:"month" },
  pro:      { label:"Pro",      limit:200, price:"£7.99",  period:"month" },
  business: { label:"Business", limit:600, price:"£14.99", period:"month" },
};
function effectiveTier(p) {
  if (!p || p.tier==="free") return "free";
  if (p.tier_expires_at && new Date(p.tier_expires_at) < new Date()) return "free";
  return p.tier;
}

/* ─── CONFIDENCE LEVELS ─── */
const CONF_LEVELS = [
  { min:90, max:100, label:"Very high confidence",  colour:"#4ade80", desc:"Multiple strong authentication markers identified. Assessment is highly reliable, though professional grading remains the definitive standard for high-value cards." },
  { min:75, max:89,  label:"High confidence",        colour:"#86efac", desc:"Key authentication markers align well with known genuine examples. Minor uncertainties exist but the overall assessment is considered reliable." },
  { min:60, max:74,  label:"Moderate confidence",    colour:"#E6B43C", desc:"Some consistent markers noted but areas of uncertainty remain. Treat as indicative only — a second scan or professional verification is recommended." },
  { min:40, max:59,  label:"Low confidence",         colour:"#fb923c", desc:"Image quality or card condition made assessment difficult. Retake the photo in good lighting before drawing conclusions." },
  { min:0,  max:39,  label:"Very low confidence",    colour:"#f87171", desc:"A reliable assessment was not possible from this image. Please retake with a clearer, well-lit photo." },
];
function getConfLevel(pct) { return CONF_LEVELS.find(l => pct >= l.min && pct <= l.max) || CONF_LEVELS[4]; }

/* ─── CONDITION LABELS ─── */
const CONDITIONS = {
  "Near Mint":         { short:"NM",  colour:"#4ade80", desc:"Virtually no wear. Suitable for grading." },
  "Lightly Played":    { short:"LP",  colour:"#86efac", desc:"Minor edge or surface wear. Still excellent condition." },
  "Moderately Played": { short:"MP",  colour:"#E6B43C", desc:"Visible wear on edges or surface. Still playable." },
  "Heavily Played":    { short:"HP",  colour:"#fb923c", desc:"Significant wear. Reduced value and gradability." },
  "Damaged":           { short:"DMG", colour:"#f87171", desc:"Major damage — creases, tears, or heavy marking." },
};

/* ─── TEXT SANITISER ─── */
function sanitise(str = "") {
  return str
    .replace(/[^\x20-\x7E\n\r£]/g, "") // remove non-printable except £
    .replace(/\*\*/g, "")               // remove markdown bold
    .replace(/#{1,6}\s/g, "")           // remove markdown headers
    .replace(/`/g, "")                  // remove backticks
    .trim();
}

/* ─── STYLES ─── */
const S = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}

.T{
  --bg:#07080d;--bg-surface:rgba(255,255,255,.028);--bg-cam:#0d0c15;
  --bg-modal:#0f0e1a;--bg-scan:rgba(255,255,255,.02);--bg-flag:rgba(255,255,255,.02);
  --border:#1e1d28;--border-soft:#2a2836;--border-flag:#1a1924;
  --text:#eceaf4;--text2:#b0adb8;--text3:#52505e;--text4:#3a3848;
  --gold:#E6B43C;--gold-h:#f0c84a;--gold-dim:rgba(230,180,60,.06);
  --gold-border:rgba(230,180,60,.2);--gold-ring:rgba(230,180,60,.15);
  --gold-logo:rgba(230,180,60,.04);--glow1:rgba(230,180,60,.07);
  --glow2:rgba(90,180,255,.05);--pip-empty:#1e1d28;
  --ghost-bg:transparent;--ghost-text:#9996a3;--ghost-text-h:#b0adb8;
  --auth-card:rgba(255,255,255,.025);--idle-text:#52505e;
}
.T.light{
  --bg:#f5f3ee;--bg-surface:rgba(0,0,0,.032);--bg-cam:#e2e0da;
  --bg-modal:#ffffff;--bg-scan:rgba(0,0,0,.02);--bg-flag:rgba(0,0,0,.02);
  --border:rgba(0,0,0,.1);--border-soft:rgba(0,0,0,.13);--border-flag:rgba(0,0,0,.07);
  --text:#1a1820;--text2:#4a4858;--text3:#7a7880;--text4:#aaa8b8;
  --gold:#b8860b;--gold-h:#c99a0f;--gold-dim:rgba(184,134,11,.07);
  --gold-border:rgba(184,134,11,.25);--gold-ring:rgba(184,134,11,.2);
  --gold-logo:rgba(184,134,11,.06);--glow1:rgba(184,134,11,.05);
  --glow2:rgba(60,130,200,.04);--pip-empty:rgba(0,0,0,.1);
  --ghost-bg:transparent;--ghost-text:#6a6878;--ghost-text-h:#4a4858;
  --auth-card:#ffffff;--idle-text:#7a7880;
}

body{font-family:'DM Sans',sans-serif;}
.T{min-height:100vh;background:var(--bg);color:var(--text);position:relative;overflow:hidden;}
.T::before{content:'';position:fixed;top:-30%;left:-10%;width:55vw;height:55vw;background:radial-gradient(circle,var(--glow1) 0%,transparent 65%);pointer-events:none;}
.T::after{content:'';position:fixed;bottom:-20%;right:-5%;width:45vw;height:45vw;background:radial-gradient(circle,var(--glow2) 0%,transparent 65%);pointer-events:none;}
.app{padding:1rem 1rem 4rem;position:relative;z-index:1;}
.agate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.wrap{max-width:700px;margin:0 auto;position:relative;z-index:1;}

/* ── HEADER v4 — fixed overlap ── */
.hdr{text-align:center;margin-bottom:1.5rem;}
.hdr-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px;}
.hdr-left{display:flex;align-items:center;gap:6px;flex:1;}
.user-avatar{width:26px;height:26px;border-radius:50%;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:var(--gold);flex-shrink:0;}
.user-email{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hdr-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.btn-signout{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;}
.btn-signout:hover{color:var(--text3);}
.theme-btn{width:28px;height:28px;border-radius:50%;border:0.5px solid var(--border);background:var(--bg-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.theme-btn:hover{border-color:var(--gold);background:var(--gold-dim);}
.theme-btn-float{position:fixed;top:1rem;right:1rem;z-index:50;width:36px;height:36px;border-radius:50%;border:0.5px solid var(--border);background:var(--bg-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;}
.logo-ring{width:48px;height:62px;border-radius:8px;border:1.5px solid var(--gold-ring);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;background:var(--gold-logo);}
.app-name{font-family:'Syne',sans-serif;font-size:1.9rem;font-weight:800;letter-spacing:2px;color:var(--text);line-height:1;}
.app-tag{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-top:3px;}

/* ── SCAN COUNTER ── */
.scan-counter{display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:.7rem 1rem;margin-bottom:1.25rem;}
.sc-label{font-size:12px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;}
.sc-pips{display:flex;gap:6px;}
.pip{width:24px;height:5px;border-radius:3px;background:var(--pip-empty);transition:background .3s;}
.pip.used{background:var(--gold);}
.sc-upgrade{font-size:12px;color:var(--gold);cursor:pointer;font-family:'DM Mono',monospace;text-decoration:underline;text-underline-offset:3px;border:none;background:none;}

/* ── STEPS ── */
.steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.step{padding:.6rem .5rem;border-radius:9px;border:0.5px solid var(--border);text-align:center;background:var(--bg-surface);cursor:pointer;}
.step.active{border-color:var(--gold);background:var(--gold-dim);}
.step.done{border-color:#3a6b4a;background:rgba(60,180,100,.04);}
.step.locked{opacity:.4;cursor:not-allowed;}
.step-num{font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;}
.step-name{font-size:13px;font-weight:500;color:var(--text2);margin-top:2px;}
.step.active .step-name{color:var(--gold);}
.step.done .step-name{color:#4ade80;}

/* ── CAPTURE ── */
.capture-panel{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:1.25rem;}
.cap-tabs{display:flex;border-bottom:0.5px solid var(--border);}
.cap-tab{flex:1;padding:.65rem;font-size:13px;text-align:center;cursor:pointer;color:var(--text3);border:none;background:none;font-family:'DM Sans',sans-serif;transition:color .15s,background .15s;}
.cap-tab.active{color:var(--gold);background:var(--gold-dim);}
.cap-body{padding:1.25rem;}

/* ── CAMERA BOX — portrait ── */
.cam-box{position:relative;width:100%;aspect-ratio:3/4;background:var(--bg-cam);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:0.5px dashed var(--border-soft);margin-bottom:1rem;max-height:420px;}
.cam-box video,.cam-box img{width:100%;height:100%;object-fit:contain;}
.cam-corner{position:absolute;width:20px;height:20px;border-color:var(--gold);border-style:solid;border-width:0;}
.cam-corner.tl{top:8px;left:8px;border-top-width:1.5px;border-left-width:1.5px;}
.cam-corner.tr{top:8px;right:8px;border-top-width:1.5px;border-right-width:1.5px;}
.cam-corner.bl{bottom:8px;left:8px;border-bottom-width:1.5px;border-left-width:1.5px;}
.cam-corner.br{bottom:8px;right:8px;border-bottom-width:1.5px;border-right-width:1.5px;}
.cam-idle-icon{font-size:36px;opacity:.3;}
.cam-idle-text{font-size:12px;color:var(--idle-text);font-family:'DM Mono',monospace;}
.cam-actions{display:flex;gap:8px;flex-wrap:wrap;}
.scan-running{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);animation:scanY 1.5s ease-in-out infinite;pointer-events:none;}
@keyframes scanY{0%{top:0}100%{top:100%}}
.hint{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:.5rem;line-height:1.5;}

/* ── BUTTONS ── */
.btn{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
.btn-gold{background:var(--gold);color:#07080d;}
.btn-gold:hover{background:var(--gold-h);}
.btn-ghost{background:var(--ghost-bg);border:0.5px solid var(--border-soft);color:var(--ghost-text);}
.btn-ghost:hover{border-color:var(--border);color:var(--ghost-text-h);}
.btn-sm{padding:7px 14px;font-size:12px;}
.btn:disabled{opacity:.35;cursor:not-allowed;}

/* ── PROGRESS BAR ── */
.progress-wrap{background:var(--bg-scan);border:0.5px solid var(--border);border-radius:14px;padding:1.5rem;margin-bottom:1.25rem;animation:fadeUp .3s ease;}
.progress-label{font-family:'DM Mono',monospace;font-size:12px;color:var(--text3);margin-bottom:12px;text-align:center;}
.progress-track{height:6px;background:var(--border);border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;background:var(--gold);border-radius:3px;transition:width .4s ease;}
.progress-steps{display:flex;justify-content:space-between;margin-top:8px;}
.progress-step{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;}
.progress-step.active{color:var(--gold);}

/* ── RESULTS ── */
.result-wrap{animation:fadeUp .4s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.verdict-bar{padding:1.25rem 1.5rem;display:flex;align-items:center;gap:14px;border-radius:14px 14px 0 0;}
.verdict-bar.auth{background:rgba(74,222,128,.1);border:0.5px solid rgba(74,222,128,.2);}
.verdict-bar.counter{background:rgba(248,113,113,.1);border:0.5px solid rgba(248,113,113,.2);}
.verdict-bar.inc{background:var(--gold-dim);border:0.5px solid var(--gold-border);}
.v-icon{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.auth .v-icon{background:rgba(74,222,128,.15);}
.counter .v-icon{background:rgba(248,113,113,.15);}
.inc .v-icon{background:var(--gold-dim);}
.v-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-family:'DM Mono',monospace;margin-bottom:2px;}
.auth .v-label{color:#4ade80;}.counter .v-label{color:#f87171;}.inc .v-label{color:var(--gold);}
.v-title{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:700;line-height:1.2;}
.auth .v-title{color:#4ade80;}.counter .v-title{color:#f87171;}.inc .v-title{color:var(--gold);}
.conf-wrap{margin-left:auto;text-align:right;cursor:pointer;}
.conf-n{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;line-height:1;}
.auth .conf-n{color:#4ade80;}.counter .conf-n{color:#f87171;}.inc .conf-n{color:var(--gold);}
.conf-l{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;}
.conf-tap{font-size:9px;color:var(--gold);font-family:'DM Mono',monospace;margin-top:2px;}
.result-body{background:var(--bg-scan);border:0.5px solid var(--border);border-top:none;border-radius:0 0 14px 14px;}
.result-section{padding:1rem 1.4rem;border-bottom:0.5px solid var(--border);}
.result-section:last-child{border-bottom:none;}
.sec-hdg{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text4);font-family:'DM Mono',monospace;margin-bottom:10px;}
.summary-text{font-size:13px;color:var(--text2);line-height:1.75;}

/* ── CARD INFO ROW ── */
.card-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;}
.card-info-item{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:8px;padding:8px 10px;}
.ci-label{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}
.ci-value{font-size:13px;color:var(--text);font-weight:500;}

/* ── CONDITION BADGE ── */
.condition-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;border:0.5px solid;}
.cond-dot{width:6px;height:6px;border-radius:50%;}

/* ── VALUE BADGE ── */
.value-badge{display:inline-flex;align-items:center;gap:6px;background:var(--gold-dim);border:0.5px solid var(--gold-border);border-radius:6px;padding:4px 10px;font-size:13px;font-weight:500;color:var(--gold);}

/* ── FLAGS ── */
.flag{display:flex;gap:9px;padding:9px 11px;border-radius:8px;background:var(--bg-flag);border:0.5px solid var(--border-flag);margin-bottom:8px;}
.flag-pip{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:7px;}
.pip-r{background:#f87171;}.pip-g{background:#4ade80;}.pip-y{background:var(--gold);}
.flag-txt{font-size:12.5px;color:var(--text3);line-height:1.6;}
.result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:1rem;align-items:center;}

/* ── SKELETON ── */
.skel{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-scan) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:6px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* ── CONF BAR ── */
.conf-bar-track{height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin:6px 0 10px;}
.conf-bar-fill{height:100%;border-radius:3px;transition:width .5s ease;}

/* ── AUTH GATE ── */
.auth-card{background:var(--auth-card);border:0.5px solid var(--border);border-radius:18px;padding:2.5rem 2rem;max-width:360px;width:100%;text-align:center;position:relative;z-index:1;}
.auth-title{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--text);margin-bottom:4px;letter-spacing:1px;}
.auth-sub{font-size:13px;color:var(--text3);margin-bottom:1.75rem;line-height:1.6;}
.auth-perks{text-align:left;margin-bottom:1.75rem;}
.perk{display:flex;gap:9px;align-items:center;font-size:13px;color:var(--text2);margin-bottom:8px;}
.perk-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0;}
.btn-google{width:100%;background:#fff;color:#1a1a1a;border:none;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'DM Sans',sans-serif;transition:background .15s;box-shadow:0 1px 3px rgba(0,0,0,.15);}
.btn-google:hover{background:#f0f0f0;}
.btn-google:disabled{opacity:.5;cursor:not-allowed;}
.auth-note{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:12px;line-height:1.6;}

/* ── MODALS ── */
.modal-bg{position:fixed;inset:0;background:rgba(7,8,13,.85);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;}
.T.light .modal-bg{background:rgba(200,198,194,.7);}
.modal{background:var(--bg-modal);border:0.5px solid var(--border);border-radius:18px;padding:2rem 1.75rem;max-width:440px;width:100%;text-align:center;max-height:90vh;overflow-y:auto;}
.modal-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gold);margin-bottom:6px;letter-spacing:1px;}
.modal-sub{font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:1.25rem;}
.modal-left{text-align:left;}
.modal-left h3{font-size:14px;font-weight:500;color:var(--text);margin:14px 0 5px;}
.modal-left p{font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:6px;}
.modal-left ul{font-size:13px;color:var(--text3);line-height:1.9;margin-left:18px;margin-bottom:6px;}
.modal-dismiss{font-size:12px;color:var(--text4);cursor:pointer;font-family:'DM Mono',monospace;background:none;border:none;margin-top:10px;text-decoration:underline;text-underline-offset:3px;}
.modal-dismiss:hover{color:var(--text3);}

/* ── PAYWALL ── */
.tier-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.tier-card{border:0.5px solid var(--border);border-radius:10px;padding:.85rem .6rem;cursor:pointer;transition:border-color .15s,background .15s;text-align:center;}
.tier-card:hover{border-color:var(--gold);background:var(--gold-dim);}
.tier-card.popular{border-color:var(--gold-border);background:var(--gold-dim);}
.tier-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px;}
.tier-price{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:var(--gold);line-height:1;}
.tier-period{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;}
.tier-scans{font-size:11px;color:var(--text3);margin-top:4px;}
.popular-badge{font-size:9px;background:var(--gold-dim);color:var(--gold);border-radius:4px;padding:2px 5px;font-family:'DM Mono',monospace;}

/* ── ONBOARDING TOUR ── */
.tour-bg{position:fixed;inset:0;background:rgba(7,8,13,.9);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem;}
.tour-card{background:var(--bg-modal);border:0.5px solid var(--gold-border);border-radius:18px;padding:2rem 1.75rem;max-width:380px;width:100%;text-align:center;}
.tour-step{font-size:11px;color:var(--gold);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:10px;}
.tour-icon{font-size:44px;margin-bottom:14px;}
.tour-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text);margin-bottom:8px;}
.tour-desc{font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:1.5rem;}
.tour-dots{display:flex;justify-content:center;gap:6px;margin-bottom:1.25rem;}
.tour-dot{width:6px;height:6px;border-radius:50%;background:var(--border);}
.tour-dot.active{background:var(--gold);}

/* ── SCAN HISTORY ── */
.history-item{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.history-verdict{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.history-info{flex:1;}
.history-card-name{font-size:13px;font-weight:500;color:var(--text);}
.history-meta{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px;}
.history-conf{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;}
.history-empty{text-align:center;padding:2rem;font-size:13px;color:var(--text3);}

/* ── EXAMPLE SCANS ── */
.example-card{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px;}
.example-header{padding:12px 16px;display:flex;align-items:center;gap:10px;}
.example-badge{font-size:10px;font-family:'DM Mono',monospace;letter-spacing:1px;padding:3px 8px;border-radius:4px;text-transform:uppercase;}
.example-body{padding:10px 16px 14px;font-size:12px;color:var(--text3);line-height:1.6;border-top:0.5px solid var(--border);}

/* ── TIPS ── */
.tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;}
.tip-card{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:12px;}
.tip-icon{font-size:20px;margin-bottom:6px;}
.tip-title{font-size:12px;font-weight:500;color:var(--text);margin-bottom:3px;}
.tip-desc{font-size:11px;color:var(--text3);line-height:1.5;}

/* ── FAQ ── */
.faq-item{border:0.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:8px;}
.faq-q{padding:12px 14px;font-size:13px;font-weight:500;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);}
.faq-q:hover{background:var(--gold-dim);}
.faq-a{padding:0 14px;font-size:13px;color:var(--text3);line-height:1.7;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;}
.faq-a.open{max-height:200px;padding:12px 14px;}

/* ── PWA BANNER ── */
.pwa-banner{position:fixed;bottom:0;left:0;right:0;z-index:90;padding:12px 16px;background:var(--bg-modal);border-top:0.5px solid var(--gold-border);display:flex;align-items:center;gap:12px;animation:slideUp .3s ease;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.pwa-icon{width:40px;height:40px;border-radius:9px;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;}
.pwa-text{flex:1;}
.pwa-title{font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px;}
.pwa-sub{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;}
.pwa-actions{display:flex;gap:6px;flex-shrink:0;}

/* ── FOOTER ── */
.footer-nav{display:flex;justify-content:center;gap:14px;margin-top:1.5rem;flex-wrap:wrap;}
.footer-link{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}
.footer-link:hover{color:var(--text3);}
.disclaimer{text-align:center;font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:1rem;line-height:1.7;}
.err-box{background:rgba(248,113,113,.08);border:0.5px solid rgba(248,113,113,.2);border-radius:10px;padding:12px 16px;font-size:13px;color:#f87171;margin-bottom:1rem;}
.analyse-row{display:flex;gap:10px;align-items:center;margin-bottom:1.25rem;}
.page-view{animation:fadeUp .3s ease;}
.page-hdr{display:flex;align-items:center;gap:10px;margin-bottom:1.5rem;}
.page-back{background:none;border:none;cursor:pointer;color:var(--gold);font-size:20px;padding:0;}
.page-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text);}
`;

/* ─── AI SYSTEM PROMPT ─── */
const SYSTEM_PROMPT = `You are a trading card authentication and grading specialist. Analyse the card image(s) and respond in this EXACT format with no extra text:

CARD: [Full card name or "Unable to identify"]
SET: [Set name or "Unknown"]
RARITY: [Rarity or "Unknown"]
CONDITION: [Near Mint / Lightly Played / Moderately Played / Heavily Played / Damaged]
VALUE: [Estimated market value e.g. "£15-25" or "Unable to estimate"]
VERDICT: [HIGHLY LIKELY AUTHENTIC / CHARACTERISTICS MATCH KNOWN COUNTERFEITS / INCONCLUSIVE — PROFESSIONAL REVIEW ADVISED]
CONFIDENCE: [0-100]%
SUMMARY: [2-3 sentences. Never use "fake", "genuine", "real". Use "consistent with authenticated specimens", "aligns with known reproductions", "deviates from official standards".]
FLAGS:
- [Observation about print quality, fonts, colour, holographic pattern, card stock, alignment, symbols, copyright, card back]
- [Observation 2]
- [Observation 3]
- [Observation 4]
- [Observation 5 if needed]`;

/* ─── HELPERS ─── */
function toBase64(f) {
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = e => res({ base64:e.target.result.split(",")[1], mediaType:f.type, preview:e.target.result });
    r.onerror = () => rej();
    r.readAsDataURL(f);
  });
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, "is"));
  return m ? sanitise(m[1].trim()) : "";
}
function parseVerdict(t) {
  const u = t.toUpperCase();
  if (u.includes("HIGHLY LIKELY AUTHENTIC")) return "auth";
  if (u.includes("CHARACTERISTICS MATCH")) return "counter";
  return "inc";
}
function parseConf(t) { const m = t.match(/CONFIDENCE:\s*(\d{1,3})/i); return m ? parseInt(m[1]) : 70; }
function parseFlags(t) {
  const m = t.match(/FLAGS:([\s\S]+)/i); if (!m) return [];
  return m[1].split("\n")
    .map(l => sanitise(l.replace(/^[-•*\d.]+\s*/, "").trim()))
    .filter(l => l.length > 10).slice(0,7)
    .map(text => ({ text, type: text.toLowerCase().match(/inconsistent|deviates|unofficial|concern|misalign|poor|thin|blurry/) ? "r" : text.toLowerCase().match(/consistent|aligns|matches|correct|high quality|sharp/) ? "g" : "y" }));
}

/* ─── FRIENDLY ERRORS ─── */
function friendlyError(msg = "") {
  if (msg.includes("credit") || msg.includes("billing")) return "Your API credits need topping up — check console.anthropic.com";
  if (msg.includes("model")) return "The AI model name needs updating — check your App.jsx model string";
  if (msg.includes("rate")) return "Too many requests — please wait a moment and try again";
  if (msg.includes("network") || msg.includes("fetch")) return "Connection issue — check your internet and try again";
  if (msg.includes("api key") || msg.includes("auth")) return "API key issue — check your Vercel environment variables";
  return "Something went wrong — please try again. If it keeps happening, check your Anthropic console.";
}

/* ─── LOGO ─── */
function Logo({ gold = "#E6B43C" }) {
  const b = { fill:"none", stroke:gold, strokeWidth:1.1, opacity:0.55, strokeLinecap:"round" };
  return (
    <svg width="34" height="48" viewBox="0 0 38 54" fill="none">
      <rect x="1" y="1" width="36" height="52" rx="5" stroke={gold} strokeWidth="1.8"/>
      <line x1="1" y1="9" x2="37" y2="9" stroke={gold} strokeWidth="0.5" opacity="0.2"/>
      <path d="M6,6 L6,11 M6,6 L11,6"     {...b}/>
      <path d="M32,6 L32,11 M32,6 L27,6"  {...b}/>
      <path d="M6,48 L6,43 M6,48 L11,48"  {...b}/>
      <path d="M32,48 L32,43 M32,48 L27,48" {...b}/>
      <path d="M11,29 L17,36 L28,21" fill="none" stroke={gold} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function SunIcon({ color }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="19.8" y1="4.2" x2="17.7" y2="6.3"/><line x1="6.3" y1="17.7" x2="4.2" y2="19.8"/></svg>; }
function MoonIcon({ color }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>; }
function ThemeBtn({ theme, onToggle, float = false }) {
  const gold = theme === "light" ? "#b8860b" : "#E6B43C";
  return <button className={float ? "theme-btn-float" : "theme-btn"} onClick={onToggle} aria-label="Toggle theme">{theme === "dark" ? <SunIcon color={gold}/> : <MoonIcon color={gold}/>}</button>;
}

/* ─── PROGRESS BAR ─── */
function ScanProgress() {
  const [pct, setPct] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const steps = ["Examining image", "Analysing print quality", "Checking fonts & colours", "Assessing holographics", "Generating verdict"];
  useEffect(() => {
    const interval = setInterval(() => {
      setPct(p => {
        const next = p + (100 - p) * 0.08;
        const capped = Math.min(next, 94);
        setStepIdx(Math.floor((capped / 100) * steps.length));
        return capped;
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="progress-wrap">
      <p className="progress-label">{steps[Math.min(stepIdx, steps.length - 1)]}…</p>
      <div className="progress-track"><div className="progress-fill" style={{ width:`${pct}%` }}/></div>
      <div className="progress-steps">
        {steps.map((s,i) => <span key={i} className={`progress-step${i <= stepIdx ? " active" : ""}`}>{i+1}</span>)}
      </div>
    </div>
  );
}

/* ─── ONBOARDING TOUR ─── */
const TOUR_STEPS = [
  { icon:"🃏", title:"Welcome to TCGVerify", desc:"AI-powered trading card authentication for Pokémon, Magic, Yu-Gi-Oh!, and more. Your first 3 scans are completely free." },
  { icon:"📸", title:"Take a photo", desc:"Photograph the front of your card — lay it flat in good lighting and fill the frame. Adding the back gives a more accurate result." },
  { icon:"🔍", title:"AI analyses your card", desc:"Our AI checks print quality, fonts, colours, holographic patterns, and more against thousands of authenticated specimens." },
  { icon:"✓", title:"Get your verdict", desc:"Receive a detailed verdict with confidence score, card identification, condition grade, and estimated market value." },
];
function OnboardingTour({ onDone }) {
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  return (
    <div className="tour-bg">
      <div className="tour-card">
        <div className="tour-step">Step {step+1} of {TOUR_STEPS.length}</div>
        <div className="tour-icon">{s.icon}</div>
        <h2 className="tour-title">{s.title}</h2>
        <p className="tour-desc">{s.desc}</p>
        <div className="tour-dots">
          {TOUR_STEPS.map((_,i) => <div key={i} className={`tour-dot${i===step?" active":""}`}/>)}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={() => isLast ? onDone() : setStep(s => s+1)}>
          {isLast ? "Let's go →" : "Next →"}
        </button>
        {step > 0 && <button className="modal-dismiss" onClick={() => setStep(s => s-1)}>← Back</button>}
        {step === 0 && <button className="modal-dismiss" onClick={onDone}>Skip tour</button>}
      </div>
    </div>
  );
}

/* ─── DISCLAIMER ─── */
function DisclaimerModal({ onAccept }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
        <h2 className="modal-title">Before You Begin</h2>
        <p className="modal-sub">Please read this important notice about TCGVerify.</p>
        <div style={{ textAlign:"left", background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:10, padding:"1rem", marginBottom:"1.25rem" }}>
          {["TCGVerify provides AI-generated assessments for reference purposes only.","Results are not a substitute for professional grading services such as PSA, BGS, or CGC.","For high-value cards, always obtain a professional grading opinion before buying or selling.","Confidence scores reflect image quality — not a guarantee of authenticity.","Estimated values are indicative only — check TCGPlayer or eBay for live prices."].map((t,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:8, fontSize:13, color:"var(--text2)", lineHeight:1.6 }}>
              <span style={{ color:"var(--gold)", flexShrink:0 }}>•</span><span>{t}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={onAccept}>I understand — continue</button>
        <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginTop:10 }}>This notice will not show again</p>
      </div>
    </div>
  );
}

/* ─── TIPS MODAL ─── */
function TipsModal({ onClose }) {
  const tips = [
    { icon:"💡", title:"Good lighting", desc:"Natural daylight or a desk lamp. Avoid flash — it causes glare on holographic cards." },
    { icon:"📐", title:"Lay it flat", desc:"Place on a plain flat surface. Any curve or angle affects the analysis." },
    { icon:"🔍", title:"Fill the frame", desc:"The card should fill most of the photo with all four edges visible." },
    { icon:"🚫", title:"Avoid reflections", desc:"Tilt your phone slightly to prevent the camera reflecting on the surface." },
    { icon:"🔄", title:"Both sides", desc:"Front and back together give a significantly more accurate result." },
    { icon:"📸", title:"Keep steady", desc:"Blurry images reduce confidence. Rest your hand on a surface if needed." },
  ];
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title">📸 Photo Tips</h2>
        <p className="modal-sub">Better photos = more accurate results</p>
        <div className="tips-grid">
          {tips.map((t,i) => <div key={i} className="tip-card"><div className="tip-icon">{t.icon}</div><div className="tip-title">{t.title}</div><div className="tip-desc">{t.desc}</div></div>)}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ─── CONFIDENCE EXPLAINER ─── */
function ConfidenceModal({ confidence, onClose }) {
  const level = getConfLevel(confidence);
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title">What does {confidence}% mean?</h2>
        <div style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:12, padding:"1rem 1.25rem", marginBottom:"1.25rem", textAlign:"left" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"2.2rem", fontWeight:800, color:level.colour }}>{confidence}%</span>
            <span style={{ fontSize:13, fontWeight:500, color:level.colour }}>{level.label}</span>
          </div>
          <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width:`${confidence}%`, background:level.colour }}/></div>
          <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7 }}>{level.desc}</p>
        </div>
        <div style={{ textAlign:"left", marginBottom:"1.25rem" }}>
          {CONF_LEVELS.map((l,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:l.colour, flexShrink:0 }}/>
              <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace", width:55 }}>{l.min}–{l.max}%</span>
              <span style={{ fontSize:12, color:"var(--text2)" }}>{l.label}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ─── PAYWALL ─── */
function PaywallModal({ onDismiss, onSelect }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
        <h2 className="modal-title">Unlock More Scans</h2>
        <p className="modal-sub">You've used your free scans. Choose a plan to keep authenticating.</p>
        <div className="tier-grid">
          {[{key:"starter",popular:false},{key:"pro",popular:true},{key:"business",popular:false}].map(({key,popular}) => {
            const t = TIERS[key];
            return <div key={key} className={`tier-card${popular?" popular":""}`} onClick={() => onSelect(key)}>
              {popular && <div className="popular-badge">POPULAR</div>}
              <div className="tier-label">{t.label}</div>
              <div className="tier-price">{t.price}</div>
              <div className="tier-period">/{t.period}</div>
              <div className="tier-scans">{t.limit} scans</div>
            </div>;
          })}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={() => onSelect("pro")}>Get started →</button>
        <br/><button className="modal-dismiss" onClick={onDismiss}>Maybe later</button>
      </div>
    </div>
  );
}

/* ─── AUTH GATE ─── */
function AuthGate({ onSignIn, loading, theme, onToggle }) {
  const gold = theme === "light" ? "#b8860b" : "#E6B43C";
  return (
    <div className="agate">
      <ThemeBtn theme={theme} onToggle={onToggle} float/>
      <div className="auth-card">
        <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}><Logo gold={gold}/></div>
        <h1 className="auth-title">TCG<span style={{ color:gold }}>Verify</span></h1>
        <p className="auth-sub">AI-powered trading card authentication. Free to try — no card required.</p>
        <div className="auth-perks">
          {["3 free scans when you sign up","Card name, set & rarity identification","Condition grading + estimated value","Detailed authentication breakdown"].map(p => <div key={p} className="perk"><span className="perk-dot"/>{p}</div>)}
        </div>
        <button className="btn-google" onClick={onSignIn} disabled={loading}><GoogleIcon/>{loading ? "Signing in…" : "Continue with Google"}</button>
        <p className="auth-note">Scan count is tied to your account —<br/>incognito and cache clears won't reset your free scans.</p>
      </div>
    </div>
  );
}

/* ─── CAMERA HOOK ─── */
function useCam(vRef) {
  const [on, setOn] = useState(false);
  const start = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" }, audio:false });
      vRef.current.srcObject = s; vRef.current.play(); setOn(true);
    } catch { alert("Camera unavailable — please upload an image instead."); }
  }, [vRef]);
  const stop = useCallback(() => { vRef.current?.srcObject?.getTracks().forEach(t=>t.stop()); if(vRef.current) vRef.current.srcObject=null; setOn(false); }, [vRef]);
  const capture = useCallback(() => { const c=document.createElement("canvas"); c.width=vRef.current.videoWidth; c.height=vRef.current.videoHeight; c.getContext("2d").drawImage(vRef.current,0,0); return c.toDataURL("image/jpeg",.92); }, [vRef]);
  return { on, start, stop, capture };
}

/* ─── CAPTURE PANEL ─── */
function CapturePanel({ label, image, onCapture, onClear, onShowTips }) {
  const [mode, setMode] = useState("idle");
  const vRef = useRef(null), fRef = useRef(null);
  const { on, start, stop, capture } = useCam(vRef);
  const doCapture = () => { const d=capture(); stop(); setMode("captured"); onCapture({ base64:d.split(",")[1], mediaType:"image/jpeg", preview:d }); };
  const doFile = async f => { if(!f||!f.type.startsWith("image/")) return; const d=await toBase64(f); setMode("captured"); onCapture(d); };
  const doClear = () => { stop(); setMode("idle"); onClear(); };
  return (
    <div style={{ marginBottom:"1rem" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:"1px" }}>{label}</span>
        <button className="btn btn-ghost btn-sm" onClick={onShowTips} style={{ fontSize:10, padding:"4px 10px" }}>📸 Photo tips</button>
      </div>
      <div className="cam-box">
        <div className="cam-corner tl"/><div className="cam-corner tr"/><div className="cam-corner bl"/><div className="cam-corner br"/>
        {mode==="idle"     && <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}><span className="cam-idle-icon">🃏</span><span className="cam-idle-text">No image captured</span></div>}
        {mode==="camera"   && <video ref={vRef} playsInline muted style={{ width:"100%",height:"100%",objectFit:"cover" }}/>}
        {mode==="captured" && image && <img src={image.preview} alt={label}/>}
        {mode==="camera"   && <div className="scan-running"/>}
      </div>
      <div className="cam-actions">
        {mode==="idle"     && (<><button className="btn btn-gold btn-sm" onClick={() => { setMode("camera"); start(); }}>📷 Camera</button><button className="btn btn-ghost btn-sm" onClick={() => fRef.current.click()}>⬆ Upload</button><input ref={fRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>doFile(e.target.files[0])}/></>)}
        {mode==="camera"   && on && (<><button className="btn btn-gold btn-sm" onClick={doCapture}>⬤ Capture</button><button className="btn btn-ghost btn-sm" onClick={() => { stop(); setMode("idle"); }}>Cancel</button></>)}
        {mode==="captured" && <button className="btn btn-ghost btn-sm" onClick={doClear}>✕ Retake</button>}
      </div>
      {mode==="idle" && <p className="hint">{label.includes("Back") ? "Ensure the full card back is visible." : "Ensure the full card front is visible."}</p>}
    </div>
  );
}

/* ─── VIDEO PANEL ─── */
function VideoPanel({ isPro, video, onVideo, onClear }) {
  const fRef = useRef(null);
  const hFile = f => { if(!f||!f.type.startsWith("video/")) return; const p=URL.createObjectURL(f); const r=new FileReader(); r.onload=e=>onVideo({ base64:e.target.result.split(",")[1], mediaType:f.type, preview:p, name:f.name }); r.readAsDataURL(f); };
  if (!isPro) return (
    <div style={{ padding:"1.5rem", textAlign:"center" }}>
      <div style={{ fontSize:32, marginBottom:8, opacity:.4 }}>🎬</div>
      <div className="popular-badge" style={{ marginBottom:10 }}>Pro Feature</div>
      <div style={{ fontSize:14, fontWeight:500, color:"var(--text2)", marginBottom:6 }}>Holographic Video Analysis</div>
      <div style={{ fontSize:12, color:"var(--text3)", lineHeight:1.6, marginBottom:8 }}>Upload a 3-second video tilting the card under light. AI analyses holographic consistency.</div>
      <div style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", lineHeight:1.7 }}>How to record: Hold at eye level → tilt slowly left to right → let the holo catch light.</div>
    </div>
  );
  return (
    <div style={{ padding:"1.25rem" }}>
      <p style={{ fontSize:12, color:"var(--text3)", marginBottom:10, lineHeight:1.6 }}>📽 Record 3 seconds of the card tilting. AI assesses holographic consistency.</p>
      {!video ? (
        <div style={{ border:"1.5px dashed var(--border-soft)", borderRadius:10, padding:"2rem", textAlign:"center", cursor:"pointer", position:"relative" }} onClick={() => fRef.current.click()}>
          <input ref={fRef} type="file" accept="video/*" style={{ display:"none" }} onChange={e=>hFile(e.target.files[0])}/>
          <span style={{ fontSize:28 }}>🎬</span>
          <p style={{ fontSize:13, color:"var(--text3)", marginTop:8 }}>Tap to upload video (max 10MB)</p>
          <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginTop:4 }}>MP4, MOV, WEBM · max 3 seconds</p>
        </div>
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:".75rem 1rem", background:"var(--bg-surface)", borderRadius:8, border:"0.5px solid var(--border)" }}>
          <span style={{ fontSize:20 }}>🎬</span>
          <span style={{ fontSize:13, color:"var(--text2)", fontFamily:"'DM Mono',monospace", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{video.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClear}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ─── STEPS ─── */
function Steps({ active, frontDone, backDone, videoDone, isPro }) {
  return (
    <div className="steps">
      {[{id:"front",label:"Front"},{id:"back",label:"Back"},{id:"video",label:"Holo Video",pro:true}].map((s,i) => {
        const done = s.id==="front"?frontDone:s.id==="back"?backDone:videoDone;
        const locked = s.pro && !isPro;
        return <div key={s.id} className={locked?"step locked":done?"step done":active===s.id?"step active":"step"}>
          <div className="step-num">Step {i+1}{s.pro?" · Pro":""}</div>
          <div className="step-name">{done?"✓ ":""}{s.label}</div>
        </div>;
      })}
    </div>
  );
}

/* ─── PDF GENERATOR (fixed) ─── */
function generatePDF(result, userEmail) {
  const vLabel = { auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vColour = { auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const level = getConfLevel(result.confidence);
  const condInfo = CONDITIONS[result.condition] || null;

  // sanitise all fields for PDF
  const safeSummary = sanitise(result.summary);
  const safeFlags = result.flags.map(f => ({ ...f, text:sanitise(f.text) }));
  const flagColour = { r:"#f87171", g:"#4ade80", y:"#E6B43C" };

  const html = `<html><head><style>
    body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;color:#1a1820;}
    .header{text-align:center;border-bottom:2px solid #E6B43C;padding-bottom:20px;margin-bottom:24px;}
    .logo{font-size:26px;font-weight:900;letter-spacing:2px;color:#1a1820;}
    .logo span{color:#E6B43C;}
    .subtitle{font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-top:4px;}
    .date{font-size:11px;color:#888;margin-top:6px;}
    .verdict-box{border-radius:8px;padding:16px 20px;margin-bottom:20px;border:1px solid ${vColour[result.verdict]}33;background:${vColour[result.verdict]}11;}
    .verdict-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${vColour[result.verdict]};margin-bottom:4px;}
    .verdict-title{font-size:18px;font-weight:700;color:${vColour[result.verdict]};}
    .conf-row{display:flex;align-items:baseline;gap:8px;margin-top:8px;}
    .conf-num{font-size:28px;font-weight:900;color:${level.colour};}
    .conf-label{font-size:12px;color:#888;}
    .section{margin-bottom:18px;}
    .section-title{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#aaa;margin-bottom:8px;border-bottom:0.5px solid #eee;padding-bottom:4px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;}
    .info-item{background:#f8f8f5;border-radius:6px;padding:8px 10px;}
    .info-label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}
    .info-value{font-size:13px;font-weight:500;color:#1a1820;}
    .cond-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;background:${condInfo?condInfo.colour+"22":"#eee"};color:${condInfo?condInfo.colour:"#888"};}
    .value-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;background:#E6B43C22;color:#b8860b;}
    .summary{font-size:13px;line-height:1.7;color:#444;}
    .flag{display:flex;gap:8px;margin-bottom:8px;font-size:12px;color:#555;line-height:1.5;}
    .flag-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px;}
    .footer{margin-top:32px;padding-top:16px;border-top:0.5px solid #eee;font-size:10px;color:#aaa;text-align:center;line-height:1.7;}
  </style></head><body>
    <div class="header">
      <div class="logo">TCG<span>Verify</span></div>
      <div class="subtitle">Trading Card Authentication</div>
      <div class="date">Scanned by ${sanitise(userEmail)} &middot; ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
    </div>
    <div class="verdict-box">
      <div class="verdict-label">Authentication Result</div>
      <div class="verdict-title">${vLabel[result.verdict]}</div>
      <div class="conf-row"><div class="conf-num">${result.confidence}%</div><div class="conf-label">${level.label}</div></div>
    </div>
    ${result.cardName || result.cardSet || result.cardRarity ? `
    <div class="section">
      <div class="section-title">Card Identification</div>
      <div class="info-grid">
        ${result.cardName ? `<div class="info-item"><div class="info-label">Card Name</div><div class="info-value">${sanitise(result.cardName)}</div></div>` : ""}
        ${result.cardSet  ? `<div class="info-item"><div class="info-label">Set</div><div class="info-value">${sanitise(result.cardSet)}</div></div>` : ""}
        ${result.cardRarity ? `<div class="info-item"><div class="info-label">Rarity</div><div class="info-value">${sanitise(result.cardRarity)}</div></div>` : ""}
      </div>
    </div>` : ""}
    ${result.condition || result.estimatedValue ? `
    <div class="section">
      <div class="section-title">Condition &amp; Value</div>
      ${result.condition ? `<div style="margin-bottom:8px;"><div class="info-label" style="font-size:10px;color:#aaa;margin-bottom:4px;">CONDITION</div><span class="cond-badge">${sanitise(result.condition)}</span></div>` : ""}
      ${result.estimatedValue ? `<div><div class="info-label" style="font-size:10px;color:#aaa;margin-bottom:4px;">EST. MARKET VALUE</div><span class="value-badge">${sanitise(result.estimatedValue)}</span></div>` : ""}
    </div>` : ""}
    ${safeSummary ? `<div class="section"><div class="section-title">Summary</div><div class="summary">${safeSummary}</div></div>` : ""}
    ${safeFlags.length > 0 ? `<div class="section"><div class="section-title">Analysis Breakdown</div>${safeFlags.map(f=>`<div class="flag"><div class="flag-dot" style="background:${flagColour[f.type]||"#E6B43C"};"></div><span>${f.text}</span></div>`).join("")}</div>` : ""}
    <div class="footer">
      TCGVerify provides indicative assessments only &middot; Not a substitute for professional grading<br/>
      Estimated values are based on AI training data and may not reflect current market prices<br/>
      Always verify with PSA, BGS, or CGC for high-value cards
    </div>
  </body></html>`;

  const blob = new Blob([html], { type:"text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tcgverify-${Date.now()}.html`;
  a.click(); URL.revokeObjectURL(url);
}

/* ─── RESULT ─── */
function Result({ result, onReset, userEmail, gold }) {
  const [showConf, setShowConf] = useState(false);
  const vLabel = { auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vIcon  = { auth:"✓", counter:"✗", inc:"?" };
  const condInfo = CONDITIONS[result.condition] || null;
  const shareText = `I just authenticated a trading card with TCGVerify AI — ${vLabel[result.verdict]} (${result.confidence}% confidence). Check yours at tcgverify.ai`;
  return (
    <div className="result-wrap">
      {showConf && <ConfidenceModal confidence={result.confidence} onClose={() => setShowConf(false)}/>}
      <div className={`verdict-bar ${result.verdict}`}>
        <div className="v-icon">{vIcon[result.verdict]}</div>
        <div><div className="v-label">Authentication Result</div><div className="v-title">{vLabel[result.verdict]}</div></div>
        <div className="conf-wrap" onClick={() => setShowConf(true)} title="Tap to explain">
          <div className="conf-n">{result.confidence}%</div>
          <div className="conf-l">Confidence</div>
          <div className="conf-tap">Tap to explain ↗</div>
        </div>
      </div>
      <div className="result-body">
        {/* Card ID */}
        {(result.cardName || result.cardSet || result.cardRarity) && (
          <div className="result-section">
            <div className="sec-hdg">Card Identification</div>
            <div className="card-info-grid">
              {result.cardName && <div className="card-info-item"><div className="ci-label">Card Name</div><div className="ci-value">{result.cardName}</div></div>}
              {result.cardSet  && <div className="card-info-item"><div className="ci-label">Set</div><div className="ci-value">{result.cardSet}</div></div>}
              {result.cardRarity && <div className="card-info-item"><div className="ci-label">Rarity</div><div className="ci-value">{result.cardRarity}</div></div>}
            </div>
          </div>
        )}
        {/* Condition + Value */}
        {(result.condition || result.estimatedValue) && (
          <div className="result-section">
            <div className="sec-hdg">Condition &amp; Value</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              {result.condition && condInfo && (
                <div className="condition-badge" style={{ borderColor:condInfo.colour+"44", color:condInfo.colour }}>
                  <div className="cond-dot" style={{ background:condInfo.colour }}/>
                  <span style={{ fontSize:13, fontWeight:500 }}>{result.condition}</span>
                  <span style={{ fontSize:11, opacity:.7 }}>({condInfo.short})</span>
                </div>
              )}
              {result.estimatedValue && result.estimatedValue !== "Unable to estimate" && (
                <div className="value-badge">💰 {result.estimatedValue}</div>
              )}
            </div>
            {result.condition && condInfo && <p style={{ fontSize:12, color:"var(--text3)", marginTop:8 }}>{condInfo.desc}</p>}
          </div>
        )}
        {/* Summary */}
        {result.summary && <div className="result-section"><p className="summary-text">{result.summary}</p></div>}
        {/* Flags */}
        {result.flags.length > 0 && (
          <div className="result-section">
            <div className="sec-hdg">Detailed Analysis Breakdown</div>
            {result.flags.map((f,i) => <div key={i} className="flag"><div className={`flag-pip pip-${f.type}`}/><p className="flag-txt">{f.text}</p></div>)}
          </div>
        )}
      </div>
      <div className="result-actions">
        <button className="btn btn-ghost btn-sm" onClick={onReset}>← Scan another</button>
        <button className="btn btn-ghost btn-sm" onClick={() => generatePDF(result, userEmail)}>⬇ PDF</button>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>𝕏 Share</a>
        <a href={`https://reddit.com/submit?title=${encodeURIComponent("TCGVerify result")}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>Reddit</a>
      </div>
    </div>
  );
}

/* ─── SCAN HISTORY PAGE ─── */
function HistoryPage({ onBack, userId }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const vColour = { auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const vLabel  = { auth:"Authentic", counter:"Counterfeit characteristics", inc:"Inconclusive" };

  useEffect(() => {
    supabase.from("scans").select("*").eq("user_id", userId).order("created_at", { ascending:false }).limit(50)
      .then(({ data }) => { setScans(data || []); setLoading(false); });
  }, [userId]);

  return (
    <div className="page-view">
      <div className="page-hdr">
        <button className="page-back" onClick={onBack}>←</button>
        <h2 className="page-title">Scan History</h2>
      </div>
      {loading ? (
        <div style={{ display:"flex", gap:7, justifyContent:"center", padding:"2rem" }}>
          {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"var(--gold)", opacity:.4, animation:"dp 1.2s ease-in-out infinite", animationDelay:`${i*.2}s` }}/>)}
        </div>
      ) : scans.length === 0 ? (
        <div className="history-empty">
          <div style={{ fontSize:36, marginBottom:10 }}>🃏</div>
          <p>No scans yet — authenticate your first card!</p>
        </div>
      ) : (
        scans.map((s,i) => (
          <div key={i} className="history-item">
            <div className="history-verdict" style={{ background:vColour[s.verdict]||"#E6B43C" }}/>
            <div className="history-info">
              <div className="history-card-name">{s.card_name || "Unknown card"}</div>
              <div className="history-meta">
                {s.card_set && `${s.card_set} · `}
                {s.condition_grade && `${s.condition_grade} · `}
                {new Date(s.created_at).toLocaleDateString("en-GB")}
              </div>
              <div style={{ fontSize:11, color:vColour[s.verdict]||"#E6B43C", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{vLabel[s.verdict]||"Inconclusive"}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div className="history-conf" style={{ color:vColour[s.verdict]||"#E6B43C" }}>{s.confidence}%</div>
              {s.estimated_value && s.estimated_value !== "Unable to estimate" && (
                <div style={{ fontSize:11, color:"var(--gold)", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{s.estimated_value}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── EXAMPLE SCANS PAGE ─── */
function ExamplesPage({ onBack }) {
  const examples = [
    {
      verdict:"auth", conf:94, card:"Charizard VMAX", set:"Brilliant Stars", rarity:"Secret Rare",
      condition:"Near Mint", value:"£85–120",
      summary:"Print characteristics are highly consistent with authenticated specimens from this set. Holographic foil behaviour aligns precisely with official production standards. Font metrics and colour saturation fall within expected tolerances.",
      flags:[
        { type:"g", text:"Print dot pattern under magnification is consistent with official Pokémon TCG production standards." },
        { type:"g", text:"Holographic foil exhibits the characteristic rainbow shift expected from authentic specimens of this era." },
        { type:"g", text:"Card stock weight and texture are consistent with genuine examples — light test shows appropriate opacity." },
        { type:"y", text:"Minor centering deviation noted — within acceptable variance for this print run." },
      ]
    },
    {
      verdict:"counter", conf:88, card:"Pikachu VMAX", set:"Vivid Voltage", rarity:"Full Art",
      condition:"Lightly Played", value:"Unable to estimate",
      summary:"Several characteristics of this specimen deviate from authenticated examples. Print quality and font metrics exhibit markers commonly associated with unofficial reproductions. Professional review is strongly recommended before any transaction.",
      flags:[
        { type:"r", text:"Font weight on HP value is visibly thinner than authenticated specimens — a common indicator of unofficial printing." },
        { type:"r", text:"Colour saturation appears washed out compared to genuine examples, particularly in the yellow tones." },
        { type:"r", text:"Card back design shows subtle misalignment inconsistent with official production standards." },
        { type:"y", text:"Image quality limits definitive assessment of holographic elements — physical inspection recommended." },
      ]
    },
    {
      verdict:"inc", conf:58, card:"Unable to identify", set:"Unknown", rarity:"Unknown",
      condition:"Moderately Played", value:"Unable to estimate",
      summary:"Image quality and card condition made a definitive assessment difficult. Several markers were identified but significant uncertainty remains. A higher quality photograph or physical inspection is recommended.",
      flags:[
        { type:"y", text:"Image is slightly out of focus — key authentication markers such as font and print dots could not be clearly assessed." },
        { type:"y", text:"Card surface wear makes holographic pattern assessment unreliable from this image." },
        { type:"r", text:"Visible crease across the card surface reduces gradability regardless of authenticity." },
      ]
    },
  ];
  const vColour = { auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const vLabel  = { auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vIcon   = { auth:"✓", counter:"✗", inc:"?" };

  return (
    <div className="page-view">
      <div className="page-hdr">
        <button className="page-back" onClick={onBack}>←</button>
        <h2 className="page-title">Example Scans</h2>
      </div>
      <p style={{ fontSize:13, color:"var(--text3)", marginBottom:16, lineHeight:1.6 }}>Here's what TCGVerify results look like across different scenarios — authentic cards, suspected counterfeits, and inconclusive results.</p>
      {examples.map((e,i) => {
        const condInfo = CONDITIONS[e.condition] || null;
        return (
          <div key={i} style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, overflow:"hidden", marginBottom:16 }}>
            <div className={`verdict-bar ${e.verdict}`}>
              <div className="v-icon">{vIcon[e.verdict]}</div>
              <div><div className="v-label">Example Result</div><div className="v-title">{vLabel[e.verdict]}</div></div>
              <div className="conf-wrap" style={{ cursor:"default" }}>
                <div className="conf-n">{e.conf}%</div>
                <div className="conf-l">Confidence</div>
              </div>
            </div>
            <div className="result-body">
              <div className="result-section">
                <div className="sec-hdg">Card Identification</div>
                <div className="card-info-grid">
                  <div className="card-info-item"><div className="ci-label">Card Name</div><div className="ci-value">{e.card}</div></div>
                  <div className="card-info-item"><div className="ci-label">Set</div><div className="ci-value">{e.set}</div></div>
                  {e.rarity !== "Unknown" && <div className="card-info-item"><div className="ci-label">Rarity</div><div className="ci-value">{e.rarity}</div></div>}
                </div>
              </div>
              <div className="result-section">
                <div className="sec-hdg">Condition &amp; Value</div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                  {condInfo && <div className="condition-badge" style={{ borderColor:condInfo.colour+"44", color:condInfo.colour }}><div className="cond-dot" style={{ background:condInfo.colour }}/><span style={{ fontSize:13, fontWeight:500 }}>{e.condition}</span></div>}
                  {e.value !== "Unable to estimate" && <div className="value-badge">💰 {e.value}</div>}
                </div>
              </div>
              <div className="result-section"><p className="summary-text">{e.summary}</p></div>
              <div className="result-section">
                <div className="sec-hdg">Analysis Breakdown</div>
                {e.flags.map((f,j) => <div key={j} className="flag"><div className={`flag-pip pip-${f.type}`}/><p className="flag-txt">{f.text}</p></div>)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── FAQ PAGE ─── */
function FAQPage({ onBack }) {
  const [open, setOpen] = useState(null);
  const faqs = [
    { q:"How accurate is TCGVerify?", a:"TCGVerify uses Claude AI to analyse visual markers in your card photo. Accuracy depends on image quality — a well-lit, in-focus photo of both sides typically yields 80-95% confidence. It is most reliable as a quick first check, not a replacement for professional grading." },
    { q:"Which card games does it support?", a:"TCGVerify works with all major TCGs including Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece TCG, Digimon, and Dragon Ball Super. Pokémon and Magic have the highest accuracy due to the volume of documented counterfeits." },
    { q:"What does the confidence score mean?", a:"The confidence score reflects how certain the AI is about its assessment based on the image provided. 90%+ is very high confidence, 75-89% is high, 60-74% is moderate, and below 60% suggests image quality is limiting the analysis. Tap the score on any result to see a full explanation." },
    { q:"How accurate is the card value estimate?", a:"Estimated values are based on the AI's training data and are indicative only. Prices change regularly — always check TCGPlayer, eBay sold listings, or CardMarket for current market prices before buying or selling." },
    { q:"Can I bypass the free scan limit?", a:"No — the scan limit is tracked against your Google account in our secure database. Clearing cookies, using incognito, or using a VPN will not reset your free scans." },
    { q:"Are my card images stored?", a:"Card images are sent to the AI for analysis and are not stored by TCGVerify. Your scan count, subscription tier, and scan history are stored securely. We do not retain images after analysis." },
    { q:"TCGVerify said authentic but a dealer says fake — why?", a:"TCGVerify is an AI tool and results are indicative only. Professional graders physically handle cards and use tools like UV lights and specialised equipment we cannot replicate from a photo. Always defer to a professional grader for high-value cards." },
  ];
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">FAQ</h2></div>
      {faqs.map((f,i) => (
        <div key={i} className="faq-item">
          <div className="faq-q" onClick={() => setOpen(open===i?null:i)}>
            <span>{f.q}</span><span style={{ color:"var(--gold)", fontSize:16 }}>{open===i?"−":"+"}</span>
          </div>
          <div className={`faq-a${open===i?" open":""}`}>{f.a}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── LEGAL PAGES ─── */
function TermsPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Terms &amp; Conditions</h2></div>
      <div className="modal-left" style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, padding:"1.25rem" }}>
        <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginBottom:14 }}>Last updated: {new Date().toLocaleDateString("en-GB",{year:"numeric",month:"long"})}</p>
        {[{h:"1. Service description",p:"TCGVerify provides AI-powered trading card authentication assessments for informational purposes only."},{h:"2. Limitation of liability",p:"TCGVerify accepts no liability for financial loss arising from reliance on our assessments. Always seek professional grading for high-value transactions."},{h:"3. Accuracy disclaimer",p:"AI analysis is dependent on image quality and card condition. We make no warranties regarding accuracy. Confidence scores reflect AI certainty, not a guarantee."},{h:"4. User accounts",p:"Users must sign in with a valid Google account. Each account receives 3 free scans. Paid plans are billed monthly and may be cancelled at any time."},{h:"5. Acceptable use",p:"TCGVerify may only be used for card authentication purposes. Automated access or abuse of the free scan limit is prohibited."},{h:"6. Changes",p:"We reserve the right to update these terms at any time. Continued use constitutes acceptance of updated terms."}].map((s,i) => <div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

function PrivacyPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Privacy Policy</h2></div>
      <div className="modal-left" style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, padding:"1.25rem" }}>
        <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginBottom:14 }}>Last updated: {new Date().toLocaleDateString("en-GB",{year:"numeric",month:"long"})}</p>
        {[{h:"What we collect",p:"Your Google account email and profile information when you sign in. Your scan count, subscription tier, and scan history in our secure database. Card images are transmitted to our AI provider for analysis only and are not stored."},{h:"How we use your data",p:"Your email is used solely to identify your account. We do not sell, share, or use your data for marketing. We do not use your data to train AI models."},{h:"Third parties",p:"We use Supabase for auth and storage, Anthropic Claude API for AI analysis, and Stripe for payments. Each maintains their own privacy policy."},{h:"Your rights",p:"You may request deletion of your account and data at any time. We will respond to all requests within 30 days."}].map((s,i) => <div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

/* ─── PWA INSTALL BANNER ─── */
function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [iosVisible, setIosVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem("tcgv_pwa_dismissed"); } catch { return false; } });
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) { setInstalled(true); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    if (ios && !dismissed) { const t = setTimeout(() => setIosVisible(true), 4000); return () => clearTimeout(t); }
    const handler = e => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  const dismiss = () => { try { localStorage.setItem("tcgv_pwa_dismissed","1"); } catch {} setDismissed(true); setIosVisible(false); };
  const install = async () => { if(!prompt) return; prompt.prompt(); const { outcome } = await prompt.userChoice; setPrompt(null); if(outcome==="accepted") dismiss(); };

  if (installed || dismissed) return null;

  if (prompt) return (
    <div className="pwa-banner">
      <div className="pwa-icon">🃏</div>
      <div className="pwa-text"><div className="pwa-title">Add TCGVerify to home screen</div><div className="pwa-sub">Instant access — no app store needed</div></div>
      <div className="pwa-actions"><button className="btn btn-gold btn-sm" onClick={install}>Add</button><button className="btn btn-ghost btn-sm" onClick={dismiss}>✕</button></div>
    </div>
  );

  if (isIOS && iosVisible) return (
    <div className="pwa-banner" style={{ flexDirection:"column", alignItems:"flex-start", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, width:"100%" }}>
        <div className="pwa-icon">🃏</div>
        <div className="pwa-text"><div className="pwa-title">Add to your home screen</div><div className="pwa-sub">Instant access every time</div></div>
        <button className="btn btn-ghost btn-sm" onClick={dismiss} style={{ flexShrink:0 }}>✕</button>
      </div>
      <div style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:8, padding:"10px 12px", width:"100%", fontSize:12, color:"var(--text2)", lineHeight:1.7 }}>
        Tap the <strong>Share button ⎙</strong> at the bottom → <strong>"Add to Home Screen"</strong> → <strong>"Add"</strong>
      </div>
    </div>
  );

  return null;
}

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────── */
export default function App() {
  /* ── theme ── */
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("tcgv_theme")||"dark"; } catch { return "dark"; } });
  const toggleTheme = () => setTheme(t => { const n=t==="dark"?"light":"dark"; try{ localStorage.setItem("tcgv_theme",n); }catch{} return n; });
  const gold = theme === "light" ? "#b8860b" : "#E6B43C";

  /* ── modals/tours ── */
  const [showDisclaimer, setShowDisclaimer] = useState(() => { try { return !localStorage.getItem("tcgv_disclaimed"); } catch { return true; } });
  const [showTour,       setShowTour]       = useState(false);
  const [showTips,       setShowTips]       = useState(false);
  const [showPaywall,    setShowPaywall]     = useState(false);

  const acceptDisclaimer = () => {
    try { localStorage.setItem("tcgv_disclaimed","1"); } catch {}
    setShowDisclaimer(false);
    const seenTour = localStorage.getItem("tcgv_tour_done");
    if (!seenTour) setShowTour(true);
  };
  const doneTour = () => { try { localStorage.setItem("tcgv_tour_done","1"); } catch {} setShowTour(false); };

  /* ── page routing ── */
  const [page, setPage] = useState("home");

  /* ── auth ── */
  const [user,        setUser]        = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  /* ── scan ── */
  const [step,     setStep]     = useState("front");
  const [front,    setFront]    = useState(null);
  const [back,     setBack]     = useState(null);
  const [video,    setVideo]    = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => { setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else setAuthLoading(false); });
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else { setProfile(null); setAuthLoading(false); } });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async uid => { const { data, error } = await supabase.from("profiles").select("scan_count,tier,tier_expires_at").eq("id",uid).single(); if(!error&&data) setProfile(data); setAuthLoading(false); };
  const signIn  = async () => { setAuthLoading(true); await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:window.location.origin } }); };
  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setProfile(null); setResult(null); };

  const tier      = effectiveTier(profile);
  const tierInfo  = TIERS[tier];
  const scanCount = profile?.scan_count ?? 0;
  const isPro     = tier !== "free";
  const remaining = Math.max(0, tierInfo.limit - scanCount);

  /* ── analyse ── */
  const analyse = async () => {
    if (remaining <= 0) { setShowPaywall(true); return; }
    if (!front) { setError("Please capture the front of your card first."); return; }
    setScanning(true); setError(null); setResult(null);
    try {
      const content = [
        { type:"image", source:{ type:"base64", media_type:front.mediaType, data:front.base64 } },
        { type:"text",  text:"Card front image." },
      ];
      if (back) { content.push({ type:"image", source:{ type:"base64", media_type:back.mediaType, data:back.base64 } }, { type:"text", text:"Card back image." }); }
      let prompt = back ? "Authenticate this card. Front and back provided." : "Authenticate this card.";
      if (video) prompt += " Holographic video also provided.";
      content.push({ type:"text", text:prompt });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true",
        },
        body: JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:600, system:SYSTEM_PROMPT, messages:[{ role:"user", content }] })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content.map(c=>c.text||"").join("\n");

      const r = {
        verdict:       parseVerdict(text),
        confidence:    parseConf(text),
        cardName:      parseField(text, "CARD"),
        cardSet:       parseField(text, "SET"),
        cardRarity:    parseField(text, "RARITY"),
        condition:     parseField(text, "CONDITION"),
        estimatedValue:parseField(text, "VALUE"),
        summary:       sanitise(parseField(text, "SUMMARY")),
        flags:         parseFlags(text),
      };

      /* save to Supabase scans table */
      await supabase.from("scans").insert({
        user_id:         user.id,
        verdict:         r.verdict,
        confidence:      r.confidence,
        card_name:       r.cardName || null,
        card_set:        r.cardSet  || null,
        card_rarity:     r.cardRarity || null,
        condition_grade: r.condition || null,
        estimated_value: r.estimatedValue || null,
        summary:         r.summary || null,
      });

      /* increment scan count */
      const newCount = scanCount + 1;
      await supabase.from("profiles").update({ scan_count:newCount }).eq("id", user.id);
      setProfile(p => ({ ...p, scan_count:newCount }));
      setResult(r);
      if (!isPro && newCount >= TIERS.free.limit) setTimeout(() => setShowPaywall(true), 2000);

    } catch(e) {
      setError(friendlyError(e.message || ""));
    } finally { setScanning(false); }
  };

  const reset = () => { setFront(null); setBack(null); setVideo(null); setResult(null); setError(null); setStep("front"); };

  /* ── loading ── */
  if (authLoading) return (
    <div className={`T${theme==="light"?" light":""}`} style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{S}</style>
      <div style={{ display:"flex", gap:7 }}>{[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:gold, opacity:.4, animation:"dp 1.2s ease-in-out infinite", animationDelay:`${i*.2}s` }}/>)}</div>
    </div>
  );

  /* ── auth gate ── */
  if (!user) return <><style>{S}</style><div className={`T${theme==="light"?" light":""}`}><AuthGate onSignIn={signIn} loading={authLoading} theme={theme} onToggle={toggleTheme}/></div></>;

  /* ── main ── */
  return (
    <div className={`T${theme==="light"?" light":""}`}>
      <style>{S}</style>

      {showDisclaimer && <DisclaimerModal onAccept={acceptDisclaimer}/>}
      {showTour       && <OnboardingTour onDone={doneTour}/>}
      {showTips       && <TipsModal onClose={() => setShowTips(false)}/>}
      {showPaywall    && <PaywallModal onDismiss={() => setShowPaywall(false)} onSelect={t => { setShowPaywall(false); alert(`Stripe integration coming soon — ${TIERS[t].label} plan selected!`); }}/>}
      <InstallBanner/>

      <div className="app">
        <div className="wrap">

          {/* ── HEADER v4 — no overlap ── */}
          <div className="hdr">
            <div className="hdr-top">
              <div className="hdr-left">
                <div className="user-avatar">{user.email?.[0]?.toUpperCase()}</div>
                <span className="user-email">{user.email}</span>
              </div>
              <div className="hdr-right">
                <ThemeBtn theme={theme} onToggle={toggleTheme}/>
                <button className="btn-signout" onClick={signOut}>Sign out</button>
              </div>
            </div>
            <div className="logo-ring"><Logo gold={gold}/></div>
            <h1 className="app-name">TCG<span style={{ color:gold }}>Verify</span></h1>
            <p className="app-tag">Trading Card Authentication · AI-Powered</p>
          </div>

          {/* ── PAGE ROUTING ── */}
          {page==="history"  && <HistoryPage onBack={() => setPage("home")} userId={user.id}/>}
          {page==="examples" && <ExamplesPage onBack={() => setPage("home")}/>}
          {page==="faq"      && <FAQPage onBack={() => setPage("home")}/>}
          {page==="terms"    && <TermsPage onBack={() => setPage("home")}/>}
          {page==="privacy"  && <PrivacyPage onBack={() => setPage("home")}/>}

          {page==="home" && <>
            {/* SCAN COUNTER */}
            <div className="scan-counter">
              <span className="sc-label">{isPro ? `${tierInfo.label} · ${remaining} scans left` : `${remaining} free scan${remaining!==1?"s":""} remaining`}</span>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {tier==="free" && <div className="sc-pips">{[0,1,2].map(i=><div key={i} className={`pip${i<scanCount?" used":""}`}/>)}</div>}
                <button className="sc-upgrade" onClick={() => setShowPaywall(true)}>{isPro?"Change plan ↗":"Upgrade ↗"}</button>
              </div>
            </div>

            {scanning ? <ScanProgress/> : !result ? (
              <>
                <Steps active={step} frontDone={!!front} backDone={!!back} videoDone={!!video} isPro={isPro}/>
                <div className="capture-panel">
                  <div className="cap-tabs">
                    {["front","back","video"].map(s => (
                      <button key={s} className={`cap-tab${step===s?" active":""}`} onClick={() => setStep(s)} style={s==="video"&&!isPro?{opacity:.5}:{}}>
                        {s==="front"?"🃏 Front":s==="back"?"🔄 Back":"🎬 Holo Video"}
                      </button>
                    ))}
                  </div>
                  <div className="cap-body">
                    {step==="front" && <CapturePanel label="Card Front" image={front} onCapture={d=>{setFront(d);setStep("back");}} onClear={()=>setFront(null)} onShowTips={()=>setShowTips(true)}/>}
                    {step==="back"  && <CapturePanel label="Card Back"  image={back}  onCapture={d=>{setBack(d);setStep(isPro?"video":"front");}} onClear={()=>setBack(null)} onShowTips={()=>setShowTips(true)}/>}
                    {step==="video" && <VideoPanel isPro={isPro} video={video} onVideo={setVideo} onClear={()=>setVideo(null)}/>}
                  </div>
                </div>
                <div className="analyse-row">
                  <button className="btn btn-gold" style={{ flex:1, justifyContent:"center", padding:"12px" }} onClick={analyse} disabled={!front||scanning}>
                    {`Analyse card${back?" (front + back)":" (front only)"}`}
                  </button>
                  {(front||back) && <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>}
                </div>
                {error && <div className="err-box">⚠ {error}</div>}
              </>
            ) : (
              <Result result={result} onReset={reset} userEmail={user.email} gold={gold}/>
            )}
          </>}

          {/* FOOTER */}
          <div className="footer-nav">
            <button className="footer-link" onClick={() => setPage("history")}>Scan History</button>
            <button className="footer-link" onClick={() => setPage("examples")}>Example Scans</button>
            <button className="footer-link" onClick={() => setPage("faq")}>FAQ</button>
            <button className="footer-link" onClick={() => setShowTips(true)}>Photo Tips</button>
            <button className="footer-link" onClick={() => setPage("terms")}>Terms</button>
            <button className="footer-link" onClick={() => setPage("privacy")}>Privacy</button>
          </div>
          <p className="disclaimer">
            TCGVerify provides indicative assessments only · Not a substitute for professional grading<br/>
            Card values are estimates only · Always verify with a certified grader for high-value cards
          </p>
        </div>
      </div>
    </div>
  );
}
