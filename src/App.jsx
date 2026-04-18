import { useState, useEffect, useRef } from "react";

// ─── TIER CONFIG ────────────────────────────────────────────────────────────
const TIERS = {
  free: {
    name: "Free",
    price: 0,
    label: "Get Started",
    color: "#888",
    limit: 3,
    badge: null,
    perks: [
      "3 property analyses per month",
      "Fair Value Score only",
      "Basic buy/negotiate/walk away tag",
      "No risk flag breakdown",
      "No report download",
      "Community access"
    ]
  },
  basic: {
    name: "Basic",
    price: 19,
    label: "Start Basic",
    color: "#7EB8F7",
    limit: 25,
    badge: null,
    perks: [
      "25 property analyses per month",
      "Full Fair Value Score + breakdown",
      "Risk flags (up to 3 per listing)",
      "Plain English recommendation",
      "Key strength & concern summary",
      "Email report export",
      "Standard support"
    ]
  },
  pro: {
    name: "Pro",
    price: 49,
    label: "Go Pro",
    color: "#D4AF37",
    limit: 100,
    badge: "MOST POPULAR",
    perks: [
      "100 property analyses per month",
      "Deep risk flag analysis (unlimited flags)",
      "Neighbourhood market trend overlay",
      "Comparable sales data summary",
      "Investment potential score",
      "PDF report with TRunch AI branding",
      "Saved property history (up to 50)",
      "Priority support",
      "Early access to new features"
    ]
  },
  agent: {
    name: "Agent Suite",
    price: 199,
    label: "Unlock Agent Suite",
    color: "#00D68F",
    limit: "Unlimited",
    badge: "FOR CLOSERS",
    perks: [
      "Unlimited property analyses",
      "White-label client reports",
      "Bulk listing upload & analysis",
      "Client management dashboard",
      "Shareable report links per client",
      "Full risk flag + legal red flag scan",
      "Market timing score per property",
      "Commission opportunity estimator",
      "API access for MLS integrations",
      "Dedicated account manager",
      "Quarterly strategy call with TRunch team"
    ]
  }
};

// ─── AI PROMPT ───────────────────────────────────────────────────────────────
const buildPrompt = (listing, tier) => `You are TRunch AI — a real estate transparency engine that brings honesty back to property buying. A ${tier}-tier user submitted this listing:

"${listing}"

Analyze this property and return ONLY a valid JSON object. No markdown. No explanation. No extra text:

{
  "fairValueScore": <0-100, where 100=perfect deal, 50=fairly priced, <30=overpriced>,
  "fairValueLabel": <"Great Deal" | "Underpriced" | "Fair Price" | "Slightly Overpriced" | "Overpriced" | "Way Overpriced">,
  "estimatedMarketValue": <e.g. "$412,000 – $438,000">,
  "priceAssessment": <one clear sentence on price vs market value>,
  "riskFlags": [
    { "level": <"high"|"medium"|"low">, "flag": <short title>, "detail": <one plain English sentence> }
  ],
  "recommendation": <"BUY" | "NEGOTIATE" | "WALK AWAY">,
  "recommendationReason": <2-3 plain English sentences, like you're advising a close friend — zero jargon>,
  "negotiationTip": <one tactical sentence on how to approach the seller if applicable, else null>,
  "keyStrength": <biggest positive about this property in one sentence>,
  "biggestConcern": <single most important watch-out in one sentence>,
  "investmentScore": <0-100 rating of long-term investment potential>,
  "marketTiming": <"Good Time to Buy" | "Wait if Possible" | "Seller's Market — Proceed Carefully">,
  "confidenceLevel": <"High" | "Medium" | "Low">,
  "oneLineSummary": <punchy one-liner that captures the whole picture in under 12 words>
}`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const scoreColor = s => s >= 70 ? "#00D68F" : s >= 45 ? "#D4AF37" : "#FF4D6D";
const recMeta = r => ({
  BUY:       { bg: "rgba(0,214,143,0.08)",  border: "rgba(0,214,143,0.35)",  text: "#00D68F", icon: "✓" },
  NEGOTIATE: { bg: "rgba(212,175,55,0.08)", border: "rgba(212,175,55,0.35)", text: "#D4AF37", icon: "↔" },
  "WALK AWAY":{ bg: "rgba(255,77,109,0.08)",border: "rgba(255,77,109,0.35)", text: "#FF4D6D", icon: "✕" }
}[r] || {});
const riskCol = l => ({ high:"#FF4D6D", medium:"#D4AF37", low:"#00D68F" }[l]);
const circ = 2 * Math.PI * 52;

