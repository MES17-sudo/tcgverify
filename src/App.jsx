// ═══════════════════════════════════════════════════════════════
//  TCGVerify v3 — SETUP INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════
//  1. npm install @supabase/supabase-js
//  2. Create Supabase project at https://supabase.com
//  3. Run SQL from previous version to create profiles table
//  4. Enable Google OAuth in Supabase → Authentication → Providers
//  5. Replace env vars below (or use import.meta.env in prod)
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── TIER CONFIG ─── */
const TIERS = {
  free:     { label:"Free",     limit:3,   price:null,     period:null,    desc:"3 scans to try" },
  starter:  { label:"Starter",  limit:50,  price:"£3.99",  period:"month", desc:"50 scans / month" },
  pro:      { label:"Pro",      limit:200, price:"£7.99",  period:"month", desc:"200 scans / month" },
  business: { label:"Business", limit:600, price:"£14.99", period:"month", desc:"600 scans / month" },
};
function effectiveTier(p) {
  if (!p || p.tier === "free") return "free";
  if (p.tier_expires_at && new Date(p.tier_expires_at) < new Date()) return "free";
  return p.tier;
}

/* ─── CONFIDENCE EXPLANATION ─── */
const CONF_LEVELS = [
  { min:90, max:100, label:"Very high confidence",   colour:"#4ade80", desc:"The AI has identified multiple strong markers that are highly consistent with authenticated specimens. We strongly suggest this assessment is reliable, though professional grading remains the definitive standard for high-value cards." },
  { min:75, max:89,  label:"High confidence",         colour:"#86efac", desc:"Several key authentication markers align well with known genuine examples. Minor uncertainties exist — typically due to image angle or lighting — but the overall assessment is considered reliable." },
  { min:60, max:74,  label:"Moderate confidence",     colour:"#E6B43C", desc:"The AI identified some consistent markers but also noted areas of uncertainty. This result should be treated as indicative only. We recommend a second scan with better lighting or a closer photo, or professional verification." },
  { min:40, max:59,  label:"Low confidence",          colour:"#fb923c", desc:"Image quality, angle, or card condition made a definitive assessment difficult. The result may not be reliable. Please retake the photo in good lighting with the card flat and fully in frame." },
  { min:0,  max:39,  label:"Very low confidence",     colour:"#f87171", desc:"The AI was unable to make a reliable assessment from this image. Please retake with a clearer, well-lit photo before drawing any conclusions." },
];
function getConfLevel(pct) { return CONF_LEVELS.find(l => pct >= l.min && pct <= l.max) || CONF_LEVELS[4]; }

