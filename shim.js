/* La Flèche · version installable : remplace la plateforme claude.ai par Supabase.
   L'appli appelle claude.use("db"|"user"|"mcp"|"downloads") : on fournit les mêmes fonctions. */
(function(){
const C=window.LF_CONFIG;
const sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.LF_SB=sb;
const parentOf=p=>p.split("/").slice(0,-1).join("/"),idOf=p=>p.split("/").pop();
const err=(e,code)=>{const x=new Error(e&&e.message||String(e));x.code=code||(e&&e.code==="42501"?"invalid_argument":"unavailable");return x};

/* ---------- connexion par lien magique ---------- */
let session=null;
const ready=new Promise(async res=>{
  const {data}=await sb.auth.getSession();session=data.session;
  if(session)return res();
  showLogin();
  sb.auth.onAuthStateChange((_e,s)=>{if(s&&!session){session=s;hideLogin();res()}});
});
function showLogin(){
  if(!document.body){document.addEventListener("DOMContentLoaded",showLogin,{once:true});return}
  const d=document.createElement("div");d.id="lfLogin";
  d.innerHTML=`<style>#lfLogin{position:fixed;inset:0;z-index:999;background:radial-gradient(ellipse at 50% 30%,#1b1910,#08080A 70%);display:flex;flex-direction:column;justify-content:center;padding:32px;color:#F5F5F3;font-family:Barlow,sans-serif}
  #lfLogin img{width:220px;margin:0 auto 34px;display:block}#lfLogin h1{font-family:'Barlow Condensed';font-style:italic;font-weight:900;text-transform:uppercase;font-size:46px;line-height:.95;margin:0 0 12px}
  #lfLogin h1 b{color:#FFC107}#lfLogin p{color:#9a9aa0;margin:0 0 22px;line-height:1.5}#lfLogin input{width:100%;padding:14px;background:#141417;border:1px solid #333;color:#fff;font-size:16px;margin-bottom:12px;box-sizing:border-box}
  #lfLogin button{width:100%;padding:15px;background:#FFC107;border:0;color:#000;font-family:'Barlow Condensed';font-style:italic;font-weight:900;font-size:20px;text-transform:uppercase}#lfLogin .m{margin-top:14px;color:#FFC107;min-height:20px}</style>
  <img src="logo_la_fleche.png" alt="La Flèche"><h1>Entre dans<br><b>ton QG.</b></h1>
  <p>ton e-mail, et on t'envoie un lien de connexion. pas de mot de passe.</p>
  <input id="lfMail" type="email" autocomplete="email" placeholder="ton@email.com"><button id="lfGo">recevoir mon lien</button><div class="m" id="lfMsg"></div>`;
  document.body.appendChild(d);
  const go=async()=>{const email=(document.getElementById("lfMail").value||"").trim();const m=document.getElementById("lfMsg");
    if(!/^\S+@\S+\.\S+$/.test(email)){m.textContent="e-mail invalide.";return}
    m.textContent="envoi…";const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
    m.textContent=error?"erreur : "+error.message:"📩 regarde tes mails (et les spams) et clique sur le lien.";};
  document.getElementById("lfGo").onclick=go;document.getElementById("lfMail").onkeydown=e=>{if(e.key==="Enter")go()};
}
function hideLogin(){const d=document.getElementById("lfLogin");if(d)d.remove()}
window.LF_logout=async()=>{await sb.auth.signOut();location.reload()};

/* ---------- base de données (même API que claude.ai) ---------- */
function docRef(path){return{
  async get(){const {data,error}=await sb.from("docs").select("data").eq("path",path).maybeSingle();if(error)throw err(error);return{exists:!!data,id:idOf(path),data:()=>data?data.data:undefined}},
  async set(obj){const {error}=await sb.from("docs").upsert({path,parent:parentOf(path),data:obj,updated_at:new Date().toISOString()});if(error)throw err(error)},
  async update(patch){const {data,error}=await sb.rpc("doc_merge",{p:path,patch});if(error)throw err(error);if(!data)throw err("introuvable","not_found")},
  async delete(){const {error}=await sb.from("docs").delete().eq("path",path);if(error)throw err(error)},
  collection(name){return colRef(path+"/"+name)}}}
function colRef(col){return{
  doc(id){return docRef(col+"/"+id)},
  onSnapshot(cb,onErr){const map=new Map();let stopped=false;
    const emit=()=>{if(stopped)return;cb({docs:[...map.entries()].map(([p,d])=>({id:idOf(p),exists:true,data:()=>d})),metadata:{fromCache:false}})};
    const ch=sb.channel("c:"+col+":"+Math.random().toString(36).slice(2))
      .on("postgres_changes",{event:"*",schema:"public",table:"docs",filter:"parent=eq."+col},pl=>{
        if(pl.eventType==="DELETE"){if(pl.old&&map.delete(pl.old.path))emit();return}
        map.set(pl.new.path,pl.new.data);emit()})
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"docs"},pl=>{if(pl.old&&map.delete(pl.old.path))emit()})
      .subscribe(async st=>{if(st!=="SUBSCRIBED")return;
        const {data,error}=await sb.from("docs").select("path,data").eq("parent",col).limit(5000);
        if(error){onErr&&onErr(err(error));return}map.clear();data.forEach(r=>map.set(r.path,r.data));emit()});
    // filet de sécurité : relecture au retour sur l'appli
    const re=async()=>{if(document.hidden)return;const {data}=await sb.from("docs").select("path,data").eq("parent",col).limit(5000);if(data){map.clear();data.forEach(r=>map.set(r.path,r.data));emit()}};
    document.addEventListener("visibilitychange",re);
    return()=>{stopped=true;sb.removeChannel(ch);document.removeEventListener("visibilitychange",re)}}}}
