// ═══════════════════════════════════════════════════════════════
//  TCGVerify v6
// ═══════════════════════════════════════════════════════════════
//  New in v6:
//  - Google Gemini API for accurate card identification
//  - Claude handles authentication only (more accurate)
//  - Smooth 0-100% progress bar (no step numbers)
//  - Sticky shutter button fixed to bottom of screen
//  - Tap camera view to capture
//  - Home button in header
//  - Prominent "Scan Another" button at top of result
//  - Flat surface reminder overlay before camera starts
//  - Low confidence counterfeit disclaimer
//  - System prompt less aggressive on flagging
//  - "AI" replaced with TCGVerify branding throughout
//  - Bigger verdict icon and confidence score
//  - More breathing room between result sections
//  - Max 3 flags on authentic cards
//  - Summary collapsed behind toggle
//  - No condition description text (badge only)
//  - All v5 fixes carried forward
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY    = import.meta.env.VITE_GEMINI_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── STRIPE PAYMENT LINKS ─── */
const STRIPE_LINKS = {
  starter:  "https://buy.stripe.com/YOUR_STARTER_LINK",
  pro:      "https://buy.stripe.com/YOUR_PRO_LINK",
  business: "https://buy.stripe.com/YOUR_BUSINESS_LINK",
};

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
  { min:90, max:100, label:"Very high confidence",  colour:"#4ade80", desc:"Multiple strong authentication markers identified. Assessment is highly reliable." },
  { min:75, max:89,  label:"High confidence",        colour:"#86efac", desc:"Key markers align well with known genuine examples. Assessment is considered reliable." },
  { min:60, max:74,  label:"Moderate confidence",    colour:"#E6B43C", desc:"Some consistent markers noted but uncertainty remains. Treat as indicative only." },
  { min:40, max:59,  label:"Low confidence",         colour:"#fb923c", desc:"Image quality or card condition made assessment difficult. Retake in better lighting." },
  { min:0,  max:39,  label:"Very low confidence",    colour:"#f87171", desc:"A reliable assessment was not possible. Please retake with a clearer, well-lit photo." },
];
function getConfLevel(pct) { return CONF_LEVELS.find(l => pct >= l.min && pct <= l.max) || CONF_LEVELS[4]; }

/* ─── CONDITIONS ─── */
const CONDITIONS = {
  "Near Mint":         { short:"NM",  colour:"#4ade80" },
  "Lightly Played":    { short:"LP",  colour:"#86efac" },
  "Moderately Played": { short:"MP",  colour:"#E6B43C" },
  "Heavily Played":    { short:"HP",  colour:"#fb923c" },
  "Damaged":           { short:"DMG", colour:"#f87171" },
};

/* ─── TEXT SANITISER ─── */
function sanitise(str = "") {
  return str.replace(/[^\x20-\x7E\n\r£]/g,"").replace(/\*\*/g,"").replace(/#{1,6}\s/g,"").replace(/`/g,"").trim();
}

/* ─── FRIENDLY ERRORS ─── */
function friendlyError(msg = "") {
  if (msg.includes("credit")||msg.includes("billing")) return "Authentication credits need topping up — please contact support";
  if (msg.includes("rate")) return "Too many requests — please wait a moment and try again";
  if (msg.includes("network")||msg.includes("fetch")) return "Connection issue — check your internet and try again";
  return "Something went wrong — please try again. If it persists, contact support.";
}

/* ─── REFERRAL HELPER ─── */
function getReferralCode(userId) { return userId?.slice(0,8).toUpperCase() || ""; }

/* ─── GEMINI CARD IDENTIFICATION ─── */
async function identifyCardWithGemini(base64Image, mediaType) {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Image } },
            { text: `Identify this trading card precisely. Respond in this exact format only:
CARD: [exact card name]
SET: [set name]
RARITY: [rarity]
GAME: [Pokemon / Magic: The Gathering / Yu-Gi-Oh! / Other]
If you cannot identify it with confidence write "Unable to identify" for that field.` }
          ]
        }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.1 }
      })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parseG = field => { const m = text.match(new RegExp(`${field}:\\s*([^\\n]+)`, "i")); return m ? sanitise(m[1].trim()) : ""; };
    return {
      cardName: parseG("CARD"),
      cardSet:  parseG("SET"),
      cardRarity: parseG("RARITY"),
      cardGame: parseG("GAME"),
    };
  } catch { return null; }
}

/* ─── CLAUDE AUTHENTICATION SYSTEM PROMPT ─── */
function buildSystemPrompt(cardInfo) {
  const cardContext = cardInfo?.cardName && cardInfo.cardName !== "Unable to identify"
    ? `The card has been identified as: ${cardInfo.cardName}${cardInfo.cardSet ? ` from ${cardInfo.cardSet}` : ""}${cardInfo.cardRarity ? ` (${cardInfo.cardRarity})` : ""}. Use this to focus your authentication analysis on the specific markers for this card.`
    : "The card could not be identified from the image. Authenticate based on general print quality and construction markers.";

  return `You are a forensic trading card authentication specialist covering all major TCGs.

${cardContext}

Analyse the card image(s) and respond in this EXACT format:

CONDITION: [Near Mint / Lightly Played / Moderately Played / Heavily Played / Damaged]
VALUE: [Estimated market value e.g. "£15-25" or "Unable to estimate"]
VERDICT: [HIGHLY LIKELY AUTHENTIC / CHARACTERISTICS MATCH KNOWN COUNTERFEITS / INCONCLUSIVE — PROFESSIONAL REVIEW ADVISED]
CONFIDENCE: [0-100]%
SUMMARY: [2 sentences maximum. Never use "fake", "genuine", "real", "AI". Use "consistent with authenticated specimens", "aligns with known reproductions", "deviates from official standards".]
FLAGS:
- [Most important observation about print quality, fonts, colour, holographic pattern, card stock, alignment]
- [Second observation]
- [Third observation — for authentic cards stop here. For counterfeits add up to 2 more]

Important: If image quality, glare, shadows, or surface reflections could explain any anomalies, lean towards INCONCLUSIVE rather than counterfeit. Only flag as counterfeit when multiple clear markers are present that cannot be explained by image quality.`;
}

