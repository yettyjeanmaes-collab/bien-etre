// Tulipe hors de claude.ai : remplace window.claude par Supabase (données), le compte du foyer (utilisateur)
// et la dictée du téléphone (gratuite). L'assistant IA reste désactivé (aucun coût).
(function(){
  const URL_ = "https://tjdvycbzynsioeoffkii.supabase.co";
  const KEY  = "sb_publishable_3DCh7ayO0oNUJ2EPu4BDLQ_5jGTCftl";
  const DEMO = new URLSearchParams(location.search).has("demo");
  let sbP = null;
  function sb(){ return sbP || (sbP = import("https://esm.sh/@supabase/supabase-js@2").then(m=>m.createClient(URL_, KEY, {auth:{persistSession:true,autoRefreshToken:true}}))); }

  // ---------- connexion (même compte que Tulipe Sport)
  let sessP = null;
  function session(){
    if(sessP) return sessP;
    return sessP = (async()=>{
      if(DEMO) return null;
      const c = await sb();
      const { data } = await c.auth.getSession();
      if(data.session) return data.session;
      return await loginForm(c);
    })();
  }
  function loginForm(c){
    return new Promise(res=>{
      const d = document.createElement("div");
      d.style.cssText="position:fixed;inset:0;z-index:99;background:linear-gradient(160deg,#E23D5B,#FF7A59);display:grid;place-items:center;padding:20px;font-family:'Plus Jakarta Sans',system-ui,sans-serif";
      d.innerHTML = `<form style="background:#fff;border-radius:24px;padding:24px;width:100%;max-width:360px;box-shadow:0 10px 30px rgba(0,0,0,.2)">
        <div style="font-size:40px;text-align:center">🌷</div>
        <h2 style="font-family:Fraunces,Georgia,serif;text-align:center;margin:4px 0 16px;color:#2A1F24">Tulipe</h2>
        <input name="e" type="email" autocomplete="username" placeholder="E-mail" required style="width:100%;padding:12px;border:1.5px solid #F3E3DD;border-radius:12px;font:inherit;margin-bottom:10px;box-sizing:border-box">
        <input name="p" type="password" autocomplete="current-password" placeholder="Mot de passe" required style="width:100%;padding:12px;border:1.5px solid #F3E3DD;border-radius:12px;font:inherit;margin-bottom:14px;box-sizing:border-box">
        <button style="width:100%;border:0;border-radius:14px;padding:13px;font:inherit;font-weight:700;color:#fff;background:linear-gradient(135deg,#E23D5B,#FF7A59)">Se connecter</button>
        <p class="m" style="color:#B3122E;font-size:13px;text-align:center;min-height:1em;margin:10px 0 0"></p>
        <p style="font-size:12px;text-align:center;color:#857579;margin:6px 0 0">Même e-mail et mot de passe que Tulipe Sport</p></form>`;
      document.body.appendChild(d);
      d.querySelector("form").onsubmit = async ev=>{
        ev.preventDefault(); const f=ev.target; f.querySelector(".m").textContent="Connexion…";
        const { data, error } = await c.auth.signInWithPassword({ email:f.e.value.trim(), password:f.p.value });
        if(error){ f.querySelector(".m").textContent="E-mail ou mot de passe incorrect"; return; }
        d.remove(); res(data.session);
      };
    });
  }

  // ---------- base de données (même logique que celle de claude.ai)
  const T = "tulipe_docs";
  const parent = p => p.split("/").slice(0,-1).join("/");
  const last = p => p.split("/").pop();
  const listeners = []; // {kind:"doc"|"coll", key, cb, err}
  let channel = null;

  async function fetchDoc(c, path){
    const { data, error } = await c.from(T).select("data").eq("path", path).maybeSingle();
    if(error) throw error;
    return { exists: !!data, data: ()=> data ? data.data : undefined, metadata:{fromCache:false} };
  }
  async function fetchColl(c, coll){
    const { data, error } = await c.from(T).select("path,data").eq("coll", coll);
    if(error) throw error;
    return { docs:(data||[]).map(r=>({ id:last(r.path), data:()=>r.data })), metadata:{fromCache:false} };
  }
  async function run(c, L){
    try{ L.cb(L.kind==="doc" ? await fetchDoc(c,L.key) : await fetchColl(c,L.key)); }
    catch(e){ if(L.err) L.err(e); }
  }
  function ensureChannel(c){
    if(channel) return;
    channel = c.channel("tulipe").on("postgres_changes",{event:"*",schema:"public",table:T}, p=>{
      const path = (p.new && p.new.path) || (p.old && p.old.path); if(!path) return;
      listeners.forEach(L=>{ if((L.kind==="doc" && L.key===path) || (L.kind==="coll" && L.key===parent(path))) run(c,L); });
    }).subscribe();
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) listeners.forEach(L=>run(c,L)); });
  }
  function listen(kind, key, cb, err){
    const L = {kind,key,cb,err}; listeners.push(L);
    sb().then(c=>{ ensureChannel(c); run(c,L); });
    return ()=>{ const i=listeners.indexOf(L); if(i>=0) listeners.splice(i,1); };
  }
  function wrapErr(e){ const x=new Error(e&&e.message||"erreur"); x.code="unavailable"; return x; }
  const DBshim = {
    doc(path){ return {
      async set(data){ const c=await sb(); const { error } = await c.from(T).upsert({ path, coll:parent(path), data, updated_at:new Date().toISOString() }); if(error) throw wrapErr(error); },
      async delete(){ const c=await sb(); const { error } = await c.from(T).delete().eq("path", path); if(error) throw wrapErr(error); },
      onSnapshot(cb, err){ return listen("doc", path, cb, err); }
    }; },
    collection(coll){ return { onSnapshot(cb, err){ return listen("coll", coll, cb, err); } }; }
  };

  // ---------- dictée (reconnaissance vocale du téléphone, gratuite)
  function dictation(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) throw new Error("indisponible");
    const h = {final:[],partial:[],state:[]}; let r = null;
    const emit = (k,v)=>h[k].forEach(f=>{ try{f(v)}catch(e){} });
    return {
      onFinal(f){h.final.push(f)}, onPartial(f){h.partial.push(f)}, onState(f){h.state.push(f)},
      start(o){
        r = new SR(); r.lang = "fr-BE"; r.continuous = true; r.interimResults = true;
        r.onstart = ()=>emit("state",{state:"listening"});
        r.onresult = ev=>{ let part=""; for(let i=ev.resultIndex;i<ev.results.length;i++){ const t=ev.results[i][0].transcript; if(ev.results[i].isFinal) emit("final",{text:" "+t.trim()}); else part+=t; } emit("partial",{text:part}); };
        r.onerror = ev=>emit("state",{state:"idle",reason:ev.error==="not-allowed"?"denied":"error"});
        r.onend = ()=>emit("state",{state:"idle"});
        r.start();
      },
      stop(){ if(r) r.stop(); }
    };
  }

  window.claude = { async use(name){
    if(name==="db"){ if(!(await session())) throw new Error("hors ligne"); return DBshim; }
    if(name==="user"){ const s=await session(); if(!s) throw new Error("hors ligne"); return { id: async()=>s.user.id }; }
    if(name==="dictation") return dictation();
    throw new Error("non disponible"); // "sample" : assistant IA désactivé
  }};

  if("serviceWorker" in navigator) addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
