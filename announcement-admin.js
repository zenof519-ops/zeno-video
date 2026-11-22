const SUPABASE_URL = "https://pvzucwayxudnnmskkodk.supabase.co";
const SUPABASE_KEY = "sb_publishable_v8D1gyzp2peCtsYj7Zxh8w_PdSAiajV";
const ADMIN_ID = "6683090f-57d1-4d9b-b358-6107e909c40f";
const CLOUD_NAME = "wnonuvx4";
const BUNNY_LIBRARY_ID = "811150";
const CLOUDINARY_VIDEO_UPLOAD_PRESET = "zeno_video_upload";
const CLOUDINARY_IMAGE_UPLOAD_PRESET = "zeno_cover_upload";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const form = document.getElementById("announcement-form");
const message = document.getElementById("form-message");
const list = document.getElementById("announcement-list");
const mediaType = document.getElementById("media-type");
const videoFields = document.getElementById("video-fields");
const providerSelect = document.getElementById("video-provider");
const coverInput = document.getElementById("cover-file");
const coverProviderSelect = document.getElementById("cover-provider");
const coverPreview = document.getElementById("cover-preview");
const cloudinaryFile = document.getElementById("cloudinary-file");
const cloudinarySource = document.getElementById("cloudinary-source");
const muxFile = document.getElementById("mux-file");
const muxStatus = document.getElementById("mux-status");
const viooSource = document.getElementById("vioo-source");
const dropboxSource = document.getElementById("dropbox-source");
const oneDriveSource = document.getElementById("onedrive-source");
const oneDriveHelperMessage = document.getElementById("onedrive-helper-message");
const oneDriveChatGPTButton = document.getElementById("onedrive-chatgpt-button");
const deepStorageFile = document.getElementById("deepstorage-file");
const deepStorageSource = document.getElementById("deepstorage-source");
const deepStorageStatusElement = document.getElementById("deepstorage-status");
const bunnySource = document.getElementById("bunny-source");
const bunnyDownloadSource = document.getElementById("bunny-download-source");
const saveButton = document.getElementById("save-button");

let announcements = [];
let editingId = null;
let editingItem = null;
let currentCover = null;
let coverObjectUrl = null;
let deepStorageStatus = {checked:false,available:false,message:"Vérification de l’accès API DeepStorage…"};

function show(element,text){if(element)element.textContent=text;}
function showMessage(element,text){show(element,text);}
function updateMediaFields(){
  const isVideo=mediaType.value==="video";
  videoFields.classList.toggle("admin-hidden",!isVideo);
  if(isVideo)updateProviderFields();
}
function updateProviderFields(){
  const provider=providerSelect.value;
  for(const name of ["cloudinary","mux","vioo","dropbox","onedrive","deepstorage","bunny"]){
    document.getElementById(name+"-fields").classList.toggle("admin-hidden",provider!==name);
  }
  deepStorageFile.disabled=provider!=="deepstorage"||!deepStorageStatus.available;
  muxFile.disabled=provider!=="mux"||Boolean(editingId);
  cloudinaryFile.disabled=provider!=="cloudinary";
  bunnySource.disabled=provider!=="bunny";
  bunnyDownloadSource.disabled=provider!=="bunny";
  if(provider==="deepstorage")checkDeepStorageAvailability(false);
}
mediaType.addEventListener("change",updateMediaFields);
providerSelect.addEventListener("change",updateProviderFields);

coverInput.addEventListener("change",()=>{
  const file=coverInput.files[0];
  if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);
  coverObjectUrl=null;
  if(!file){
    if(currentCover){coverPreview.src=currentCover;coverPreview.classList.remove("admin-hidden");}
    else coverPreview.classList.add("admin-hidden");
    return;
  }
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    coverInput.value="";
    show(message,"Choisis une image PNG, JPG ou WebP.");
    return;
  }
  if(coverProviderSelect.value==="imagekit"&&file.size>25*1024*1024){
    coverInput.value="";
    show(message,"ImageKit Free accepte les images jusqu’à 25 Mo. Choisis une image plus légère ou Cloudinary.");
    return;
  }
  coverObjectUrl=URL.createObjectURL(file);
  coverPreview.src=coverObjectUrl;
  coverPreview.classList.remove("admin-hidden");
});