const db={doc:docRef,collection:colRef};

/* ---------- compte ---------- */
const user={
  async id(){return session.user.id},
  async isOwner(){return (session.user.email||"").toLowerCase()===String(C.ADMIN_EMAIL).toLowerCase()},
  async profiles(ids){const o={};ids.forEach(i=>{if(i===session.user.id)o[i]={name:(session.user.user_metadata&&session.user.user_metadata.name)||(session.user.email||"").split("@")[0]}});return o}};

/* ---------- Strava (via la fonction serveur) ; Google Agenda remplacé par l'agenda intégré ---------- */
const SEEN="lf_strava_seen";
const stravaAuth=()=>{location.href="https://www.strava.com/oauth/authorize?"+new URLSearchParams({client_id:C.STRAVA_CLIENT_ID,response_type:"code",redirect_uri:location.origin+location.pathname,approval_prompt:"auto",scope:"read,activity:read_all",state:"lfstrava"})};
async function fn(body){const {data,error}=await sb.functions.invoke("strava",{body});if(error)throw err(error,"server_unavailable");
  if(data&&data.need_auth){stravaAuth();throw err("redirection vers strava…","redirect")}
  if(data&&data.error){const x=new Error(data.error);x.code=data.code||"tool_error";throw x}return data}
const mcp={async callTool(server,tool,args){
  if(server!=="Strava"||!C.STRAVA_CLIENT_ID)throw err("non connecté","server_not_connected");
  if(tool==="list_activities"){const d=await fn({action:"activities",after:args&&args.range_start});return{payload:{activities:d.activities||[]}}}
  if(tool==="get_athlete_best_efforts"){let seen=[];try{seen=JSON.parse(localStorage.getItem(SEEN)||"[]")}catch(_){}
    const d=await fn({action:"best",seen});
    if(d.left>0)setTimeout(()=>typeof toast==="function"&&toast(`records : encore ${d.left} sorties à analyser, relance la synchro`),2500);else if(d.total)setTimeout(()=>typeof toast==="function"&&toast(`records : ${d.total} sorties analysées ✅`),2500);
    try{localStorage.setItem(SEEN,JSON.stringify([...new Set([...seen,...(d.analysed||[])])].slice(-2000)))}catch(_){}
    const old=(typeof strava!=="undefined"&&strava&&strava.efforts)||[],k=e=>e.best_effort_type+"|"+e.activity_id,m=new Map();
    [...old,...(d.efforts||[])].forEach(e=>m.set(k(e),e));return{payload:{efforts:[...m.values()]}}}
  throw err("outil inconnu","tool_error")}};
// retour de la page d'autorisation Strava
(async()=>{const q=new URLSearchParams(location.search);if(q.get("state")!=="lfstrava")return;await ready;
  history.replaceState(null,"",location.pathname+"#course");
  if(q.get("error")||!q.get("code")){setTimeout(()=>typeof toast==="function"&&toast("connexion strava annulée"),1500);return}
  try{await fn({action:"exchange",code:q.get("code")});setTimeout(()=>{try{go("course");syncStrava()}catch(_){}},2500)}
  catch(e){setTimeout(()=>typeof toast==="function"&&toast("strava : "+e.message),1500)}})();
window.LF_ical=async url=>{const {data,error}=await sb.functions.invoke("ical",{body:{url}});if(error)throw new Error("serveur indisponible");if(data.error)throw new Error(data.error);return data.ics};
window.LF_strava_disconnect=async()=>{await fn({action:"disconnect"});localStorage.removeItem(SEEN)};

window.claude={use:async name=>{await ready;
  if(name==="db")return db;if(name==="user")return user;if(name==="mcp")return mcp;
  return null; // downloads : l'appli bascule sur le partage du téléphone
}};

/* ---------- installable + hors ligne ---------- */
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
