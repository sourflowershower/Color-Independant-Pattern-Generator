/**
 * Semiotic Pattern Builder — Web Component
 * https://github.com/your-username/semiotic-pattern-builder
 *
 * Usage:
 *   <script src="semiotic-pattern-builder.js"></script>
 *   <semiotic-pattern-builder style="display:block;width:100%;height:100vh"></semiotic-pattern-builder>
 *
 * Attributes:
 *   view="all"        (default) full UI: controls + preview + collection
 *   view="panel"      controls only
 *   view="preview"    live preview only
 *   view="collection" thumbnail collection only
 *   theme="dark|light|warm|terminal|blueprint|paper"
 *
 * Multiple instances stay in sync (shared state via storage events), so you can
 * place a "panel" view and a "preview" view side by side as separate elements.
 *
 * Public API:
 *   el.setTheme(name)
 *   el.loadState(stateObject)
 *   el.getState()
 */

const LOCK_OPEN=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17 1a5 5 0 0 1 5 5v3h-2V6A3 3 0 0 0 14 6v2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h7V6A5 5 0 0 1 17 1z'/%3E%3C/svg%3E")`;
const LOCK_SHUT=`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 1a5 5 0 0 1 5 5v2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6A5 5 0 0 1 12 1zm0 2a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z'/%3E%3C/svg%3E")`;
// Dice icon (used inline as a unicode glyph fallback + label "Randomise")
const DICE='\u{1F3B2}';

// ── Themes ──
const THEMES={
  dark:{'--s1':'#0c0c10','--s2':'#15151c','--s3':'#1e1e28','--s4':'#272733','--s5':'#303040','--bd':'#2e2e3e','--bdh':'#44445a','--tx':'#e2e2ee','--tx2':'#9090aa','--tx3':'#55556a','--ac':'#6366f1','--aclo':'rgba(99,102,241,.15)','--lon':'#f59e0b','--lonlo':'rgba(245,158,11,.12)'},
  light:{'--s1':'#f0f0f4','--s2':'#ffffff','--s3':'#f7f7fb','--s4':'#eaeaf2','--s5':'#d0d0dc','--bd':'#d8d8e8','--bdh':'#b0b0c8','--tx':'#1a1a2e','--tx2':'#555570','--tx3':'#9090aa','--ac':'#5254cc','--aclo':'rgba(82,84,204,.12)','--lon':'#d97706','--lonlo':'rgba(217,119,6,.1)'},
  warm:{'--s1':'#110e0a','--s2':'#1c1612','--s3':'#252018','--s4':'#2e271d','--s5':'#3a3026','--bd':'#3a3020','--bdh':'#584838','--tx':'#ede0cc','--tx2':'#a0896c','--tx3':'#665545','--ac':'#d97706','--aclo':'rgba(217,119,6,.15)','--lon':'#f59e0b','--lonlo':'rgba(245,158,11,.12)'},
  terminal:{'--s1':'#020c02','--s2':'#040f04','--s3':'#071407','--s4':'#0a1a0a','--s5':'#102010','--bd':'#1a3a1a','--bdh':'#2a5a2a','--tx':'#00ff41','--tx2':'#00cc33','--tx3':'#007a1e','--ac':'#00ff41','--aclo':'rgba(0,255,65,.1)','--lon':'#ffff00','--lonlo':'rgba(255,255,0,.1)'},
  blueprint:{'--s1':'#0a1628','--s2':'#0e1e38','--s3':'#122348','--s4':'#162a56','--s5':'#1e3668','--bd':'#1e3a6e','--bdh':'#2a5090','--tx':'#cce4ff','--tx2':'#7aaad0','--tx3':'#3d6a9a','--ac':'#4da6ff','--aclo':'rgba(77,166,255,.15)','--lon':'#ffd666','--lonlo':'rgba(255,214,102,.1)'},
  paper:{'--s1':'#f5f0e8','--s2':'#faf6ee','--s3':'#f0ebe0','--s4':'#e8e0d0','--s5':'#d8d0bc','--bd':'#ccc0a8','--bdh':'#a89878','--tx':'#2a1f0e','--tx2':'#6a5535','--tx3':'#9a8560','--ac':'#8b4513','--aclo':'rgba(139,69,19,.12)','--lon':'#a0520c','--lonlo':'rgba(160,82,12,.1)'},
};

// ── .smp serialiser / parser ──
function stateToSmp(st){
  const f=n=>parseFloat(n).toFixed(4);
  const lay=(n,L)=>[`\nlayer          ${n}`,`type           ${L.type}`,`color          ${L.color}`,
    `size           ${f(L.size)}`,`spacing        ${f(L.spacing)}`,
    `rotation       ${f(L.rotation||0)}`,
    `row_offset     ${f(L.row_offset)}`,`col_offset     ${f(L.col_offset)}`].join('\n');
  return['# semiotic-pattern/v1',
    '# rotation is per-layer (degrees, clockwise, about the canvas centre).',
    '# row_offset/col_offset: fraction of spacing shifted on every other row/column',
    '# (0=none  0.5=brick  1.0=full period = same as 0)','',
    'schema         semiotic-pattern/v1',`background     ${st.bg}`,
    `scale          ${f(st.scale)}`,
    lay(1,st.s1),lay(2,st.s2)].join('\n');
}
function smpToState(txt){
  const p={},layers=[];let cur=null;
  for(const raw of txt.split('\n')){
    const line=raw.trim();
    if(!line||line[0]==='#')continue;   // only whole-line comments — keeps #hex colors intact
    const[k,...r]=line.split(/\s+/);const v=r.join(' ');
    if(k==='layer'){cur={type:'none',color:'#fff',size:24,spacing:24,rotation:0,row_offset:0,col_offset:0};layers.push(cur);continue;}
    if(cur)cur[k]=isNaN(+v)?v:+v;else p[k]=isNaN(+v)?v:+v;
  }
  const globalRot=+(p.rotation||0);   // older files had a single global rotation
  const L1=layers[0]||{type:'checkerboard',color:'#3b82f6',size:24,spacing:24,rotation:0,row_offset:0,col_offset:0};
  const L2=layers[1]||{type:'none',color:'#3b82f6',size:12,spacing:24,rotation:0,row_offset:0,col_offset:0};
  if(L1.rotation===undefined)L1.rotation=globalRot;
  if(L2.rotation===undefined)L2.rotation=globalRot;
  return{bg:p.background||'#121214',scale:+(p.scale||1),s1:L1,s2:L2};
}