function normalizeViooEmbedUrl(value){
  const raw=String(value||"").trim();
  if(/^[A-Za-z0-9_-]+$/.test(raw))return "https://vioo.cc/embed/"+raw;
  const iframeSource=raw.match(/src\s*=\s*["']([^"']+)["']/i);
  const candidate=iframeSource?iframeSource[1]:raw;
  let url;
  try{url=new URL(candidate);}catch{throw new Error("Indique un identifiant Vioo ou une URL de lecteur Vioo valide.");}
  if(url.protocol!=="https:"||!["vioo.cc","www.vioo.cc"].includes(url.hostname))throw new Error("Le lecteur doit provenir de https://vioo.cc.");
  const match=url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)\/?$/);
  if(!match)throw new Error("Utilise le lien du lecteur Vioo au format https://vioo.cc/embed/IDENTIFIANT.");
  return "https://vioo.cc/embed/"+match[1];
}
function normalizeDropboxUrl(value){
  let url;
  try{url=new URL(String(value||"").trim());}catch{throw new Error("Colle un lien de partage Dropbox valide.");}
  if(url.protocol!=="https:"||!["dropbox.com","www.dropbox.com"].includes(url.hostname))throw new Error("Le lien doit provenir de https://www.dropbox.com.");
  if(!/^\/(scl\/fi|s)\//.test(url.pathname))throw new Error("Utilise un lien de partage Dropbox vers un fichier, pas un dossier.");
  url.searchParams.delete("dl");url.searchParams.set("raw","1");
  return url.toString();
}
function normalizeOneDriveEmbedUrl(value){
  const raw=String(value||"").trim();
  const iframeSource=raw.match(/src\s*=\s*["']([^"']+)["']/i);
  const candidate=iframeSource?iframeSource[1]:raw;
  let url;
  try{url=new URL(candidate);}catch{throw new Error("Colle un lien de lecteur OneDrive valide.");}
  const allowed=["1drv.ms","onedrive.live.com","www.onedrive.com"].includes(url.hostname);
  if(url.protocol!=="https:"||!allowed||!url.pathname.startsWith("/"))throw new Error("Le lien doit provenir de OneDrive.");
  return url.toString();
}
function isOneDriveEmbedUrl(value){
  try{
    const url=new URL(String(value||"").trim());
    if(url.protocol!=="https:")return false;
    if(["onedrive.live.com","www.onedrive.com"].includes(url.hostname))return url.pathname.toLowerCase().includes("/embed")||url.searchParams.has("embed");
    if(url.hostname==="1drv.ms")return /^\/v\/c\/[^/]+\/[^/]+\/?$/i.test(url.pathname)&&!url.search&&!url.hash;
    return false;
  }catch{return false;}
}
function refreshOneDriveHelper(){
  const value=oneDriveSource.value.trim();
  const isEmbed=Boolean(value)&&isOneDriveEmbedUrl(value);
  document.getElementById("onedrive-helper").classList.remove("admin-hidden");
  oneDriveChatGPTButton.classList.toggle("admin-hidden",isEmbed);
  if(!value)oneDriveHelperMessage.textContent="Colle ton lien de partage OneDrive ici. Si ce n’est pas encore un lien Embed, le bouton peut t’aider à le convertir.";
  else if(isEmbed)oneDriveHelperMessage.textContent="✓ Un lien d’intégration OneDrive semble détecté. Tu peux l’enregistrer.";
  else oneDriveHelperMessage.textContent="⚠ Ce lien semble être un lien de partage classique. Convertis-le en véritable lien Embed avant de publier.";
}
oneDriveSource.addEventListener("input",refreshOneDriveHelper);
oneDriveChatGPTButton.addEventListener("click",async()=>{
  const sharedUrl=oneDriveSource.value.trim();
  if(!sharedUrl){oneDriveHelperMessage.textContent="Colle d’abord ton lien OneDrive.";oneDriveSource.focus();return;}
  const prompt="Aide-moi à convertir ce lien de partage OneDrive en véritable URL d’intégration vidéo (iframe) compatible avec mon site Zeno Video. Vérifie le type de lien et récupère le véritable lien Embed si possible. Ne modifie aucune autorisation. Voici le lien : "+sharedUrl;
  try{await navigator.clipboard.writeText(prompt);oneDriveHelperMessage.textContent="✓ Demande copiée. Ouverture de ChatGPT : colle le texte dans la conversation.";}
  catch{oneDriveHelperMessage.textContent="ChatGPT va s’ouvrir. Copie le lien OneDrive et colle-le dans la conversation.";}
  window.open("https://chatgpt.com/","_blank","noopener,noreferrer");
});

async function ensureAdminSession(){
  let {data,error}=await db.auth.getSession();
  if(error)throw new Error("Vérification de la session impossible : "+error.message);
  let session=data?.session;
  if(!session?.access_token)throw new Error("Ta session administrateur n’est plus active. Reconnecte-toi : les champs de l’annonce sont conservés.");
  if(session.user?.id!==ADMIN_ID)throw new Error("La session actuelle n’a pas les droits administrateur. Reconnecte-toi avec le compte Zeno Video.");
  const expiresAt=Number(session.expires_at||0);
  if(expiresAt&&expiresAt<=Math.floor(Date.now()/1000)+90){
    const refreshed=await db.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session){
      throw new Error("La session administrateur a expiré et n’a pas pu être renouvelée. Reconnecte-toi : les champs de l’annonce sont conservés.");
    }
    session=refreshed.data.session;
    if(session.user?.id!==ADMIN_ID)throw new Error("La session renouvelée n’a pas les droits administrateur. Reconnecte-toi avec le compte Zeno Video.");
  }
  return session;
}

async function uploadCover(file){
  const data=new FormData();data.append("file",file);data.append("upload_preset",CLOUDINARY_IMAGE_UPLOAD_PRESET);
  let response;
  try{
    response=await fetch("https://api.cloudinary.com/v1_1/"+CLOUD_NAME+"/image/upload",{method:"POST",body:data});
  }catch(error){
    throw new Error("Connexion interrompue pendant l’envoi vers Cloudinary. Vérifie la connexion puis réessaie : les champs de l’annonce sont conservés.");
  }
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.secure_url)throw new Error(result.error?.message||"Échec de l’envoi de la couverture sur Cloudinary.");
  return result;
}