/* ─── STYLES ─── */
const S = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
.T{--bg:#07080d;--bg-surface:rgba(255,255,255,.028);--bg-cam:#0d0c15;--bg-modal:#0f0e1a;--bg-scan:rgba(255,255,255,.02);--bg-flag:rgba(255,255,255,.02);--border:#1e1d28;--border-soft:#2a2836;--border-flag:#1a1924;--text:#eceaf4;--text2:#b0adb8;--text3:#52505e;--text4:#3a3848;--gold:#E6B43C;--gold-h:#f0c84a;--gold-dim:rgba(230,180,60,.06);--gold-border:rgba(230,180,60,.2);--gold-ring:rgba(230,180,60,.15);--gold-logo:rgba(230,180,60,.04);--glow1:rgba(230,180,60,.07);--glow2:rgba(90,180,255,.05);--pip-empty:#1e1d28;--ghost-bg:transparent;--ghost-text:#9996a3;--ghost-text-h:#b0adb8;--auth-card:rgba(255,255,255,.025);--idle-text:#52505e;}
.T.light{--bg:#f5f3ee;--bg-surface:rgba(0,0,0,.032);--bg-cam:#e2e0da;--bg-modal:#ffffff;--bg-scan:rgba(0,0,0,.02);--bg-flag:rgba(0,0,0,.02);--border:rgba(0,0,0,.1);--border-soft:rgba(0,0,0,.13);--border-flag:rgba(0,0,0,.07);--text:#1a1820;--text2:#4a4858;--text3:#7a7880;--text4:#aaa8b8;--gold:#b8860b;--gold-h:#c99a0f;--gold-dim:rgba(184,134,11,.07);--gold-border:rgba(184,134,11,.25);--gold-ring:rgba(184,134,11,.2);--gold-logo:rgba(184,134,11,.06);--glow1:rgba(184,134,11,.05);--glow2:rgba(60,130,200,.04);--pip-empty:rgba(0,0,0,.1);--ghost-bg:transparent;--ghost-text:#6a6878;--ghost-text-h:#4a4858;--auth-card:#ffffff;--idle-text:#7a7880;}
body{font-family:'DM Sans',sans-serif;}
.T{min-height:100vh;background:var(--bg);color:var(--text);position:relative;overflow:hidden;}
.T::before{content:'';position:fixed;top:-30%;left:-10%;width:55vw;height:55vw;background:radial-gradient(circle,var(--glow1) 0%,transparent 65%);pointer-events:none;}
.T::after{content:'';position:fixed;bottom:-20%;right:-5%;width:45vw;height:45vw;background:radial-gradient(circle,var(--glow2) 0%,transparent 65%);pointer-events:none;}
.app{padding:1.5rem 1rem 4rem;position:relative;z-index:1;}
.agate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.wrap{max-width:700px;margin:0 auto;position:relative;z-index:1;}
.hdr{text-align:center;margin-bottom:2rem;position:relative;}
.logo-ring{width:52px;height:68px;border-radius:8px;border:1.5px solid var(--gold-ring);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;background:var(--gold-logo);}
.app-name{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;letter-spacing:2px;color:var(--text);line-height:1;}
.app-tag{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-top:3px;}
.hdr-controls{position:absolute;top:0;right:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
.user-avatar{width:28px;height:28px;border-radius:50%;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;color:var(--gold);}
.user-email{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.btn-signout{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;transition:color .15s,border-color .15s;}
.btn-signout:hover{color:var(--text3);border-color:var(--border-soft);}
.theme-btn{width:28px;height:28px;border-radius:50%;border:0.5px solid var(--border);background:var(--bg-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .15s,background .15s;flex-shrink:0;}
.theme-btn:hover{border-color:var(--gold);background:var(--gold-dim);}
.theme-btn-float{position:fixed;top:1rem;right:1rem;z-index:50;width:36px;height:36px;border-radius:50%;border:0.5px solid var(--border);background:var(--bg-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;}
.nav-btn{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;transition:color .15s,border-color .15s;}
.nav-btn:hover{color:var(--text2);border-color:var(--border-soft);}
.scan-counter{display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:.7rem 1rem;margin-bottom:1.5rem;}
.sc-label{font-size:12px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;}
.sc-pips{display:flex;gap:6px;}
.pip{width:28px;height:6px;border-radius:3px;background:var(--pip-empty);transition:background .3s;}
.pip.used{background:var(--gold);}
.sc-upgrade{font-size:12px;color:var(--gold);cursor:pointer;font-family:'DM Mono',monospace;text-decoration:underline;text-underline-offset:3px;border:none;background:none;}
.sc-upgrade:hover{color:var(--gold-h);}
.steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.step{padding:.6rem .5rem;border-radius:9px;border:0.5px solid var(--border);text-align:center;background:var(--bg-surface);cursor:pointer;transition:border-color .2s,background .2s;}
.step.active{border-color:var(--gold);background:var(--gold-dim);}
.step.done{border-color:#3a6b4a;background:rgba(60,180,100,.04);}
.step.locked{opacity:.4;cursor:not-allowed;}
.step-num{font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;}
.step-name{font-size:13px;font-weight:500;color:var(--text2);margin-top:2px;}
.step.active .step-name{color:var(--gold);}
.step.done .step-name{color:#4ade80;}
.capture-panel{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:1.25rem;}
.cap-tabs{display:flex;border-bottom:0.5px solid var(--border);}
.cap-tab{flex:1;padding:.65rem;font-size:13px;text-align:center;cursor:pointer;color:var(--text3);border:none;background:none;font-family:'DM Sans',sans-serif;transition:color .15s,background .15s;}
.cap-tab.active{color:var(--gold);background:var(--gold-dim);}
.cap-body{padding:1.25rem;}
.cam-box{position:relative;width:100%;aspect-ratio:5/3.5;background:var(--bg-cam);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:0.5px dashed var(--border-soft);margin-bottom:1rem;}
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
.btn{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
.btn-gold{background:var(--gold);color:#07080d;}
.btn-gold:hover{background:var(--gold-h);}
.btn-ghost{background:var(--ghost-bg);border:0.5px solid var(--border-soft);color:var(--ghost-text);}
.btn-ghost:hover{border-color:var(--border);color:var(--ghost-text-h);}
.btn-sm{padding:7px 14px;font-size:12px;}
.btn:disabled{opacity:.35;cursor:not-allowed;}
.video-locked{padding:1.5rem;text-align:center;}
.badge-pro{display:inline-block;background:var(--gold-dim);border:0.5px solid var(--gold-border);color:var(--gold);font-size:11px;font-family:'DM Mono',monospace;letter-spacing:1px;padding:3px 10px;border-radius:20px;text-transform:uppercase;margin-bottom:12px;}
.video-upload{padding:1.25rem;}
.video-drop{border:1.5px dashed var(--border-soft);border-radius:10px;padding:2rem;text-align:center;cursor:pointer;transition:border-color .2s;position:relative;}
.video-drop:hover{border-color:var(--gold);}
.video-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.video-preview{display:flex;align-items:center;gap:10px;padding:.75rem 1rem;background:var(--bg-surface);border-radius:8px;border:0.5px solid var(--border);}
.video-name{font-size:13px;color:var(--text2);font-family:'DM Mono',monospace;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.scanning-box{padding:2rem;text-align:center;background:var(--bg-scan);border:0.5px solid var(--border);border-radius:14px;margin-bottom:1.25rem;}
.dots{display:flex;justify-content:center;gap:7px;margin-bottom:12px;}
.d{width:7px;height:7px;border-radius:50%;background:var(--gold);animation:dp 1.2s ease-in-out infinite;}
.d:nth-child(2){animation-delay:.2s}.d:nth-child(3){animation-delay:.4s}
@keyframes dp{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
.scanning-msg{font-family:'DM Mono',monospace;font-size:12px;color:var(--text3);}
/* ── SKELETONS ── */
.skel{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-scan) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:6px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skel-text{height:14px;margin-bottom:8px;}
.skel-block{height:80px;margin-bottom:8px;}
.skel-title{height:20px;width:60%;margin-bottom:12px;}
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
.summary-sec{padding:1.1rem 1.4rem;border-bottom:0.5px solid var(--border);}
.summary-text{font-size:13.5px;color:var(--text2);line-height:1.75;}
.flags-sec{padding:1.1rem 1.4rem;}
.flags-hdg{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text4);font-family:'DM Mono',monospace;margin-bottom:12px;}
.flag{display:flex;gap:9px;padding:9px 11px;border-radius:8px;background:var(--bg-flag);border:0.5px solid var(--border-flag);margin-bottom:8px;}
.flag-pip{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:7px;}
.pip-r{background:#f87171;}.pip-g{background:#4ade80;}.pip-y{background:var(--gold);}
.flag-txt{font-size:12.5px;color:var(--text3);line-height:1.6;}
.result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:1rem;align-items:center;}
/* ── CONF EXPLAINER ── */
.conf-bar-wrap{margin:6px 0 10px;}
.conf-bar-track{height:6px;border-radius:3px;background:var(--border);overflow:hidden;}
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
.modal-title{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:var(--gold);margin-bottom:6px;letter-spacing:1px;}
.modal-sub{font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:1.25rem;}
.modal-dismiss{font-size:12px;color:var(--text4);cursor:pointer;font-family:'DM Mono',monospace;background:none;border:none;margin-top:10px;text-decoration:underline;text-underline-offset:3px;}
.modal-dismiss:hover{color:var(--text3);}
.modal-left{text-align:left;}
.modal-left h3{font-size:15px;font-weight:500;color:var(--text);margin:16px 0 6px;}
.modal-left p{font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:8px;}
.modal-left ul{font-size:13px;color:var(--text3);line-height:1.9;margin-left:18px;margin-bottom:8px;}
/* ── PAYWALL ── */
.tier-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.tier-card{border:0.5px solid var(--border);border-radius:10px;padding:.85rem .6rem;cursor:pointer;transition:border-color .15s,background .15s;text-align:center;}
.tier-card:hover{border-color:var(--gold);background:var(--gold-dim);}
.tier-card.popular{border-color:var(--gold-border);background:var(--gold-dim);}
.tier-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px;}
.tier-price{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:var(--gold);line-height:1;}
.tier-period{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;}
.tier-scans{font-size:11px;color:var(--text3);margin-top:4px;}
.popular-badge{font-size:9px;background:var(--gold-dim);color:var(--gold);border-radius:4px;padding:2px 5px;font-family:'DM Mono',monospace;letter-spacing:0.5px;}
/* ── TIPS SCREEN ── */
.tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;}
.tip-card{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:12px;text-align:left;}
.tip-icon{font-size:20px;margin-bottom:6px;}
.tip-title{font-size:12px;font-weight:500;color:var(--text);margin-bottom:3px;}
.tip-desc{font-size:11px;color:var(--text3);line-height:1.5;}
/* ── FAQ ── */
.faq-item{border:0.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:8px;}
.faq-q{padding:12px 14px;font-size:13px;font-weight:500;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);}
.faq-q:hover{background:var(--gold-dim);}
.faq-a{padding:0 14px;font-size:13px;color:var(--text3);line-height:1.7;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;}
.faq-a.open{max-height:200px;padding:12px 14px;}
/* ── PWA INSTALL BANNER ── */
.pwa-banner{position:fixed;bottom:0;left:0;right:0;z-index:90;padding:12px 16px;background:var(--bg-modal);border-top:0.5px solid var(--gold-border);display:flex;align-items:center;gap:12px;animation:slideUp .3s ease;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.pwa-icon{width:40px;height:40px;border-radius:9px;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;}
.pwa-text{flex:1;}
.pwa-title{font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px;}
.pwa-sub{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;line-height:1.4;}
.pwa-actions{display:flex;gap:6px;flex-shrink:0;}
/* ── FOOTER NAV ── */
.footer-nav{display:flex;justify-content:center;gap:16px;margin-top:1.5rem;flex-wrap:wrap;}
.footer-link{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}
.footer-link:hover{color:var(--text3);}
/* ── DISCLAIMER ── */
.disclaimer{text-align:center;font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:1rem;line-height:1.7;}
.err-box{background:rgba(248,113,113,.08);border:0.5px solid rgba(248,113,113,.2);border-radius:10px;padding:12px 16px;font-size:12px;color:#f87171;font-family:'DM Mono',monospace;margin-bottom:1rem;}
.analyse-row{display:flex;gap:10px;align-items:center;margin-bottom:1.25rem;}
/* ── PAGE VIEWS ── */
.page-view{animation:fadeUp .3s ease;}
.page-hdr{display:flex;align-items:center;gap:10px;margin-bottom:1.5rem;}
.page-back{background:none;border:none;cursor:pointer;color:var(--gold);font-size:20px;padding:0;}
.page-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text);}
`;

/* ─── AI SYSTEM PROMPT ─── */
const SYSTEM_PROMPT = `You are a forensic trading card authentication specialist with expertise in identifying genuine vs counterfeit collectible cards.

Respond in this EXACT format:

VERDICT: [HIGHLY LIKELY AUTHENTIC / CHARACTERISTICS MATCH KNOWN COUNTERFEITS / INCONCLUSIVE — PROFESSIONAL REVIEW ADVISED]
CONFIDENCE: [0-100]%
SUMMARY: [2-3 sentences using professional language. Avoid "fake"/"genuine". Use phrases like "consistent with authenticated specimens", "aligns with known reproductions", "deviates from official production standards".]
FLAGS:
- [Specific observation — print quality, fonts, colour, holographic pattern, card stock, text alignment, symbols, copyright text, card back, etc.]
- [Observation 2]
- [Observation 3]
- [Observation 4]
- [Observation 5 if applicable]`;

/* ─── HELPERS ─── */
function toBase64(f) { return new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res({ base64:e.target.result.split(",")[1], mediaType:f.type, preview:e.target.result }); r.onerror=()=>rej(); r.readAsDataURL(f); }); }
function parseVerdict(t) { const u=t.toUpperCase(); if(u.includes("HIGHLY LIKELY AUTHENTIC")) return "auth"; if(u.includes("CHARACTERISTICS MATCH")) return "counter"; return "inc"; }
function parseConf(t) { const m=t.match(/CONFIDENCE:\s*(\d{1,3})/i); return m?parseInt(m[1]):70; }
function parseSummary(t) { const m=t.match(/SUMMARY:\s*([\s\S]+?)(?=\nFLAGS:|\n-\s)/i); return m?m[1].trim():""; }
function parseFlags(t) {
  const m=t.match(/FLAGS:([\s\S]+)/i); if(!m) return [];
  return m[1].split("\n").map(l=>l.replace(/^[-•*\d.]+\s*/,"").trim()).filter(l=>l.length>15).slice(0,7)
    .map(text=>({ text, type:text.toLowerCase().match(/inconsistent|deviates|unofficial|reproduction|concern|misalign|poor|thin|blurry/)?"r":text.toLowerCase().match(/consistent|aligns|matches|in line|correct|high quality|sharp/)?"g":"y" }));
}

/* ─── LOGO ─── */
function Logo({ gold="#E6B43C" }) {
  const b={ fill:"none", stroke:gold, strokeWidth:1.1, opacity:0.55, strokeLinecap:"round" };
  return (
    <svg width="38" height="54" viewBox="0 0 38 54" fill="none">
      <rect x="1" y="1" width="36" height="52" rx="5" stroke={gold} strokeWidth="1.8"/>
      <line x1="1" y1="9" x2="37" y2="9" stroke={gold} strokeWidth="0.5" opacity="0.2"/>
      <path d="M6,6 L6,11 M6,6 L11,6" {...b}/><path d="M32,6 L32,11 M32,6 L27,6" {...b}/>
      <path d="M6,48 L6,43 M6,48 L11,48" {...b}/><path d="M32,48 L32,43 M32,48 L27,48" {...b}/>
      <path d="M11,29 L17,36 L28,21" fill="none" stroke={gold} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function SunIcon({ color }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="19.8" y1="4.2" x2="17.7" y2="6.3"/><line x1="6.3" y1="17.7" x2="4.2" y2="19.8"/></svg>; }
function MoonIcon({ color }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>; }

function ThemeBtn({ theme, onToggle, float=false }) {
  const gold=theme==="light"?"#b8860b":"#E6B43C";
  return <button className={float?"theme-btn-float":"theme-btn"} onClick={onToggle} aria-label="Toggle colour theme">{theme==="dark"?<SunIcon color={gold}/>:<MoonIcon color={gold}/>}</button>;
}

/* ─── SKELETON LOADER ─── */
function ScanSkeleton() {
  return (
    <div style={{ animation:"fadeUp .3s ease" }}>
      <div className="skel skel-title" style={{ marginBottom:16 }}/>
      <div style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, overflow:"hidden", marginBottom:12 }}>
        <div style={{ padding:"1.25rem 1.5rem", display:"flex", gap:14, alignItems:"center" }}>
          <div className="skel" style={{ width:42, height:42, borderRadius:"50%", flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <div className="skel skel-text" style={{ width:"40%", marginBottom:6 }}/>
            <div className="skel" style={{ height:20, width:"80%" }}/>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="skel" style={{ width:50, height:32, marginBottom:4 }}/>
            <div className="skel skel-text" style={{ width:50 }}/>
          </div>
        </div>
        <div style={{ padding:"1rem 1.5rem", borderTop:"0.5px solid var(--border)" }}>
          <div className="skel skel-text"/>
          <div className="skel skel-text" style={{ width:"80%" }}/>
          <div className="skel skel-text" style={{ width:"60%" }}/>
        </div>
        <div style={{ padding:"1rem 1.5rem", borderTop:"0.5px solid var(--border)" }}>
          <div className="skel skel-text" style={{ width:"40%", marginBottom:10 }}/>
          {[0,1,2,3].map(i=><div key={i} className="skel" style={{ height:36, marginBottom:8 }}/>)}
        </div>
      </div>
    </div>
  );
}

/* ─── DISCLAIMER POPUP (first use) ─── */
function DisclaimerModal({ onAccept }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        <div style={{ fontSize:32, marginBottom:10 }}>⚠️</div>
        <h2 className="modal-title">Before You Begin</h2>
        <p className="modal-sub">Please read this important notice about TCGVerify.</p>
        <div style={{ textAlign:"left", background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:10, padding:"1rem", marginBottom:"1.25rem" }}>
          {[
            "TCGVerify provides AI-generated assessments for reference purposes only.",
            "Results are not a substitute for professional grading services such as PSA, BGS, or CGC.",
            "For high-value cards, always obtain a professional grading opinion before buying or selling.",
            "Confidence scores reflect the AI's certainty based on image quality — not a guarantee of authenticity.",
            "Image quality, lighting, and angle significantly affect accuracy.",
          ].map((t,i) => (
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

/* ─── PHOTO TIPS MODAL ─── */
function TipsModal({ onClose }) {
  const tips = [
    { icon:"💡", title:"Use good lighting", desc:"Natural daylight or a desk lamp works best. Avoid flash — it creates glare on holographic cards." },
    { icon:"📐", title:"Lay the card flat", desc:"Place the card on a flat, plain surface. Any angle or curve distorts the AI's analysis." },
    { icon:"🔍", title:"Fill the frame", desc:"The card should take up most of the photo. Get close enough that all four edges are visible." },
    { icon:"🚫", title:"Avoid reflections", desc:"Tilt your phone slightly to avoid the camera reflecting on the card surface." },
    { icon:"🔄", title:"Capture both sides", desc:"Front and back together give a much more accurate result — the card back is a key authenticity marker." },
    { icon:"📸", title:"Keep it steady", desc:"Blurry images reduce confidence significantly. Rest your hand on a surface if needed." },
  ];
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title" style={{ marginBottom:6 }}>📸 Photo Tips</h2>
        <p className="modal-sub">Better photos = more accurate results</p>
        <div className="tips-grid">
          {tips.map((t,i) => (
            <div key={i} className="tip-card">
              <div className="tip-icon">{t.icon}</div>
              <div className="tip-title">{t.title}</div>
              <div className="tip-desc">{t.desc}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={onClose}>Got it — start scanning</button>
      </div>
    </div>
  );
}

/* ─── CONFIDENCE EXPLAINER MODAL ─── */
function ConfidenceModal({ confidence, onClose }) {
  const level = getConfLevel(confidence);
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title">What does {confidence}% mean?</h2>
        <p className="modal-sub">Understanding your confidence score</p>
        <div style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:12, padding:"1rem 1.25rem", marginBottom:"1.25rem", textAlign:"left" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"2.5rem", fontWeight:800, color:level.colour }}>{confidence}%</span>
            <span style={{ fontSize:14, fontWeight:500, color:level.colour }}>{level.label}</span>
          </div>
          <div className="conf-bar-wrap">
            <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width:`${confidence}%`, background:level.colour }}/></div>
          </div>
          <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.7 }}>{level.desc}</p>
        </div>
        <div style={{ textAlign:"left", marginBottom:"1.25rem" }}>
          <p style={{ fontSize:12, color:"var(--text3)", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Score guide</p>
          {CONF_LEVELS.map((l,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:l.colour, flexShrink:0 }}/>
              <span style={{ fontSize:12, color:"var(--text3)", fontFamily:"'DM Mono',monospace", width:60 }}>{l.min}–{l.max}%</span>
              <span style={{ fontSize:12, color:"var(--text2)" }}>{l.label}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center" }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ─── FAQ PAGE ─── */
function FAQPage({ onBack }) {
  const [open, setOpen] = useState(null);
  const faqs = [
    { q:"How accurate is TCGVerify?", a:"TCGVerify uses Claude AI to analyse visual markers in your card photo. Accuracy depends heavily on image quality — a well-lit, in-focus photo of both sides typically yields 80–95% confidence. It is most reliable as a quick first check, not a replacement for professional grading." },
    { q:"What cards can TCGVerify check?", a:"TCGVerify is optimised for Pokémon TCG cards but works with any trading card. The AI analyses print quality, font accuracy, colour saturation, holographic patterns, card stock markers, and other visual indicators common across TCG products." },
    { q:"What does the confidence score mean?", a:"The confidence score reflects how certain the AI is about its assessment based on the image provided. 90%+ is very high confidence, 75–89% is high, 60–74% is moderate, and below 60% suggests the image quality is limiting the analysis. Tap the score on any result to see a full explanation." },
    { q:"Can I beat the free scan limit?", a:"The free scan limit is tracked against your Google account in our secure database — not your browser. Clearing cookies, using incognito mode, or using a VPN will not reset your free scans. Each Google account receives 3 free scans." },
    { q:"What's the difference between the plans?", a:"All plans include the same AI analysis quality. The difference is the number of scans per month — Starter gives 50 scans, Pro gives 200, and Business gives 600. Pro users also get holographic video analysis." },
    { q:"Is my card data stored?", a:"Card images are sent to the AI for analysis and are not stored by TCGVerify. Your scan count and subscription tier are stored securely in our database. We do not retain images after analysis." },
    { q:"How should I photograph my card?", a:"Lay the card flat on a plain surface in good natural or desk light. Avoid flash as it creates glare on holographic surfaces. Fill the frame with the card and ensure all four edges are visible. Capture both front and back for the most accurate result." },
    { q:"TCGVerify said my card is authentic but a dealer says it's fake — why?", a:"TCGVerify is an AI tool and its results are indicative only. Professional graders physically handle cards and use tools like UV lights and specialised equipment that we cannot replicate from a photo. Always defer to a professional grader for high-value cards." },
  ];
  return (
    <div className="page-view">
      <div className="page-hdr">
        <button className="page-back" onClick={onBack}>←</button>
        <h2 className="page-title">Frequently Asked Questions</h2>
      </div>
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

/* ─── TERMS & CONDITIONS PAGE ─── */
function TermsPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr">
        <button className="page-back" onClick={onBack}>←</button>
        <h2 className="page-title">Terms & Conditions</h2>
      </div>
      <div className="modal-left" style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, padding:"1.25rem" }}>
        <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginBottom:16 }}>Last updated: {new Date().toLocaleDateString("en-GB", { year:"numeric", month:"long" })}</p>
        {[
          { h:"1. Service description", p:"TCGVerify provides AI-powered trading card authentication assessments. Results are generated algorithmically from photographic analysis and are provided for informational purposes only." },
          { h:"2. Limitation of liability", p:"TCGVerify assessments are indicative only and do not constitute professional authentication or grading. TCGVerify accepts no liability for financial loss arising from reliance on our assessments. Always seek professional grading for high-value transactions." },
          { h:"3. Accuracy disclaimer", p:"AI analysis is dependent on image quality, lighting, and card condition. TCGVerify makes no warranties regarding the accuracy of results. Confidence scores reflect the AI's certainty, not a guarantee of authenticity." },
          { h:"4. User accounts", p:"Users must sign in with a valid Google account. Each account is entitled to 3 free scans. Paid plans are billed monthly and may be cancelled at any time. Refunds are available within 7 days of purchase." },
          { h:"5. Acceptable use", p:"TCGVerify may only be used for personal or commercial card authentication purposes. Automated access, scraping, or abuse of the free scan limit is prohibited and may result in account suspension." },
          { h:"6. Intellectual property", p:"The TCGVerify name, logo, and application are the intellectual property of TCGVerify. Card images uploaded by users remain the property of the uploader." },
          { h:"7. Changes to terms", p:"We reserve the right to update these terms at any time. Continued use of the service following notification of changes constitutes acceptance of the updated terms." },
        ].map((s,i) => <div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

/* ─── PRIVACY POLICY PAGE ─── */
function PrivacyPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr">
        <button className="page-back" onClick={onBack}>←</button>
        <h2 className="page-title">Privacy Policy</h2>
      </div>
      <div className="modal-left" style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:14, padding:"1.25rem" }}>
        <p style={{ fontSize:11, color:"var(--text4)", fontFamily:"'DM Mono',monospace", marginBottom:16 }}>Last updated: {new Date().toLocaleDateString("en-GB", { year:"numeric", month:"long" })}</p>
        {[
          { h:"What data we collect", p:"We collect your Google account email address and profile information when you sign in. We store your scan count and subscription tier in our secure database. Card images are transmitted to our AI provider for analysis only and are not stored by TCGVerify." },
          { h:"How we use your data", p:"Your email is used solely to identify your account and manage your scan allowance. We do not sell, share, or use your personal data for marketing purposes. We do not use your data to train AI models." },
          { h:"Third party services", p:"TCGVerify uses Supabase for authentication and database storage, Anthropic Claude API for AI analysis, and Stripe for payment processing. Each provider maintains their own privacy policy and data handling practices." },
          { h:"Card images", p:"Images you upload are sent securely to Anthropic's API for analysis. Images are not stored by TCGVerify after the analysis is complete. We do not retain, view, or share your card images." },
          { h:"Cookies and storage", p:"We use browser local storage to remember your theme preference (dark/light mode) and whether you have seen the first-use disclaimer. No advertising or tracking cookies are used." },
          { h:"Your rights", p:"You may request deletion of your account and associated data at any time by contacting us. You may also request a copy of the data we hold about you. We will respond to all requests within 30 days." },
          { h:"Contact", p:"For any privacy-related queries please contact us via the TCGVerify website. We take data privacy seriously and will respond promptly to all enquiries." },
        ].map((s,i) => <div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

/* ─── PWA INSTALL HOOK ─── */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) { setIsInstalled(true); return; }
    // Check iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);
    // Android/Chrome install prompt
    const handler = e => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    return outcome === "accepted";
  };

  return { prompt, isIOS, isInstalled, triggerInstall };
}

/* ─── PWA INSTALL BANNER ─── */
function InstallBanner({ onDismiss }) {
  const { prompt, isIOS, isInstalled, triggerInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem("tcgv_pwa_dismissed"); } catch { return false; } });
  const [iosVisible, setIosVisible] = useState(false);

  // Show iOS banner after a short delay
  useEffect(() => {
    if (isIOS && !isInstalled && !dismissed) {
      const t = setTimeout(() => setIosVisible(true), 3000);
      return () => clearTimeout(t);
    }
  }, [isIOS, isInstalled, dismissed]);

  const dismiss = () => {
    try { localStorage.setItem("tcgv_pwa_dismissed", "1"); } catch {}
    setDismissed(true);
    setIosVisible(false);
    onDismiss?.();
  };

  const handleInstall = async () => {
    const accepted = await triggerInstall();
    if (accepted) dismiss();
  };

  // Android/Chrome — show when prompt is available
  if (!dismissed && prompt) return (
    <div className="pwa-banner">
      <div className="pwa-icon">🃏</div>
      <div className="pwa-text">
        <div className="pwa-title">Add TCGVerify to your home screen</div>
        <div className="pwa-sub">Instant access — no app store needed</div>
      </div>
      <div className="pwa-actions">
        <button className="btn btn-gold btn-sm" onClick={handleInstall}>Add</button>
        <button className="btn btn-ghost btn-sm" onClick={dismiss}>✕</button>
      </div>
    </div>
  );

  // iOS Safari — show manual instructions
  if (!dismissed && isIOS && iosVisible) return (
    <div className="pwa-banner" style={{ flexDirection:"column", alignItems:"flex-start", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, width:"100%" }}>
        <div className="pwa-icon">🃏</div>
        <div className="pwa-text">
          <div className="pwa-title">Add TCGVerify to your home screen</div>
          <div className="pwa-sub">Instant access every time you need it</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={dismiss} style={{ flexShrink:0 }}>✕</button>
      </div>
      <div style={{ background:"var(--bg-surface)", border:"0.5px solid var(--border)", borderRadius:8, padding:"10px 12px", width:"100%", fontSize:12, color:"var(--text2)", lineHeight:1.7 }}>
        <div style={{ marginBottom:4 }}>On Safari tap the <strong>Share button</strong> <span style={{ fontSize:14 }}>⎙</span> at the bottom of the screen</div>
        <div>Then tap <strong>"Add to Home Screen"</strong> → <strong>"Add"</strong></div>
      </div>
    </div>
  );

  return null;
}

/* ─── PAYWALL MODAL ─── */
function PaywallModal({ onDismiss, onSelect }) {
  return (
    <div className="modal-bg">
      <div className="modal">
        <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
        <h2 className="modal-title">Unlock More Scans</h2>
        <p className="modal-sub">You've used your free scans. Choose a plan to keep authenticating.</p>
        <div className="tier-grid">
          {[{key:"starter",popular:false},{key:"pro",popular:true},{key:"business",popular:false}].map(({key,popular}) => {
            const t=TIERS[key];
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
  const gold=theme==="light"?"#b8860b":"#E6B43C";
  return (
    <div className="agate">
      <ThemeBtn theme={theme} onToggle={onToggle} float/>
      <div className="auth-card">
        <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo gold={gold}/></div>
        <h1 className="auth-title">TCG<span style={{ color:gold }}>Verify</span></h1>
        <p className="auth-sub">Sign in to start authenticating your trading cards with AI. Free to try — no card required.</p>
        <div className="auth-perks">
          {["3 free scans when you sign up","Front & back dual-image analysis","Detailed red flag breakdown","Upgrade anytime for more scans"].map(p => <div key={p} className="perk"><span className="perk-dot"/>{p}</div>)}
        </div>
        <button className="btn-google" onClick={onSignIn} disabled={loading}><GoogleIcon/>{loading?"Signing in…":"Continue with Google"}</button>
        <p className="auth-note">Scan count is tied to your account —<br/>incognito and cache clears won't reset your free scans.</p>
      </div>
    </div>
  );
}

/* ─── CAMERA HOOK ─── */
function useCam(vRef) {
  const [on,setOn]=useState(false);
  const start=useCallback(async()=>{ try{ const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}); vRef.current.srcObject=s; vRef.current.play(); setOn(true); }catch{ alert("Camera unavailable."); }}, [vRef]);
  const stop=useCallback(()=>{ vRef.current?.srcObject?.getTracks().forEach(t=>t.stop()); if(vRef.current) vRef.current.srcObject=null; setOn(false); },[vRef]);
  const capture=useCallback(()=>{ const c=document.createElement("canvas"); c.width=vRef.current.videoWidth; c.height=vRef.current.videoHeight; c.getContext("2d").drawImage(vRef.current,0,0); return c.toDataURL("image/jpeg",.92); },[vRef]);
  return {on,start,stop,capture};
}

/* ─── CAPTURE PANEL ─── */
function CapturePanel({ label, image, onCapture, onClear, onShowTips }) {
  const [mode,setMode]=useState("idle");
  const vRef=useRef(null), fRef=useRef(null);
  const {on,start,stop,capture}=useCam(vRef);
  const doCapture=()=>{ const d=capture(); stop(); setMode("captured"); onCapture({base64:d.split(",")[1],mediaType:"image/jpeg",preview:d}); };
  const doFile=async f=>{ if(!f||!f.type.startsWith("image/")) return; const d=await toBase64(f); setMode("captured"); onCapture(d); };
  const doClear=()=>{ stop(); setMode("idle"); onClear(); };
  return (
    <div style={{ marginBottom:"1rem" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:"1px" }}>{label}</span>
        <button className="btn btn-ghost btn-sm" onClick={onShowTips} style={{ fontSize:10, padding:"4px 10px" }}>📸 Photo tips</button>
      </div>
      <div className="cam-box">
        <div className="cam-corner tl"/><div className="cam-corner tr"/><div className="cam-corner bl"/><div className="cam-corner br"/>
        {mode==="idle" && <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}><span className="cam-idle-icon">🃏</span><span className="cam-idle-text">No image captured</span></div>}
        {mode==="camera" && <video ref={vRef} playsInline muted style={{ width:"100%",height:"100%",objectFit:"cover" }}/>}
        {mode==="captured" && image && <img src={image.preview} alt={label}/>}
        {mode==="camera" && <div className="scan-running"/>}
      </div>
      <div className="cam-actions">
        {mode==="idle" && (<><button className="btn btn-gold btn-sm" onClick={()=>{ setMode("camera"); start(); }}>📷 Use camera</button><button className="btn btn-ghost btn-sm" onClick={()=>fRef.current.click()}>⬆ Upload</button><input ref={fRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>doFile(e.target.files[0])}/></>)}
        {mode==="camera" && on && (<><button className="btn btn-gold btn-sm" onClick={doCapture}>⬤ Capture</button><button className="btn btn-ghost btn-sm" onClick={()=>{ stop(); setMode("idle"); }}>Cancel</button></>)}
        {mode==="captured" && <button className="btn btn-ghost btn-sm" onClick={doClear}>✕ Retake</button>}
      </div>
      {mode==="idle" && <p className="hint">Tap "Photo tips" above for best results. {label.includes("Back")?"Ensure the full card back is visible.":"Ensure the full card front is visible."}</p>}
    </div>
  );
}

/* ─── VIDEO PANEL ─── */
function VideoPanel({ isPro, video, onVideo, onClear }) {
  const fRef=useRef(null);
  const hFile=f=>{ if(!f||!f.type.startsWith("video/")) return; const p=URL.createObjectURL(f); const r=new FileReader(); r.onload=e=>onVideo({base64:e.target.result.split(",")[1],mediaType:f.type,preview:p,name:f.name}); r.readAsDataURL(f); };
  if (!isPro) return (
    <div className="video-locked">
      <div style={{ fontSize:32,marginBottom:8,opacity:.4 }}>🎬</div>
      <div className="badge-pro">Pro Feature</div>
      <div style={{ fontSize:15,fontWeight:500,color:"var(--text2)",marginBottom:4 }}>Holographic Video Analysis</div>
      <div style={{ fontSize:12,color:"var(--text3)",lineHeight:1.6,marginBottom:8 }}>Upload a 3-second video of your card tilting under light. AI analyses holographic consistency against authenticated specimens.</div>
      <div style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",lineHeight:1.7 }}>How to record: Hold at eye level → tilt slowly left to right → let the holo catch the light.</div>
    </div>
  );
  return (
    <div className="video-upload">
      <p style={{ fontSize:12,color:"var(--text3)",marginBottom:10,lineHeight:1.6 }}>📽 Record 3 seconds of the card tilting. AI assesses holographic consistency.</p>
      {!video ? <div className="video-drop" onClick={()=>fRef.current.click()}><input ref={fRef} type="file" accept="video/*" style={{ display:"none" }} onChange={e=>hFile(e.target.files[0])}/><span style={{ fontSize:30 }}>🎬</span><p style={{ fontSize:13,color:"var(--text3)",marginTop:8 }}>Tap to upload video (max 10MB)</p><p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginTop:4 }}>MP4, MOV, WEBM · max 3 seconds</p></div>
      : <div className="video-preview"><span style={{ fontSize:22 }}>🎬</span><span className="video-name">{video.name}</span><button className="btn btn-ghost btn-sm" onClick={onClear}>✕</button></div>}
    </div>
  );
}

/* ─── STEPS ─── */
function Steps({ active, frontDone, backDone, videoDone, isPro }) {
  return (
    <div className="steps">
      {[{id:"front",label:"Front"},{id:"back",label:"Back"},{id:"video",label:"Holo Video",pro:true}].map((s,i)=>{
        const done=s.id==="front"?frontDone:s.id==="back"?backDone:videoDone;
        const locked=s.pro&&!isPro;
        return <div key={s.id} className={locked?"step locked":done?"step done":active===s.id?"step active":"step"}>
          <div className="step-num">Step {i+1}{s.pro?" · Pro":""}</div>
          <div className="step-name">{done?"✓ ":""}{s.label}</div>
        </div>;
      })}
    </div>
  );
}

/* ─── PDF GENERATOR ─── */
function generatePDF(result, userEmail) {
  const vLabel={ auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vColour={ auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const level=getConfLevel(result.confidence);
  const html=`
    <html><head><style>
      body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;color:#1a1820;}
      .header{text-align:center;border-bottom:2px solid #E6B43C;padding-bottom:20px;margin-bottom:24px;}
      .logo{font-size:28px;font-weight:900;letter-spacing:2px;color:#1a1820;}
      .logo span{color:#E6B43C;}
      .subtitle{font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-top:4px;}
      .date{font-size:11px;color:#888;margin-top:8px;}
      .verdict-box{border-radius:8px;padding:16px 20px;margin-bottom:20px;border:1px solid ${vColour[result.verdict]}20;background:${vColour[result.verdict]}10;}
      .verdict-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${vColour[result.verdict]};margin-bottom:4px;}
      .verdict-title{font-size:20px;font-weight:700;color:${vColour[result.verdict]};}
      .conf-row{display:flex;align-items:baseline;gap:8px;margin-top:8px;}
      .conf-num{font-size:32px;font-weight:900;color:${level.colour};}
      .conf-label{font-size:12px;color:#888;}
      .section{margin-bottom:20px;}
      .section-title{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:8px;border-bottom:0.5px solid #eee;padding-bottom:4px;}
      .summary{font-size:13px;line-height:1.7;color:#444;}
      .flag{display:flex;gap:8px;margin-bottom:8px;font-size:12px;color:#555;line-height:1.5;}
      .flag-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:5px;}
      .footer{margin-top:32px;padding-top:16px;border-top:0.5px solid #eee;font-size:10px;color:#aaa;text-align:center;line-height:1.7;}
    </style></head><body>
      <div class="header">
        <div class="logo">TCG<span>Verify</span></div>
        <div class="subtitle">Trading Card Authentication · AI-Powered</div>
        <div class="date">Scanned by ${userEmail} · ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      <div class="verdict-box">
        <div class="verdict-label">Authentication Result</div>
        <div class="verdict-title">${vLabel[result.verdict]}</div>
        <div class="conf-row">
          <div class="conf-num">${result.confidence}%</div>
          <div class="conf-label">${level.label}</div>
        </div>
      </div>
      ${result.summary?`<div class="section"><div class="section-title">Summary</div><div class="summary">${result.summary}</div></div>`:""}
      ${result.flags.length>0?`<div class="section"><div class="section-title">Analysis Breakdown</div>${result.flags.map(f=>`<div class="flag"><div class="flag-dot" style="background:${f.type==="r"?"#f87171":f.type==="g"?"#4ade80":"#E6B43C"}"></div><span>${f.text}</span></div>`).join("")}</div>`:""}
      <div class="footer">
        TCGVerify provides indicative assessments only · Not a substitute for professional grading services<br/>
        Results are AI-generated and carry no guarantee of accuracy<br/>
        Always verify with a certified grader (PSA, BGS, CGC) for high-value cards
      </div>
    </body></html>`;
  const blob=new Blob([html],{type:"text/html"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`tcgverify-result-${Date.now()}.html`;
  a.click(); URL.revokeObjectURL(url);
}

/* ─── RESULT ─── */
function Result({ result, onReset, userEmail, gold }) {
  const [showConf,setShowConf]=useState(false);
  const vLabel={ auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vIcon={ auth:"✓", counter:"✗", inc:"?" };

  const shareText = `I just authenticated a trading card with TCGVerify AI — ${vLabel[result.verdict]} (${result.confidence}% confidence). Check yours at tcgverify.ai`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const redditUrl  = `https://reddit.com/submit?title=${encodeURIComponent("TCGVerify AI authentication result")}&text=${encodeURIComponent(shareText)}`;

  return (
    <div className="result-wrap">
      {showConf && <ConfidenceModal confidence={result.confidence} onClose={()=>setShowConf(false)}/>}
      <div className={`verdict-bar ${result.verdict}`}>
        <div className="v-icon">{vIcon[result.verdict]}</div>
        <div><div className="v-label">Authentication Result</div><div className="v-title">{vLabel[result.verdict]}</div></div>
        <div className="conf-wrap" onClick={()=>setShowConf(true)} title="Tap to explain this score">
          <div className="conf-n">{result.confidence}%</div>
          <div className="conf-l">Confidence</div>
          <div className="conf-tap">Tap to explain ↗</div>
        </div>
      </div>
      <div className="result-body">
        {result.summary && <div className="summary-sec"><p className="summary-text">{result.summary}</p></div>}
        {result.flags.length>0 && (
          <div className="flags-sec">
            <div className="flags-hdg">Detailed Analysis Breakdown</div>
            {result.flags.map((f,i)=><div key={i} className="flag"><div className={`flag-pip pip-${f.type}`}/><p className="flag-txt">{f.text}</p></div>)}
          </div>
        )}
      </div>
      <div className="result-actions">
        <button className="btn btn-ghost btn-sm" onClick={onReset}>← Scan another</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>generatePDF(result,userEmail)} title="Download as HTML file — open in browser and print to PDF">⬇ Save as PDF</button>
        <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>𝕏 Share</a>
        <a href={redditUrl}  target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>Reddit</a>
      </div>
    </div>
  );
}

/* ─── MAIN APP ─── */
export default function App() {
  const [theme,setTheme]=useState(()=>{ try{ return localStorage.getItem("tcgv_theme")||"dark"; }catch{ return "dark"; }});
  const toggleTheme=()=>setTheme(t=>{ const n=t==="dark"?"light":"dark"; try{ localStorage.setItem("tcgv_theme",n); }catch{} return n; });
  const gold=theme==="light"?"#b8860b":"#E6B43C";

  /* first-use disclaimer */
  const [showDisclaimer,setShowDisclaimer]=useState(()=>{ try{ return !localStorage.getItem("tcgv_disclaimed"); }catch{ return true; }});
  const acceptDisclaimer=()=>{ try{ localStorage.setItem("tcgv_disclaimed","1"); }catch{} setShowDisclaimer(false); };

  /* page routing */
  const [page,setPage]=useState("home"); /* home | faq | terms | privacy */

  /* modals */
  const [showTips,setShowTips]=useState(false);
  const [showPaywall,setShowPaywall]=useState(false);

  /* auth */
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);

  /* scan */
  const [step,setStep]=useState("front");
  const [front,setFront]=useState(null);
  const [back,setBack]=useState(null);
  const [video,setVideo]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else setAuthLoading(false); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{ setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else{ setProfile(null); setAuthLoading(false); }});
    return ()=>subscription.unsubscribe();
  },[]);

  const loadProfile=async uid=>{ const{data,error}=await supabase.from("profiles").select("scan_count,tier,tier_expires_at").eq("id",uid).single(); if(!error&&data) setProfile(data); setAuthLoading(false); };
  const signIn=async()=>{ setAuthLoading(true); await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}}); };
  const signOut=async()=>{ await supabase.auth.signOut(); setUser(null); setProfile(null); setResult(null); };

  const tier=effectiveTier(profile);
  const tierInfo=TIERS[tier];
  const scanCount=profile?.scan_count??0;
  const isPro=tier!=="free";
  const remaining=Math.max(0,tierInfo.limit-scanCount);

  const analyse=async()=>{
    if(remaining<=0){ setShowPaywall(true); return; }
    if(!front){ alert("Please capture the front of the card first."); return; }
    setScanning(true); setError(null); setResult(null);
    try{
      const content=[
        {type:"image",source:{type:"base64",media_type:front.mediaType,data:front.base64}},
        {type:"text",text:"Card front image."},
      ];
      if(back){ content.push({type:"image",source:{type:"base64",media_type:back.mediaType,data:back.base64}},{type:"text",text:"Card back image."}); }
      let prompt=back?"Authenticate this card. I have provided front and back.":"Authenticate this card.";
      if(video) prompt+=" A holographic tilt video was also provided — comment on holographic consistency.";
      content.push({type:"text",text:prompt});
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers: { 
    "Content-Type": "application/json",
    "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  },body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:600,system:SYSTEM_PROMPT,messages:[{role:"user",content}]})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const text=data.content.map(c=>c.text||"").join("\n");
      const newCount=scanCount+1;
      await supabase.from("profiles").update({scan_count:newCount}).eq("id",user.id);
      setProfile(p=>({...p,scan_count:newCount}));
      setResult({verdict:parseVerdict(text),confidence:parseConf(text),summary:parseSummary(text),flags:parseFlags(text)});
      if(!isPro&&newCount>=TIERS.free.limit) setTimeout(()=>setShowPaywall(true),2000);
    }catch(e){ setError(e.message||"Analysis failed. Please try again."); }
    finally{ setScanning(false); }
  };

  const reset=()=>{ setFront(null); setBack(null); setVideo(null); setResult(null); setError(null); setStep("front"); };

  /* loading */
  if(authLoading) return (
    <div className={`T${theme==="light"?" light":""}`} style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <style>{S}</style>
      <div style={{ display:"flex",gap:7 }}>{[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:gold,opacity:.4,animation:"dp 1.2s ease-in-out infinite",animationDelay:`${i*.2}s` }}/>)}</div>
    </div>
  );

  /* auth gate */
  if(!user) return <><style>{S}</style><div className={`T${theme==="light"?" light":""}`}><AuthGate onSignIn={signIn} loading={authLoading} theme={theme} onToggle={toggleTheme}/></div></>;

  /* main */
  return (
    <div className={`T${theme==="light"?" light":""}`}>
      <style>{S}</style>

      {showDisclaimer && <DisclaimerModal onAccept={acceptDisclaimer}/>}
      {showTips && <TipsModal onClose={()=>setShowTips(false)}/>}
      {showPaywall && <PaywallModal onDismiss={()=>setShowPaywall(false)} onSelect={t=>{ setShowPaywall(false); alert(`Stripe integration goes here — connect your ${TIERS[t].label} plan payment link!`); }}/>}
      <InstallBanner/>

      <div className="app">
        <div className="wrap">

          {/* HEADER */}
          <div className="hdr">
            <div className="hdr-controls">
              <div className="user-avatar">{user.email?.[0]?.toUpperCase()}</div>
              <span className="user-email">{user.email}</span>
              <ThemeBtn theme={theme} onToggle={toggleTheme}/>
              <button className="btn-signout" onClick={signOut}>Sign out</button>
            </div>
            <div className="logo-ring"><Logo gold={gold}/></div>
            <h1 className="app-name">TCG<span style={{ color:gold }}>Verify</span></h1>
            <p className="app-tag">Trading Card Authentication · AI-Powered</p>
          </div>

          {/* PAGE ROUTING */}
          {page==="faq"     && <FAQPage onBack={()=>setPage("home")}/>}
          {page==="terms"   && <TermsPage onBack={()=>setPage("home")}/>}
          {page==="privacy" && <PrivacyPage onBack={()=>setPage("home")}/>}

          {page==="home" && <>
            {/* SCAN COUNTER */}
            <div className="scan-counter">
              <span className="sc-label">{isPro?`${tierInfo.label} · ${remaining} scans left this month`:`${remaining} free scan${remaining!==1?"s":""} remaining`}</span>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                {tier==="free"&&<div className="sc-pips">{[0,1,2].map(i=><div key={i} className={`pip${i<scanCount?" used":""}`}/>)}</div>}
                <button className="sc-upgrade" onClick={()=>setShowPaywall(true)}>{isPro?"Change plan ↗":"Upgrade ↗"}</button>
              </div>
            </div>

            {scanning ? (
              <ScanSkeleton/>
            ) : !result ? (
              <>
                <Steps active={step} frontDone={!!front} backDone={!!back} videoDone={!!video} isPro={isPro}/>
                <div className="capture-panel">
                  <div className="cap-tabs">
                    {["front","back","video"].map(s=>(
                      <button key={s} className={`cap-tab${step===s?" active":""}`} onClick={()=>setStep(s)} style={s==="video"&&!isPro?{opacity:.5}:{}}>
                        {s==="front"?"🃏 Front":s==="back"?"🔄 Back":"🎬 Holo Video"}
                      </button>
                    ))}
                  </div>
                  <div className="cap-body">
                    {step==="front"&&<CapturePanel label="Card Front" image={front} onCapture={d=>{setFront(d);setStep("back");}} onClear={()=>setFront(null)} onShowTips={()=>setShowTips(true)}/>}
                    {step==="back" &&<CapturePanel label="Card Back"  image={back}  onCapture={d=>{setBack(d);setStep(isPro?"video":"front");}} onClear={()=>setBack(null)} onShowTips={()=>setShowTips(true)}/>}
                    {step==="video"&&<VideoPanel isPro={isPro} video={video} onVideo={setVideo} onClear={()=>setVideo(null)}/>}
                  </div>
                </div>
                <div className="analyse-row">
                  <button className="btn btn-gold" style={{ flex:1,justifyContent:"center",padding:"12px" }} onClick={analyse} disabled={!front||scanning}>
                    {`Analyse card${back?" (front + back)":" (front only)"}`}
                  </button>
                  {(front||back)&&<button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>}
                </div>
                {error&&<div className="err-box">⚠ {error}</div>}
              </>
            ) : (
              <Result result={result} onReset={reset} userEmail={user.email} gold={gold}/>
            )}
          </>}

          {/* FOOTER */}
          <div className="footer-nav">
            <button className="footer-link" onClick={()=>setPage("faq")}>FAQ</button>
            <button className="footer-link" onClick={()=>setPage("terms")}>Terms & Conditions</button>
            <button className="footer-link" onClick={()=>setPage("privacy")}>Privacy Policy</button>
            <button className="footer-link" onClick={()=>setShowTips(true)}>Photo Tips</button>
          </div>
          <p className="disclaimer">
            TCGVerify provides indicative assessments only · Not a substitute for professional grading<br/>
            Results are AI-generated · Always verify with a certified grader for high-value cards
          </p>
        </div>
      </div>
    </div>
  );
}