// ── SVG pattern engine ──
function buildPatternDef(id,type,color,size,sp,rOff,cOff,bg,isSec){
  if(type==='none')return'';
  const rx=rOff*sp,cy=cOff*sp;
  if(type==='checkerboard'){
    const bf=isSec?'':` <rect width="${sp*2}" height="${sp*2}" fill="${bg}"/>`;
    return`<pattern id="${id}" width="${sp*2}" height="${sp*2}" patternUnits="userSpaceOnUse" patternTransform="XFORM">${bf}
 <rect x="0" y="0" width="${sp}" height="${sp}" fill="${color}"/>
 <rect x="${sp}" y="${sp}" width="${sp}" height="${sp}" fill="${color}"/>
</pattern>`;
  }
  const tW=sp*2,tH=sp*2,f3=n=>+n.toFixed(3);
  const centres=[[sp/2,sp/2],[sp/2+sp,sp/2+cy],[sp/2+rx,sp/2+sp],[sp/2+sp+rx,sp/2+sp+cy]];
  const offs=[[0,0],[-tW,0],[tW,0],[0,-tH],[0,tH],[-tW,-tH],[tW,-tH],[-tW,tH],[tW,tH]];
  function sh(px,py){
    const[x,y]=[f3(px),f3(py)];
    if(type==='circles')return`<circle cx="${x}" cy="${y}" r="${size/2}" fill="${color}"/>`;
    if(type==='squares'){const h=size/2;return`<rect x="${f3(x-h)}" y="${f3(y-h)}" width="${size}" height="${size}" fill="${color}"/>`;}
    return'';
  }
  let c='';
  if(type==='stripes'){
    for(const bx of[sp/2,sp/2+sp])for(const ox of[-tW,0,tW])
      c+=`\n <rect x="${f3(bx+ox-size/2)}" y="0" width="${size}" height="${tH}" fill="${color}"/>`;
  }else{
    for(const[bx,by]of centres)for(const[ox,oy]of offs)c+='\n '+sh(bx+ox,by+oy);
  }
  return`<pattern id="${id}" width="${tW}" height="${tH}" patternUnits="userSpaceOnUse" patternTransform="XFORM">${c}
</pattern>`;
}
let _svgSeq=0;
const _svgBoot=Math.random().toString(36).slice(2,8);
function buildSVG(st,W,H,embed,idPrefix){
  // Globally-unique pattern IDs per call. If two SVGs in the same DOM/shadow
  // root share a pattern id, url(#id) resolves to the FIRST one — so editing or
  // re-rendering one would visually change all of them. A unique token per call
  // (boot id + monotonic counter) guarantees every SVG is fully self-contained.
  const pre=(idPrefix||'p')+_svgBoot+(_svgSeq++)+'_';
  const i1=pre+'1', i2=pre+'2';
  const cx=W/2,cy=H/2,sc=st.scale;
  // Rotation is per-layer; scale is global. Each pattern gets its own transform.
  const xf=rot=>`rotate(${rot} ${cx} ${cy}) translate(${cx*(1-sc)} ${cy*(1-sc)}) scale(${sc})`;
  const r1=st.s1.rotation??st.rotation??0;
  const r2=st.s2.rotation??st.rotation??0;
  const d1=buildPatternDef(i1,st.s1.type,st.s1.color,st.s1.size,st.s1.spacing,st.s1.row_offset,st.s1.col_offset,st.bg,false).replace('XFORM',xf(r1));
  const d2=buildPatternDef(i2,st.s2.type,st.s2.color,st.s2.size,st.s2.spacing,st.s2.row_offset,st.s2.col_offset,st.bg,true).replace('XFORM',xf(r2));
  const l1=st.s1.type!=='none'?`<rect width="${W}" height="${H}" fill="url(#${i1})"/>`:'';
  const l2=st.s2.type!=='none'?`<rect width="${W}" height="${H}" fill="url(#${i2})"/>`:'';
  const desc=embed?`<desc>\n${stateToSmp(st)}\n</desc>`:'';
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${desc}<defs>${d1}${d2}</defs><rect width="${W}" height="${H}" fill="${st.bg}"/>${l1}${l2}</svg>`;
}

// ── CSS ──
const CSS=`
*{box-sizing:border-box;margin:0;padding:0}
:host{display:flex!important;flex-direction:column;min-height:0;height:100%;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:var(--s1);color:var(--tx);
  --s1:#0c0c10;--s2:#15151c;--s3:#1e1e28;--s4:#272733;--s5:#303040;
  --bd:#2e2e3e;--bdh:#44445a;--tx:#e2e2ee;--tx2:#9090aa;--tx3:#55556a;
  --ac:#6366f1;--aclo:rgba(99,102,241,.15);--lon:#f59e0b;--lonlo:rgba(245,158,11,.12);
}

/* scroll container fills host and scrolls when content overflows */
.scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column}
.scroll::-webkit-scrollbar{width:8px}
.scroll::-webkit-scrollbar-thumb{background:var(--s5);border-radius:4px}
.scroll::-webkit-scrollbar-track{background:transparent}