async function uploadToImageKit(file){
  const {data:auth,error:authError}=await db.functions.invoke("imagekit-upload-auth",{body:{}});
  if(authError){
    let details=authError.message||"Impossible d’obtenir l’autorisation ImageKit.";
    try{if(authError.context&&typeof authError.context.json==="function"){const payload=await authError.context.json();details=payload.error||payload.message||details;}}catch{}
    throw new Error(details);
  }
  if(!auth?.token||!auth?.signature||!auth?.expire||!auth?.publicKey)throw new Error("Supabase n’a pas fourni les paramètres sécurisés d’envoi ImageKit.");
  const data=new FormData();
  data.append("file",file,file.name);data.append("fileName",file.name);data.append("publicKey",auth.publicKey);
  data.append("token",auth.token);data.append("expire",String(auth.expire));data.append("signature",auth.signature);
  data.append("folder","/zeno-covers");data.append("useUniqueFileName","true");data.append("isPrivateFile","false");
  return await new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("POST","https://upload.imagekit.io/api/v1/files/upload");xhr.timeout=300000;
    xhr.upload.addEventListener("progress",event=>{
      const percent=event.lengthComputable?Math.round(event.loaded/event.total*100):null;
      show(message,percent===null?"Envoi de l’image vers ImageKit…":"Envoi de l’image vers ImageKit : "+percent+"%");
    });
    xhr.addEventListener("load",()=>{
      let uploaded;try{uploaded=JSON.parse(xhr.responseText||"{}");}catch{reject(new Error("Réponse illisible d’ImageKit (HTTP "+xhr.status+")."));return;}
      if(xhr.status<200||xhr.status>=300){reject(new Error(uploaded.message||uploaded.help||"ImageKit a refusé l’image (HTTP "+xhr.status+")."));return;}
      if(!uploaded.url||!uploaded.fileId){reject(new Error("ImageKit n’a pas renvoyé l’URL publique attendue."));return;}
      resolve(uploaded);
    });
    xhr.addEventListener("error",()=>reject(new Error("Connexion interrompue pendant l’envoi vers ImageKit.")));
    xhr.addEventListener("timeout",()=>reject(new Error("L’envoi ImageKit a dépassé 5 minutes.")));
    xhr.addEventListener("abort",()=>reject(new Error("Envoi ImageKit annulé.")));
    xhr.send(data);
  });
}

function showDeepStorageStatus(){
  deepStorageStatusElement.textContent=deepStorageStatus.message;
  deepStorageStatusElement.className="admin-message "+(deepStorageStatus.available?"success":deepStorageStatus.checked?"error":"status-pending");
}
async function invokeDeepStorage(payload){
  const {data,error}=await db.functions.invoke("deepstorage-upload",{body:payload});
  if(error){
    let details=error.message||"La fonction DeepStorage a échoué.";
    try{if(error.context&&typeof error.context.json==="function"){const response=await error.context.json();details=response.error||response.message||details;}}catch{}
    throw new Error(details);
  }
  if(data?.error)throw new Error(data.error);
  return data;
}
async function checkDeepStorageAvailability(force=false){
  if(!force&&deepStorageStatus.checked)return deepStorageStatus.available;
  deepStorageStatus={checked:false,available:false,message:"Vérification de l’accès API DeepStorage…"};showDeepStorageStatus();
  try{
    const data=await invokeDeepStorage({action:"status"});
    deepStorageStatus=data?.available
      ?{checked:true,available:true,message:"✓ DeepStorage API disponible ("+(data.plan||"offre payante")+"). Tu peux envoyer une vidéo."}
      :{checked:true,available:false,message:data?.message||"DeepStorage API indisponible. Choisis un autre hébergeur."};
  }catch(error){deepStorageStatus={checked:true,available:false,message:(error.message||"Vérification impossible.")+" Choisis un autre hébergeur si l’accès API n’est pas actif."};}
  showDeepStorageStatus();deepStorageFile.disabled=providerSelect.value!=="deepstorage"||!deepStorageStatus.available;
  return deepStorageStatus.available;
}
async function sendDeepStorageBinary(action,params,blob){
  const {data:sessionData,error:sessionError}=await db.auth.getSession();
  const session=sessionData?.session;
  if(sessionError||!session?.access_token)throw new Error("Ta session administrateur a expiré. Reconnecte-toi avant de relancer l’envoi.");
  const query=new URLSearchParams({action,...params});
  const response=await fetch(SUPABASE_URL+"/functions/v1/deepstorage-upload?"+query.toString(),{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token,apikey:SUPABASE_KEY,"Content-Type":blob.type||"application/octet-stream"},body:blob
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const failure=new Error(data.error||"DeepStorage a refusé le transfert (HTTP "+response.status+").");
    failure.code=data.code||"deepstorage_error";failure.retryAfter=data.retry_after;throw failure;
  }
  return data;
}
async function uploadToDeepStorage(file){
  const started=await invokeDeepStorage({action:"start",filename:file.name,size:file.size,content_type:file.type||"application/octet-stream"});
  if(started.mode==="one_shot"){show(message,"Envoi de la vidéo vers DeepStorage…");return await sendDeepStorageBinary("single",{filename:file.name},file);}
  if(!started.session_id||!started.chunk_size)throw new Error("DeepStorage n’a pas fourni les informations nécessaires au transfert reprenable.");
  const sessionId=started.session_id,chunkSize=Number(started.chunk_size);let offset=Number(started.next_offset||0),chunkNumber=0;
  try{
    while(offset<file.size){
      await waitForOnlineConnection();const end=Math.min(offset+chunkSize,file.size),chunk=file.slice(offset,end);let sent=false,lastError=null;
      for(let attempt=1;attempt<=5&&!sent;attempt++){
        try{
          show(message,"Envoi DeepStorage : "+Math.round(offset/file.size*100)+"% · morceau "+(chunkNumber+1)+" · tentative "+attempt+"/5");
          const result=await sendDeepStorageBinary("chunk",{session_id:sessionId,offset:String(offset)},chunk);
          offset=Number(result.next_offset??end);sent=true;chunkNumber++;
        }catch(error){
          lastError=error;
          if(["premium_required","invalid_api_key","upload_scope_missing"].includes(error.code)||/indisponible|Pro|clé API|administrateur/i.test(error.message))throw error;
          if(error.code==="bad_offset"){const resumed=await invokeDeepStorage({action:"resume",session_id:sessionId});offset=Number(resumed.next_offset||0);sent=true;break;}
          if(attempt===5)break;
          await wait(error.retryAfter?Number(error.retryAfter)*1000:Math.min(1000*(2**(attempt-1)),8000));
        }
      }
      if(!sent)throw new Error("Le morceau n’a pas pu être envoyé après plusieurs tentatives. "+(lastError?.message||""));
    }
    show(message,"Finalisation du fichier sur DeepStorage…");
    const finished=await invokeDeepStorage({action:"finish",session_id:sessionId});
    if(!finished?.link)throw new Error("DeepStorage n’a pas renvoyé le lien de lecture final.");
    return finished;
  }catch(error){try{await invokeDeepStorage({action:"abort",session_id:sessionId});}catch{}throw error;}
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function waitForOnlineConnection() {
  if (navigator.onLine) return Promise.resolve();
  showMessage(message, "Connexion coupée : le transfert attend le retour du réseau…");
  return new Promise(resolve => {
    window.addEventListener("online", resolve, { once: true });
  });
}

function uploadChunkToCloudinary(file, start, end, uploadId, chunkNumber, chunkCount) {
  const chunk = file.slice(start, end + 1);
  const uploadData = new FormData();
  uploadData.append("file", chunk, file.name);
  uploadData.append("upload_preset", CLOUDINARY_VIDEO_UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
    xhr.timeout = 900000;
    xhr.setRequestHeader("X-Unique-Upload-Id", uploadId);
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        const totalSent = start + event.loaded;
        const percent = Math.min(100, Math.round((totalSent / file.size) * 100));
        showMessage(message, `Envoi Cloudinary par morceaux : ${percent}% · morceau ${chunkNumber}/${chunkCount}`);
      }
    });

    xhr.addEventListener("load", () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("Réponse illisible de Cloudinary (HTTP " + xhr.status + ")."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(result.error?.message || "Cloudinary a refusé le morceau (HTTP " + xhr.status + ").");
        error.status = xhr.status;
        reject(error);
        return;
      }
      resolve(result);
    });

    xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant le transfert du morceau.")));
    xhr.addEventListener("timeout", () => reject(new Error("Le transfert de ce morceau a dépassé 15 minutes.")));
    xhr.addEventListener("abort", () => reject(new Error("Envoi du morceau annulé.")));
    xhr.send(uploadData);
  });
}

