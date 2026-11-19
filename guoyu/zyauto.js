// 自動注音與資料匯入（瀏覽器與 node 共用）
// DICT = {c:{字:[讀音0(預設), 讀音1, …]}, w:{語詞:"讀音 讀音"}}，讀音順序＝注音字型的異體字選擇子順序
(function(root){
const TONE = s => s.startsWith('˙') ? '5' : s.includes('ˊ') ? '2' : s.includes('ˇ') ? '3' : s.includes('ˋ') ? '4' : '1';
const BLOCK = /眾矢之的|圖們江|自我反省|么麼|麼蝨|什佰|兵強主尊|他是男人/;

function autoWord(word, D){
  const ch=[...word]; const z=ch.map(c=>(D.c[c]||[''])[0]); const sure=ch.map(c=>!/[一-鿿]/.test(c)||!D.c[c]||D.c[c].length<2);
  // 先找整個詞，再找詞裡較長的片段（例：好朋友 → 朋友）
  for(let len=ch.length; len>=2; len--){
    for(let i=0;i+len<=ch.length;i++){
      const w=ch.slice(i,i+len).join(''); const r=D.w[w];
      if(r){ r.split(' ').forEach((s,k)=>{ if(!sure[i+k] || len===ch.length){ z[i+k]=s; sure[i+k]=true; } }); }
    }
  }
  const axa=[];
  // 「看一看」這種：前後同一個字，讀音一樣（用前一個字的讀音）
  for(let i=0;i+2<ch.length;i++){ if(ch[i+1]==='一'&&ch[i]===ch[i+2]&&!D.w[ch.slice(i,i+3).join('')]){ z[i+2]=z[i]; sure[i+1]=false; axa.push(i+1); } }
  // 一、不 變調（看下一個字的本調；下一個字是輕聲時看它的字典第一讀音）
  for(let i=0;i<ch.length-1;i++){
    const next = TONE(z[i+1])==='5' ? TONE((D.c[ch[i+1]]||[z[i+1]])[0]) : TONE(z[i+1]);
    if(ch[i]==='一' && !'十'.includes(ch[i+1]) && D.c[ch[i+1]]) { z[i] = next==='4' ? 'ㄧˊ' : 'ㄧˋ'; sure[i]=true; }
    if(ch[i]==='不' && D.c[ch[i+1]]) { z[i] = next==='4' ? 'ㄅㄨˊ' : 'ㄅㄨˋ'; sure[i]=true; }
  }
  axa.forEach(k=>sure[k]=false);
  const ivs=ch.map((c,k)=>{ const L=D.c[c]||[]; const n=L.indexOf(z[k]); return n<0?0:n; });
  const miss=ch.map((c,k)=>!/[一-鿿]/.test(c)?false:(!D.c[c] || (D.c[c].indexOf(z[k])<0)));
  return {h:word, z, ivs, flag: sure.some(x=>!x) || miss.some(Boolean)};
}
function autoChar(c, D){ const L=D.c[c]||['']; return {c, z:L[0], ivs:0, flag:L.length>1||!D.c[c]}; }

// 生字：用提示詞裡的讀音決定多音字（輕聲不算），提示詞在字典裡就不用確認
function charWithHint(c,hint,D){ const o=autoChar(c,D); o.hint=hint||''; if(hint&&hint.includes(c)){ const w=autoWord(hint,D); const z=w.z[[...hint].indexOf(c)]; if(z&&TONE(z)!=='5'&&z!==o.z){ o.z=z; o.ivs=Math.max(0,(D.c[c]||[]).indexOf(z)); } if(!w.flag) o.flag=false; } return o; }
// 生字的提示詞：先用本冊語詞，再用字典例詞（兩個字），都沒有就只唸字
function pickHint(c, bookWords, examples){
  const a=bookWords.filter(w=>w.includes(c)&&w.length<=3); if(a.length) return a.sort((x,y)=>x.length-y.length)[0];
  const b=(examples||[]).filter(w=>w.length===2&&w.includes(c)&&!BLOCK.test(w)); return b[0]||'';
}

// 解析從教育百科「生字詞彙表」網頁全選複製的文字（可一次貼很多課）
const CN={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
function cnum(s){ if(/^\d+$/.test(s)) return +s; if(s.length===1) return CN[s]||0; if(s[0]==='十') return 10+(CN[s[1]]||0); if(s[1]==='十') return CN[s[0]]*10+(CN[s[2]]||0); return 0; }
function parsePedia(text){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); const lessons=[]; let cur=null;
  for(let i=0;i<lines.length;i++){
    const L=lines[i]; const m=L.match(/^(?:生字詞彙表：)?第([一二三四五六七八九十\d]+)課[：:]\s*(.+)$/);
    if(m){ cur={no:cnum(m[1]), title:m[2].replace(/[?？]$/,'？'), chars:[], read:[], words:[], ex:{}}; lessons.push(cur); continue; }
    if(!cur) continue;
    if((L==='生字'||L==='認讀字'||L==='語詞') && lines[i+1] && /^[一-鿿]{1,6}$/.test(lines[i+1])){
      const w=lines[i+1]; const def=lines[i+2]||'';
      if(L==='生字'){ cur.chars.push(w); cur.ex[w]=[...def.matchAll(/「([^」]{2,4})」/g)].map(x=>x[1]).filter(x=>x.includes(w)&&!/[，。？！：、]/.test(x)); }
      else if(L==='認讀字') cur.read.push(w); else cur.words.push(w);
      i++;
    }
  }
  return lessons.filter(l=>l.chars.length||l.words.length);
}
// 把解析結果變成遊戲資料
function buildLessons(parsed, meta, D){
  const bookWords=parsed.flatMap(l=>l.words);
  return parsed.map(l=>({ id:`${meta.year}${meta.term==='上'?'a':'b'}-${meta.book}-${String(l.no).padStart(2,'0')}`, year:meta.year, term:meta.term, book:meta.book, no:l.no, title:l.title,
    src:meta.src||'教育百科 生字詞彙表',
    words:l.words.map(w=>autoWord(w,D)),
    chars:l.chars.map(c=>charWithHint(c,pickHint(c,bookWords,l.ex[c]),D)),
    read:l.read.map(c=>autoChar(c,D)), sents:[] }));
}

// ---------- 句型：解析「語句練習」（大補帖格式或簡單格式），自動切詞塊、找關鍵詞 ----------
const PUNC=/[，。？！、：；「」…—]/;
function parseSents(text){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); const out=[]; let L=null,P=null,kind='句型';
  for(const s of lines){
    let m=s.match(/^第\s*([一二三四五六七八九十\d]+)\s*課\s*[：:]?\s*(.*)$/);
    if(m){ L={no:cnum(m[1]),title:m[2].replace(/\s+/g,''),pats:[]}; out.push(L); P=null; kind='句型'; continue; }
    if(!L) continue;
    if(/短語練習/.test(s)){ kind='短語'; continue; } if(/(造句|短句|句型|句子)練習/.test(s)){ kind='句型'; continue; }
    m=s.match(/^【(短語|句型|句子)】\s*(.+)$/);
    if(m){ const [name,st]=m[2].split(/[｜|]/); P={kind:m[1]==='短語'?'短語':'句型',name:name.trim(),struct:(st||'').trim(),ex:[]}; L.pats.push(P); continue; }
    m=s.match(/^(?:[⒈⒉⒊⒋⒌⒍⒎⒏⒐]|●|\d+[.、．])\s*(.+)$/);
    if(m){ P={kind,name:m[1].replace(/[—－\-]+$/,'').trim(),struct:'',ex:[]}; L.pats.push(P); continue; }
    if(!P) continue;
    m=s.match(/^結構\s*(.+)$/); if(m){ P.struct=m[1].replace(/︵/g,'（').replace(/︶/g,'）').trim(); continue; }
    if(/^(說明|引導)/.test(s)) continue;
    m=s.match(/^(例|原)\s*(.+)$/); if(m){ P.ex.push({t:m[2].trim(),orig:m[1]==='原'}); continue; }
    if(/^[一-鿿，。？！、「」：；…｜|]{2,}$/.test(s) && /[一-鿿]/.test(s)) P.ex.push({t:s,orig:false});
  }
  return out.filter(l=>l.pats.length);
}
// 結構拆成格子：（…）是要填的位置，其他是固定的關鍵詞
function structSlots(st){ return ((st||'').match(/（[^）]*）|[^（）＋+\s]+/g)||[]).map(x=>x.startsWith('（')?{t:x.slice(1,-1),key:false}:{t:x.replace(/[^一-鿿]/g,''),key:true}).filter(x=>x.t); }
const KEYW=['一起','什麼','這是','又','也','在','是','好','的','一'];
function keysOf(p){ const c=new Set(); p.name.split(/……|…/).map(x=>x.replace(/[，。？！、\s]/g,'')).filter((x,i,a)=>a.length>1&&x).forEach(x=>c.add(x));
  structSlots(p.struct).filter(t=>t.key).map(t=>t.t).filter(x=>[...x].length<=2).forEach(x=>c.add(x));
  KEYW.forEach(k=>{ if(p.name.includes(k)) c.add(k); }); const rank=k=>{ const i=KEYW.indexOf(k); return i<0?99:i; }; return [...c].sort((a,b)=>rank(a)-rank(b)||b.length-a.length); }
function segSet(D){ if(!D._seg) D._seg=new Set((D.s||'').split(' ')); return D._seg; }
function chunkText(t,D){ const ch=[...t]; const out=[]; let i=0;
  while(i<ch.length){ if(PUNC.test(ch[i])){ if(out.length) out[out.length-1]+=ch[i]; else out.push(ch[i]); i++; continue; }
    let len=Math.min(4,ch.length-i), hit=1; for(;len>=2;len--){ const w=ch.slice(i,i+len).join(''); if((D.w[w]||segSet(D).has(w))&&!PUNC.test(w)){ hit=len; break; } }
    out.push(ch.slice(i,i+hit).join('')); i+=hit; }
  // 單字太多時把相鄰的單字併起來，最多 6 塊
  while(out.length>6){ let k=out.findIndex((x,j)=>j<out.length-1&&[...x.replace(PUNC,'')].length===1); if(k<0) k=out.length-2; out.splice(k,2,out[k]+out[k+1]); }
  return out; }
function buildSents(pats,D){ return pats.map(p=>{ const keys=keysOf(p); const mk=e=>{ const cut=/[｜|]/.test(e.t)?e.t.split(/[｜|]/).filter(Boolean):null; const t=e.t.replace(/[｜|]/g,''); e={...e,t}; const w=autoWord(e.t,D); const key=keys.find(k=>e.t.includes(k))||''; return {t:e.t,z:w.z,ivs:w.ivs,flag:w.flag,orig:!!e.orig,chunks:cut||chunkText(e.t,D),key}; };
  const o=p.ex.filter(e=>e.orig), x=p.ex.filter(e=>!e.orig);
  return {kind:p.kind,name:p.name,struct:p.struct,keys,orig:o.map(mk),ex:(x.length?x:o).map(mk)}; }); }

// 頁面上一般文字（課名、句型名稱、說明）的多音字與變調：產生 [文字, 第幾個字, 異體字序號]
function rulesFor(texts,D){ const out=[], seen=new Set(); texts.forEach(t=>{ if(!t||seen.has(t)) return; seen.add(t); const w=autoWord(t,D); w.ivs.forEach((n,k)=>{ if(n>0) out.push([t,k,n]); }); }); return out; }
function lessonTexts(L){ return L.flatMap(l=>[l.title].concat((l.sents||[]).flatMap(p=>[p.name].concat(structSlots(p.struct).map(x=>x.t))))); }
const api={rulesFor,lessonTexts,structSlots,autoWord,autoChar,charWithHint,pickHint,parsePedia,buildLessons,TONE,parseSents,buildSents,chunkText,keysOf};
if(typeof module!=='undefined') module.exports=api; else root.ZYAUTO=api;
})(this);
