(function(){
    const $ = s => document.querySelector(s);
    const bar=document.querySelector('.bar');
    const input=$('#colorInput'),   picker=$('#picker'),
          inputB=$('#colorInputB'), pickerB=$('#pickerB'),
          inputC=$('#colorInputC'), pickerC=$('#pickerC'),
          err=$('#err'), baseCard=$('#baseCard'), out=$('#palettes'),
          toast=$('#toast'), dot=$('#brandDot'), hint=$('#hint'),
          modeTag=$('#modeTag'), slotB=$('#slotB'), slotC=$('#slotC');
  
    let mode='single';
    let scaleForCss=[];
    let selectedSet=null;
    let lastSet=null;
  
    const COUNT={single:1,duo:2,trio:3};
  
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
    const setName=cols=>cols.map(colorName).join(' × ');
  
    /* ---------- rendering ---------- */
    function chipHtml(...cols){
      return cols.filter(Boolean).map(c=>`<i style="background:${toHex(c)}"></i>`).join('');
    }
  
    function swatch(colors,label){
      const hexes=colors.map(toHex);
      const b=document.createElement('button');
      b.type='button';
      b.className='sw'+(colors.length>1?' n'+colors.length:'');
      if(colors.length>1){
        b.dataset.hexes=hexes.join(' ');
        b.setAttribute('aria-pressed','false');
        b.innerHTML=`<span class="chip">${chipHtml(...colors)}</span>
          <span class="lbl"><b>${hexes.join(' · ')}</b><i>${label}</i></span>`;
        b.onclick=()=>selectSet(colors,label,b);
      }else{
        const rgb=colors[0], hex=hexes[0];
        b.innerHTML=`<span class="chip">${chipHtml(rgb)}<span class="hexOn" style="color:${readable(rgb)}">copy</span></span>
          <span class="lbl"><b>${hex}</b><i>${label} · ${rgb.r|0},${rgb.g|0},${rgb.b|0}</i></span>`;
        b.onclick=()=>copy(hex, hex+' copied');
      }
      return b;
    }
  
    function selectSet(colors,label,btn){
      selectedSet={colors,label,name:setName(colors)};
      out.querySelectorAll('.sw.on').forEach(el=>{
        el.classList.remove('on'); el.setAttribute('aria-pressed','false');
      });
      btn.classList.add('on');
      btn.setAttribute('aria-pressed','true');
      paintBaseMulti(colors,true);
      copy(colors.map(toHex).join(' '), selectedSet.name+' selected');
    }
  
    // n = how many colors per item; item format: [c1, ...cN, label]
    function group(title, items, n){
      n = n===true ? 2 : (n||1);
      const g=document.createElement('div'); g.className='group';
      const h=document.createElement('h2'); h.textContent=title; g.appendChild(h);
      const row=document.createElement('div');
      row.className='row'+(n>1?' n'+n:'');
      items.forEach(it=>row.appendChild(swatch(it.slice(0,n), it[n])));
      g.appendChild(row); out.appendChild(g);
    }
  
    function paintBaseSingle(rgb){
      const hex=toHex(rgb), hsl=rgbToHsl(rgb);
      const cw=contrast(rgb,{r:255,g:255,b:255}), cb=contrast(rgb,{r:17,g:17,b:17});
      document.documentElement.style.setProperty('--accent',hex);
      dot.classList.remove('split');
      dot.classList.remove('split3');
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
  
    function paintBaseMulti(colors,fromSelect){
      const hexes=colors.map(toHex);
      const name=setName(colors);
      const labels = colors.length===2 ? ['Left','Right'] : ['First','Second','Third'];
      const root=document.documentElement.style;
      root.setProperty('--accent',hexes[0]);
      root.setProperty('--accent-a',hexes[0]);
      root.setProperty('--accent-b',hexes[1]);
      root.setProperty('--accent-c',hexes[2]||hexes[1]);
      dot.classList.toggle('split',  colors.length===2);
      dot.classList.toggle('split3', colors.length===3);
  
      let meta='';
      colors.forEach((c,i)=>{
        const h=rgbToHsl(c);
        meta+=`<div><span>${labels[i]}</span><b>${hexes[i].toUpperCase()}</b></div>`;
        meta+=`<div><span>${labels[i]} HSL</span><b>${h.h}°, ${h.s}%, ${h.l}%</b></div>`;
      });
      for(let i=0;i<colors.length;i++){
        for(let j=i+1;j<colors.length;j++){
          meta+=`<div><span>${labels[i]} vs ${labels[j]}</span><b>${ratio(contrast(colors[i],colors[j]))}</b></div>`;
        }
      }
  
      baseCard.innerHTML=`
        <div class="big">${chipHtml(...colors)}</div>
        <div>
          <div class="name">${name}${fromSelect?' · selected':''}</div>
          <div class="meta">${meta}</div>
        </div>
        <div class="preview" style="background:${hexes[0]};color:${readable(colors[0])}" aria-hidden="true">
          <div class="pv-cap">Live preview</div>
          <div class="pv-ttl">Heading on first color</div>
          <div class="pv-txt">Body text sample.</div>
          <div class="pv-actions">
            <span class="pv-btn" style="background:${hexes[1]};color:${readable(colors[1])}">Button</span>
            ${colors[2]?`<span class="pv-btn" style="background:${hexes[2]};color:${readable(colors[2])}">Tag</span>`:''}
          </div>
        </div>`;
    }
  
    function render(rgb){
      picker.value=toHex(rgb);
      paintBaseSingle(rgb);
      out.innerHTML='';
      selectedSet=null; lastSet=null;
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
      lastSet=[a,b];
      selectedSet=null;
      paintBaseMulti([a,b],false);
      out.innerHTML='';
      const W={r:255,g:255,b:255}, K={r:0,g:0,b:0};
      const hslA=rgbToHsl(a), hslB=rgbToHsl(b);
      const name=setName([a,b]);
  
      group(name+' — split pair', [
        [a,b,'50 / 50'],
        [b,a,'50 / 50 reverse'],
        [a, mix(a,b,.5), 'left + midpoint'],
        [mix(a,b,.5), b, 'midpoint + right'],
      ], 2);
  
      group(name+' — tint splits', [
        [a, mix(b,W,.25), 'right 25% white'],
        [a, mix(b,W,.5), 'right 50% white'],
        [a, mix(b,W,.75), 'right 75% white'],
        [mix(a,W,.25), b, 'left 25% white'],
        [mix(a,W,.5), b, 'left 50% white'],
        [mix(a,W,.75), b, 'left 75% white'],
      ], 2);
  
      group(name+' — shade splits', [
        [a, mix(b,K,.25), 'right 25% black'],
        [a, mix(b,K,.5), 'right 50% black'],
        [a, mix(b,K,.75), 'right 75% black'],
        [mix(a,K,.25), b, 'left 25% black'],
        [mix(a,K,.5), b, 'left 50% black'],
        [mix(a,K,.75), b, 'left 75% black'],
      ], 2);
  
      group(name+' — blend splits', [
        [a, mix(a,b,.2), '20% blend'],
        [a, mix(a,b,.4), '40% blend'],
        [a, mix(a,b,.6), '60% blend'],
        [a, mix(a,b,.8), '80% blend'],
        [mix(b,a,.3), mix(a,b,.3), 'soft cross'],
        [mix(b,a,.15), mix(a,b,.15), 'near originals'],
      ], 2);
  
      group(name+' — harmony splits', [
        [a, shiftHue(hslB,180), 'right complement'],
        [shiftHue(hslA,180), b, 'left complement'],
        [a, shiftHue(hslB,30), 'right analogous'],
        [a, shiftHue(hslB,-30), 'right analogous −'],
        [shiftHue(hslA,120), b, 'left triadic'],
        [a, shiftHue(hslB,120), 'right triadic'],
      ], 2);
    }
  
    function renderTrio(a,b,c){
      picker.value=toHex(a);
      pickerB.value=toHex(b);
      pickerC.value=toHex(c);
      lastSet=[a,b,c];
      selectedSet=null;
      paintBaseMulti([a,b,c],false);
      out.innerHTML='';
      const W={r:255,g:255,b:255}, K={r:0,g:0,b:0};
      const hslA=rgbToHsl(a), hslB=rgbToHsl(b), hslC=rgbToHsl(c);
      const name=setName([a,b,c]);
  
      group(name+' — split set', [
        [a,b,c,'1 / 2 / 3'],
        [c,b,a,'reversed'],
        [b,c,a,'rotate left'],
        [c,a,b,'rotate right'],
        [a, mix(a,c,.5), c, 'ends + midpoint'],
        [mix(a,b,.5), b, mix(b,c,.5), 'softened'],
      ], 3);
  
      group(name+' — tint set', [
        [mix(a,W,.25), mix(b,W,.25), mix(c,W,.25), '25% white'],
        [mix(a,W,.5),  mix(b,W,.5),  mix(c,W,.5),  '50% white'],
        [mix(a,W,.75), mix(b,W,.75), mix(c,W,.75), '75% white'],
        [mix(a,W,.5), b, c, 'first 50% white'],
        [a, mix(b,W,.5), c, 'second 50% white'],
        [a, b, mix(c,W,.5), 'third 50% white'],
      ], 3);
  
      group(name+' — shade set', [
        [mix(a,K,.25), mix(b,K,.25), mix(c,K,.25), '25% black'],
        [mix(a,K,.5),  mix(b,K,.5),  mix(c,K,.5),  '50% black'],
        [mix(a,K,.75), mix(b,K,.75), mix(c,K,.75), '75% black'],
        [mix(a,K,.5), b, c, 'first 50% black'],
        [a, mix(b,K,.5), c, 'second 50% black'],
        [a, b, mix(c,K,.5), 'third 50% black'],
      ], 3);
  
      group(name+' — blend set', [
        [a, mix(a,b,.5), b, '1 → 2 ramp'],
        [b, mix(b,c,.5), c, '2 → 3 ramp'],
        [a, mix(a,c,.33), mix(a,c,.66), '1 → 3 ramp'],
        [mix(a,b,.2), mix(b,c,.2), mix(c,a,.2), '20% cross'],
        [mix(a,b,.4), mix(b,c,.4), mix(c,a,.4), '40% cross'],
        [mix(b,a,.3), mix(c,b,.3), mix(a,c,.3), 'soft cross'],
      ], 3);
  
      group(name+' — harmony set', [
        [shiftHue(hslA,180), b, c, 'first complement'],
        [a, shiftHue(hslB,180), c, 'second complement'],
        [a, b, shiftHue(hslC,180), 'third complement'],
        [a, shiftHue(hslB,30), shiftHue(hslC,-30), 'analogous spread'],
        [shiftHue(hslA,120), shiftHue(hslB,120), shiftHue(hslC,120), 'all +120'],
        [shiftHue(hslA,240), shiftHue(hslB,240), shiftHue(hslC,240), 'all +240'],
      ], 3);
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
      const n=COUNT[mode]||1;
      [['#modeSingle',1],['#modeDuo',2],['#modeTrio',3]].forEach(([sel,k])=>{
        const el=$(sel); if(!el) return;
        el.classList.toggle('on', n===k);
        el.setAttribute('aria-selected', String(n===k));
      });
      slotB.classList.toggle('hidden', n<2);
      slotC.classList.toggle('hidden', n<3);
      bar.classList.toggle('tight', n===3);
      modeTag.textContent = n===3 ? 'three-color split palette'
                         : n===2 ? 'two-color split palette'
                                 : 'single-color palette generator';
      hint.textContent = n>1
        ? 'Click a split swatch to select that set. Copy CSS exports the selected set.'
        : 'Click on any swatch to copy the hex code.';
      go();
    }
  
    function go(){
      const a=parseColor(input.value);
      if(!a){ err.textContent="Couldn't read that color. Try: #c17440 or rgb(193,116,64)"; return; }
      if(mode==='single'){ err.textContent=''; render(a); return; }
  
      const b=parseColor(inputB.value);
      if(!b){ err.textContent='Second color missing. Try: #111111 or rgb(17,17,17)'; return; }
      if(mode==='duo'){ err.textContent=''; renderDuo(a,b); return; }
  
      const c=parseColor(inputC.value);
      if(!c){ err.textContent='Third color missing. Try: #f0ece6 or rgb(240,236,230)'; return; }
      err.textContent=''; renderTrio(a,b,c);
    }
  
    $('#modeSingle').onclick=()=>setMode('single');
    $('#modeDuo').onclick=()=>setMode('duo');
    $('#modeTrio').onclick=()=>setMode('trio');
    $('#goBtn').onclick=go;
  
    [[input,'single'],[inputB,'duo'],[inputC,'trio']].forEach(([el,least])=>{
      el.addEventListener('input',()=>{
        if(COUNT[mode] >= COUNT[least] && parseColor(el.value)) go();
      });
      el.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    });
    picker.addEventListener('input',()=>{ input.value=picker.value; go(); });
    pickerB.addEventListener('input',()=>{ inputB.value=pickerB.value; go(); });
    pickerC.addEventListener('input',()=>{ inputC.value=pickerC.value; go(); });
  
    const randColor=()=>hslToRgb({
      h:Math.floor(Math.random()*360), s:20+Math.random()*70, l:12+Math.random()*68
    });
  
    $('#randBtn').onclick=()=>{
      const n=COUNT[mode]||1;
      const picked=[hslToRgb({h:Math.floor(Math.random()*360),s:35+Math.random()*50,l:30+Math.random()*35})];
      while(picked.length<n){
        let next, tries=0;
        do{ next=randColor(); }
        while(picked.some(p=>contrast(p,next)<1.7) && ++tries<30);
        picked.push(next);
      }
      input.value=toHex(picked[0]);
      if(picked[1]) inputB.value=toHex(picked[1]);
      if(picked[2]) inputC.value=toHex(picked[2]);
      go();
    };
  
    $('#copyAll').onclick=()=>{
      if(mode!=='single'){
        const set = selectedSet ? selectedSet.colors : lastSet;
        if(!set || !set.length) return;
        const hexes=set.map(toHex), n=hexes.length;
        const vars=hexes.map((h,i)=>`  --brand-${i+1}: ${h};`).join('\n');
        const stops=hexes.map((h,i)=>{
          const from=+(i*100/n).toFixed(2), to=+((i+1)*100/n).toFixed(2);
          return `var(--brand-${i+1}) ${from}%, var(--brand-${i+1}) ${to}%`;
        }).join(',\n    ');
        const css=`:root{\n${vars}\n}\n.brand-split{\n  background: linear-gradient(90deg,\n    ${stops});\n}`;
        copy(css, (selectedSet?selectedSet.name:setName(set))+' CSS copied');
        return;
      }
      if(!scaleForCss.length) return;
      const css=':root{\n'+scaleForCss.map(([n,h])=>`  --brand-${n}: ${h};`).join('\n')+'\n}';
      copy(css,'CSS variables copied');
    };
  
    go();
  })();