async function uploadVideoInChunks(file) {
  const chunkSize = 6 * 1024 * 1024;
  const chunkCount = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID
    ? crypto.randomUUID()
    : "zeno-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  let finalResponse = null;

  for (let index = 0; index < chunkCount; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size) - 1;
    let lastError = null;
    let uploadedChunk = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        showMessage(
          message,
          `Envoi Cloudinary : morceau ${index + 1}/${chunkCount} · tentative ${attempt}/5`
        );
        uploadedChunk = await uploadChunkToCloudinary(
          file, start, end, uploadId, index + 1, chunkCount
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retryable = !error.status || error.status === 420 || error.status >= 500;
        if (!retryable || attempt === 5) break;
        showMessage(
          message,
          `Connexion instable : nouvelle tentative du morceau ${index + 1}/${chunkCount}…`
        );
        if (!navigator.onLine) {
          await waitForOnlineConnection();
        } else {
          await wait(Math.min(1500 * (2 ** (attempt - 1)), 15000));
        }
      }
    }

    if (lastError) {
      throw new Error(
        `Le morceau ${index + 1}/${chunkCount} n'a pas pu être envoyé après 5 tentatives. ` +
        `Vérifie ta connexion puis relance l'envoi. Détail : ${lastError.message}`
      );
    }

    if (index === chunkCount - 1) {
      finalResponse = uploadedChunk;
    }
  }

  if (!finalResponse?.secure_url || !finalResponse?.public_id) {
    throw new Error("Cloudinary n'a pas confirmé la fin de l'envoi complet. Aucune vidéo ne sera enregistrée dans Supabase.");
  }

  return finalResponse;
}

async function uploadToCloudinary(file, resourceType, progressMessage) {
  if (resourceType === "video" && file.size > 6 * 1024 * 1024) {
    return await uploadVideoInChunks(file);
  }

  const uploadData = new FormData();
  if (resourceType === "image") {
    const pngBlob = await convertJpegToPng(file);
    uploadData.append("file", pngBlob, "zeno-cover.png");
    showMessage(message, "Couverture convertie en PNG. Envoi vers Cloudinary...");
  } else {
    uploadData.append("file", file, file.name);
  }
  uploadData.append(
    "upload_preset",
    resourceType === "image" ? CLOUDINARY_IMAGE_UPLOAD_PRESET : CLOUDINARY_VIDEO_UPLOAD_PRESET
  );

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const label = resourceType === "video" ? "vidéo" : "couverture PNG";
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);
    xhr.timeout = 900000;

    xhr.upload.addEventListener("progress", event => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        showMessage(message, `Envoi de la ${label} vers Cloudinary : ${percent}%`);
      } else {
        showMessage(message, `Envoi de la ${label} vers Cloudinary en cours…`);
      }
    });

    xhr.addEventListener("load", () => {
      let uploaded;
      try {
        uploaded = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new Error("Réponse illisible de Cloudinary (HTTP " + xhr.status + ")."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(uploaded.error?.message || "Cloudinary a refusé le fichier (HTTP " + xhr.status + ")."));
        return;
      }
      if (!uploaded.secure_url || !uploaded.public_id) {
        reject(new Error("Cloudinary n'a pas renvoyé l'URL sécurisée attendue."));
        return;
      }
      resolve(uploaded);
    });

    xhr.addEventListener("error", () => reject(new Error("Connexion interrompue pendant l'envoi vers Cloudinary.")));
    xhr.addEventListener("timeout", () => reject(new Error("L'envoi vers Cloudinary a dépassé 15 minutes.")));
    xhr.addEventListener("abort", () => reject(new Error("Envoi vers Cloudinary annulé.")));
    xhr.send(uploadData);
  });
}