/* ─── HELPERS ─── */
function toBase64(f) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res({ base64:e.target.result.split(",")[1], mediaType:f.type, preview:e.target.result }); r.onerror=()=>rej(); r.readAsDataURL(f); });
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}:\\s*([^\\n]+)`, "i"));
  return m ? sanitise(m[1].trim()) : "";
}
function parseVerdict(t) { const u=t.toUpperCase(); if(u.includes("HIGHLY LIKELY AUTHENTIC")) return "auth"; if(u.includes("CHARACTERISTICS MATCH")) return "counter"; return "inc"; }
function parseConf(t) { const m=t.match(/CONFIDENCE:\s*(\d{1,3})/i); return m?parseInt(m[1]):70; }
function parseFlags(t, verdict) {
  const m=t.match(/FLAGS:([\s\S]+)/i); if(!m) return [];
  const flags = m[1].split("\n").map(l=>sanitise(l.replace(/^[-•*\d.]+\s*/,"").trim())).filter(l=>l.length>10)
    .map(text=>({ text, type:text.toLowerCase().match(/inconsistent|deviates|unofficial|concern|misalign|poor|thin|blurry/)?"r":text.toLowerCase().match(/consistent|aligns|matches|correct|high quality|sharp/)?"g":"y" }));
  // Limit to 3 flags for authentic cards
  return verdict === "auth" ? flags.slice(0,3) : flags.slice(0,5);
}

/* ─── STYLES ─── */
const S = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}

.T{
  --bg:#07080d;--bg-surface:rgba(255,255,255,.028);--bg-cam:#000;
  --bg-modal:#0f0e1a;--bg-scan:rgba(255,255,255,.02);--bg-flag:rgba(255,255,255,.02);
  --border:#1e1d28;--border-soft:#2a2836;--border-flag:#1a1924;
  --text:#eceaf4;--text2:#b0adb8;--text3:#52505e;--text4:#3a3848;
  --gold:#E6B43C;--gold-h:#f0c84a;--gold-dim:rgba(230,180,60,.06);
  --gold-border:rgba(230,180,60,.2);--gold-ring:rgba(230,180,60,.15);
  --gold-logo:rgba(230,180,60,.04);--glow1:rgba(230,180,60,.07);
  --glow2:rgba(90,180,255,.05);--pip-empty:#1e1d28;
  --ghost-bg:transparent;--ghost-text:#9996a3;--ghost-text-h:#b0adb8;
  --auth-card:rgba(255,255,255,.025);
}
.T.light{
  --bg:#f5f3ee;--bg-surface:rgba(0,0,0,.032);--bg-cam:#1a1a1a;
  --bg-modal:#ffffff;--bg-scan:rgba(0,0,0,.02);--bg-flag:rgba(0,0,0,.02);
  --border:rgba(0,0,0,.1);--border-soft:rgba(0,0,0,.13);--border-flag:rgba(0,0,0,.07);
  --text:#1a1820;--text2:#4a4858;--text3:#7a7880;--text4:#aaa8b8;
  --gold:#b8860b;--gold-h:#c99a0f;--gold-dim:rgba(184,134,11,.07);
  --gold-border:rgba(184,134,11,.25);--gold-ring:rgba(184,134,11,.2);
  --gold-logo:rgba(184,134,11,.06);--glow1:rgba(184,134,11,.05);
  --glow2:rgba(60,130,200,.04);--pip-empty:rgba(0,0,0,.1);
  --ghost-bg:transparent;--ghost-text:#6a6878;--ghost-text-h:#4a4858;
  --auth-card:#ffffff;
}

body{font-family:'DM Sans',sans-serif;}
.T{min-height:100vh;background:var(--bg);color:var(--text);position:relative;overflow:hidden;}
.T::before{content:'';position:fixed;top:-30%;left:-10%;width:55vw;height:55vw;background:radial-gradient(circle,var(--glow1) 0%,transparent 65%);pointer-events:none;}
.T::after{content:'';position:fixed;bottom:-20%;right:-5%;width:45vw;height:45vw;background:radial-gradient(circle,var(--glow2) 0%,transparent 65%);pointer-events:none;}
.app{padding:1rem 1rem 6rem;position:relative;z-index:1;}
.agate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;flex-direction:column;gap:0;}
.wrap{max-width:700px;margin:0 auto;position:relative;z-index:1;}

/* ── HEADER ── */
.hdr{text-align:center;margin-bottom:1.5rem;}
.hdr-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px;}
.hdr-left{display:flex;align-items:center;gap:6px;flex:1;}
.user-avatar{width:26px;height:26px;border-radius:50%;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:var(--gold);flex-shrink:0;}
.user-email{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hdr-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.btn-signout{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;}
.btn-home{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;}
.btn-home:hover{color:var(--gold);border-color:var(--gold-border);}
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

/* ── FLAT SURFACE REMINDER ── */
.flat-overlay{position:fixed;inset:0;background:rgba(7,8,13,.92);backdrop-filter:blur(6px);z-index:150;display:flex;align-items:center;justify-content:center;padding:1rem;}
.flat-card{background:var(--bg-modal);border:0.5px solid var(--gold-border);border-radius:18px;padding:2rem 1.75rem;max-width:340px;width:100%;text-align:center;}
.flat-icon{font-size:48px;margin-bottom:14px;}
.flat-title{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:10px;}
.flat-tips{text-align:left;margin-bottom:1.5rem;}
.flat-tip{display:flex;gap:8px;font-size:13px;color:var(--text2);margin-bottom:8px;align-items:flex-start;line-height:1.5;}
.flat-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:6px;}

/* ── CAMERA v6 — sticky shutter ── */
.cam-wrap{position:relative;margin-bottom:80px;}
.cam-screen{position:relative;width:100%;border-radius:14px;overflow:hidden;background:#000;}
.cam-screen video{width:100%;display:block;aspect-ratio:3/4;object-fit:cover;}
.cam-screen img{width:100%;display:block;aspect-ratio:3/4;object-fit:contain;background:#000;}
.cam-overlay-ui{position:absolute;inset:0;pointer-events:none;}
.cam-corner{position:absolute;width:24px;height:24px;border-color:var(--gold);border-style:solid;border-width:0;opacity:.8;}
.cam-corner.tl{top:12px;left:12px;border-top-width:2px;border-left-width:2px;}
.cam-corner.tr{top:12px;right:12px;border-top-width:2px;border-right-width:2px;}
.cam-corner.bl{bottom:12px;left:12px;border-bottom-width:2px;border-left-width:2px;}
.cam-corner.br{bottom:12px;right:12px;border-bottom-width:2px;border-right-width:2px;}
.cam-label-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);backdrop-filter:blur(4px);color:#fff;font-size:12px;font-family:'DM Mono',monospace;padding:5px 14px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;pointer-events:none;}
.cam-retake-btn{position:absolute;top:14px;right:14px;background:rgba(0,0,0,.55);border:0.5px solid rgba(255,255,255,.2);color:#fff;font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;pointer-events:all;}
.cam-tap-hint{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:rgba(255,255,255,.6);font-size:10px;font-family:'DM Mono',monospace;padding:4px 10px;border-radius:10px;pointer-events:none;white-space:nowrap;}

/* sticky shutter bar */
.shutter-bar{position:fixed;bottom:0;left:0;right:0;z-index:80;background:var(--bg-modal);border-top:0.5px solid var(--border);padding:12px 20px 20px;display:flex;align-items:center;justify-content:center;gap:20px;}
.shutter{width:68px;height:68px;border-radius:50%;background:var(--gold);border:3px solid rgba(255,255,255,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .1s,background .15s;box-shadow:0 0 0 5px rgba(230,180,60,.15);flex-shrink:0;}
.shutter:hover{background:var(--gold-h);}
.shutter:active{transform:scale(.92);}
.shutter-inner{width:24px;height:24px;border-radius:50%;background:#07080d;}
.shutter-label{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-align:center;line-height:1.4;}
.upload-btn{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;background:none;border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer;}
.upload-btn:hover{color:var(--text2);border-color:var(--border-soft);}
.step-dots{display:flex;gap:6px;align-items:center;}
.step-dot{width:7px;height:7px;border-radius:50%;background:var(--border);}
.step-dot.done{background:#4ade80;}
.step-dot.active{background:var(--gold);width:18px;border-radius:4px;}

/* ── SMOOTH PROGRESS BAR ── */
.progress-wrap{background:var(--bg-scan);border:0.5px solid var(--border);border-radius:14px;padding:2rem 1.5rem;margin-bottom:1.25rem;animation:fadeUp .3s ease;text-align:center;}
.progress-icon{font-size:32px;margin-bottom:14px;}
.progress-label{font-family:'DM Mono',monospace;font-size:12px;color:var(--text3);margin-bottom:14px;}
.progress-track{height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:8px;}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-h));border-radius:4px;transition:width .6s ease;}
.progress-pct{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:var(--gold);}

/* ── RESULTS ── */
.result-wrap{animation:fadeUp .4s ease;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* scan another — prominent at top */
.scan-another-top{width:100%;padding:11px;border-radius:10px;background:var(--gold);color:#07080d;border:none;font-size:14px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;margin-bottom:1rem;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s;}
.scan-another-top:hover{background:var(--gold-h);}

.verdict-bar{padding:1.5rem 1.5rem;display:flex;align-items:center;gap:16px;border-radius:14px 14px 0 0;}
.verdict-bar.auth{background:rgba(74,222,128,.1);border:0.5px solid rgba(74,222,128,.2);}
.verdict-bar.counter{background:rgba(248,113,113,.1);border:0.5px solid rgba(248,113,113,.2);}
.verdict-bar.inc{background:var(--gold-dim);border:0.5px solid var(--gold-border);}
.v-icon{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;font-weight:700;}
.auth .v-icon{background:rgba(74,222,128,.2);color:#4ade80;}
.counter .v-icon{background:rgba(248,113,113,.2);color:#f87171;}
.inc .v-icon{background:var(--gold-dim);color:var(--gold);}
.v-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-family:'DM Mono',monospace;margin-bottom:3px;}
.auth .v-label{color:#4ade80;}.counter .v-label{color:#f87171;}.inc .v-label{color:var(--gold);}
.v-title{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:700;line-height:1.2;}
.auth .v-title{color:#4ade80;}.counter .v-title{color:#f87171;}.inc .v-title{color:var(--gold);}
.conf-wrap{margin-left:auto;text-align:right;cursor:pointer;flex-shrink:0;}
.conf-n{font-family:'Syne',sans-serif;font-size:2.4rem;font-weight:800;line-height:1;}
.auth .conf-n{color:#4ade80;}.counter .conf-n{color:#f87171;}.inc .conf-n{color:var(--gold);}
.conf-l{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;}
.conf-tap{font-size:9px;color:var(--gold);font-family:'DM Mono',monospace;margin-top:2px;}

.result-body{background:var(--bg-scan);border:0.5px solid var(--border);border-top:none;border-radius:0 0 14px 14px;}
.result-section{padding:1.1rem 1.5rem;border-bottom:0.5px solid var(--border);}
.result-section:last-child{border-bottom:none;}
.sec-hdg{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text4);font-family:'DM Mono',monospace;margin-bottom:10px;}

/* card ID — single line */
.card-id-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;}
.card-id-name{font-weight:500;color:var(--text);}
.card-id-sep{color:var(--text4);}
.card-id-meta{color:var(--text3);}
.card-id-game{font-size:10px;font-family:'DM Mono',monospace;color:var(--gold);background:var(--gold-dim);border:0.5px solid var(--gold-border);border-radius:4px;padding:2px 6px;}
.fake-id-notice{background:rgba(248,113,113,.06);border:0.5px solid rgba(248,113,113,.15);border-radius:7px;padding:7px 10px;font-size:11px;color:#f87171;font-family:'DM Mono',monospace;margin-top:8px;line-height:1.5;}
.low-conf-notice{background:rgba(251,146,60,.06);border:0.5px solid rgba(251,146,60,.2);border-radius:7px;padding:8px 12px;font-size:12px;color:#fb923c;margin-top:8px;line-height:1.6;}

/* condition badge */
.condition-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;border:0.5px solid;}
.cond-dot{width:6px;height:6px;border-radius:50%;}
.value-badge{display:inline-flex;align-items:center;gap:5px;background:var(--gold-dim);border:0.5px solid var(--gold-border);border-radius:6px;padding:4px 10px;font-size:13px;font-weight:500;color:var(--gold);}

/* flags */
.flag{display:flex;gap:9px;padding:10px 12px;border-radius:8px;background:var(--bg-flag);border:0.5px solid var(--border-flag);margin-bottom:8px;}
.flag:last-child{margin-bottom:0;}
.flag-pip{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:7px;}
.pip-r{background:#f87171;}.pip-g{background:#4ade80;}.pip-y{background:var(--gold);}
.flag-txt{font-size:13px;color:var(--text2);line-height:1.6;}

/* summary toggle */
.summary-toggle{font-size:11px;color:var(--gold);font-family:'DM Mono',monospace;background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;}
.summary-text{font-size:13px;color:var(--text2);line-height:1.75;margin-top:8px;}

.result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:1rem;align-items:center;}

/* confidence modal bar */
.conf-bar-track{height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin:6px 0 10px;}
.conf-bar-fill{height:100%;border-radius:3px;transition:width .5s ease;}

/* ── AUTH ── */
.auth-tabs{display:flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:1.25rem;}
.auth-tab{flex:1;padding:9px;font-size:13px;text-align:center;cursor:pointer;background:var(--bg-surface);border:none;font-family:'DM Sans',sans-serif;color:var(--text3);transition:color .15s,background .15s;}
.auth-tab.active{background:var(--gold-dim);color:var(--gold);}
.auth-card{background:var(--auth-card);border:0.5px solid var(--border);border-radius:18px;padding:2rem 1.75rem;max-width:380px;width:100%;text-align:center;position:relative;z-index:1;}
.auth-title{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--text);margin-bottom:4px;letter-spacing:1px;}
.auth-sub{font-size:13px;color:var(--text3);margin-bottom:1.25rem;line-height:1.6;}
.auth-perks{text-align:left;margin-bottom:1.25rem;}
.perk{display:flex;gap:9px;align-items:center;font-size:13px;color:var(--text2);margin-bottom:7px;}
.perk-dot{width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0;}
.btn-google{width:100%;background:#fff;color:#1a1a1a;border:none;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'DM Sans',sans-serif;transition:background .15s;box-shadow:0 1px 3px rgba(0,0,0,.15);}
.btn-google:hover{background:#f0f0f0;}
.btn-google:disabled{opacity:.5;cursor:not-allowed;}
.auth-note{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:10px;line-height:1.6;}
.magic-input{width:100%;background:var(--bg-surface);border:0.5px solid var(--border-soft);border-radius:9px;padding:12px 14px;font-size:14px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;transition:border-color .15s;margin-bottom:10px;}
.magic-input:focus{border-color:var(--gold);}
.magic-input::placeholder{color:var(--text3);}
.magic-sent{background:rgba(74,222,128,.08);border:0.5px solid rgba(74,222,128,.2);border-radius:10px;padding:14px;font-size:13px;color:#4ade80;line-height:1.6;}

/* stats bar */
.stats-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.stat-item{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:10px;text-align:center;}
.stat-num{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:var(--gold);line-height:1;}
.stat-label{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-top:3px;}

/* feed */
.feed-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-surface);border:0.5px solid var(--border);border-radius:8px;margin-bottom:6px;}
.feed-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.feed-info{flex:1;font-size:12px;color:var(--text2);}
.feed-time{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;}

/* referral */
.referral-box{background:var(--gold-dim);border:0.5px solid var(--gold-border);border-radius:12px;padding:14px 16px;margin-bottom:1.25rem;}
.ref-title{font-size:13px;font-weight:500;color:var(--gold);margin-bottom:4px;}
.ref-desc{font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.5;}
.ref-code-row{display:flex;gap:8px;align-items:center;}
.ref-code{flex:1;background:var(--bg-surface);border:0.5px solid var(--border);border-radius:7px;padding:8px 12px;font-family:'DM Mono',monospace;font-size:13px;color:var(--text);letter-spacing:2px;}
.ref-copy{font-size:12px;padding:8px 14px;border-radius:7px;background:var(--gold);color:#07080d;border:none;cursor:pointer;font-weight:500;font-family:'DM Sans',sans-serif;white-space:nowrap;}

/* promo */
.promo-row{display:flex;gap:8px;margin-top:8px;}
.promo-input{flex:1;background:var(--bg-surface);border:0.5px solid var(--border-soft);border-radius:7px;padding:8px 12px;font-size:13px;color:var(--text);font-family:'DM Mono',monospace;outline:none;}
.promo-input:focus{border-color:var(--gold);}
.promo-btn{font-size:12px;padding:8px 14px;border-radius:7px;background:var(--bg-surface);border:0.5px solid var(--border);color:var(--text2);cursor:pointer;font-family:'DM Sans',sans-serif;}
.promo-ok{color:#4ade80;font-size:12px;font-family:'DM Mono',monospace;margin-top:6px;}
.promo-err{color:#f87171;font-size:12px;font-family:'DM Mono',monospace;margin-top:6px;}

/* modals */
.modal-bg{position:fixed;inset:0;background:rgba(7,8,13,.85);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;}
.T.light .modal-bg{background:rgba(200,198,194,.7);}
.modal{background:var(--bg-modal);border:0.5px solid var(--border);border-radius:18px;padding:2rem 1.75rem;max-width:440px;width:100%;text-align:center;max-height:90vh;overflow-y:auto;}
.modal-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gold);margin-bottom:6px;letter-spacing:1px;}
.modal-sub{font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:1.25rem;}
.modal-left{text-align:left;}
.modal-left h3{font-size:14px;font-weight:500;color:var(--text);margin:14px 0 5px;}
.modal-left p{font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:6px;}
.modal-dismiss{font-size:12px;color:var(--text4);cursor:pointer;font-family:'DM Mono',monospace;background:none;border:none;margin-top:10px;text-decoration:underline;text-underline-offset:3px;}

/* paywall */
.tier-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1.25rem;}
.tier-card{border:0.5px solid var(--border);border-radius:10px;padding:.85rem .6rem;cursor:pointer;transition:border-color .15s,background .15s;text-align:center;}
.tier-card:hover{border-color:var(--gold);background:var(--gold-dim);}
.tier-card.popular{border-color:var(--gold-border);background:var(--gold-dim);}
.tier-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px;}
.tier-price{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;color:var(--gold);line-height:1;}
.tier-period{font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;}
.tier-scans{font-size:11px;color:var(--text3);margin-top:4px;}
.popular-badge{font-size:9px;background:var(--gold-dim);color:var(--gold);border-radius:4px;padding:2px 5px;font-family:'DM Mono',monospace;}

/* onboarding */
.tour-bg{position:fixed;inset:0;background:rgba(7,8,13,.92);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem;}
.tour-card{background:var(--bg-modal);border:0.5px solid var(--gold-border);border-radius:18px;padding:2rem 1.75rem;max-width:380px;width:100%;text-align:center;}
.tour-step{font-size:11px;color:var(--gold);font-family:'DM Mono',monospace;letter-spacing:1px;margin-bottom:10px;}
.tour-icon{font-size:44px;margin-bottom:14px;}
.tour-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text);margin-bottom:8px;}
.tour-desc{font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:1.5rem;}
.tour-dots{display:flex;justify-content:center;gap:6px;margin-bottom:1.25rem;}
.tour-dot{width:6px;height:6px;border-radius:50%;background:var(--border);}
.tour-dot.active{background:var(--gold);}

/* tips */
.tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;}
.tip-card{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:12px;}
.tip-icon{font-size:20px;margin-bottom:6px;}
.tip-title{font-size:12px;font-weight:500;color:var(--text);margin-bottom:3px;}
.tip-desc{font-size:11px;color:var(--text3);line-height:1.5;}

/* faq */
.faq-item{border:0.5px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:8px;}
.faq-q{padding:12px 14px;font-size:13px;font-weight:500;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);}
.faq-q:hover{background:var(--gold-dim);}
.faq-a{padding:0 14px;font-size:13px;color:var(--text3);line-height:1.7;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;}
.faq-a.open{max-height:220px;padding:12px 14px;}

/* history */
.history-item{background:var(--bg-surface);border:0.5px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.history-verdict{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.history-info{flex:1;}
.history-card-name{font-size:13px;font-weight:500;color:var(--text);}
.history-meta{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px;}
.history-conf{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;}

/* pwa */
.pwa-banner{position:fixed;bottom:0;left:0;right:0;z-index:90;padding:12px 16px;background:var(--bg-modal);border-top:0.5px solid var(--gold-border);display:flex;align-items:center;gap:12px;animation:slideUp .3s ease;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.pwa-icon{width:38px;height:38px;border-radius:8px;background:var(--gold-dim);border:0.5px solid var(--gold-border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;}
.pwa-text{flex:1;}
.pwa-title{font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px;}
.pwa-sub{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;}
.pwa-actions{display:flex;gap:6px;flex-shrink:0;}

/* buttons */
.btn{padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:'DM Sans',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
.btn-gold{background:var(--gold);color:#07080d;}
.btn-gold:hover{background:var(--gold-h);}
.btn-ghost{background:var(--ghost-bg,transparent);border:0.5px solid var(--border-soft);color:var(--ghost-text,#9996a3);}
.btn-ghost:hover{border-color:var(--border);color:var(--ghost-text-h,#b0adb8);}
.btn-sm{padding:7px 14px;font-size:12px;}
.btn:disabled{opacity:.35;cursor:not-allowed;}

/* footer */
.footer-nav{display:flex;justify-content:center;gap:12px;margin-top:1.5rem;flex-wrap:wrap;}
.footer-link{font-size:11px;color:var(--text4);font-family:'DM Mono',monospace;background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}
.footer-link:hover{color:var(--text3);}
.disclaimer{text-align:center;font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;margin-top:.75rem;line-height:1.7;}
.err-box{background:rgba(248,113,113,.08);border:0.5px solid rgba(248,113,113,.2);border-radius:10px;padding:12px 16px;font-size:13px;color:#f87171;margin-bottom:1rem;}
.page-view{animation:fadeUp .3s ease;}
.page-hdr{display:flex;align-items:center;gap:10px;margin-bottom:1.5rem;}
.page-back{background:none;border:none;cursor:pointer;color:var(--gold);font-size:20px;padding:0;}
.page-title{font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--text);}
.skel{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-scan) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:6px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;

/* ─── ICONS ─── */
function Logo({ gold="#E6B43C" }) {
  const b={ fill:"none", stroke:gold, strokeWidth:1.1, opacity:0.55, strokeLinecap:"round" };
  return <svg width="34" height="48" viewBox="0 0 38 54" fill="none"><rect x="1" y="1" width="36" height="52" rx="5" stroke={gold} strokeWidth="1.8"/><line x1="1" y1="9" x2="37" y2="9" stroke={gold} strokeWidth="0.5" opacity="0.2"/><path d="M6,6 L6,11 M6,6 L11,6" {...b}/><path d="M32,6 L32,11 M32,6 L27,6" {...b}/><path d="M6,48 L6,43 M6,48 L11,48" {...b}/><path d="M32,48 L32,43 M32,48 L27,48" {...b}/><path d="M11,29 L17,36 L28,21" fill="none" stroke={gold} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function SunIcon({ color }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="19.8" y1="4.2" x2="17.7" y2="6.3"/><line x1="6.3" y1="17.7" x2="4.2" y2="19.8"/></svg>; }
function MoonIcon({ color }) { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>; }
function ThemeBtn({ theme, onToggle, float=false }) {
  const gold=theme==="light"?"#b8860b":"#E6B43C";
  return <button className={float?"theme-btn-float":"theme-btn"} onClick={onToggle} aria-label="Toggle theme">{theme==="dark"?<SunIcon color={gold}/>:<MoonIcon color={gold}/>}</button>;
}

/* ─── SMOOTH PROGRESS BAR ─── */
function ScanProgress() {
  const [pct,setPct]=useState(0);
  const [msg,setMsg]=useState("Examining your card…");
  const msgs=["Examining your card…","Analysing print quality…","Checking fonts and colours…","Assessing holographic elements…","Generating verdict…"];
  useEffect(()=>{
    const iv=setInterval(()=>{
      setPct(p=>{
        const n=Math.min(p+(100-p)*0.07,94);
        setMsg(msgs[Math.min(Math.floor((n/100)*msgs.length),msgs.length-1)]);
        return n;
      });
    },350);
    return ()=>clearInterval(iv);
  },[]);
  return (
    <div className="progress-wrap">
      <div className="progress-icon">🔍</div>
      <p className="progress-label">{msg}</p>
      <div className="progress-track"><div className="progress-fill" style={{ width:`${pct}%` }}/></div>
      <div className="progress-pct">{Math.round(pct)}%</div>
    </div>
  );
}

/* ─── ONBOARDING ─── */
const TOUR=[
  { icon:"🃏", title:"Welcome to TCGVerify", desc:"Professional trading card authentication for Pokémon, Magic, Yu-Gi-Oh! and more. Your first 3 scans are completely free." },
  { icon:"📸", title:"Point and shoot", desc:"Place your card on a flat surface in good light. The camera opens automatically — just tap the shutter button to capture." },
  { icon:"🔍", title:"TCGVerify does the rest", desc:"Our authentication engine examines print quality, fonts, colours, holographic patterns and more against verified specimens." },
  { icon:"✓", title:"Instant verdict", desc:"Get a detailed verdict, confidence score, condition grade, and estimated market value in seconds." },
];
function OnboardingTour({ onDone }) {
  const [s,setS]=useState(0);
  const t=TOUR[s];
  return (
    <div className="tour-bg"><div className="tour-card">
      <div className="tour-step">Step {s+1} of {TOUR.length}</div>
      <div className="tour-icon">{t.icon}</div>
      <h2 className="tour-title">{t.title}</h2>
      <p className="tour-desc">{t.desc}</p>
      <div className="tour-dots">{TOUR.map((_,i)=><div key={i} className={`tour-dot${i===s?" active":""}`}/>)}</div>
      <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={()=>s===TOUR.length-1?onDone():setS(x=>x+1)}>{s===TOUR.length-1?"Let's go →":"Next →"}</button>
      {s>0&&<button className="modal-dismiss" onClick={()=>setS(x=>x-1)}>← Back</button>}
      {s===0&&<button className="modal-dismiss" onClick={onDone}>Skip tour</button>}
    </div></div>
  );
}

/* ─── FLAT SURFACE REMINDER ─── */
function FlatSurfaceReminder({ onContinue }) {
  return (
    <div className="flat-overlay">
      <div className="flat-card">
        <div className="flat-icon">📋</div>
        <h2 className="flat-title">Before you scan</h2>
        <div className="flat-tips">
          {[
            ["💡","Good lighting","Natural light or desk lamp — no flash"],
            ["📐","Flat surface","Place card on a plain flat surface"],
            ["🔍","Fill the frame","Card should fill most of the view"],
            ["🚫","No glare","Tilt phone slightly to avoid reflections"],
          ].map(([icon,title,desc],i)=>(
            <div key={i} className="flat-tip">
              <div className="flat-dot"/>
              <span><strong>{icon} {title}</strong> — {desc}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={onContinue}>Start scanning →</button>
        <p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginTop:8 }}>This tip helps get the most accurate result</p>
      </div>
    </div>
  );
}

/* ─── DISCLAIMER ─── */
function DisclaimerModal({ onAccept }) {
  return (
    <div className="modal-bg"><div className="modal">
      <div style={{ fontSize:32,marginBottom:10 }}>⚠️</div>
      <h2 className="modal-title">Before You Begin</h2>
      <p className="modal-sub">Please read this important notice.</p>
      <div style={{ textAlign:"left",background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:10,padding:"1rem",marginBottom:"1.25rem" }}>
        {["TCGVerify provides indicative assessments for reference only — not professional grading.","For high-value cards, always obtain professional grading before buying or selling.","Assessment accuracy depends significantly on photo quality and lighting.","Card values shown are estimates — check TCGPlayer or eBay for current prices."].map((t,i)=>(
          <div key={i} style={{ display:"flex",gap:8,marginBottom:8,fontSize:13,color:"var(--text2)",lineHeight:1.6 }}><span style={{ color:"var(--gold)",flexShrink:0 }}>•</span><span>{t}</span></div>
        ))}
      </div>
      <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={onAccept}>I understand — continue</button>
      <p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginTop:10 }}>This notice will not show again</p>
    </div></div>
  );
}

/* ─── TIPS MODAL ─── */
function TipsModal({ onClose }) {
  const tips=[{icon:"💡",title:"Good lighting",desc:"Natural daylight or desk lamp. No flash — causes glare on holographic cards."},{icon:"📐",title:"Lay it flat",desc:"Plain flat surface. Any curve affects the analysis."},{icon:"🔍",title:"Fill the frame",desc:"Card should fill most of the photo with all edges visible."},{icon:"🚫",title:"No reflections",desc:"Tilt phone slightly to avoid camera reflections."},{icon:"🔄",title:"Both sides",desc:"Front and back together gives a much more accurate result."},{icon:"📸",title:"Keep steady",desc:"Blurry photos reduce accuracy significantly."}];
  return (
    <div className="modal-bg"><div className="modal">
      <h2 className="modal-title">📸 Photo Tips</h2>
      <p className="modal-sub">Better photos = more accurate results</p>
      <div className="tips-grid">{tips.map((t,i)=><div key={i} className="tip-card"><div className="tip-icon">{t.icon}</div><div className="tip-title">{t.title}</div><div className="tip-desc">{t.desc}</div></div>)}</div>
      <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={onClose}>Got it</button>
    </div></div>
  );
}

/* ─── CONFIDENCE MODAL ─── */
function ConfidenceModal({ confidence, onClose }) {
  const level=getConfLevel(confidence);
  return (
    <div className="modal-bg"><div className="modal">
      <h2 className="modal-title">What does {confidence}% mean?</h2>
      <div style={{ background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:12,padding:"1rem 1.25rem",marginBottom:"1.25rem",textAlign:"left" }}>
        <div style={{ display:"flex",alignItems:"baseline",gap:8,marginBottom:6 }}><span style={{ fontFamily:"'Syne',sans-serif",fontSize:"2.2rem",fontWeight:800,color:level.colour }}>{confidence}%</span><span style={{ fontSize:13,fontWeight:500,color:level.colour }}>{level.label}</span></div>
        <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width:`${confidence}%`,background:level.colour }}/></div>
        <p style={{ fontSize:13,color:"var(--text2)",lineHeight:1.7 }}>{level.desc}</p>
      </div>
      <div style={{ textAlign:"left",marginBottom:"1.25rem" }}>
        {CONF_LEVELS.map((l,i)=><div key={i} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:7 }}><div style={{ width:7,height:7,borderRadius:"50%",background:l.colour,flexShrink:0 }}/><span style={{ fontSize:11,color:"var(--text3)",fontFamily:"'DM Mono',monospace",width:55 }}>{l.min}–{l.max}%</span><span style={{ fontSize:12,color:"var(--text2)" }}>{l.label}</span></div>)}
      </div>
      <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={onClose}>Got it</button>
    </div></div>
  );
}

/* ─── PAYWALL ─── */
function PaywallModal({ onDismiss, onSelect }) {
  return (
    <div className="modal-bg"><div className="modal">
      <div style={{ fontSize:32,marginBottom:10 }}>🔒</div>
      <h2 className="modal-title">Unlock More Scans</h2>
      <p className="modal-sub">You've used your free scans. Choose a plan to continue.</p>
      <div className="tier-grid">
        {[{key:"starter",popular:false},{key:"pro",popular:true},{key:"business",popular:false}].map(({key,popular})=>{
          const t=TIERS[key];
          return <div key={key} className={`tier-card${popular?" popular":""}`} onClick={()=>onSelect(key)}>
            {popular&&<div className="popular-badge">POPULAR</div>}
            <div className="tier-label">{t.label}</div>
            <div className="tier-price">{t.price}</div>
            <div className="tier-period">/{t.period}</div>
            <div className="tier-scans">{t.limit} scans</div>
          </div>;
        })}
      </div>
      <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={()=>onSelect("pro")}>Get started →</button>
      <br/><button className="modal-dismiss" onClick={onDismiss}>Maybe later</button>
    </div></div>
  );
}

/* ─── AUTH GATE ─── */
function AuthGate({ onSignIn, onMagicLink, loading, magicSent, theme, onToggle, stats, recentFeed }) {
  const [tab,setTab]=useState("google");
  const [email,setEmail]=useState("");
  const gold=theme==="light"?"#b8860b":"#E6B43C";
  const vColour={ auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const vShort={ auth:"Authentic", counter:"Counterfeit markers", inc:"Inconclusive" };
  return (
    <div className="agate">
      <ThemeBtn theme={theme} onToggle={onToggle} float/>
      <div className="auth-card">
        <div style={{ display:"flex",justifyContent:"center",marginBottom:12 }}><Logo gold={gold}/></div>
        <h1 className="auth-title">TCG<span style={{ color:gold }}>Verify</span></h1>
        <p className="auth-sub">Professional card authentication for all major TCGs.</p>
        {stats&&(
          <div className="stats-bar" style={{ marginBottom:"1rem" }}>
            <div className="stat-item"><div className="stat-num">{stats.total.toLocaleString()}</div><div className="stat-label">Cards checked</div></div>
            <div className="stat-item"><div className="stat-num">{stats.authentic}%</div><div className="stat-label">Authentic</div></div>
            <div className="stat-item"><div className="stat-num">{stats.fakes}</div><div className="stat-label">Fakes caught</div></div>
          </div>
        )}
        <div className="auth-perks" style={{ marginBottom:"1rem" }}>
          {["3 free scans — no card required","Condition grading & estimated value","Pokémon, Magic, Yu-Gi-Oh! & more","Scan history saved to your account"].map(p=><div key={p} className="perk"><span className="perk-dot"/>{p}</div>)}
        </div>
        <div className="auth-tabs">
          <button className={`auth-tab${tab==="google"?" active":""}`} onClick={()=>setTab("google")}>Google</button>
          <button className={`auth-tab${tab==="email"?" active":""}`} onClick={()=>setTab("email")}>Any Email</button>
        </div>
        {tab==="google"&&(
          <button className="btn-google" onClick={onSignIn} disabled={loading}><GoogleIcon/>{loading?"Signing in…":"Continue with Google"}</button>
        )}
        {tab==="email"&&(
          magicSent?(
            <div className="magic-sent">✉️ Magic link sent!<br/>Check your inbox and click the link to sign in.<br/><span style={{ fontSize:11,opacity:.7 }}>No password needed — ever.</span></div>
          ):(
            <div>
              <input className="magic-input" type="email" placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onMagicLink(email)}/>
              <button className="btn btn-gold" style={{ width:"100%",justifyContent:"center" }} onClick={()=>onMagicLink(email)} disabled={loading||!email.includes("@")}>{loading?"Sending…":"Send magic link →"}</button>
            </div>
          )
        )}
        <p className="auth-note">Scan count is tied to your account — incognito won't reset your free scans.</p>
      </div>
      {recentFeed&&recentFeed.length>0&&(
        <div style={{ maxWidth:380,width:"100%",marginTop:16,padding:"0 0.5rem" }}>
          <p style={{ fontSize:10,color:"var(--text4)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"1px",marginBottom:8,textAlign:"center" }}>Recent checks</p>
          {recentFeed.slice(0,4).map((f,i)=>(
            <div key={i} className="feed-item">
              <div className="feed-dot" style={{ background:vColour[f.verdict]||"#E6B43C" }}/>
              <div className="feed-info"><strong>{f.card_name||"Unknown card"}</strong> — {vShort[f.verdict]||"Inconclusive"}</div>
              <div className="feed-time">{f.ago}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CAMERA HOOK ─── */
function useCam(vRef) {
  const [on,setOn]=useState(false);
  const start=useCallback(async()=>{ try{ const s=await navigator.mediaDevices.getUserMedia({ video:{facingMode:"environment"}, audio:false }); vRef.current.srcObject=s; vRef.current.play(); setOn(true); }catch{ alert("Camera unavailable — please use the upload option instead."); } },[vRef]);
  const stop=useCallback(()=>{ vRef.current?.srcObject?.getTracks().forEach(t=>t.stop()); if(vRef.current) vRef.current.srcObject=null; setOn(false); },[vRef]);
  const capture=useCallback(()=>{ const c=document.createElement("canvas"); c.width=vRef.current.videoWidth; c.height=vRef.current.videoHeight; c.getContext("2d").drawImage(vRef.current,0,0); return c.toDataURL("image/jpeg",.92); },[vRef]);
  return { on, start, stop, capture };
}

/* ─── CAMERA PANEL v6 — sticky shutter, tap to capture ─── */
function CameraPanel({ label, stepNum, totalSteps, image, onCapture, onClear, onShowTips }) {
  const vRef=useRef(null), fRef=useRef(null);
  const { on, start, stop, capture }=useCam(vRef);
  const [mode,setMode]=useState("camera");

  useEffect(()=>{ start(); return ()=>stop(); },[]);

  const doCapture=useCallback(()=>{
    if(mode!=="camera"||!on) return;
    const d=capture();
    stop();
    setMode("captured");
    if(navigator.vibrate) navigator.vibrate(50);
    onCapture({ base64:d.split(",")[1], mediaType:"image/jpeg", preview:d });
  },[mode,on,capture,stop,onCapture]);

  const doRetake=()=>{ setMode("camera"); onClear(); start(); };
  const doFile=async f=>{ if(!f||!f.type.startsWith("image/")) return; const d=await toBase64(f); setMode("captured"); stop(); onCapture(d); };

  return (
    <div className="cam-wrap">
      {/* Camera view — tap to capture */}
      <div className="cam-screen" onClick={mode==="camera"?doCapture:undefined} style={{ cursor:mode==="camera"?"crosshair":"default" }}>
        {mode==="camera"&&<video ref={vRef} playsInline muted style={{ width:"100%",aspectRatio:"3/4",objectFit:"cover",display:"block" }}/>}
        {mode==="captured"&&image&&<img src={image.preview} alt={label} style={{ width:"100%",aspectRatio:"3/4",objectFit:"contain",display:"block",background:"#000" }}/>}
        <div className="cam-overlay-ui">
          <div className="cam-corner tl"/><div className="cam-corner tr"/>
          <div className="cam-corner bl"/><div className="cam-corner br"/>
          <div className="cam-label-badge">{label}</div>
          {mode==="captured"&&<button className="cam-retake-btn" onClick={e=>{ e.stopPropagation(); doRetake(); }}>Retake</button>}
          {mode==="camera"&&on&&<div className="cam-tap-hint">Tap anywhere to capture</div>}
        </div>
      </div>

      {/* Sticky shutter bar */}
      <div className="shutter-bar">
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
          <button className="upload-btn" onClick={()=>fRef.current.click()}>⬆ Upload</button>
          <input ref={fRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>doFile(e.target.files[0])}/>
        </div>
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
          <div className="step-dots">
            {Array.from({length:totalSteps}).map((_,i)=><div key={i} className={`step-dot${i<stepNum-1?" done":i===stepNum-1?" active":""}`}/>)}
          </div>
          {mode==="camera"&&on?(
            <button className="shutter" onClick={doCapture} aria-label="Capture">
              <div className="shutter-inner"/>
            </button>
          ):(
            <div style={{ width:68,height:68,borderRadius:"50%",background:"rgba(74,222,128,.15)",border:"3px solid rgba(74,222,128,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24 }}>✓</div>
          )}
          <div className="shutter-label">{mode==="camera"?"Tap to capture":"Captured!"}</div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
          <button className="upload-btn" onClick={onShowTips}>📸 Tips</button>
        </div>
      </div>
    </div>
  );
}

/* ─── VIDEO PANEL ─── */
function VideoPanel({ isPro, video, onVideo, onClear }) {
  const fRef=useRef(null);
  const hFile=f=>{ if(!f||!f.type.startsWith("video/")) return; const p=URL.createObjectURL(f); const r=new FileReader(); r.onload=e=>onVideo({ base64:e.target.result.split(",")[1],mediaType:f.type,preview:p,name:f.name }); r.readAsDataURL(f); };
  if(!isPro) return <div style={{ padding:"1.5rem",textAlign:"center" }}><div style={{ fontSize:32,marginBottom:8,opacity:.4 }}>🎬</div><div className="popular-badge" style={{ marginBottom:10 }}>Pro Feature</div><div style={{ fontSize:14,fontWeight:500,color:"var(--text2)",marginBottom:6 }}>Holographic Video Analysis</div><div style={{ fontSize:12,color:"var(--text3)",lineHeight:1.6 }}>Upload a 3-second video tilting the card under light.</div></div>;
  return (
    <div style={{ padding:"1.25rem" }}>
      {!video?<div style={{ border:"1.5px dashed var(--border-soft)",borderRadius:10,padding:"2rem",textAlign:"center",cursor:"pointer",position:"relative" }} onClick={()=>fRef.current.click()}><input ref={fRef} type="file" accept="video/*" style={{ display:"none" }} onChange={e=>hFile(e.target.files[0])}/><span style={{ fontSize:28 }}>🎬</span><p style={{ fontSize:13,color:"var(--text3)",marginTop:8 }}>Upload holo video (max 10MB)</p></div>
      :<div style={{ display:"flex",alignItems:"center",gap:10,padding:".75rem 1rem",background:"var(--bg-surface)",borderRadius:8,border:"0.5px solid var(--border)" }}><span style={{ fontSize:20 }}>🎬</span><span style={{ fontSize:13,color:"var(--text2)",fontFamily:"'DM Mono',monospace",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{video.name}</span><button className="btn btn-ghost btn-sm" onClick={onClear}>✕</button></div>}
    </div>
  );
}

/* ─── SUMMARY TOGGLE ─── */
function SummaryToggle({ summary }) {
  const [open,setOpen]=useState(false);
  return (
    <div className="result-section">
      <button className="summary-toggle" onClick={()=>setOpen(o=>!o)}>{open?"Hide summary ↑":"Read full summary ↓"}</button>
      {open&&<p className="summary-text">{summary}</p>}
    </div>
  );
}

/* ─── PDF GENERATOR ─── */
function generatePDF(result, userEmail) {
  const vLabel={ auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vColour={ auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const level=getConfLevel(result.confidence);
  const condInfo=CONDITIONS[result.condition]||null;
  const flagColour={ r:"#f87171", g:"#4ade80", y:"#E6B43C" };
  const html=`<html><head><style>
    body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;color:#1a1820;}
    .hdr{text-align:center;border-bottom:2px solid #E6B43C;padding-bottom:20px;margin-bottom:24px;}
    .logo{font-size:26px;font-weight:900;letter-spacing:2px;}.logo span{color:#E6B43C;}
    .sub{font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;margin-top:4px;}
    .date{font-size:11px;color:#888;margin-top:6px;}
    .vbox{border-radius:8px;padding:16px 20px;margin-bottom:20px;border:1px solid ${vColour[result.verdict]}33;background:${vColour[result.verdict]}11;}
    .vlabel{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${vColour[result.verdict]};margin-bottom:4px;}
    .vtitle{font-size:18px;font-weight:700;color:${vColour[result.verdict]};}
    .crow{display:flex;align-items:baseline;gap:8px;margin-top:8px;}
    .cnum{font-size:28px;font-weight:900;color:${level.colour};}
    .clabel{font-size:12px;color:#888;}
    .sec{margin-bottom:18px;}
    .sth{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#aaa;margin-bottom:8px;border-bottom:0.5px solid #eee;padding-bottom:4px;}
    .cbadge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;background:${condInfo?condInfo.colour+"22":"#eee"};color:${condInfo?condInfo.colour:"#888"};}
    .valbadge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;background:#E6B43C22;color:#b8860b;}
    .summary{font-size:13px;line-height:1.7;color:#444;}
    .flag{display:flex;gap:8px;margin-bottom:8px;font-size:12px;color:#555;line-height:1.5;}
    .fdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:4px;}
    .footer{margin-top:32px;padding-top:16px;border-top:0.5px solid #eee;font-size:10px;color:#aaa;text-align:center;line-height:1.7;}
  </style></head><body>
    <div class="hdr"><div class="logo">TCG<span>Verify</span></div><div class="sub">Card Authentication Report</div><div class="date">Checked by ${sanitise(userEmail)} &middot; ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div></div>
    ${result.cardName&&result.cardName!=="Unable to identify"?`<div class="sec"><div class="sth">Card Identification</div><p class="summary">${sanitise(result.cardName)}${result.cardSet?` &middot; ${sanitise(result.cardSet)}`:""}${result.cardRarity?` &middot; ${sanitise(result.cardRarity)}`:""}</p></div>`:""}
    <div class="vbox"><div class="vlabel">Authentication Result</div><div class="vtitle">${vLabel[result.verdict]}</div><div class="crow"><div class="cnum">${result.confidence}%</div><div class="clabel">${level.label}</div></div></div>
    ${result.condition||result.estimatedValue?`<div class="sec"><div class="sth">Condition &amp; Value</div>${result.condition?`<span class="cbadge">${sanitise(result.condition)}</span> `:""}${result.estimatedValue&&result.estimatedValue!=="Unable to estimate"?`<span class="valbadge">${sanitise(result.estimatedValue)}</span>`:""}</div>`:""}
    ${result.summary?`<div class="sec"><div class="sth">Summary</div><div class="summary">${sanitise(result.summary)}</div></div>`:""}
    ${result.flags.length>0?`<div class="sec"><div class="sth">Analysis Breakdown</div>${result.flags.map(f=>`<div class="flag"><div class="fdot" style="background:${flagColour[f.type]||"#E6B43C"}"></div><span>${sanitise(f.text)}</span></div>`).join("")}</div>`:""}
    <div class="footer">TCGVerify provides indicative assessments only &middot; Not a substitute for professional grading<br/>Card values are estimates only &middot; Always verify with PSA, BGS or CGC for high-value cards</div>
  </body></html>`;
  const blob=new Blob([html],{type:"text/html"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`tcgverify-${Date.now()}.html`; a.click(); URL.revokeObjectURL(url);
}

/* ─── RESULT ─── */
function Result({ result, onScanAnother, onReset, userEmail }) {
  const [showConf,setShowConf]=useState(false);
  const vLabel={ auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vIcon={ auth:"✓", counter:"✗", inc:"?" };
  const condInfo=CONDITIONS[result.condition]||null;
  const level=getConfLevel(result.confidence);
  const shareText=`I just verified a trading card with TCGVerify — ${vLabel[result.verdict]} (${result.confidence}% confidence). Check yours at tcgverify.ai`;
  const showLowConfWarning=result.verdict==="counter"&&result.confidence<80;

  return (
    <div className="result-wrap">
      {showConf&&<ConfidenceModal confidence={result.confidence} onClose={()=>setShowConf(false)}/>}

      {/* Prominent scan another at top */}
      <button className="scan-another-top" onClick={onScanAnother}>🃏 Scan another card</button>

      <div className={`verdict-bar ${result.verdict}`}>
        <div className="v-icon">{vIcon[result.verdict]}</div>
        <div style={{ flex:1 }}>
          <div className="v-label">Authentication Result</div>
          <div className="v-title">{vLabel[result.verdict]}</div>
        </div>
        <div className="conf-wrap" onClick={()=>setShowConf(true)}>
          <div className="conf-n">{result.confidence}%</div>
          <div className="conf-l">Confidence</div>
          <div className="conf-tap">Tap to explain ↗</div>
        </div>
      </div>

      <div className="result-body">
        {/* Card ID — single line */}
        {(result.cardName&&result.cardName!=="Unable to identify")&&(
          <div className="result-section" style={{ padding:"0.8rem 1.5rem" }}>
            <div className="card-id-line">
              <span className="card-id-name">{result.cardName}</span>
              {result.cardSet&&<><span className="card-id-sep">·</span><span className="card-id-meta">{result.cardSet}</span></>}
              {result.cardRarity&&<><span className="card-id-sep">·</span><span className="card-id-meta">{result.cardRarity}</span></>}
              {result.cardGame&&<span className="card-id-game">{result.cardGame}</span>}
            </div>
            {result.verdict==="counter"&&<div className="fake-id-notice">⚠ Card name is based on artwork — less reliable on suspected counterfeits.</div>}
          </div>
        )}

        {/* Condition + Value — badges only, no description */}
        {(result.condition||result.estimatedValue)&&(
          <div className="result-section" style={{ padding:"0.8rem 1.5rem" }}>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
              {result.condition&&condInfo&&(
                <div className="condition-badge" style={{ borderColor:condInfo.colour+"44",color:condInfo.colour }}>
                  <div className="cond-dot" style={{ background:condInfo.colour }}/>
                  <span style={{ fontSize:13,fontWeight:500 }}>{result.condition}</span>
                  <span style={{ fontSize:11,opacity:.7 }}>({condInfo.short})</span>
                </div>
              )}
              {result.estimatedValue&&result.estimatedValue!=="Unable to estimate"&&(
                <div className="value-badge">💰 {result.estimatedValue}</div>
              )}
            </div>
          </div>
        )}

        {/* Low confidence counterfeit warning */}
        {showLowConfWarning&&(
          <div className="result-section" style={{ padding:"0.8rem 1.5rem" }}>
            <div className="low-conf-notice">
              ⚠ Moderate confidence result — poor lighting, glare, or an uneven surface can cause genuine cards to appear suspicious. Try rescanning on a flat surface in better light before drawing conclusions.
            </div>
          </div>
        )}

        {/* Flags — straight away, max 3 for authentic */}
        {result.flags.length>0&&(
          <div className="result-section">
            <div className="sec-hdg">Analysis Breakdown</div>
            {result.flags.map((f,i)=><div key={i} className="flag"><div className={`flag-pip pip-${f.type}`}/><p className="flag-txt">{f.text}</p></div>)}
          </div>
        )}

        {/* Summary — collapsed */}
        {result.summary&&<SummaryToggle summary={result.summary}/>}
      </div>

      <div className="result-actions" style={{ marginTop:"1rem" }}>
        <button className="btn btn-ghost btn-sm" onClick={onReset}>Full reset</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>generatePDF(result,userEmail)}>⬇ PDF</button>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>𝕏</a>
        <a href={`https://reddit.com/submit?title=${encodeURIComponent("TCGVerify result")}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>Reddit</a>
      </div>
    </div>
  );
}

/* ─── REFERRAL BOX ─── */
function ReferralBox({ userId }) {
  const code=getReferralCode(userId);
  const [copied,setCopied]=useState(false);
  return (
    <div className="referral-box">
      <div className="ref-title">🎁 Give 3 scans, get 3 scans</div>
      <div className="ref-desc">Share your link. When a friend signs up you both get 3 bonus scans.</div>
      <div className="ref-code-row">
        <div className="ref-code">tcgverify.ai?ref={code}</div>
        <button className="ref-copy" onClick={()=>{ navigator.clipboard.writeText(`tcgverify.ai?ref=${code}`); setCopied(true); setTimeout(()=>setCopied(false),2000); }}>{copied?"Copied!":"Copy"}</button>
      </div>
    </div>
  );
}

/* ─── PROMO BOX ─── */
function PromoBox({ userId, onScansAdded }) {
  const [code,setCode]=useState("");
  const [msg,setMsg]=useState("");
  const [ok,setOk]=useState(false);
  const PROMOS={ "TCGLAUNCH":10, "WELCOME10":10, "YOUTUBER":20 };
  const apply=async()=>{
    const clean=code.trim().toUpperCase();
    const bonus=PROMOS[clean];
    if(!bonus){ setMsg("Invalid or expired code"); setOk(false); return; }
    const used=JSON.parse(localStorage.getItem(`tcgv_promos_${userId}`)||"[]");
    if(used.includes(clean)){ setMsg("Already used this code"); setOk(false); return; }
    const {data}=await supabase.from("profiles").select("scan_count").eq("id",userId).single();
    const newCount=Math.max(0,(data?.scan_count||0)-bonus);
    await supabase.from("profiles").update({scan_count:newCount}).eq("id",userId);
    localStorage.setItem(`tcgv_promos_${userId}`,JSON.stringify([...used,clean]));
    setMsg(`✓ ${bonus} bonus scans added!`); setOk(true); setCode(""); onScansAdded(bonus);
  };
  return (
    <div style={{ marginBottom:"1.25rem" }}>
      <p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginBottom:6 }}>Have a promo code?</p>
      <div className="promo-row">
        <input className="promo-input" placeholder="Enter code" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&apply()}/>
        <button className="promo-btn" onClick={apply}>Apply</button>
      </div>
      {msg&&<p className={ok?"promo-ok":"promo-err"}>{msg}</p>}
    </div>
  );
}

/* ─── HISTORY PAGE ─── */
function HistoryPage({ onBack, userId }) {
  const [scans,setScans]=useState([]);
  const [loading,setLoading]=useState(true);
  const vColour={ auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const vLabel={ auth:"Authentic", counter:"Counterfeit markers", inc:"Inconclusive" };
  useEffect(()=>{ supabase.from("scans").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(50).then(({data})=>{ setScans(data||[]); setLoading(false); }); },[userId]);
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Scan History</h2></div>
      {loading?<div style={{ display:"flex",gap:7,justifyContent:"center",padding:"2rem" }}>{[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"var(--gold)",opacity:.4,animation:"dp 1.2s ease-in-out infinite",animationDelay:`${i*.2}s` }}/>)}</div>
      :scans.length===0?<div style={{ textAlign:"center",padding:"2rem",fontSize:13,color:"var(--text3)" }}><div style={{ fontSize:36,marginBottom:10 }}>🃏</div><p>No scans yet — check your first card!</p></div>
      :scans.map((s,i)=>(
        <div key={i} className="history-item">
          <div className="history-verdict" style={{ background:vColour[s.verdict]||"#E6B43C" }}/>
          <div className="history-info">
            <div className="history-card-name">{s.card_name||"Unknown card"}</div>
            <div className="history-meta">{s.card_set&&`${s.card_set} · `}{s.condition_grade&&`${s.condition_grade} · `}{new Date(s.created_at).toLocaleDateString("en-GB")}</div>
            <div style={{ fontSize:11,color:vColour[s.verdict]||"#E6B43C",fontFamily:"'DM Mono',monospace",marginTop:2 }}>{vLabel[s.verdict]||"Inconclusive"}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="history-conf" style={{ color:vColour[s.verdict]||"#E6B43C" }}>{s.confidence}%</div>
            {s.estimated_value&&s.estimated_value!=="Unable to estimate"&&<div style={{ fontSize:11,color:"var(--gold)",fontFamily:"'DM Mono',monospace",marginTop:2 }}>{s.estimated_value}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── EXAMPLES PAGE ─── */
function ExamplesPage({ onBack }) {
  const examples=[
    { verdict:"auth",conf:94,card:"Charizard VMAX",set:"Brilliant Stars",rarity:"Secret Rare",condition:"Near Mint",value:"£85–120",summary:"Print characteristics are highly consistent with authenticated specimens. Holographic foil behaviour aligns precisely with official production standards.",flags:[{type:"g",text:"Print dot pattern consistent with official TCG production standards."},{type:"g",text:"Holographic foil exhibits the characteristic rainbow shift expected from authentic specimens."},{type:"y",text:"Minor centering deviation — within acceptable variance for this print run."}] },
    { verdict:"counter",conf:88,card:"Pikachu VMAX",set:"Vivid Voltage",rarity:"Full Art",condition:"Lightly Played",value:"Unable to estimate",summary:"Several characteristics deviate from authenticated examples. Print quality and font metrics exhibit markers commonly associated with unofficial reproductions.",flags:[{type:"r",text:"Font weight on HP value visibly thinner than authenticated specimens."},{type:"r",text:"Colour saturation appears washed out compared to genuine examples."},{type:"r",text:"Card back shows subtle misalignment inconsistent with official production."}] },
    { verdict:"inc",conf:55,card:"Unable to identify",set:"Unknown",rarity:"Unknown",condition:"Moderately Played",value:"Unable to estimate",summary:"Image quality and card condition made a definitive assessment difficult. A higher quality photograph is recommended before drawing conclusions.",flags:[{type:"y",text:"Image slightly out of focus — key authentication markers could not be clearly assessed."},{type:"r",text:"Visible crease reduces gradability regardless of authenticity."}] },
  ];
  const vColour={ auth:"#4ade80", counter:"#f87171", inc:"#E6B43C" };
  const vLabel={ auth:"Highly Likely Authentic", counter:"Characteristics Match Known Counterfeits", inc:"Inconclusive — Professional Review Advised" };
  const vIcon={ auth:"✓", counter:"✗", inc:"?" };
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Example Results</h2></div>
      <p style={{ fontSize:13,color:"var(--text3)",marginBottom:16,lineHeight:1.6 }}>See what TCGVerify results look like across different scenarios.</p>
      {examples.map((e,i)=>{
        const condInfo=CONDITIONS[e.condition]||null;
        return (
          <div key={i} style={{ background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:14,overflow:"hidden",marginBottom:16 }}>
            <div className={`verdict-bar ${e.verdict}`}>
              <div className="v-icon">{vIcon[e.verdict]}</div>
              <div style={{ flex:1 }}><div className="v-label">Example Result</div><div className="v-title">{vLabel[e.verdict]}</div></div>
              <div className="conf-wrap" style={{ cursor:"default" }}><div className="conf-n">{e.conf}%</div><div className="conf-l">Confidence</div></div>
            </div>
            <div className="result-body">
              {e.card!=="Unable to identify"&&<div className="result-section" style={{ padding:"0.8rem 1.5rem" }}><div className="card-id-line"><span className="card-id-name">{e.card}</span>{e.set!=="Unknown"&&<><span className="card-id-sep">·</span><span className="card-id-meta">{e.set}</span></>}</div></div>}
              <div className="result-section" style={{ padding:"0.8rem 1.5rem" }}>
                <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                  {condInfo&&<div className="condition-badge" style={{ borderColor:condInfo.colour+"44",color:condInfo.colour }}><div className="cond-dot" style={{ background:condInfo.colour }}/>{e.condition}<span style={{ fontSize:11,opacity:.7,marginLeft:4 }}>({condInfo.short})</span></div>}
                  {e.value!=="Unable to estimate"&&<div className="value-badge">💰 {e.value}</div>}
                </div>
              </div>
              <div className="result-section"><div className="sec-hdg">Analysis Breakdown</div>{e.flags.map((f,j)=><div key={j} className="flag"><div className={`flag-pip pip-${f.type}`}/><p className="flag-txt">{f.text}</p></div>)}</div>
              <div className="result-section"><button className="summary-toggle" style={{ pointerEvents:"none",opacity:.5 }}>Read full summary ↓</button></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── FAQ ─── */
function FAQPage({ onBack }) {
  const [open,setOpen]=useState(null);
  const faqs=[
    {q:"How accurate is TCGVerify?",a:"Accuracy depends on image quality — a well-lit, in-focus photo of both sides on a flat surface typically yields 80-95% confidence. It's most reliable as a quick first check, not a replacement for professional grading."},
    {q:"Which card games does it support?",a:"Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Disney Lorcana, One Piece TCG, Digimon, Dragon Ball Super, and more."},
    {q:"My genuine card was flagged as a fake — why?",a:"Poor lighting, glare, reflections, or an uneven surface can cause genuine cards to appear suspicious. Always scan on a flat, plain surface in good natural or desk light. If in doubt, rescan with better lighting before drawing conclusions."},
    {q:"How accurate are the card value estimates?",a:"Values are estimates based on training data and are indicative only. Always check TCGPlayer, eBay sold listings, or CardMarket for current prices."},
    {q:"Can I bypass the free scan limit?",a:"No — scans are tracked against your account in our secure database. Incognito, cache clears, and VPNs won't reset your free scans."},
    {q:"How does the referral system work?",a:"Share your unique referral link. When a friend signs up using your link, you both receive 3 bonus scans automatically."},
    {q:"Are my card images stored?",a:"Images are used for authentication only and are not stored after the result is returned."},
  ];
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">FAQ</h2></div>
      {faqs.map((f,i)=><div key={i} className="faq-item"><div className="faq-q" onClick={()=>setOpen(open===i?null:i)}><span>{f.q}</span><span style={{ color:"var(--gold)",fontSize:16 }}>{open===i?"−":"+"}</span></div><div className={`faq-a${open===i?" open":""}`}>{f.a}</div></div>)}
    </div>
  );
}

/* ─── LEGAL ─── */
function TermsPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Terms &amp; Conditions</h2></div>
      <div className="modal-left" style={{ background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:14,padding:"1.25rem" }}>
        <p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginBottom:14 }}>Last updated: {new Date().toLocaleDateString("en-GB",{year:"numeric",month:"long"})}</p>
        {[{h:"1. Service",p:"TCGVerify provides card authentication assessments for informational purposes only. Results are not a substitute for professional grading."},{h:"2. Liability",p:"TCGVerify accepts no liability for financial loss from reliance on our assessments. Always seek professional grading for high-value transactions."},{h:"3. Accuracy",p:"Assessment accuracy depends on image quality and lighting. We make no warranties regarding accuracy."},{h:"4. Accounts",p:"Users must sign in with a valid account. Each account receives 3 free scans. Paid plans are billed monthly and may be cancelled at any time."},{h:"5. Acceptable use",p:"TCGVerify is for card authentication only. Abuse of the free scan limit or automated access is prohibited."}].map((s,i)=><div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

function PrivacyPage({ onBack }) {
  return (
    <div className="page-view">
      <div className="page-hdr"><button className="page-back" onClick={onBack}>←</button><h2 className="page-title">Privacy Policy</h2></div>
      <div className="modal-left" style={{ background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:14,padding:"1.25rem" }}>
        <p style={{ fontSize:11,color:"var(--text4)",fontFamily:"'DM Mono',monospace",marginBottom:14 }}>Last updated: {new Date().toLocaleDateString("en-GB",{year:"numeric",month:"long"})}</p>
        {[{h:"What we collect",p:"Your email when you sign in. Scan count, subscription tier, and scan history. Card images are used for authentication only and not stored after the result is returned."},{h:"How we use it",p:"Your email identifies your account only. We do not sell or share your data."},{h:"Third parties",p:"Supabase (auth/storage), authentication processing services, and Stripe (payments). Each has their own privacy policy."},{h:"Your rights",p:"You may request account deletion at any time. We respond to all requests within 30 days."}].map((s,i)=><div key={i}><h3>{s.h}</h3><p>{s.p}</p></div>)}
      </div>
    </div>
  );
}

/* ─── PWA BANNER ─── */
function InstallBanner() {
  const [prompt,setPrompt]=useState(null);
  const [isIOS,setIsIOS]=useState(false);
  const [iosVisible,setIosVisible]=useState(false);
  const [dismissed,setDismissed]=useState(()=>{ try{ return !!localStorage.getItem("tcgv_pwa_dismissed"); }catch{ return false; } });
  const [installed,setInstalled]=useState(false);
  useEffect(()=>{
    if(window.matchMedia("(display-mode: standalone)").matches){ setInstalled(true); return; }
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    if(ios&&!dismissed){ const t=setTimeout(()=>setIosVisible(true),5000); return ()=>clearTimeout(t); }
    const handler=e=>{ e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt",handler);
    return ()=>window.removeEventListener("beforeinstallprompt",handler);
  },[dismissed]);
  const dismiss=()=>{ try{ localStorage.setItem("tcgv_pwa_dismissed","1"); }catch{} setDismissed(true); setIosVisible(false); };
  const install=async()=>{ if(!prompt) return; prompt.prompt(); const {outcome}=await prompt.userChoice; setPrompt(null); if(outcome==="accepted") dismiss(); };
  if(installed||dismissed) return null;
  if(prompt) return <div className="pwa-banner"><div className="pwa-icon">🃏</div><div className="pwa-text"><div className="pwa-title">Add TCGVerify to home screen</div><div className="pwa-sub">Instant access — no app store needed</div></div><div className="pwa-actions"><button className="btn btn-gold btn-sm" onClick={install}>Add</button><button className="btn btn-ghost btn-sm" onClick={dismiss}>✕</button></div></div>;
  if(isIOS&&iosVisible) return <div className="pwa-banner" style={{ flexDirection:"column",alignItems:"flex-start",gap:10 }}><div style={{ display:"flex",alignItems:"center",gap:10,width:"100%" }}><div className="pwa-icon">🃏</div><div className="pwa-text"><div className="pwa-title">Add to home screen</div><div className="pwa-sub">Instant access every time</div></div><button className="btn btn-ghost btn-sm" onClick={dismiss} style={{ flexShrink:0 }}>✕</button></div><div style={{ background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:8,padding:"10px 12px",width:"100%",fontSize:12,color:"var(--text2)",lineHeight:1.7 }}>Tap <strong>Share ⎙</strong> → <strong>"Add to Home Screen"</strong> → <strong>"Add"</strong></div></div>;
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */
export default function App() {
  /* theme */
  const [theme,setTheme]=useState(()=>{ try{ return localStorage.getItem("tcgv_theme")||"dark"; }catch{ return "dark"; } });
  const toggleTheme=()=>setTheme(t=>{ const n=t==="dark"?"light":"dark"; try{ localStorage.setItem("tcgv_theme",n); }catch{} return n; });
  const gold=theme==="light"?"#b8860b":"#E6B43C";

  /* modals */
  const [showDisclaimer,setShowDisclaimer]=useState(()=>{ try{ return !localStorage.getItem("tcgv_disclaimed"); }catch{ return true; } });
  const [showTour,setShowTour]=useState(false);
  const [showTips,setShowTips]=useState(false);
  const [showPaywall,setShowPaywall]=useState(false);
  const [showFlatReminder,setShowFlatReminder]=useState(false);
  const acceptDisclaimer=()=>{ try{ localStorage.setItem("tcgv_disclaimed","1"); }catch{} setShowDisclaimer(false); if(!localStorage.getItem("tcgv_tour_done")) setShowTour(true); };
  const doneTour=()=>{ try{ localStorage.setItem("tcgv_tour_done","1"); }catch{} setShowTour(false); };

  /* page */
  const [page,setPage]=useState("home");

  /* auth */
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [magicSent,setMagicSent]=useState(false);

  /* landing data */
  const [stats,setStats]=useState(null);
  const [recentFeed,setRecentFeed]=useState([]);

  /* scan state */
  const [scanPhase,setScanPhase]=useState("front");
  const [front,setFront]=useState(null);
  const [back,setBack]=useState(null);
  const [video,setVideo]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else setAuthLoading(false); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{ setUser(session?.user??null); if(session?.user) loadProfile(session.user.id); else{ setProfile(null); setAuthLoading(false); } });
    loadLandingData();
    return ()=>subscription.unsubscribe();
  },[]);

  const loadProfile=async uid=>{ const {data,error}=await supabase.from("profiles").select("scan_count,tier,tier_expires_at").eq("id",uid).single(); if(!error&&data) setProfile(data); setAuthLoading(false); };

  const loadLandingData=async()=>{
    try {
      const {count:total}=await supabase.from("scans").select("*",{count:"exact",head:true});
      const {count:authCount}=await supabase.from("scans").select("*",{count:"exact",head:true}).eq("verdict","auth");
      const {count:counterCount}=await supabase.from("scans").select("*",{count:"exact",head:true}).eq("verdict","counter");
      const t=total||0;
      setStats({ total:t, authentic:t>0?Math.round(((authCount||0)/t)*100):0, fakes:counterCount||0 });
      const {data:recent}=await supabase.from("scans").select("card_name,verdict,created_at").order("created_at",{ascending:false}).limit(8);
      if(recent) setRecentFeed(recent.map(s=>({ ...s, ago:getTimeAgo(new Date(s.created_at)) })));
    } catch {}
  };

  function getTimeAgo(date){
    const diff=Math.floor((Date.now()-date)/1000);
    if(diff<60) return "just now";
    if(diff<3600) return `${Math.floor(diff/60)}m ago`;
    if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }

  const signIn=async()=>{ setAuthLoading(true); await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:window.location.origin } }); };
  const signInMagic=async email=>{ setAuthLoading(true); const {error}=await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo:window.location.origin } }); setAuthLoading(false); if(!error) setMagicSent(true); else alert("Failed to send magic link — check your email address."); };
  const signOut=async()=>{ await supabase.auth.signOut(); setUser(null); setProfile(null); setResult(null); setScanPhase("front"); };

  /* derived */
  const tier=effectiveTier(profile);
  const tierInfo=TIERS[tier];
  const scanCount=profile?.scan_count??0;
  const isPro=tier!=="free";
  const remaining=Math.max(0,tierInfo.limit-scanCount);

  /* analyse */
  const analyse=async(frontImg,backImg,videoData)=>{
    setScanning(true); setError(null); setResult(null);
    try {
      // Step 1: Gemini identifies the card
      let cardInfo=null;
      if(GEMINI_API_KEY) {
        cardInfo=await identifyCardWithGemini(frontImg.base64, frontImg.mediaType);
      }

      // Step 2: Claude authenticates with card context
      const systemPrompt=buildSystemPrompt(cardInfo);
      const content=[
        { type:"image", source:{ type:"base64", media_type:frontImg.mediaType, data:frontImg.base64 } },
        { type:"text", text:"Card front image." },
      ];
      if(backImg){ content.push({ type:"image", source:{ type:"base64", media_type:backImg.mediaType, data:backImg.base64 } },{ type:"text", text:"Card back image." }); }
      content.push({ type:"text", text:backImg?"Authenticate this card. Front and back provided.":"Authenticate this card." });

      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true",
        },
        body:JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:500, system:systemPrompt, messages:[{ role:"user", content }] })
      });
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const text=data.content.map(c=>c.text||"").join("\n");

      const verdict=parseVerdict(text);
      const r={
        verdict,
        confidence:    parseConf(text),
        cardName:      cardInfo?.cardName||"Unable to identify",
        cardSet:       cardInfo?.cardSet||"",
        cardRarity:    cardInfo?.cardRarity||"",
        cardGame:      cardInfo?.cardGame||"",
        condition:     parseField(text,"CONDITION"),
        estimatedValue:parseField(text,"VALUE"),
        summary:       sanitise(parseField(text,"SUMMARY")),
        flags:         parseFlags(text, verdict),
      };

      /* save to Supabase */
      await supabase.from("scans").insert({ user_id:user.id, verdict:r.verdict, confidence:r.confidence, card_name:r.cardName!=="Unable to identify"?r.cardName:null, card_set:r.cardSet||null, card_rarity:r.cardRarity||null, condition_grade:r.condition||null, estimated_value:r.estimatedValue||null, summary:r.summary||null });
      const newCount=scanCount+1;
      await supabase.from("profiles").update({scan_count:newCount}).eq("id",user.id);
      setProfile(p=>({...p,scan_count:newCount}));
      setResult(r);
      setScanPhase("result");
      if(!isPro&&newCount>=TIERS.free.limit) setTimeout(()=>setShowPaywall(true),2000);
    } catch(e){
      setError(friendlyError(e.message||""));
      setScanPhase("front");
    } finally{ setScanning(false); }
  };

  const handleFrontCapture=d=>{ setFront(d); setScanPhase("back"); };
  const handleBackCapture=d=>{ setBack(d); setScanPhase("analysing"); analyse(front,d,null); };
  const handleSkipBack=()=>{ setScanPhase("analysing"); analyse(front,back,null); };

  const goHome=()=>{ setPage("home"); };
  const resetFull=()=>{ setFront(null); setBack(null); setVideo(null); setResult(null); setError(null); setScanPhase("front"); };
  const scanAnother=()=>{ setFront(null); setBack(null); setVideo(null); setResult(null); setError(null); setScanPhase("front"); };

  const startScanning=()=>{
    // Show flat surface reminder on first few scans
    const seen=localStorage.getItem("tcgv_flat_seen");
    if(!seen&&scanCount<5){ setShowFlatReminder(true); }
  };

  useEffect(()=>{ if(scanPhase==="front"&&remaining>0) startScanning(); },[scanPhase]);

  /* loading */
  if(authLoading) return (
    <div className={`T${theme==="light"?" light":""}`} style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <style>{S}</style>
      <div style={{ display:"flex",gap:7 }}>{[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",background:gold,opacity:.4,animation:"dp 1.2s ease-in-out infinite",animationDelay:`${i*.2}s` }}/>)}</div>
    </div>
  );

  /* auth gate */
  if(!user) return (
    <div className={`T${theme==="light"?" light":""}`}>
      <style>{S}</style>
      <AuthGate onSignIn={signIn} onMagicLink={signInMagic} loading={authLoading} magicSent={magicSent} theme={theme} onToggle={toggleTheme} stats={stats} recentFeed={recentFeed}/>
    </div>
  );

  /* main */
  return (
    <div className={`T${theme==="light"?" light":""}`}>
      <style>{S}</style>

      {showDisclaimer&&<DisclaimerModal onAccept={acceptDisclaimer}/>}
      {showTour&&<OnboardingTour onDone={doneTour}/>}
      {showTips&&<TipsModal onClose={()=>setShowTips(false)}/>}
      {showPaywall&&<PaywallModal onDismiss={()=>setShowPaywall(false)} onSelect={key=>{ setShowPaywall(false); window.open(STRIPE_LINKS[key],"_blank"); }}/>}
      {showFlatReminder&&<FlatSurfaceReminder onContinue={()=>{ try{ localStorage.setItem("tcgv_flat_seen","1"); }catch{} setShowFlatReminder(false); }}/>}
      <InstallBanner/>

      <div className="app">
        <div className="wrap">

          {/* HEADER */}
          <div className="hdr">
            <div className="hdr-top">
              <div className="hdr-left">
                <div className="user-avatar">{user.email?.[0]?.toUpperCase()}</div>
                <span className="user-email">{user.email}</span>
              </div>
              <div className="hdr-right">
                {page!=="home"&&<button className="btn-home" onClick={goHome}>🏠 Home</button>}
                <ThemeBtn theme={theme} onToggle={toggleTheme}/>
                <button className="btn-signout" onClick={signOut}>Sign out</button>
              </div>
            </div>
            <div className="logo-ring"><Logo gold={gold}/></div>
            <h1 className="app-name">TCG<span style={{ color:gold }}>Verify</span></h1>
            <p className="app-tag">Card Authentication · Powered by TCGVerify</p>
          </div>

          {/* PAGE ROUTING */}
          {page==="history"  && <HistoryPage onBack={goHome} userId={user.id}/>}
          {page==="examples" && <ExamplesPage onBack={goHome}/>}
          {page==="faq"      && <FAQPage onBack={goHome}/>}
          {page==="terms"    && <TermsPage onBack={goHome}/>}
          {page==="privacy"  && <PrivacyPage onBack={goHome}/>}
          {page==="referral" && (
            <div className="page-view">
              <div className="page-hdr"><button className="page-back" onClick={goHome}>←</button><h2 className="page-title">Refer a Friend</h2></div>
              <ReferralBox userId={user.id}/>
              <PromoBox userId={user.id} onScansAdded={bonus=>setProfile(p=>({...p,scan_count:Math.max(0,(p?.scan_count||0)-bonus)}))}/>
            </div>
          )}

          {page==="home" && <>
            {/* SCAN COUNTER */}
            <div className="scan-counter">
              <span className="sc-label">{isPro?`${tierInfo.label} · ${remaining} scans left`:`${remaining} free scan${remaining!==1?"s":""} remaining`}</span>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                {tier==="free"&&<div className="sc-pips">{[0,1,2].map(i=><div key={i} className={`pip${i<scanCount?" used":""}`}/>)}</div>}
                <button className="sc-upgrade" onClick={()=>setShowPaywall(true)}>{isPro?"Change plan ↗":"Upgrade ↗"}</button>
              </div>
            </div>

            {/* NO SCANS */}
            {remaining<=0&&scanPhase!=="result"&&(
              <div style={{ textAlign:"center",padding:"2rem",background:"var(--bg-surface)",border:"0.5px solid var(--border)",borderRadius:14,marginBottom:"1.25rem" }}>
                <div style={{ fontSize:36,marginBottom:10 }}>🔒</div>
                <p style={{ fontSize:15,fontWeight:500,color:"var(--text)",marginBottom:6 }}>No scans remaining</p>
                <p style={{ fontSize:13,color:"var(--text3)",marginBottom:16 }}>Upgrade to continue checking cards</p>
                <button className="btn btn-gold" onClick={()=>setShowPaywall(true)}>View plans →</button>
              </div>
            )}

            {/* FRONT CAPTURE */}
            {remaining>0&&scanPhase==="front"&&(
              <CameraPanel label="CARD FRONT" stepNum={1} totalSteps={isPro?3:2} image={front} onCapture={handleFrontCapture} onClear={()=>setFront(null)} onShowTips={()=>setShowTips(true)}/>
            )}

            {/* BACK CAPTURE */}
            {remaining>0&&scanPhase==="back"&&(
              <div>
                <CameraPanel label="CARD BACK" stepNum={2} totalSteps={isPro?3:2} image={back} onCapture={handleBackCapture} onClear={()=>setBack(null)} onShowTips={()=>setShowTips(true)}/>
                <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }} onClick={handleSkipBack}>Skip back — check front only</button>
              </div>
            )}

            {/* VIDEO */}
            {remaining>0&&scanPhase==="video"&&isPro&&(
              <div>
                <VideoPanel isPro={isPro} video={video} onVideo={v=>{ setVideo(v); setScanPhase("analysing"); analyse(front,back,v); }} onClear={()=>setVideo(null)}/>
                <button className="btn btn-gold" style={{ marginTop:8 }} onClick={()=>{ setScanPhase("analysing"); analyse(front,back,null); }}>Check without video →</button>
              </div>
            )}

            {/* ANALYSING */}
            {scanPhase==="analysing"&&<ScanProgress/>}

            {/* RESULT */}
            {scanPhase==="result"&&result&&(
              <Result result={result} onScanAnother={scanAnother} onReset={resetFull} userEmail={user.email}/>
            )}

            {error&&<div className="err-box">⚠ {error}</div>}
          </>}

          {/* FOOTER */}
          <div className="footer-nav">
            <button className="footer-link" onClick={()=>setPage("history")}>Check History</button>
            <button className="footer-link" onClick={()=>setPage("examples")}>Examples</button>
            <button className="footer-link" onClick={()=>setPage("referral")}>Refer &amp; Promos</button>
            <button className="footer-link" onClick={()=>setPage("faq")}>FAQ</button>
            <button className="footer-link" onClick={()=>setShowTips(true)}>Photo Tips</button>
            <button className="footer-link" onClick={()=>setPage("terms")}>Terms</button>
            <button className="footer-link" onClick={()=>setPage("privacy")}>Privacy</button>
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
