(function(){
    const $ = s => document.querySelector(s);
    const input=$('#colorInput'), picker=$('#picker'),
          inputB=$('#colorInputB'), pickerB=$('#pickerB'),
          err=$('#err'), baseCard=$('#baseCard'), out=$('#palettes'),
          toast=$('#toast'), dot=$('#brandDot'), hint=$('#hint'),
          modeTag=$('#modeTag'), slotB=$('#slotB');
  
    let mode='single';
    let scaleForCss=[];
    let selectedPair=null;
    let lastPair=null;
  
    /* ---------- parsing & conversion ---------- */
    const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  
    function parseColor(str){
      if(!str) return null;
      const s=str.trim().toLowerCase();
      let m=s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
      if(m){
        let h=m[1];
        if(h.length===3) h=h.split('').map(c=>c+c).join('');
        return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
      }
      m=s.match(/^(?:rgba?\s*)?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[,)]?/);
      if(m){
        const r=+m[1],g=+m[2],b=+m[3];
        if([r,g,b].some(v=>v>255)) return null;
        return {r,g,b};
      }
      return null;
    }
    const toHex=c=>'#'+[c.r,c.g,c.b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  
    function rgbToHsl({r,g,b}){
      r/=255;g/=255;b/=255;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
      let h=0,s=0;const l=(mx+mn)/2;
      if(d){
        s=l>.5? d/(2-mx-mn) : d/(mx+mn);
        if(mx===r) h=((g-b)/d+(g<b?6:0));
        else if(mx===g) h=((b-r)/d+2);
        else h=((r-g)/d+4);
        h*=60;
      }
      return {h:Math.round(h),s:Math.round(s*100),l:Math.round(l*100)};
    }
    function hslToRgb({h,s,l}){
      h=((h%360)+360)%360; s=clamp(s,0,100)/100; l=clamp(l,0,100)/100;
      const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
      let p=[0,0,0];
      if(h<60)p=[c,x,0];else if(h<120)p=[x,c,0];else if(h<180)p=[0,c,x];
      else if(h<240)p=[0,x,c];else if(h<300)p=[x,0,c];else p=[c,0,x];
      return {r:Math.round((p[0]+m)*255),g:Math.round((p[1]+m)*255),b:Math.round((p[2]+m)*255)};
    }
    const mix=(c,t,a)=>({r:c.r+(t.r-c.r)*a, g:c.g+(t.g-c.g)*a, b:c.b+(t.b-c.b)*a});
    const shiftHue=(hsl,deg)=>hslToRgb({h:hsl.h+deg,s:hsl.s,l:hsl.l});
  
    function lum({r,g,b}){
      const f=v=>{v/=255;return v<=0.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4);};
      return .2126*f(r)+.7152*f(g)+.0722*f(b);
    }
    const contrast=(a,b)=>{const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);};
    const readable=c=>contrast(c,{r:255,g:255,b:255})>=contrast(c,{r:17,g:17,b:17})?'#ffffff':'#111111';
    const wcag=r=> r>=7?['AAA','pass'] : r>=4.5?['AA','pass'] : r>=3?['AA lg','warn'] : ['Fail','fail'];
    const ratio=r=>{const [t,c]=wcag(r);return `${r.toFixed(2)}:1 <em class="badge ${c}">${t}</em>`;};
  
    function colorName(rgb){
      const {h,s,l}=rgbToHsl(rgb);
      if(l<=8) return 'Black';
      if(l>=94 && s<12) return 'White';
      if(s<10) return l<40?'Charcoal':l<70?'Gray':'Silver';
      const bands=[[15,'Red'],[45,'Orange'],[70,'Yellow'],[155,'Green'],
                   [200,'Cyan'],[255,'Blue'],[310,'Purple'],[345,'Pink'],[360,'Red']];
      const hue=bands.find(x=>h<=x[0])[1];
      const mod=l<28?'Deep ':l>75?'Pale ':s>72?'Vivid ':'';
      return (mod+hue).trim();
    }
    const pairName=(a,b)=>`${colorName(a)} × ${colorName(b)}`;
  
    /* ---------- rendering ---------- */
    function chipHtml(a,b){
      if(b) return `<i style="background:${toHex(a)}"></i><i style="background:${toHex(b)}"></i>`;
      return `<i style="background:${toHex(a)}"></i>`;
    }
  
    function swatch(rgb,label,pair){
      const hex=toHex(rgb);
      const b=document.createElement('button');
      b.type='button';
      b.className='sw';
      if(pair){
        const hexB=toHex(pair);
        b.dataset.a=hex; b.dataset.b=hexB;
        b.setAttribute('aria-pressed','false');
        b.innerHTML=`<span class="chip">${chipHtml(rgb,pair)}</span>
          <span class="lbl"><b>${hex} · ${hexB}</b><i>${label}</i></span>`;
        b.onclick=()=>selectPair(rgb,pair,label,b);
      }else{
        b.innerHTML=`<span class="chip">${chipHtml(rgb)}<span class="hexOn" style="color:${readable(rgb)}">copy</span></span>
          <span class="lbl"><b>${hex}</b><i>${label} · ${rgb.r|0},${rgb.g|0},${rgb.b|0}</i></span>`;
        b.onclick=()=>copy(hex, hex+' copied');
      }
      return b;
    }
  
    function selectPair(a,b,label,btn){
      selectedPair={a,b,label,name:pairName(a,b)};
      out.querySelectorAll('.sw.on').forEach(el=>{
        el.classList.remove('on'); el.setAttribute('aria-pressed','false');
      });
      btn.classList.add('on');
      btn.setAttribute('aria-pressed','true');
      paintBaseDuo(a,b,true);
      copy(`${toHex(a)} ${toHex(b)}`, selectedPair.name+' selected');
    }
  
    function group(title, items, paired){
      const g=document.createElement('div'); g.className='group';
      const h=document.createElement('h2'); h.textContent=title; g.appendChild(h);
      const row=document.createElement('div'); row.className='row';
      items.forEach(item=>{
        if(paired) row.appendChild(swatch(item[0], item[2], item[1]));
        else row.appendChild(swatch(item[0], item[1]));
      });
      g.appendChild(row); out.appendChild(g);
    }
  
    function paintBaseSingle(rgb){
      const hex=toHex(rgb), hsl=rgbToHsl(rgb);
      const cw=contrast(rgb,{r:255,g:255,b:255}), cb=contrast(rgb,{r:17,g:17,b:17});
      document.documentElement.style.setProperty('--accent',hex);
      dot.classList.remove('split');
      baseCard.innerHTML=`
        <div class="big">${chipHtml(rgb)}</div>
        <div>
          <div class="name">${colorName(rgb)}</div>
          <div class="meta">
            <div><span>Hex</span><b>${hex.toUpperCase()}</b></div>
            <div><span>RGB</span><b>${rgb.r}, ${rgb.g}, ${rgb.b}</b></div>
            <div><span>HSL</span><b>${hsl.h}°, ${hsl.s}%, ${hsl.l}%</b></div>
            <div><span>vs White</span><b>${ratio(cw)}</b></div>
            <div><span>vs Black</span><b>${ratio(cb)}</b></div>
            <div><span>Best text</span><b>${readable(rgb).toUpperCase()}</b></div>
          </div>
        </div>`;
    }
  
    function paintBaseDuo(a,b,fromSelect){
      const hexA=toHex(a), hexB=toHex(b);
      const hslA=rgbToHsl(a), hslB=rgbToHsl(b);
      const name=pairName(a,b);
      const inkA=readable(a), inkB=readable(b);
      document.documentElement.style.setProperty('--accent',hexA);
      document.documentElement.style.setProperty('--accent-a',hexA);
      document.documentElement.style.setProperty('--accent-b',hexB);
      dot.classList.add('split');
      baseCard.innerHTML=`
        <div class="big">${chipHtml(a,b)}</div>
        <div>
          <div class="name">${name}${fromSelect?' · selected':''}</div>
          <div class="meta">
            <div><span>Left</span><b>${hexA.toUpperCase()}</b></div>
            <div><span>Right</span><b>${hexB.toUpperCase()}</b></div>
            <div><span>Left HSL</span><b>${hslA.h}°, ${hslA.s}%, ${hslA.l}%</b></div>
            <div><span>Right HSL</span><b>${hslB.h}°, ${hslB.s}%, ${hslB.l}%</b></div>
            <div><span>Contrast</span><b>${ratio(contrast(a,b))}</b></div>
            <div><span>Pair</span><b>${name}</b></div>
          </div>
        </div>
        <div class="preview" style="background:${hexA};color:${inkA}" aria-hidden="true">
          <div class="pv-cap">Live preview</div>
          <div class="pv-ttl">Heading on left color</div>
          <div class="pv-txt">Body text sample.</div>
          <span class="pv-btn" style="background:${hexB};color:${inkB}">Button</span>
        </div>`;
    }
  
    function render(rgb){
      picker.value=toHex(rgb);
      paintBaseSingle(rgb);
      out.innerHTML='';
      selectedPair=null;
      const W={r:255,g:255,b:255}, B={r:0,g:0,b:0}, G={r:128,g:128,b:128};
      const hsl=rgbToHsl(rgb);
  
      group('Tints — white mix',  [.15,.3,.45,.6,.75,.9].map(a=>[mix(rgb,W,a), (a*100)+'% white']));
      group('Shades — black mix', [.15,.3,.45,.6,.75,.9].map(a=>[mix(rgb,B,a), (a*100)+'% black']));
      group('Tones — gray mix',   [.15,.3,.45,.6,.75].map(a=>[mix(rgb,G,a), (a*100)+'% gray']));
  
      const steps=[['50',95],['100',90],['200',80],['300',68],['400',56],
                   ['500',hsl.l],['600',Math.max(hsl.l-12,8)],['700',Math.max(hsl.l-24,6)],
                   ['800',Math.max(hsl.l-34,5)],['900',Math.max(hsl.l-44,4)]];
      scaleForCss=steps.map(([n,l])=>[n,toHex(hslToRgb({h:hsl.h,s:hsl.s,l}))]);
      group('Scale 50 → 900', steps.map(([n,l])=>[hslToRgb({h:hsl.h,s:hsl.s,l}), n]));
  
      group('Harmony', [
        [rgb,'base'],
        [shiftHue(hsl,180),'complement'],
        [shiftHue(hsl,30),'analogous +30'],
        [shiftHue(hsl,-30),'analogous −30'],
        [shiftHue(hsl,120),'triadic +120'],
        [shiftHue(hsl,240),'triadic +240'],
        [shiftHue(hsl,150),'split +150'],
        [shiftHue(hsl,210),'split +210'],
        [shiftHue(hsl,90),'tetradic +90'],
        [shiftHue(hsl,270),'tetradic +270'],
      ]);
    }
  
    function renderDuo(a,b){
      picker.value=toHex(a);
      pickerB.value=toHex(b);
      lastPair={a,b};
      selectedPair=null;
      paintBaseDuo(a,b,false);
      out.innerHTML='';
      const W={r:255,g:255,b:255}, K={r:0,g:0,b:0};
      const hslA=rgbToHsl(a), hslB=rgbToHsl(b);
      const name=pairName(a,b);
  
      group(name+' — split pair', [
        [a,b,'50 / 50'],
        [b,a,'50 / 50 reverse'],
        [a, mix(a,b,.5), 'left + midpoint'],
        [mix(a,b,.5), b, 'midpoint + right'],
      ], true);
  
      group(name+' — tint splits', [
        [a, mix(b,W,.25), 'right 25% white'],
        [a, mix(b,W,.5), 'right 50% white'],
        [a, mix(b,W,.75), 'right 75% white'],
        [mix(a,W,.25), b, 'left 25% white'],
        [mix(a,W,.5), b, 'left 50% white'],
        [mix(a,W,.75), b, 'left 75% white'],
      ], true);
  
      group(name+' — shade splits', [
        [a, mix(b,K,.25), 'right 25% black'],
        [a, mix(b,K,.5), 'right 50% black'],
        [a, mix(b,K,.75), 'right 75% black'],
        [mix(a,K,.25), b, 'left 25% black'],
        [mix(a,K,.5), b, 'left 50% black'],
        [mix(a,K,.75), b, 'left 75% black'],
      ], true);
  
      group(name+' — blend splits', [
        [a, mix(a,b,.2), '20% blend'],
        [a, mix(a,b,.4), '40% blend'],
        [a, mix(a,b,.6), '60% blend'],
        [a, mix(a,b,.8), '80% blend'],
        [mix(b,a,.3), mix(a,b,.3), 'soft cross'],
        [mix(b,a,.15), mix(a,b,.15), 'near originals'],
      ], true);
  
      group(name+' — harmony splits', [
        [a, shiftHue(hslB,180), 'right complement'],
        [shiftHue(hslA,180), b, 'left complement'],
        [a, shiftHue(hslB,30), 'right analogous'],
        [a, shiftHue(hslB,-30), 'right analogous −'],
        [shiftHue(hslA,120), b, 'left triadic'],
        [a, shiftHue(hslB,120), 'right triadic'],
      ], true);
    }
  
    /* ---------- actions ---------- */
    function copy(text,msg){
      const done=()=>{
        toast.textContent=msg; toast.classList.add('on');
        clearTimeout(copy._t); copy._t=setTimeout(()=>toast.classList.remove('on'),1400);
      };
      try{
        navigator.clipboard.writeText(text).then(done).catch(()=>fallback(text,done));
      }catch(e){ fallback(text,done); }
    }
    function fallback(text,done){
      const ta=document.createElement('textarea');
      ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{document.execCommand('copy');done();}catch(e){}
      document.body.removeChild(ta);
    }
  
    function setMode(next){
      mode=next;
      const isDuo=mode==='duo';
      $('#modeSingle').classList.toggle('on', !isDuo);
      $('#modeDuo').classList.toggle('on', isDuo);
      $('#modeSingle').setAttribute('aria-selected', String(!isDuo));
      $('#modeDuo').setAttribute('aria-selected', String(isDuo));
      slotB.classList.toggle('hidden', !isDuo);
      modeTag.textContent=isDuo?'two-color split palette':'single-color palette generator';
      hint.textContent=isDuo
        ? 'Click a split swatch to select that pair. Copy CSS exports the selected pair.'
        : 'Click on any swatch to copy the hex code.';
      go();
    }
  
    function go(){
      const rgb=parseColor(input.value);
      if(!rgb){ err.textContent="Couldn't read that color. Try: #c17440 or rgb(193,116,64)"; return; }
      if(mode==='duo'){
        const rgbB=parseColor(inputB.value);
        if(!rgbB){ err.textContent='Second color missing. Try: #111111 or rgb(17,17,17)'; return; }
        err.textContent='';
        renderDuo(rgb, rgbB);
        return;
      }
      err.textContent='';
      render(rgb);
    }
  
    $('#modeSingle').onclick=()=>setMode('single');
    $('#modeDuo').onclick=()=>setMode('duo');
    $('#goBtn').onclick=go;
    input.addEventListener('input',()=>{ if(parseColor(input.value)) go(); });
    input.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    inputB.addEventListener('input',()=>{ if(mode==='duo' && parseColor(inputB.value)) go(); });
    inputB.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    picker.addEventListener('input',()=>{ input.value=picker.value; go(); });
    pickerB.addEventListener('input',()=>{ inputB.value=pickerB.value; go(); });
  
    $('#randBtn').onclick=()=>{
      const c=hslToRgb({h:Math.floor(Math.random()*360),s:35+Math.random()*50,l:30+Math.random()*35});
      input.value=toHex(c);
      if(mode==='duo'){
        let d, tries=0;
        do{ d=hslToRgb({h:Math.floor(Math.random()*360),s:20+Math.random()*70,l:8+Math.random()*70}); }
        while(contrast(c,d)<2 && ++tries<20);
        inputB.value=toHex(d);
      }
      go();
    };
  
    $('#copyAll').onclick=()=>{
      if(mode==='duo'){
        const pair=selectedPair || (lastPair && {a:lastPair.a,b:lastPair.b,name:pairName(lastPair.a,lastPair.b)});
        if(!pair) return;
        const a=toHex(pair.a), b=toHex(pair.b);
        const css=`:root{\n  --brand-a: ${a};\n  --brand-b: ${b};\n}\n.brand-split{\n  background: linear-gradient(90deg, var(--brand-a) 50%, var(--brand-b) 50%);\n}`;
        copy(css, (pair.name||'Pair')+' CSS copied');
        return;
      }
      if(!scaleForCss.length) return;
      const css=':root{\n'+scaleForCss.map(([n,h])=>`  --brand-${n}: ${h};`).join('\n')+'\n}';
      copy(css,'CSS variables copied');
    };
  
    go();
  })();