function uploadToMux(file, uploadUrl) {
  return new Promise((resolve, reject) => {
    const upChunkLibrary = window.UpChunk;
    if (!upChunkLibrary?.createUpload) {
      reject(new Error("Le module d'envoi Mux n'a pas pu se charger. Recharge la page puis réessaie."));
      return;
    }

    const upload = upChunkLibrary.createUpload({
      endpoint: uploadUrl,
      file,
      chunkSize: 5120,
      attempts: 5,
      dynamicChunkSize: true,
      minChunkSize: 256,
      maxChunkSize: 20480
    });

    upload.on("progress", event => {
      const percent = Math.round(Number(event.detail) || 0);
      showMessage(message, "Envoi reprenable vers Mux : " + percent + "%");
    });
    upload.on("offline", () => showMessage(message, "Connexion interrompue : Mux met l'envoi en pause et le reprendra automatiquement."));
    upload.on("online", () => showMessage(message, "Connexion rétablie : reprise de l'envoi vers Mux…"));
    upload.on("error", event => {
      reject(new Error(event.detail?.message || "Le transfert vers Mux a échoué après plusieurs tentatives."));
    });
    upload.on("success", resolve);
  });
}


async function compressVideoTo480p(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !AudioContextClass) {
    throw new Error("La compression 480p n'est pas prise en charge par ce navigateur. Choisis « Qualité originale » pour continuer.");
  }

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(file);
  video.preload = "auto";
  video.playsInline = true;
  video.src = sourceUrl;
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "0";
  video.style.width = "2px";
  video.style.height = "2px";
  document.body.appendChild(video);

  let audioContext = null;
  let canvasStream = null;
  let recorder = null;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Impossible de lire cette vidéo pour la compression.")), { once: true });
      video.load();
    });

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight) {
      throw new Error("Les dimensions de la vidéo n'ont pas pu être lues.");
    }

    const longestSide = Math.max(originalWidth, originalHeight);
    if (longestSide <= 854) {
      showMessage(message, "Cette vidéo est déjà en 480p ou moins. Envoi du fichier original…");
      return file;
    }

    const ratio = 854 / longestSide;
    const width = Math.max(2, Math.floor((originalWidth * ratio) / 2) * 2);
    const height = Math.max(2, Math.floor((originalHeight * ratio) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Le traitement vidéo n'est pas disponible sur ce téléphone.");

    audioContext = new AudioContextClass();
    const audioSource = audioContext.createMediaElementSource(video);
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);
    await audioContext.resume();

    canvasStream = canvas.captureStream(24);
    audioDestination.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

    const mimeCandidates = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm"
    ];
    const mimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("Ce navigateur ne propose pas de format vidéo compatible pour la compression 480p.");

    const chunks = [];
    recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 700000,
      audioBitsPerSecond: 96000
    });

    const recordingFinished = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", event => reject(event.error || new Error("Erreur pendant la compression vidéo.")), { once: true });
      recorder.addEventListener("stop", resolve, { once: true });
    });

    let animationFrame = 0;
    const drawFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, 0, 0, width, height);
      }
      if (!video.ended && !video.paused) {
        animationFrame = requestAnimationFrame(drawFrame);
      }
    };

    video.addEventListener("timeupdate", () => {
      if (video.duration) {
        const percent = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        showMessage(message, `Compression locale en 480p : ${percent}% · ${width}×${height}`);
      }
    });

    video.addEventListener("ended", () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }, { once: true });

    await video.play();
    recorder.start(1000);
    drawFrame();
    await recordingFinished;
    cancelAnimationFrame(animationFrame);

    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    if (!blob.size) throw new Error("La compression n'a produit aucun fichier.");
    const outputName = file.name.replace(/\.[^.]+$/, "") + "-480p.webm";
    const compressedFile = new File([blob], outputName, { type: blob.type || "video/webm", lastModified: Date.now() });

    showMessage(
      message,
      `Compression terminée : ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}. Préparation de l'envoi…`
    );
    return compressedFile;
  } catch (error) {
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
    throw error;
  } finally {
    if (canvasStream) canvasStream.getTracks().forEach(track => track.stop());
    if (audioContext) {
      try { await audioContext.close(); } catch {}
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(sourceUrl);
  }
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "taille inconnue";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
}