.hdr{padding:12px 14px 6px;flex-shrink:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.hdr h1{font-size:1.05rem;font-weight:700;letter-spacing:-.02em}
.hdr p{font-size:.7rem;color:var(--tx2)}

/* Default (view=all): the .scroll container is the single scroll context.
   row-main sizes to its content (with a comfortable min preview height) and the
   collection sits below it; if the total exceeds the host, .scroll scrolls.
   This prevents the collection from overlapping the panel/preview. */
.row-main{display:flex;flex-direction:row;gap:12px;padding:6px 14px 10px;flex:0 0 auto;min-height:0;align-items:stretch}
:host([narrow]) .row-main{flex-direction:column}

/* panel takes its natural height (no internal scrollbar). If the whole thing
   is too tall for the pane, the outer .scroll handles it — but the 2-column
   wide mode is designed so that doesn't happen at normal sizes. */
.panel{width:340px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;
  overflow:visible;min-height:0}
:host([narrow]) .panel{width:100%}

/* WIDE: panel uses a 2-column grid so all controls fit without scrolling.
   Full-width items (randomise row, output, add button) span both columns. */
:host([wide]) .panel{width:660px;display:grid;grid-template-columns:1fr 1fr;
  gap:8px;align-content:start}
:host([wide]) .panel>.g3,
:host([wide]) .panel>.slot-output,
:host([wide]) .panel>.btn-add{grid-column:1 / -1}
/* tighten control density in wide mode so the 2-col panel fits short panes */
:host([wide]) .slot{padding:7px 8px 2px}
:host([wide]) .shdr{padding-bottom:5px;margin-bottom:5px}
:host([wide]) .r,:host([wide]) .cr{margin-bottom:4px;min-height:22px}
:host([wide]) hr{margin:3px 0 5px}
:host([wide]) .panel{gap:6px}

.preview-wrap{flex:1;min-width:0;display:flex;flex-direction:column;align-self:stretch}
:host([narrow]) .preview-wrap{width:100%}
#psvg{flex:1;min-height:420px;display:block;width:100%;height:100%;
  border-radius:10px;border:1px solid var(--bd);box-shadow:0 4px 24px rgba(0,0,0,.4);overflow:hidden}
:host([narrow]) #psvg{height:360px;min-height:360px;flex:none}

/* preview-only view: fill the whole host */
:host([view="preview"]) #psvg{height:100%}
:host([view="preview"]) .preview-wrap{height:100%;flex:1}
:host([view="preview"]) .row-main{height:100%;padding:10px;flex:1}

/* panel-only / collection-only: let the scroll container handle overflow */
:host([view="panel"]) .row-main{flex:none}
:host([view="panel"]) .panel{overflow:visible}

/* collection: bounded height in all-view so the page doesn't grow unbounded;
   you only scroll the thumbs area itself for more. */
.coll{flex-shrink:0;padding:4px 14px 14px;display:flex;flex-direction:column;min-height:0}
.coll-hdr{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.coll-hdr h2{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx2);flex:1}
.coll-empty{font-size:.72rem;color:var(--tx3);padding:10px 4px;line-height:1.5}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;
  max-height:230px;overflow-y:auto;padding-right:4px}
.thumbs::-webkit-scrollbar{width:6px}
.thumbs::-webkit-scrollbar-thumb{background:var(--s5);border-radius:3px}
/* collection-only view: thumbs fill the host */
:host([view="collection"]) .thumbs{max-height:none}
:host([view="collection"]) .coll{flex:1}
.thumb{background:var(--s2);border-radius:7px;padding:4px;cursor:pointer;
  border:1.5px solid var(--bd);position:relative;transition:transform .15s,border-color .15s}
.thumb:hover{transform:scale(1.04);border-color:var(--ac)}
.thumb svg{width:100%;height:auto;display:block;border-radius:3px}
.tlbl{font-size:.6rem;color:var(--tx2);text-align:center;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.del{position:absolute;top:3px;right:3px;width:15px;height:15px;background:rgba(0,0,0,.8);
  color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;cursor:pointer;opacity:0;transition:opacity .15s;z-index:9}
.thumb:hover .del{opacity:1}

.slot{border-radius:8px;padding:10px 10px 4px;border:1px solid var(--bd);
  background:color-mix(in srgb,var(--s3) 93%,var(--sa,#888) 7%)}
.shdr{display:grid;grid-template-columns:1fr auto 50px;align-items:center;gap:7px;
  padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid var(--bd)}
.shdr h3{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx2)}
.lcl{font-size:.48rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--tx3);text-align:center;line-height:1.2}
hr{border:none;border-top:1px solid var(--bd);margin:5px 0 8px}

.r,.cr{display:grid;grid-template-columns:84px 1fr 50px;align-items:center;gap:6px;margin-bottom:6px;min-height:26px}
.lbl{font-size:.68rem;color:var(--tx2);white-space:nowrap;line-height:1.2}
.lbl .v{color:var(--tx);font-size:.63rem;display:block;font-variant-numeric:tabular-nums}
.ctrl{display:flex;align-items:center;gap:5px;min-width:0}

input[type=range]{flex:1;min-width:0;height:4px;-webkit-appearance:none;appearance:none;background:var(--s5);border-radius:2px;outline:none;cursor:pointer}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--ac);box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:pointer;transition:box-shadow .12s}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--ac);cursor:pointer}
input[type=range]:hover::-webkit-slider-thumb{box-shadow:0 0 0 3px var(--aclo)}
.ctrl select{flex:1;padding:4px 6px;background:var(--s4);color:var(--tx);border:1px solid var(--bdh);border-radius:5px;font-size:.72rem;outline:none;cursor:pointer}
.ctrl select:focus{border-color:var(--ac)}

