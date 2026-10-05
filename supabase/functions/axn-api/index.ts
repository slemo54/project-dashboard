import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const adminKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, adminKey, {auth:{persistSession:false,autoRefreshToken:false}});
const encoder = new TextEncoder();
const BUCKET = "axn-deliverables";
const MAX = 50*1024*1024;
const formats:Record<string,string> = {ai:"application/postscript",psd:"image/vnd.adobe.photoshop",fig:"application/octet-stream",xd:"application/octet-stream",indd:"application/octet-stream",eps:"application/postscript",svg:"image/svg+xml",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",pdf:"application/pdf",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",zip:"application/zip"};
function json(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{"cache-control":"no-store",...headers}})}
function failure(message:string,status=400){return json({error:message},status)}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64(s:string){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))}
function eq(a:Uint8Array,b:Uint8Array){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a[i]??0)^(b[i]??0);return n===0}
function camel(row:Record<string,unknown>){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]))}
const user={name:"Team",email:""};
const cookie=(value:string,seconds:number)=>`axn_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function checked<T>(result:{data:T;error:unknown}):T{if(result.error)throw new Error("Database operation failed");return result.data}
async function hash(password:string,salt:string){let bytes=encoder.encode(password);for(let i=0;i<3;i++){const key=await crypto.subtle.importKey("raw",bytes,"PBKDF2",false,["deriveBits"]);bytes=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(salt),iterations:80000,hash:"SHA-256"},key,256))}return bytes}
async function sessionKey(secret:string){return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])}
async function hasSession(req:Request,config:Record<string,string>){
 const token=(req.headers.get("cookie")??"").split(";").map(s=>s.trim()).find(s=>s.startsWith("axn_session="))?.slice(12);
 if(!token)return false;
 try {const [p,s,extra]=token.split(".");if(!p||!s||extra)return false;const value=JSON.parse(new TextDecoder().decode(unb64(p)));return value.user===config.username&&value.exp>Date.now()/1000&&await crypto.subtle.verify("HMAC",await sessionKey(config.session_secret),unb64(s),encoder.encode(p));}catch{return false}
}
async function body(req:Request){const raw=await req.text();if(raw.length>20000)throw new Error("Request too large");return JSON.parse(raw||"{}") as Record<string,unknown>}
function validDate(v:unknown){if(v===null||v==="")return null;if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error("Invalid date");return v}
function taskPayload(p:Record<string,unknown>){const data:Record<string,unknown>={};for(const [client,field,max] of [["title","title",160],["brief","brief",5000],["deliverable","deliverable",2000],["assignee","assignee",80]] as const){if(client in p){if(typeof p[client]!=="string"||(p[client] as string).length>max)throw new Error("Invalid field");data[field]=(p[client] as string).trim();if(client==="title"&&!data[field])throw new Error("Empty title")}}if("status"in p){if(!["backlog","todo","in_progress","review","done"].includes(p.status as string))throw new Error("Invalid status");data.status=p.status}if("priority"in p){if(!["bassa","media","alta"].includes(p.priority as string))throw new Error("Invalid priority");data.priority=p.priority}if("dueDate"in p)data.due_date=validDate(p.dueDate);return data}
Deno.serve(async(req:Request)=>{
 try {
  const url=new URL(req.url);const path=url.pathname.split("/axn-api/")[1]?.split("/").map(decodeURIComponent)??[];
  const config=checked(await db.from("axn_settings").select("*").eq("id",true).single());
  if(path.join("/")==="auth/login"&&req.method==="POST"){
   if(!checked(await db.rpc("axn_login_allowed")))return failure("Troppi tentativi. Riprova tra un minuto.",429);
   const p=await body(req);const password=typeof p.password==="string"&&p.password.length<=256?p.password:"";
   const match=eq(await hash(password,config.password_salt),unb64(config.password_hash));
   if(p.username!==config.username||!match)return failure("Username o password errati.",401);
   const payload=b64(encoder.encode(JSON.stringify({user:config.username,exp:Math.floor(Date.now()/1000)+604800})));
   const sig=b64(new Uint8Array(await crypto.subtle.sign("HMAC",await sessionKey(config.session_secret),encoder.encode(payload))));
   return json({user},200,{"set-cookie":cookie(`${payload}.${sig}`,604800)});
  }
  if(!await hasSession(req,config))return failure("Accedi per aprire lo spazio di lavoro.",401);
  if(path.join("/")==="auth/session"&&req.method==="GET")return json({user});
  if(path.join("/")==="auth/logout"&&req.method==="POST")return json({ok:true},200,{"set-cookie":cookie("",0)});
  if(path[0]==="workspace"&&path.length===1){
   if(req.method==="GET"){
    const results=await Promise.all([db.from("axn_projects").select("*").order("id"),db.from("axn_tasks").select("*").order("due_date").order("created_at"),db.from("axn_comments").select("*").order("created_at"),db.from("axn_attachments").select("id,task_id,file_name,content_type,file_size,uploaded_by,uploaded_at").eq("ready",true).order("uploaded_at")]);
    return json(Object.fromEntries([...results.map((r,i)=>[["projects","tasks","comments","attachments"][i],checked(r).map(camel)]),["user",user]]));
   }
   if(req.method==="POST"){
    const p=await body(req);const data=taskPayload(p);if(!data.title||typeof p.projectId!=="string")return failure("Inserisci titolo e progetto.");
    const project=checked(await db.from("axn_projects").select("id").eq("id",p.projectId).maybeSingle());if(!project)return failure("Progetto non valido.");
    const row=checked(await db.from("axn_tasks").insert({...data,id:crypto.randomUUID(),project_id:p.projectId,status:"backlog",created_by:"team"}).select().single());return json({task:camel(row)},201);
   }
  }
  if(path[0]==="tasks"&&path[1]){
   const taskId=path[1];const task=checked(await db.from("axn_tasks").select("id").eq("id",taskId).maybeSingle());if(!task)return failure("Task non trovata.",404);
   if(path.length===2&&req.method==="DELETE"){
    const files=checked(await db.from("axn_attachments").select("storage_key").eq("task_id",taskId));
    if(files.length)checked(await db.storage.from(BUCKET).remove(files.map(f=>f.storage_key)));
    checked(await db.from("axn_tasks").delete().eq("id",taskId));return json({ok:true});
   }
   if(path.length===2&&req.method==="PATCH"){
    const data=taskPayload(await body(req));const row=checked(await db.from("axn_tasks").update({...data,updated_at:new Date().toISOString()}).eq("id",taskId).select().single());return json({task:camel(row)});
   }
   if(path[2]==="comments"&&path.length===3&&req.method==="POST"){
    const p=await body(req);if(typeof p.body!=="string"||!p.body.trim()||p.body.length>5000)return failure("Inserisci un commento valido.");
    const row=checked(await db.from("axn_comments").insert({task_id:taskId,body:p.body.trim(),author_name:"Team"}).select().single());return json({comment:camel(row)},201);
   }
   if(path[2]==="attachments"&&req.method==="POST"){
    const p=await body(req);
    if(path[3]==="complete"){
     const row=checked(await db.from("axn_attachments").select("*").eq("id",p.id).eq("task_id",taskId).eq("ready",false).maybeSingle());if(!row)return failure("Consegna non trovata.",404);
     const [folder,file]=[row.storage_key.slice(0,row.storage_key.lastIndexOf("/")),row.storage_key.split("/").pop()];
     const objects=checked(await db.storage.from(BUCKET).list(folder,{search:file,limit:100}));const object=objects.find(o=>o.name===file);
     if(!object||Number(object.metadata?.size)!==Number(row.file_size)||object.metadata?.mimetype!==row.content_type)return failure("File non valido o caricamento incompleto.");
     checked(await db.from("axn_attachments").update({ready:true}).eq("id",row.id));return json({ok:true},201);
    }
    if(path.length!==3)return failure("Operazione non valida.",404);
    if(typeof p.fileName!=="string"||p.fileName.length>180||/[\x00-\x1f/\\]/.test(p.fileName)||typeof p.fileSize!=="number"||!Number.isInteger(p.fileSize)||p.fileSize<1||p.fileSize>MAX)return failure("File non valido. Limite 50 MB.");
    const extension=p.fileName.split(".").pop()?.toLowerCase()??"";const contentType=formats[extension];if(!contentType)return failure("Questo formato non è consentito.");
    const id=crypto.randomUUID();const storageKey=`${taskId}/${id}.${extension}`;
    const upload=checked(await db.storage.from(BUCKET).createSignedUploadUrl(storageKey));
    checked(await db.from("axn_attachments").insert({id,task_id:taskId,file_name:p.fileName,file_size:p.fileSize,content_type:contentType,storage_key:storageKey}));
    return json({id,uploadUrl:upload.signedUrl,contentType},201);
   }
  }
  if(path[0]==="files"&&path.length===2&&req.method==="GET"){
   const row=checked(await db.from("axn_attachments").select("*").eq("id",path[1]).eq("ready",true).maybeSingle());if(!row)return failure("File non trovato.",404);
   const result=checked(await db.storage.from(BUCKET).createSignedUrl(row.storage_key,600));return new Response(null,{status:302,headers:{location:result.signedUrl,"cache-control":"no-store"}});
  }
  return failure("Operazione non trovata.",404);
 }catch(error){console.error(error instanceof Error?error.message:"Operation failed");return failure("Operazione non riuscita. Controlla i dati e riprova.",400)}
});
