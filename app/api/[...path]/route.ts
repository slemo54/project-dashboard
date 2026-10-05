export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const methods = new Set(["GET", "POST", "PATCH", "DELETE"]);
async function proxy(request: Request, context: {params: Promise<{path: string[]}>}) {
  if (!methods.has(request.method)) return Response.json({error:"Metodo non consentito."},{status:405});
  const url = new URL(request.url);
  let sameOrigin = false;
  try { const origin = new URL(request.headers.get("origin") || ""); sameOrigin = origin.host === request.headers.get("host") && ["https:","http:"].includes(origin.protocol); } catch {}
  if (request.method !== "GET" && !sameOrigin) {
    return Response.json({error:"Richiesta non autorizzata."},{status:403});
  }
  const upstream = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!upstream || !key) return Response.json({error:"Spazio di lavoro non configurato."},{status:503});
  const {path} = await context.params;
  const headers = new Headers({apikey:key});
  for (const name of ["cookie","content-type"]) {
    const value=request.headers.get(name); if(value) headers.set(name,value);
  }
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && body.length > 20000) return Response.json({error:"Richiesta troppo grande."},{status:413});
    const response = await fetch(`${upstream}/functions/v1/axn-api/${path.map(encodeURIComponent).join("/")}${url.search}`, {method:request.method,headers,body,cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(25000)});
    const result = new Headers({"cache-control":"no-store","x-content-type-options":"nosniff"});
    for (const name of ["content-type","set-cookie","location"]) {const value=response.headers.get(name); if(value) result.set(name,value);}
    return new Response(response.body,{status:response.status,headers:result});
  } catch { return Response.json({error:"Servizio momentaneamente non disponibile. Riprova."},{status:503}); }
}
export {proxy as GET,proxy as POST,proxy as PATCH,proxy as DELETE};