.ccell{display:flex;align-items:center;gap:6px}
input[type=color]{width:32px;height:24px;border:1px solid var(--bdh);border-radius:4px;cursor:pointer;background:var(--s4);padding:2px;flex-shrink:0}

.hsv{display:flex;gap:2px}
.hl{display:flex;align-items:center;cursor:pointer}
.hl input{display:none}
.hp{font-size:.55rem;font-weight:800;padding:1px 4px;border-radius:3px;border:1px solid var(--bdh);color:var(--tx3);background:var(--s4);user-select:none;transition:all .12s;letter-spacing:.05em}
.hl input:checked+.hp{background:var(--lonlo);color:var(--lon);border-color:var(--lon)}

.lc{display:flex;flex-direction:column;align-items:center;gap:2px}
.lw{display:flex;align-items:center;justify-content:center}
.lw input{display:none}
.li{width:19px;height:19px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--bdh);border-radius:4px;cursor:pointer;background:var(--s4);transition:all .12s;user-select:none}
.li::before{content:'';display:block;width:9px;height:9px;background:var(--tx3);mask-image:${LOCK_OPEN};mask-size:contain;mask-repeat:no-repeat;-webkit-mask-image:${LOCK_OPEN};-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;transition:background .12s}
.lw input:checked+.li{background:var(--lonlo);border-color:var(--lon)}
.lw input:checked+.li::before{background:var(--lon);mask-image:${LOCK_SHUT};-webkit-mask-image:${LOCK_SHUT}}