// ════════════════════════════════════════════════════════════════════════════
export default function TRunchAI() {
  const [screen, setScreen]       = useState("home");      // home | pricing | analyze | agent
  const [tier, setTier]           = useState("free");
  const [listing, setListing]     = useState("");
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [error, setError]         = useState(null);
  const [usageLeft, setUsageLeft] = useState({ free:3, basic:25, pro:100, agent:9999 });
  const [agentTab, setAgentTab]   = useState("clients");
  const timerRef = useRef(null);

  // mock agent data
  const clients = [
    { id:1, name:"Marcus Webb",     listings:4,  status:"Active",   lastReport:"2 hrs ago" },
    { id:2, name:"Priya Naidoo",    listings:7,  status:"Closing",  lastReport:"Yesterday" },
    { id:3, name:"James Okafor",    listings:2,  status:"Prospect", lastReport:"3 days ago"},
    { id:4, name:"Sandra Liu",      listings:9,  status:"Active",   lastReport:"1 hr ago"  },
  ];
  const recentReports = [
    { address:"847 Maple Ave, Atlanta GA",  rec:"BUY",        score:78, date:"Today 9:14am" },
    { address:"23 Birchwood Dr, Austin TX", rec:"NEGOTIATE",  score:51, date:"Today 8:02am" },
    { address:"1102 Ocean Blvd, Miami FL",  rec:"WALK AWAY",  score:22, date:"Yesterday"    },
  ];

  useEffect(() => () => clearInterval(timerRef.current), []);

  const analyze = async () => {
    if (!listing.trim()) return;
    const left = usageLeft[tier];
    if (left <= 0) { setError("You've hit your monthly limit. Upgrade to continue."); return; }
    setLoading(true); setResult(null); setError(null);
    let c = 60; setCountdown(c);
    timerRef.current = setInterval(() => { c--; setCountdown(c); if(c<=0) clearInterval(timerRef.current); }, 1000);
    try {
      const res  = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:buildPrompt(listing, tier)}]
        })
      });
      clearInterval(timerRef.current);
      const data = await res.json();
      const text = data.content?.map(b=>b.text||"").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setResult(parsed);
      setUsageLeft(prev => ({...prev, [tier]: Math.max(0, prev[tier]-1)}));
      setScreen("analyze");
    } catch(e) {
      setError("Analysis failed. Please try again.");
    } finally { setLoading(false); }
  };

  const reset = () => { setResult(null); setListing(""); setError(null); };

  // ── STYLES ──
  const S = {
    page:   { minHeight:"100vh", background:"#07070A", color:"#EDEAE3", fontFamily:"'DM Sans',sans-serif", overflowX:"hidden" },
    hdr:    { borderBottom:"1px solid rgba(212,175,55,0.12)", padding:"18px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, background:"rgba(7,7,10,0.92)", backdropFilter:"blur(12px)" },
    logo:   { display:"flex", alignItems:"center", gap:10 },
    logoBox:{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#D4AF37,#96720A)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:17, color:"#07070A", fontFamily:"'Syne',sans-serif" },
    logoTxt:{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, letterSpacing:0.5 },
    logoSub:{ fontSize:9, color:"rgba(212,175,55,0.6)", letterSpacing:2, textTransform:"uppercase" },
    nav:    { display:"flex", gap:6, alignItems:"center" },
    navBtn: (active) => ({ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", border:"none", background: active ? "rgba(212,175,55,0.15)" : "transparent", color: active ? "#D4AF37" : "rgba(237,234,227,0.45)", transition:"all .2s" }),
    wrap:   { maxWidth:700, margin:"0 auto", padding:"0 20px 80px" },
    h1:     { fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:"clamp(40px,9vw,68px)", lineHeight:1.02, letterSpacing:"-1.5px" },
    gold:   { background:"linear-gradient(135deg,#D4AF37,#F5E27A)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" },
    card:   (border) => ({ background:"rgba(255,255,255,0.028)", border:`1px solid ${border||"rgba(255,255,255,0.07)"}`, borderRadius:16, padding:"22px 24px", marginBottom:14 }),
    input:  { width:"100%", background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(212,175,55,0.22)", borderRadius:14, padding:"17px 18px", color:"#EDEAE3", fontFamily:"'DM Sans',sans-serif", fontSize:15, resize:"none", outline:"none", lineHeight:1.65 },
    btn:    (bg,col,border) => ({ width:"100%", background:bg||"linear-gradient(135deg,#D4AF37,#96720A)", color:col||"#07070A", border:border||"none", borderRadius:13, padding:"17px", fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, letterSpacing:1, cursor:"pointer", marginTop:10, transition:"opacity .2s,transform .2s" }),
    tag:    (bg,col) => ({ display:"inline-block", padding:"3px 11px", borderRadius:99, fontSize:10, fontWeight:700, letterSpacing:1, textTransform:"uppercase", background:bg, color:col }),
    muted:  { color:"rgba(237,234,227,0.42)", fontSize:13 },
  };

  // ══════════════════════════ HEADER ════════════════════════
  const Header = () => (
    <header style={S.hdr}>
      <div style={S.logo} onClick={()=>setScreen("home")} className="cursor-pointer">
        <div style={S.logoBox}>T</div>
        <div>
          <p style={S.logoTxt}>TRunch AI</p>
          <p style={S.logoSub}>Real Estate Transparency</p>
        </div>
      </div>
      <div style={S.nav}>
        <button style={S.navBtn(screen==="home")}     onClick={()=>setScreen("home")}>Analyze</button>
        <button style={S.navBtn(screen==="pricing")}  onClick={()=>setScreen("pricing")}>Pricing</button>
        {tier==="agent" && <button style={S.navBtn(screen==="agent")} onClick={()=>setScreen("agent")}>Agent Suite</button>}
        <button style={{...S.navBtn(false), background:"rgba(212,175,55,0.12)", color:"#D4AF37", border:"1px solid rgba(212,175,55,0.25)"}}>
          {TIERS[tier].name} {tier!=="free" && `· $${TIERS[tier].price}/mo`}
        </button>
      </div>
    </header>
  );

  // ══════════════════════════ HOME / ANALYZE SCREEN ═════════
  const HomeScreen = () => (
    <div style={{...S.wrap, paddingTop:56}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=Syne:wght@700;800&display=swap');
        * { box-sizing:border-box; }
        .trunch-input::placeholder { color:rgba(237,234,227,0.25); }
        .trunch-input:focus { border-color:rgba(212,175,55,0.55) !important; }
        .trunch-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
        .trunch-btn:disabled { opacity:.38; cursor:not-allowed; }
        .fade-up { animation: fadeUp .55s cubic-bezier(.22,1,.36,1) forwards; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .score-arc { transition: stroke-dashoffset 1.3s cubic-bezier(.22,1,.36,1); }
        .risk-row { transition: background .2s; }
        .risk-row:hover { background:rgba(255,255,255,0.04) !important; }
        .tier-card { transition: border-color .25s, transform .2s; }
        .tier-card:hover { transform:translateY(-3px); }
        .cursor-pointer { cursor:pointer; }
      `}</style>

      {/* hero */}
      {!result && (
        <div style={{textAlign:"center", marginBottom:48}}>
          <div style={{display:"inline-block", padding:"5px 14px", borderRadius:99, background:"rgba(212,175,55,0.1)", border:"1px solid rgba(212,175,55,0.2)", fontSize:11, letterSpacing:2, color:"#D4AF37", textTransform:"uppercase", marginBottom:22}}>
            Real Estate Transparency Engine
          </div>
          <p style={S.h1}>
            The Truth About<br/><span style={S.gold}>Any Property.</span>
          </p>
          <p style={{...S.muted, marginTop:18, fontSize:15, lineHeight:1.75, maxWidth:460, margin:"18px auto 0"}}>
            Paste any home listing. Get a <b style={{color:"#EDEAE3"}}>fair value score</b>, <b style={{color:"#EDEAE3"}}>risk flags</b>, and a <b style={{color:"#EDEAE3"}}>plain English recommendation</b> — in 60 seconds.
          </p>
          <div style={{display:"flex", gap:28, justifyContent:"center", marginTop:32}}>
            {[["⚖️","Fair Value Score"],["🚩","Risk Flags"],["💬","Plain English Rec"]].map(([ic,lb])=>(
              <div key={lb} style={{textAlign:"center"}}>
                <p style={{fontSize:24,marginBottom:5}}>{ic}</p>
                <p style={{fontSize:11, color:"rgba(237,234,227,0.38)", letterSpacing:.5}}>{lb}</p>
              </div>
            ))}
          </div>
          <p style={{marginTop:18, fontSize:12, color:"rgba(237,234,227,0.25)"}}>
            {tier==="free" ? `${usageLeft.free} free analyses remaining this month` : `${usageLeft[tier] === 9999 ? "Unlimited" : usageLeft[tier]} analyses remaining`}
          </p>
        </div>
      )}

      {/* input */}
      {!result && (
        <div className="fade-up">
          <textarea
            className="trunch-input"
            style={S.input}
            rows={5}
            placeholder="Paste any listing details... e.g. '4-bed 3-bath in Houston TX listed at $520,000. Built 2003, 2,200 sqft, new HVAC 2022, backs onto highway, HOA $350/month, roof original...'"
            value={listing}
            onChange={e=>setListing(e.target.value)}
            disabled={loading}
          />
          <button className="trunch-btn" style={S.btn()} onClick={analyze} disabled={loading||!listing.trim()}>
            {loading ? `ANALYZING — ${countdown}s` : "ANALYZE THIS LISTING →"}
          </button>
          {tier==="free" && (
            <p style={{textAlign:"center", marginTop:14, fontSize:12, color:"rgba(237,234,227,0.3)"}}>
              Need more? <span style={{color:"#D4AF37", cursor:"pointer"}} onClick={()=>setScreen("pricing")}>View plans →</span>
            </p>
          )}
        </div>
      )}

      {/* loading */}
      {loading && (
        <div style={{textAlign:"center", padding:"52px 0"}}>
          <div className="spin" style={{width:72,height:72,borderRadius:"50%",border:"3px solid rgba(212,175,55,0.15)",borderTop:"3px solid #D4AF37",margin:"0 auto 22px"}}/>
          <p style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,marginBottom:7}}>Reading the market...</p>
          <p style={S.muted}>Scoring value · Detecting risk · Writing your recommendation</p>
        </div>
      )}

      {/* RESULTS */}
      {result && !loading && (
        <div className="fade-up">
          {/* one liner */}
          <div style={{textAlign:"center", marginBottom:32}}>
            <p style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(18px,4vw,26px)",fontWeight:800,lineHeight:1.2,maxWidth:560,margin:"0 auto"}}>
              "{result.oneLineSummary}"
            </p>
          </div>

          {/* score + rec row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            {/* score */}
            <div style={S.card()}>
              <p style={{fontSize:10,letterSpacing:2.5,color:"rgba(237,234,227,0.35)",textTransform:"uppercase",marginBottom:14}}>Fair Value Score</p>
              <div style={{position:"relative",width:110,height:110,margin:"0 auto 14px"}}>
                <svg width="110" height="110" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9"/>
                  <circle className="score-arc" cx="55" cy="55" r="46" fill="none"
                    stroke={scoreColor(result.fairValueScore)} strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={circ-(result.fairValueScore/100)*circ}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <p style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:scoreColor(result.fairValueScore),lineHeight:1}}>{result.fairValueScore}</p>
                  <p style={{fontSize:9,color:"rgba(237,234,227,0.35)",marginTop:1}}>/100</p>
                </div>
              </div>
              <p style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,color:scoreColor(result.fairValueScore),textAlign:"center"}}>{result.fairValueLabel}</p>
              {result.estimatedMarketValue && <p style={{...S.muted,fontSize:11,textAlign:"center",marginTop:5}}>Est. {result.estimatedMarketValue}</p>}
            </div>

            {/* recommendation */}
            {(()=>{const m=recMeta(result.recommendation); return (
              <div style={{...S.card(m.border), background:m.bg, display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                <p style={{fontSize:10,letterSpacing:2.5,color:"rgba(237,234,227,0.35)",textTransform:"uppercase",marginBottom:14}}>TRunch Says</p>
                <p style={{fontFamily:"'Syne',sans-serif",fontSize:32,fontWeight:800,color:m.text,lineHeight:1,marginBottom:10}}>
                  {m.icon} {result.recommendation}
                </p>
                <p style={{fontSize:12,color:"rgba(237,234,227,0.6)",lineHeight:1.6}}>{result.recommendationReason}</p>
                {result.negotiationTip && result.recommendation==="NEGOTIATE" && (
                  <p style={{fontSize:11,color:m.text,marginTop:10,padding:"8px 10px",background:"rgba(212,175,55,0.07)",borderRadius:8}}>
                    💡 {result.negotiationTip}
                  </p>
                )}
              </div>
            );})()}
          </div>

          {/* risk flags */}
          <div style={S.card()}>
            <p style={{fontSize:10,letterSpacing:2.5,color:"rgba(237,234,227,0.35)",textTransform:"uppercase",marginBottom:16}}>Risk Flags</p>
            {result.riskFlags.length===0
              ? <p style={{fontSize:13,color:"#00D68F"}}>✓ No significant risk flags detected.</p>
              : result.riskFlags.map((rf,i)=>(
                <div key={i} className="risk-row" style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 12px",borderRadius:10,marginBottom:8,borderLeft:`3px solid ${riskCol(rf.level)}`}}>
                  <span style={S.tag(riskCol(rf.level)+"22",riskCol(rf.level))}>{rf.level}</span>
                  <div>
                    <p style={{fontWeight:600,fontSize:13,marginBottom:3}}>{rf.flag}</p>
                    <p style={{...S.muted,fontSize:12,lineHeight:1.55}}>{rf.detail}</p>
                  </div>
                </div>
              ))
            }
          </div>

          {/* extras row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div style={S.card()}>
              <p style={{fontSize:10,letterSpacing:2,color:"#00D68F",textTransform:"uppercase",marginBottom:8}}>Key Strength</p>
              <p style={{...S.muted,fontSize:13,lineHeight:1.6}}>{result.keyStrength}</p>
            </div>
            <div style={S.card()}>
              <p style={{fontSize:10,letterSpacing:2,color:"#FF4D6D",textTransform:"uppercase",marginBottom:8}}>Biggest Concern</p>
        