function normalizeCloudinarySource(value){
  const raw=String(value||"").trim();
  if(!raw)throw new Error("Choisis un fichier vidéo ou indique son identifiant public Cloudinary.");
  if(/^https:\/\//i.test(raw)){const url=new URL(raw);if(url.protocol!=="https:"||url.hostname!=="res.cloudinary.com")throw new Error("L’URL doit provenir de Cloudinary.");return raw;}
  if(!/^[A-Za-z0-9_\/-]+$/.test(raw))throw new Error("Identifiant public Cloudinary invalide.");
  return raw;
}
function normalizeHttpsSource(value,label){
  let url;try{url=new URL(String(value||"").trim());}catch{throw new Error("Indique une URL HTTPS valide pour "+label+".");}
  if(url.protocol!=="https:")throw new Error("L’URL de "+label+" doit commencer par https://.");
  return url.toString();
}

function resetForm(){
  form.reset();editingId=null;editingItem=null;currentCover=null;
  if(coverObjectUrl)URL.revokeObjectURL(coverObjectUrl);coverObjectUrl=null;
  coverPreview.removeAttribute("src");coverPreview.classList.add("admin-hidden");
  saveButton.textContent="Publier l’annonce";document.getElementById("cancel-button").classList.add("admin-hidden");
  muxStatus.textContent="Envoi direct depuis ton téléphone vers Mux, avec reprise automatique si la connexion est interrompue. Limite de ce formulaire : 1 Go.";
  updateMediaFields();show(message,"");
}
document.getElementById("cancel-button").addEventListener("click",resetForm);

async function loadAnnouncements(){
  const {data,error}=await db.from("video_announcements").select("*").order("created_at",{ascending:false});
  if(error){show(message,"Chargement impossible : "+error.message);return;}
  announcements=data||[];document.getElementById("count").textContent=announcements.length+" annonce(s)";list.replaceChildren();
  if(!announcements.length){list.textContent="Aucune annonce pour le moment.";return;}
  const {data:linked,error:linkedError}=await db.from("videos").select("announcement_id,mux_status").not("announcement_id","is",null);
  if(linkedError){show(message,"Vérification des vidéos associées impossible : "+linkedError.message);return;}
  const linkedRows=linked||[],linkedIds=new Set(linkedRows.map(row=>row.announcement_id));
  for(const item of announcements){
    const card=document.createElement("article");card.className="admin-video";
    const title=document.createElement("h3");title.textContent=item.title;
    const detail=document.createElement("p"),kind=item.media_type==="video"?"Vidéo · "+(item.video_provider||"Hébergeur inconnu"):"Photo";
    const linkedVideo=linkedRows.find(row=>row.announcement_id===item.id);
    const muxState=item.video_provider==="mux"&&linkedVideo?" · "+(linkedVideo.mux_status==="ready"?"Mux prêt":["errored","upload_failed"].includes(linkedVideo.mux_status)?"Erreur Mux":"Traitement Mux en cours"):"";
    detail.textContent=kind+muxState+(item.is_visible?" · Visible":" · Masquée");
    const date=document.createElement("p");date.textContent=item.scheduled_for?"Date prévue : "+new Date(item.scheduled_for).toLocaleString("fr-FR"):"Date non définie";
    const actions=document.createElement("div");actions.className="admin-actions";
    const edit=document.createElement("button");edit.textContent="Modifier";
    edit.addEventListener("click",()=>{
      editingId=item.id;editingItem=item;currentCover=item.cover_url||null;
      document.getElementById("title").value=item.title||"";
      document.getElementById("description").value=item.description||"";
      document.getElementById("scheduled").value=item.scheduled_for?new Date(item.scheduled_for).toISOString().slice(0,16):"";
      mediaType.value=item.media_type||"photo";providerSelect.value=item.video_provider||"cloudinary";
      coverProviderSelect.value=currentCover&&currentCover.includes("ik.imagekit.io")?"imagekit":"cloudinary";
      cloudinarySource.value=item.video_provider==="cloudinary"?item.video_url||"":"";
      viooSource.value=item.video_provider==="vioo"?item.video_url||"":"";
      dropboxSource.value=item.video_provider==="dropbox"?item.video_url||"":"";
      oneDriveSource.value=item.video_provider==="onedrive"?item.video_url||"":"";
      deepStorageSource.value=item.video_provider==="deepstorage"?item.video_url||"":"";
      const bunnyMatch=String(item.video_url||"").match(/\/embed\/\d+\/([^/?#]+)/);
      bunnySource.value=item.video_provider==="bunny"&&bunnyMatch?decodeURIComponent(bunnyMatch[1]):"";
      bunnyDownloadSource.value=item.video_provider==="bunny"?item.video_download_url||"":"";
      coverInput.value="";
      if(currentCover){coverPreview.src=currentCover;coverPreview.classList.remove("admin-hidden");}else coverPreview.classList.add("admin-hidden");
      updateMediaFields();
      if(item.video_provider==="mux")muxStatus.textContent=item.video_url&&!item.video_url.startsWith("mux-pending")?"Vidéo Mux déjà traitée. Pour la remplacer, crée une nouvelle annonce.":"Cette annonce attend la fin du traitement Mux. Pour remplacer le fichier, crée une nouvelle annonce.";
      saveButton.textContent="Enregistrer les modifications";document.getElementById("cancel-button").classList.remove("admin-hidden");
      form.scrollIntoView({behavior:"smooth"});
    });
    const visibility=document.createElement("button");visibility.className="alt";visibility.textContent=item.is_visible?"Masquer":"Afficher";
    visibility.addEventListener("click",async()=>{const {error:e}=await db.from("video_announcements").update({is_visible:!item.is_visible}).eq("id",item.id);if(e)show(message,e.message);await loadAnnouncements();});
    const remove=document.createElement("button");remove.className="danger";remove.textContent="Supprimer";remove.disabled=linkedIds.has(item.id);
    remove.title=remove.disabled?"Une fiche vidéo est associée à cette annonce. Retire-la d’abord depuis le tableau de bord vidéo.":"";
    remove.addEventListener("click",async()=>{if(linkedIds.has(item.id))return;if(!confirm("Supprimer l’annonce « "+item.title+" » ?"))return;const {error:e}=await db.from("video_announcements").delete().eq("id",item.id);if(e)show(message,e.message);await loadAnnouncements();});
    actions.append(edit,visibility,remove);card.append(title,detail,date,actions);list.append(card);
  }
}

async function saveMuxAnnouncement({title,description,dateValue,coverUrl,coverUpload,coverProvider,file}){
  if(!file)throw new Error("Choisis le fichier vidéo à envoyer sur Mux.");
  if(file.size>1024*1024*1024)throw new Error("La taille maximale autorisée pour un envoi Mux est de 1 Go.");
  const pendingToken="mux-pending:"+(crypto.randomUUID?crypto.randomUUID():Date.now());
  const {data:created,error:createError}=await db.from("video_announcements").insert({
    title,description,cover_url:coverUrl,scheduled_for:dateValue?new Date(dateValue).toISOString():null,
    media_type:"video",video_provider:"mux",video_url:pendingToken,is_visible:false
  }).select("id").single();
  if(createError)throw new Error("Impossible de préparer l’annonce Mux : "+createError.message);
  let muxVideoId=null;
  try{
    show(message,"Préparation de l’envoi sécurisé vers Mux…");
    const {data:uploadInfo,error:uploadError}=await db.functions.invoke("mux-create-upload",{
      body:{title,description,filename:file.name,content_type:file.type||"application/octet-stream",size:file.size,
        thumbnail_url:coverUrl,thumbnail_provider:coverProvider,
        thumbnail_cloudinary_public_id:coverProvider==="cloudinary"?coverUpload?.public_id||null:null,
        thumbnail_imagekit_file_id:coverProvider==="imagekit"?coverUpload?.fileId||null:null,announcement_id:created.id}
    });
    if(uploadError){
      let details=uploadError.message||"Impossible de préparer l’envoi Mux.";
      try{if(uploadError.context&&typeof uploadError.context.json==="function"){const payload=await uploadError.context.json();details=payload.error||payload.message||details;}}catch{}
      throw new Error(details);
    }
    if(!uploadInfo?.uploadUrl||!uploadInfo?.videoId)throw new Error("Supabase n’a pas fourni l’URL sécurisée d’envoi Mux.");
    muxVideoId=uploadInfo.videoId;
    await uploadToMux(file,uploadInfo.uploadUrl);
    const {error:visibleError}=await db.from("video_announcements").update({is_visible:true}).eq("id",created.id);
    if(visibleError)throw new Error("La vidéo a été envoyée, mais l’annonce n’a pas pu être rendue visible : "+visibleError.message);
    show(message,"✓ Vidéo envoyée à Mux. Le traitement continue automatiquement. L’annonce sera lisible dès que Mux aura terminé.");
    return created.id;
  }catch(error){
    if(muxVideoId)await db.from("videos").update({mux_status:"upload_failed",is_published:false}).eq("id",muxVideoId);
    await db.from("video_announcements").update({is_visible:false,video_url:"mux-error"}).eq("id",created.id);
    throw error;
  }
}

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const title=document.getElementById("title").value.trim();
  const description=document.getElementById("description").value.trim();
  const dateValue=document.getElementById("scheduled").value;
  const type=mediaType.value,provider=providerSelect.value,coverFile=coverInput.files[0];
  if(!title){show(message,"Ajoute un titre.");return;}
  if(!coverFile&&!currentCover){show(message,"Ajoute une couverture à cette annonce.");return;}
  const cloudFile=cloudinaryFile.files[0],deepFile=deepStorageFile.files[0],muxSelectedFile=muxFile.files[0];
  const selectedVideoFile=provider==="cloudinary"?cloudFile:provider==="deepstorage"?deepFile:provider==="mux"?muxSelectedFile:null;
  if(type==="video"&&selectedVideoFile&&!["video/mp4","video/quicktime","video/webm"].includes(selectedVideoFile.type)){show(message,"Format vidéo non accepté. Choisis un fichier MP4, MOV ou WebM.");return;}
  if(type==="video"&&provider==="mux"&&!editingId&&!muxSelectedFile){show(message,"Choisis le fichier vidéo à envoyer sur Mux.");return;}
  if(type==="video"&&provider==="deepstorage"&&!deepStorageStatus.available&&deepFile){show(message,deepStorageStatus.message||"L’API DeepStorage n’est pas disponible.");await checkDeepStorageAvailability(true);return;}
  if(type==="video"&&provider==="onedrive"&&!isOneDriveEmbedUrl(oneDriveSource.value)){show(message,"Ce lien n’est pas un véritable lien Embed OneDrive. Utilise le bouton pour le convertir.");refreshOneDriveHelper();return;}
  if(type==="video"&&provider==="bunny"&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bunnySource.value.trim())){show(message,"Indique un identifiant vidéo Bunny Stream valide (format UUID).");bunnySource.focus();return;}
  if(type==="video"&&provider==="bunny"&&bunnyDownloadSource.value.trim()){
    try{const url=new URL(bunnyDownloadSource.value.trim());if(url.protocol!=="https:"||url.username||url.password)throw new Error();}
    catch{show(message,"Le lien de téléchargement Bunny doit être une URL HTTPS valide.");bunnyDownloadSource.focus();return;}
  }

  saveButton.disabled=true;providerSelect.disabled=true;
  try{
    await ensureAdminSession();
    const coverProvider=coverProviderSelect.value;
    let coverUrl=currentCover,coverUpload=null;
    if(coverFile){
      if(coverProvider==="imagekit"){
        if(coverFile.size>25*1024*1024)throw new Error("ImageKit Free accepte les images jusqu’à 25 Mo. Choisis une image plus légère ou Cloudinary.");
        show(message,"Envoi de la couverture vers ImageKit…");coverUpload=await uploadToImageKit(coverFile);coverUrl=coverUpload.url;
      }else{
        show(message,"Envoi de la couverture vers Cloudinary…");coverUpload=await uploadCover(coverFile);coverUrl=coverUpload.secure_url;
      }
    }
    if(type==="video"&&provider==="mux"&&!editingId){
      await saveMuxAnnouncement({title,description,dateValue,coverUrl,coverUpload,coverProvider,file:muxSelectedFile});
      resetForm();await loadAnnouncements();return;
    }
    let videoUrl=null,videoDownloadUrl=null;
    if(type==="video"){
      if(provider==="cloudinary"){
        const raw=cloudinarySource.value.trim();
        if(cloudFile){
          show(message,"Envoi de la vidéo vers Cloudinary…");
          let fileToUpload=cloudFile;
          if(document.getElementById("upload-quality").value==="480p"){show(message,"Préparation de la compression locale en 480p…");fileToUpload=await compressVideoTo480p(cloudFile);}
          const uploaded=await uploadToCloudinary(fileToUpload,"video");videoUrl=uploaded.secure_url;
        }else if(raw)videoUrl=normalizeCloudinarySource(raw);
        else if(editingItem?.video_provider==="cloudinary")videoUrl=editingItem.video_url;
        else throw new Error("Choisis un fichier vidéo Cloudinary ou indique son identifiant public.");
      }else if(provider==="deepstorage"){
        if(deepFile){show(message,"Préparation de l’envoi sécurisé vers DeepStorage…");const uploaded=await uploadToDeepStorage(deepFile);videoUrl=uploaded.link;}
        else if(deepStorageSource.value.trim())videoUrl=normalizeHttpsSource(deepStorageSource.value,"DeepStorage");
        else if(editingItem?.video_provider==="deepstorage")videoUrl=editingItem.video_url;
        else throw new Error("Choisis un fichier à envoyer sur DeepStorage ou indique son URL HTTPS.");
      }else if(provider==="mux"){
        if(editingItem?.video_provider==="mux"&&editingItem.video_url)videoUrl=editingItem.video_url;
        else throw new Error("Pour une nouvelle annonce Mux, choisis le fichier vidéo. Pour remplacer une annonce Mux existante, crée une nouvelle annonce.");
      }else if(provider==="vioo")videoUrl=normalizeViooEmbedUrl(viooSource.value);
      else if(provider==="dropbox")videoUrl=normalizeDropboxUrl(dropboxSource.value);
      else if(provider==="onedrive")videoUrl=normalizeOneDriveEmbedUrl(oneDriveSource.value);
      else if(provider==="bunny"){
        videoUrl="https://player.mediadelivery.net/embed/"+BUNNY_LIBRARY_ID+"/"+encodeURIComponent(bunnySource.value.trim());
        videoDownloadUrl=bunnyDownloadSource.value.trim()||null;
      }
      else throw new Error("Hébergeur vidéo non pris en charge.");
    }
    const payload={title,description,cover_url:coverUrl,scheduled_for:dateValue?new Date(dateValue).toISOString():null,
      media_type:type,video_provider:type==="video"?provider:null,video_url:type==="video"?videoUrl:null,
      video_download_url:type==="video"&&provider==="bunny"?videoDownloadUrl:null,updated_at:new Date().toISOString()};
    const result=editingId?await db.from("video_announcements").update(payload).eq("id",editingId):await db.from("video_announcements").insert({...payload,is_visible:true});
    if(result.error)throw new Error(result.error.message);
    show(message,"Annonce enregistrée avec succès.");resetForm();await loadAnnouncements();
  }catch(error){show(message,"Erreur : "+(error.message||String(error)));}
  finally{saveButton.disabled=false;providerSelect.disabled=false;updateProviderFields();}
});

async function openDashboard(user){
  if(!user||user.id!==ADMIN_ID){await db.auth.signOut();loginSection.classList.remove("admin-hidden");dashboard.classList.add("admin-hidden");show(document.getElementById("login-message"),"Accès réservé à l’administrateur.");return;}
  loginSection.classList.add("admin-hidden");dashboard.classList.remove("admin-hidden");
  await loadAnnouncements();await checkDeepStorageAvailability(true);
}
db.auth.getSession().then(({data,error})=>{if(error)show(document.getElementById("login-message"),error.message);if(data?.session)openDashboard(data.session.user);});
document.getElementById("login-form").addEventListener("submit",async event=>{
  event.preventDefault();show(document.getElementById("login-message"),"Connexion en cours…");
  const {data,error}=await db.auth.signInWithPassword({email:document.getElementById("email").value,password:document.getElementById("password").value});
  if(error){show(document.getElementById("login-message"),"Erreur : "+error.message);return;}await openDashboard(data.user);
});
document.getElementById("logout-button").addEventListener("click",async()=>{await db.auth.signOut();dashboard.classList.add("admin-hidden");loginSection.classList.remove("admin-hidden");});
updateMediaFields();refreshOneDriveHelper();