/* buttons — all derived from theme tokens, no hardcoded colors */
.btn{background:var(--ac);color:#fff;border:none;padding:6px 11px;border-radius:6px;cursor:pointer;font-weight:600;font-size:.71rem;transition:filter .12s;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.btn:hover{filter:brightness(1.12)}
.btn.sec{background:var(--s4);border:1px solid var(--bdh);color:var(--tx2)}
.btn.sec:hover{background:var(--s5);color:var(--tx)}
.btn.soft{background:var(--aclo);color:var(--ac);border:1px solid var(--ac)}
.btn.soft:hover{background:var(--ac);color:#fff}
.btn.danger{background:transparent;border:1px solid var(--bdh);color:var(--tx2)}
.btn.danger:hover{border-color:#e05;color:#e05}
.rbtn{background:transparent;color:var(--tx2);border:1px solid var(--bdh);padding:2px 7px;border-radius:4px;cursor:pointer;font-size:.63rem;font-weight:600;transition:all .12s;white-space:nowrap;display:inline-flex;align-items:center;gap:3px}
.rbtn:hover{background:var(--aclo);color:var(--ac);border-color:var(--ac)}
.dice{font-size:.85em;line-height:1}

.g2{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
.fbar{display:flex;align-items:center;gap:6px;background:var(--s3);border:1px solid var(--bd);border-radius:6px;padding:6px 9px;font-size:.67rem;margin-bottom:6px}
.fbar .fn{color:var(--tx);font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

class SemioticPatternBuilder extends HTMLElement {
  static get observedAttributes(){return['theme','view'];}

  constructor(){
    super();
    this._shadow=this.attachShadow({mode:'open'});
    this._dir=null;this._coll=[];
    this._DEFAULTS={
      bg:'#121214',scale:1,
      s1:{type:'checkerboard',color:'#3b82f6',size:24,spacing:24,rotation:0,row_offset:0,col_offset:0},
      s2:{type:'none',color:'#3b82f6',size:12,spacing:24,rotation:0,row_offset:0,col_offset:0}
    };
    this._STORE='semioticV8';
    this._STATE_STORE='semioticV8_state';
    this._id=Math.random().toString(36).slice(2);   // unique per instance
  }

  attributeChangedCallback(name,_o,val){
    if(name==='theme'&&this._shadow.firstChild){this.setTheme(val);}
    if(name==='view'&&this._shadow.firstChild){this._applyView();}
  }

  connectedCallback(){
    this._shadow.innerHTML=`<style>${CSS}</style>${this._html()}`;
    this._bind();
    if(this.getAttribute('theme'))this.setTheme(this.getAttribute('theme'));
    this._loadStorage();
    // restore shared state if present, else defaults
    let st=null;
    try{const s=localStorage.getItem(this._STATE_STORE);if(s)st=JSON.parse(s);}catch(e){}
    this._applyState(st||this._DEFAULTS,false);
    this._applyView();

    // cross-instance sync.
    // storage events only fire in OTHER tabs, so for same-page instances
    // (e.g. separated panel + preview) we use a BroadcastChannel too.
    this._onStorage=e=>{
      if(e.key===this._STATE_STORE&&e.newValue){
        try{this._applyState(JSON.parse(e.newValue),false,true);}catch(_){}
      }
      if(e.key===this._STORE){this._loadStorage();this._renderColl();}
    };
    window.addEventListener('storage',this._onStorage);

    if('BroadcastChannel' in window){
      this._chan=new BroadcastChannel('semioticV8_sync');
      this._chan.onmessage=ev=>{
        const m=ev.data; if(!m||m.from===this._id) return;
        if(m.kind==='state'){ try{this._applyState(m.state,false,true);}catch(_){} }
        else if(m.kind==='coll'){ this._loadStorage(); this._renderColl(); }
      };
    }

    // responsive + render after layout settles.
    // narrow: stack vertically.  wide: panel can use 2-column control grid so it
    // doesn't need to scroll. We also factor in height: only go 2-col when the
    // panel would otherwise overflow the available height.
    this._ro=new ResizeObserver(entries=>{
      const r=entries[0].contentRect;
      const w=r.width, h=r.height;
      this.toggleAttribute('narrow',w<680);
      // Single-column panel needs ~890px tall to avoid scrolling.
      // If the pane is shorter than that, switch to a 2-column panel — but only
      // if there's also room for the panel (~660) plus a preview (~320) side by
      // side. Otherwise we fall back to the (scrolling) single column.
      const tooShortForOneCol = h < 940;
      const wideEnoughForTwoCol = w >= 980;
      this.toggleAttribute('wide', tooShortForOneCol && wideEnoughForTwoCol && !this.hasAttribute('narrow'));
      this._render();
    });
    this._ro.observe(this);
    requestAnimationFrame(()=>this._render());
  }

  disconnectedCallback(){this._ro?.disconnect();window.removeEventListener('storage',this._onStorage);this._chan?.close();}

  // ── Public API ──
  setTheme(name){const t=THEMES[name];if(!t)return;Object.entries(t).forEach(([k,v])=>this.style.setProperty(k,v));this._render();}
  loadState(st){this._applyState(st,false);this._broadcastState();}
  getState(){return this._getState();}

  _applyView(){
    const v=this.getAttribute('view')||'all';
    const show=(sel,on)=>{const el=this._shadow.querySelector(sel);if(el)el.style.display=on?'':'none';};
    show('.panel', v==='all'||v==='panel');
    show('.preview-wrap', v==='all'||v==='preview');
    this._collVisible(this._coll.length>0);
    show('.hdr', v==='all'||v==='panel');
    requestAnimationFrame(()=>this._render());
  }

  // The collection section is shown in views that include it (all/collection),
  // regardless of how many patterns are saved — so Load and the export buttons
  // are always reachable, even with an empty collection. We just swap between the
  // thumbnail grid and an empty-state hint.
  _collShownInView(){const v=this.getAttribute('view')||'all';return v==='all'||v==='collection';}
  _collVisible(_on){
    const c=this.$('csect');if(!c)return;
    const inView=this._collShownInView();
    c.style.display=inView?'':'none';
    const has=this._coll.length>0;
    const thumbs=this.$('thumbs'), empty=this.$('cempty');
    if(thumbs)thumbs.style.display=has?'':'none';
    if(empty)empty.style.display=has?'none':'';
  }

  // ── Template ──
  _html(){
    const lk=id=>`<div class="lw"><input type="checkbox" id="${id}"><label class="li" for="${id}"></label></div>`;
    const hsv=p=>`<div class="hsv">
      <label class="hl"><input type="checkbox" id="${p}-h"><span class="hp">H</span></label>
      <label class="hl"><input type="checkbox" id="${p}-s"><span class="hp">S</span></label>
      <label class="hl"><input type="checkbox" id="${p}-v"><span class="hp">V</span></label></div>`;
    const lc=id=>`<div class="lc">${lk('lock-'+id)}</div>`;
    const lcHsv=(id,p)=>`<div class="lc">${lk('lock-'+id)}${hsv(p)}</div>`;
    const row=(lbl,id,mn,mx,st,val,lid)=>`<div class="r"><span class="lbl">${lbl}<span class="v" id="${id}-val">${val}</span></span><div class="ctrl"><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${val}"></div>${lc(lid)}</div>`;
    const sel=(lbl,id,opts,lid)=>`<div class="r"><span class="lbl">${lbl}</span><div class="ctrl"><select id="${id}">${opts}</select></div>${lc(lid)}</div>`;
    const col=(lbl,cid,lid,p)=>`<div class="cr"><span class="lbl">${lbl}</span><div class="ccell"><input type="color" id="${cid}" value="#3b82f6"></div>${lcHsv(lid,p)}</div>`;
    const shdr=(t,rfn,rdfn)=>`<div class="shdr"><h3>${t}</h3><div style="display:flex;gap:4px"><button class="rbtn" data-fn="${rfn}">↺</button><button class="rbtn" data-fn="${rdfn}"><span class="dice">${DICE}</span></button></div><span class="lcl">Lock<br>Rand</span></div>`;
    const T1=`<option value="checkerboard">Checkerboard</option><option value="circles">Circles</option><option value="squares">Squares</option><option value="stripes">Stripes</option>`;
    const T2=`<option value="none" selected>None</option>${T1}`;

    return`
<div class="scroll">
  <div class="hdr"><h1>Semiotic Pattern Builder</h1><p>Vector SVG · Infinitely scalable</p></div>
  <div class="row-main">
    <div class="panel">
      <div class="g3">
        <button class="btn" data-fn="randomizeAll"><span class="dice">${DICE}</span> All</button>
        <button class="btn soft" data-fn="randomizeAllSameColor"><span class="dice">${DICE}</span> 2&nbsp;Col</button>
        <button class="btn sec" data-fn="resetAll">↺ Reset</button>
      </div>

      <div class="slot slot-output" style="--sa:#888">
        <div class="shdr" style="grid-template-columns:1fr auto"><h3>Output</h3><button class="rbtn" data-fn="pickFolder">📁 Folder</button></div>
        <div class="fbar"><span class="fn" id="fdisp">No folder — files download</span></div>
        <div class="g2"><button class="btn" data-fn="saveSVG">↓ SVG</button><button class="btn sec" data-fn="loadFiles">↑ Load</button></div>
      </div>

      <div class="slot" style="--sa:#888">
        ${shdr('Background &amp; Scale','resetBg','randomizeBg')}
        ${col('Color','bg-color','bg-color','lock-bg')}
        <hr>
        ${row('Scale','scale','0.4','3','0.05','1','scale')}
      </div>

      <div class="slot" id="s1card" style="--sa:#3b82f6">
        ${shdr('Primary Layer','resetSlot1','randomizeSlot1')}
        ${sel('Type','slot1-type',T1,'s1-type')}
        ${col('Color','slot1-color','s1-color','lock-s1')}
        ${row('Size','slot1-size','4','60','1','24','s1-size')}
        ${row('Spacing','slot1-spacing','10','80','1','24','s1-spacing')}
        ${row('Rotation','slot1-rot','0','360','1','0','s1-rot')}
        ${row('Row offset','slot1-stx','0','1','0.01','0','s1-stx')}
        ${row('Col offset','slot1-sty','0','1','0.01','0','s1-sty')}
      </div>

      <div class="slot" id="s2card" style="--sa:#3b82f6">
        ${shdr('Secondary Layer','resetSlot2','randomizeSlot2')}
        ${sel('Type','slot2-type',T2,'s2-type')}
        ${col('Color','slot2-color','s2-color','lock-s2')}
        ${row('Size','slot2-size','2','40','1','12','s2-size')}
        ${row('Spacing','slot2-spacing','10','80','1','24','s2-spacing')}
        ${row('Rotation','slot2-rot','0','360','1','0','s2-rot')}
        ${row('Row offset','slot2-stx','0','1','0.01','0','s2-stx')}
        ${row('Col offset','slot2-sty','0','1','0.01','0','s2-sty')}
      </div>

      <button class="btn btn-add" data-fn="addToCollection" style="width:100%;margin-top:2px">Add to Collection</button>
    </div>

    <div class="preview-wrap"><svg id="psvg" xmlns="http://www.w3.org/2000/svg"></svg></div>
  </div>

  <div class="coll" id="csect" style="display:none">
    <div class="coll-hdr">
      <h2>Collection</h2>
      <button class="btn sec" data-fn="exportAllSVGs">↓ SVGs</button>
      <button class="btn sec" data-fn="exportHTML">↓ HTML</button>
      <button class="btn sec" data-fn="exportSMP">↓ .smp</button>
      <button class="btn sec" data-fn="exportJSON">↓ JSON</button>
      <button class="btn sec" data-fn="loadFiles">↑ Load</button>
      <button class="btn danger" data-fn="clearCollection">✕ Clear</button>
    </div>
    <div class="thumbs" id="thumbs"></div>
    <div class="coll-empty" id="cempty">No saved patterns yet — use “Add to Collection”, or “↑ Load” to import .svg / .smp / .json files.</div>
  </div>
</div>`;
  }

  // ── Helpers ──
  $(id){return this._shadow.getElementById(id);}
  gv(id){return parseFloat(this.$(id).value);}
  gs(id){return this.$(id).value;}
  setText(id,v){const e=this.$(id);if(e)e.textContent=v;}
  isLocked(id){const el=this.$('lock-'+id);return el&&el.checked;}

  _updateLabels(){
    this.setText('scale-val',parseFloat(this.gs('scale')).toFixed(2));
    this.setText('slot1-size-val',this.gs('slot1-size'));
    this.setText('slot1-spacing-val',this.gs('slot1-spacing'));
    this.setText('slot1-rot-val',this.gs('slot1-rot')+'°');
    this.setText('slot1-stx-val',parseFloat(this.gs('slot1-stx')).toFixed(2));
    this.setText('slot1-sty-val',parseFloat(this.gs('slot1-sty')).toFixed(2));
    this.setText('slot2-size-val',this.gs('slot2-size'));
    this.setText('slot2-spacing-val',this.gs('slot2-spacing'));
    this.setText('slot2-rot-val',this.gs('slot2-rot')+'°');
    this.setText('slot2-stx-val',parseFloat(this.gs('slot2-stx')).toFixed(2));
    this.setText('slot2-sty-val',parseFloat(this.gs('slot2-sty')).toFixed(2));
    const c1=this.$('s1card'),c2=this.$('s2card');
    if(c1)c1.style.setProperty('--sa',this.gs('slot1-color'));
    if(c2)c2.style.setProperty('--sa',this.gs('slot2-color'));
  }

  _bind(){
    this._shadow.querySelectorAll('[data-fn]').forEach(el=>el.addEventListener('click',()=>this[el.dataset.fn]()));
    ['bg-color','scale','slot1-type','slot1-color','slot1-size','slot1-spacing','slot1-rot','slot1-stx','slot1-sty',
     'slot2-type','slot2-color','slot2-size','slot2-spacing','slot2-rot','slot2-stx','slot2-sty'].forEach(id=>{
      const el=this.$(id);
      if(el)el.addEventListener('input',()=>{this._updateLabels();this._render();this._broadcastState();});
    });
  }

  _broadcastState(){
    const st=this._getState();
    try{localStorage.setItem(this._STATE_STORE,JSON.stringify(st));}catch(e){}
    this._chan?.postMessage({from:this._id,kind:'state',state:st});
  }

  // ── State ──
  _getState(){
    return{bg:this.gs('bg-color'),scale:this.gv('scale'),
      s1:{type:this.gs('slot1-type'),color:this.gs('slot1-color'),size:this.gv('slot1-size'),spacing:this.gv('slot1-spacing'),rotation:this.gv('slot1-rot'),row_offset:this.gv('slot1-stx'),col_offset:this.gv('slot1-sty')},
      s2:{type:this.gs('slot2-type'),color:this.gs('slot2-color'),size:this.gv('slot2-size'),spacing:this.gv('slot2-spacing'),rotation:this.gv('slot2-rot'),row_offset:this.gv('slot2-stx'),col_offset:this.gv('slot2-sty')}};
  }
  _applyState(st,locks,silent){
    const D=this._DEFAULTS;
    const set=(iid,lid,val)=>{const e=this.$(iid);if(!e)return;if(locks&&this.isLocked(lid))return;e.value=val;};
    set('bg-color','bg-color',st.bg);set('scale','scale',st.scale??1);
    const L1=st.s1||D.s1,L2=st.s2||D.s2;
    const gr=st.rotation??0;   // migrate old global rotation onto layers
    set('slot1-type','s1-type',L1.type);set('slot1-color','s1-color',L1.color);set('slot1-size','s1-size',L1.size);
    set('slot1-spacing','s1-spacing',L1.spacing);set('slot1-rot','s1-rot',L1.rotation??gr);set('slot1-stx','s1-stx',L1.row_offset);set('slot1-sty','s1-sty',L1.col_offset);
    set('slot2-type','s2-type',L2.type);set('slot2-color','s2-color',L2.color);set('slot2-size','s2-size',L2.size);
    set('slot2-spacing','s2-spacing',L2.spacing);set('slot2-rot','s2-rot',L2.rotation??gr);set('slot2-stx','s2-stx',L2.row_offset);set('slot2-sty','s2-sty',L2.col_offset);
    this._updateLabels();this._render();
    if(!silent)this._broadcastState();
  }

  // ── Render ──
  _render(){
    const svg=this.$('psvg');if(!svg)return;
    const W=Math.round(svg.clientWidth)||600,H=Math.round(svg.clientHeight)||600;
    if(W<2||H<2){requestAnimationFrame(()=>this._render());return;}
    const src=buildSVG(this._getState(),W,H,false);
    const doc=new DOMParser().parseFromString(src,'image/svg+xml');
    svg.innerHTML=doc.documentElement.innerHTML;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  }

  // ── Randomise ──
  _rc(hex,lH,lS,lV){
    const h2r=h=>{let r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let H=0,S=mx?d/mx:0,V=mx;
      if(d){switch(mx){case r:H=((g-b)/d)%6;break;case g:H=(b-r)/d+2;break;case b:H=(r-g)/d+4;break;}H=Math.round(H*60);if(H<0)H+=360;}return{h:H,s:S,v:V};};
    const h2h=(h,s,v)=>{const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;
      if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
      return'#'+[r,g,b].map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');};
    const c=h2r(hex);return h2h(lH?c.h:Math.random()*360,lS?c.s:Math.random()*.65+.35,lV?c.v:Math.random()*.45+.55);
  }
  randomizeBg(){
    if(!this.isLocked('bg-color'))this.$('bg-color').value=this._rc(this.gs('bg-color'),this.$('lock-bg-h').checked,this.$('lock-bg-s').checked,this.$('lock-bg-v').checked);
    if(!this.isLocked('scale'))this.$('scale').value=(Math.random()*2.6+.4).toFixed(2);
    this._updateLabels();this._render();this._broadcastState();
  }
  randomizeSlot(n,oc){
    const p='slot'+n,lp='s'+n;
    const pool=n===1?['checkerboard','circles','squares','stripes']:['none','none','checkerboard','circles','squares','stripes'];
    if(!this.isLocked(lp+'-type'))this.$(p+'-type').value=pool[Math.floor(Math.random()*pool.length)];
    if(oc!==undefined){if(!this.isLocked(lp+'-color'))this.$(p+'-color').value=oc;}
    else if(!this.isLocked(lp+'-color'))this.$(p+'-color').value=this._rc(this.gs(p+'-color'),this.$('lock-'+lp+'-h').checked,this.$('lock-'+lp+'-s').checked,this.$('lock-'+lp+'-v').checked);
    if(!this.isLocked(lp+'-rot'))this.$(p+'-rot').value=Math.floor(Math.random()*361);
    ['size','spacing','stx','sty'].forEach(k=>{if(!this.isLocked(lp+'-'+k)){const el=this.$(p+'-'+k);el.value=(Math.random()*(+el.max-+el.min)+ +el.min).toFixed(2);}});
    this._updateLabels();this._render();this._broadcastState();
  }
  randomizeAll(){this.randomizeBg();this.randomizeSlot(1);this.randomizeSlot(2);}
  randomizeAllSameColor(){this.randomizeBg();const s=this._rc(this.gs('slot1-color'),this.$('lock-s1-h').checked,this.$('lock-s1-s').checked,this.$('lock-s1-v').checked);this.randomizeSlot(1,s);this.randomizeSlot(2,s);}
  randomizeSlot1(){this.randomizeSlot(1);}
  randomizeSlot2(){this.randomizeSlot(2);}

  // ── Reset ──
  resetAll(){this._applyState(this._DEFAULTS,true);}
  resetBg(){this._applyState(this._DEFAULTS,true);}
  resetSlot1(){this._resetSlot(1);}
  resetSlot2(){this._resetSlot(2);}
  _resetSlot(n){const D=this._DEFAULTS['s'+n],p='slot'+n,lp='s'+n;
    const ms=(k,v)=>{if(!this.isLocked(lp+'-'+k))this.$(p+'-'+k).value=v;};
    ms('type',D.type);ms('color',D.color);ms('size',D.size);ms('spacing',D.spacing);ms('rot',D.rotation);ms('stx',D.row_offset);ms('sty',D.col_offset);
    this._updateLabels();this._render();this._broadcastState();}

  // ── File IO ──
  async pickFolder(){
    if(!window.showDirectoryPicker){alert('Folder picker needs Chrome or Edge.');return;}
    try{this._dir=await window.showDirectoryPicker({mode:'readwrite'});this.$('fdisp').textContent=this._dir.name;}catch(e){}
  }
  async _write(name,content,mime){
    if(this._dir){try{const fh=await this._dir.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(new Blob([content],{type:mime}));await w.close();return;}catch(e){console.warn(e);}}
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([content],{type:mime})),download:name});
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }
  async saveSVG(){const st=this._getState();await this._write(`pattern_${st.s1.type}_${st.s2.type}_${Date.now()}.svg`,buildSVG(st,1000,1000,true),'image/svg+xml');}
  loadFiles(){
    const inp=Object.assign(document.createElement('input'),{type:'file',multiple:true,accept:'.svg,.smp,.json'});
    inp.onchange=async e=>{
      let n=0;
      for(const f of[...e.target.files]){
        const txt=await f.text();
        try{
          if(f.name.endsWith('.json')){const j=JSON.parse(txt);(Array.isArray(j)?j:[j]).forEach(s=>this._coll.push(s));n++;}
          else{let smp=txt;if(f.name.endsWith('.svg')){const m=txt.match(/<desc>([\s\S]*?)<\/desc>/i);if(!m){alert(`${f.name}: no params`);continue;}smp=m[1];}this._coll.push(smpToState(smp));n++;}
        }catch(err){alert(`${f.name}: ${err.message}`);}
      }
      if(n){this._persist();this._renderColl();this._collVisible(true);}
    };
    inp.click();
  }

  // ── Collection ──
  addToCollection(){this._coll.push(this._getState());this._persist();this._renderColl();this._collVisible(true);}
  _persist(){try{localStorage.setItem(this._STORE,JSON.stringify(this._coll));}catch(e){}this._chan?.postMessage({from:this._id,kind:'coll'});}
  _loadStorage(){try{const s=localStorage.getItem(this._STORE);if(s){this._coll=JSON.parse(s);if(this._coll.length){this._renderColl();this._collVisible(true);}}}catch(e){}}
  _thumbSVG(st,TW,TH){const f=TW/600,ts=JSON.parse(JSON.stringify(st));ts.s1.size*=f;ts.s1.spacing*=f;ts.s2.size*=f;ts.s2.spacing*=f;return buildSVG(ts,TW,TH,false);}
  _renderColl(){
    const cont=this.$('thumbs');if(!cont)return;cont.innerHTML='';
    this._coll.forEach((st,i)=>{
      const div=document.createElement('div');div.className='thumb';
      div.innerHTML=this._thumbSVG(st,100,100);
      const lbl=document.createElement('div');lbl.className='tlbl';lbl.textContent=`${st.s1.type}/${st.s2.type}`;div.appendChild(lbl);
      const del=document.createElement('div');del.className='del';del.textContent='×';
      del.onclick=e=>{e.stopPropagation();this._coll.splice(i,1);this._persist();this._renderColl();this._collVisible(this._coll.length>0);};
      div.appendChild(del);
      div.onclick=e=>{if(e.target!==del){this._applyState(st,false);}};
      cont.appendChild(div);
    });
  }
  clearCollection(){if(confirm('Clear all?')){this._coll=[];this._persist();this._renderColl();this._collVisible(false);}}
  // Always read the latest collection from storage at export time, so exporting
  // from any instance (e.g. a separated Collection pane) reflects additions made
  // in another instance even if a sync message was missed.
  _freshColl(){try{const s=localStorage.getItem(this._STORE);if(s){const a=JSON.parse(s);if(Array.isArray(a)&&a.length)return a;}}catch(e){}return this._coll;}
  async exportAllSVGs(){const coll=this._freshColl();if(!coll.length){alert('Collection is empty — add a pattern first.');return;}for(let i=0;i<coll.length;i++){const st=coll[i];await this._write(`pattern_${String(i+1).padStart(3,'0')}_${st.s1.type}_${st.s2.type}.svg`,buildSVG(st,1000,1000,true),'image/svg+xml');}}
  async exportSMP(){const coll=this._freshColl();if(!coll.length){alert('Collection is empty — add a pattern first.');return;}await this._write('patterns.smp',coll.map((st,i)=>`# ── Pattern ${i+1} ──\n${stateToSmp(st)}`).join('\n\n')+'\n','text/plain');}
  async exportJSON(){const coll=this._freshColl();if(!coll.length){alert('Collection is empty — add a pattern first.');return;}await this._write('patterns.json',JSON.stringify(coll,null,2),'application/json');}
  async exportHTML(){
    const coll=this._freshColl();
    if(!coll.length){alert('Collection is empty — add a pattern first.');return;}
    const cards=coll.map((st,i)=>{const svg=buildSVG(st,400,400,true);
      return`<div class="card">${svg}<div class="info">${st.s1.type}/${st.s2.type} · ${st.bg} · ↻${Math.round(st.s1.rotation||0)}°/${Math.round(st.s2.rotation||0)}° · ×${st.scale.toFixed(2)}</div></div>`;}).join('\n');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Semiotic Patterns</title>
<style>body{background:#0c0c10;color:#eee;font-family:system-ui;padding:24px;margin:0}h1{text-align:center;margin-bottom:20px;font-size:1.1rem;color:#9090aa;text-transform:uppercase;letter-spacing:.1em}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;max-width:1400px;margin:0 auto}.card{background:#15151c;border-radius:8px;overflow:hidden;border:1px solid #2e2e3e}.card svg{width:100%;height:auto;display:block}.info{padding:8px 10px;font-size:.68rem;color:#9090aa}</style></head><body><h1>Semiotic Pattern Collection</h1><div class="grid">${cards}</div></body></html>`;
    await this._write('patterns.html',html,'text/html');
  }
}
customElements.define('semiotic-pattern-builder',SemioticPatternBuilder);
