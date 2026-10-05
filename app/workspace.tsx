"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { CalendarDays, Check, FileText, MessageSquare, Paperclip, Plus, Upload, Users, X } from "lucide-react";

type Project = { id: string; name: string; color: string };
type Attachment = { id: string; taskId: string; fileName: string; contentType: string; fileSize: number; uploadedBy: string; uploadedAt: string };
type Comment = { id: string; taskId: string; authorName: string; authorEmail: string; body: string; createdAt: string };
type Task = { id: string; projectId: string; title: string; brief: string; deliverable: string; status: Status; assignee: string; priority: string; dueDate: string | null; createdAt: string; updatedAt: string };
type Status = "backlog" | "todo" | "in_progress" | "review" | "done";
type User = { name: string; email: string };

const statuses: { id: Status; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Da fare" },
  { id: "in_progress", label: "In corso" },
  { id: "review", label: "In revisione" },
  { id: "done", label: "Completato" },
];

const accepted = ".ai,.psd,.fig,.xd,.indd,.eps,.svg,.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.webm,.zip";
const emptyBundle = { projects: [] as Project[], tasks: [] as Task[], comments: [] as Comment[], attachments: [] as Attachment[] };

function initials(value: string) {
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
}

function prettyDate(value: string | null) {
  if (!value) return "Senza scadenza";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(date);
}

function dueTone(value: string | null, status: Status) {
  if (!value || status === "done") return "";
  const due = new Date(`${value}T23:59:00`).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (due < today.getTime()) return "late";
  if (due - today.getTime() < 3 * 86400000) return "soon";
  return "";
}

function sizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

async function responseError(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error ?? "Operazione non riuscita.";
}

export function Workspace({ user: initialUser = { name: "Team", email: "" } }: { user?: User }) {
  const [bundle, setBundle] = useState(emptyBundle);
  const [authState, setAuthState] = useState<"checking" | "anonymous" | "authenticated">("checking");
  const [sessionUser, setSessionUser] = useState<User>(initialUser);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectId, setNewProjectId] = useState("bookingolf");
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const user = sessionUser;

  const refresh = useCallback(async (focusTask?: string) => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) {
        setBundle(emptyBundle); setSelectedTask(null); setCreating(false);
        setAuthState("anonymous");
        setLoginError("La sessione non è disponibile. Accedi di nuovo oppure apri la dashboard in una nuova scheda.");
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      setBundle({ projects: data.projects ?? [], tasks: data.tasks ?? [], comments: data.comments ?? [], attachments: data.attachments ?? [] });
      setError("");
      if (focusTask) setSelectedTask(focusTask);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Non riesco a caricare i dati.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (!response.ok) { setAuthState("anonymous"); setLoading(false); return; }
      const data = await response.json();
      setSessionUser(data.user ?? { name: "Team", email: "" });
      setAuthState("authenticated");
      void refresh();
    }).catch(() => { if (active) { setAuthState("anonymous"); setLoading(false); } });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => { if (!toast) return; const timer=setTimeout(()=>setToast(""),4500); return ()=>clearTimeout(timer); },[toast]);
  useEffect(() => { if(authState!=="authenticated")return;const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);return()=>clearInterval(timer); },[authState,refresh]);
  const visibleTasks = useMemo(() => bundle.tasks.filter((task) => selectedProject === "all" || task.projectId === selectedProject), [bundle.tasks, selectedProject]);
  const focusedTask = bundle.tasks.find((task) => task.id === selectedTask);
  const projectName = (id: string) => bundle.projects.find((project) => project.id === id)?.name ?? "Progetto";
  const activeCount = visibleTasks.filter((task) => task.status !== "done").length;
  const reviewCount = visibleTasks.filter((task) => task.status === "review").length;
  const dueCount = visibleTasks.filter((task) => task.dueDate && dueTone(task.dueDate, task.status)).length;

  async function moveTask(taskId: string, status: Status) {
    const before = bundle.tasks;
    setBundle((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status } : task) }));
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error(await responseError(response));
      setToast(status === "review" ? "Task inviata in revisione" : "Stato aggiornato");
      void refresh();
    } catch (reason) {
      setBundle((current) => ({ ...current, tasks: before }));
      setToast(reason instanceof Error ? reason.message : "Non riesco a salvare lo stato.");
    }
  }

  async function handleCreated(taskId: string) {
    setCreating(false);
    await refresh(taskId);
    setToast("Task aggiunta alla bacheca");
  }

  function addTask() { setNewProjectId(selectedProject === "all" ? "bookingolf" : selectedProject); setCreating(true); }

  const projectButtons = bundle.projects.map((project) => (
    <button key={project.id} className={`project-link ${selectedProject === project.id ? "active" : ""}`} onClick={() => setSelectedProject(project.id)}>
      <span className="project-dot" style={{ background: project.color }} />{project.name}
    </button>
  ));

  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: loginUsername, password: loginPassword }) });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      setSessionUser(data.user ?? { name: "Team", email: "" });
      setLoginPassword(""); setAuthState("authenticated"); setLoading(true);
      await refresh();
    } catch (reason) { setLoginError(reason instanceof Error ? reason.message : "Accesso non riuscito. Riprova."); }
    finally { setLoginBusy(false); }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setBundle(emptyBundle); setSelectedTask(null); setAuthState("anonymous"); setLoginPassword(""); setLoginError("");
  }

  if (authState !== "authenticated") return <LoginGate state={authState} username={loginUsername} password={loginPassword} error={loginError} busy={loginBusy} onUsername={setLoginUsername} onPassword={setLoginPassword} onSubmit={signIn} />;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div><div className="brand-title">A × N</div><div className="brand-sub">Spazio progetti</div></div></div>
      <div className="side-label">Workspace</div>
      <nav className="project-nav" aria-label="Progetti">
        <button className={`project-link ${selectedProject === "all" ? "active" : ""}`} onClick={() => setSelectedProject("all")}><span className="project-dot" style={{ background: "#d5f573" }} />Tutti i progetti</button>
        {projectButtons}
      </nav>
      <div className="sidebar-bottom">
        <div className="team-card"><div className="team-title">Collaborazione</div><div className="team-members"><span className="avatar">A</span><span className="avatar alt">N</span><span className="team-names">A × N</span></div></div>
      </div>
      <nav className="mobile-projects" aria-label="Seleziona progetto">
        <button className={`project-link ${selectedProject === "all" ? "active" : ""}`} onClick={() => setSelectedProject("all")}>Tutti</button>{projectButtons}
      </nav>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><h1 className="page-title">{selectedProject === "all" ? "Panoramica" : projectName(selectedProject)}</h1><p className="eyebrow">Spazio condiviso · 3 progetti</p></div>
        <div className="top-right"><button className="owner-chip logout-chip" onClick={() => void signOut()} title="Esci dalla dashboard"><span className="avatar">{initials(sessionUser.name)}</span>{sessionUser.name} · Esci</button><button className="button primary" onClick={addTask}><Plus size={16} strokeWidth={2.5} />Nuova task</button></div>
      </header>

      {error && <div className="error-banner" role="alert">{error} <button className="button small" onClick={() => { setLoading(true); void refresh(); }}>Riprova</button></div>}
      {loading ? <div className="loading">Caricamento dello spazio di lavoro…</div> : <>
        <section className="overview" aria-label="Riepilogo">
          <div className="stat"><div className="stat-label">Task da seguire</div><div className="stat-value">{activeCount}</div><div className="stat-meta">nei progetti selezionati</div></div>
          <div className="stat"><div className="stat-label">In revisione</div><div className="stat-value">{reviewCount}</div><div className="stat-meta">in attesa del tuo feedback</div></div>
          <div className="stat"><div className="stat-label">Scadenze vicine o passate</div><div className="stat-value">{dueCount}</div><div className="stat-meta">controlla le date sulle card</div></div>
        </section>

        <section className="board-wrap" aria-label="Bacheca Kanban">
          <div className="board-head"><div><h2 className="board-heading">Bacheca</h2><p className="board-caption"><span className="board-caption-desktop">Trascina una task per aggiornare lo stato, oppure aprila per modificarla.</span><span className="board-caption-mobile">Scorri le colonne. Tocca una task per cambiare stato e aggiungere file.</span></p></div><button className="button small" onClick={addTask}><Plus size={14} />Aggiungi</button></div>
          {bundle.projects.length === 0 ? <div className="project-empty">Non ci sono progetti da mostrare.</div> : <div className="board">
            {statuses.map((status) => {
              const tasksInColumn = visibleTasks.filter((task) => task.status === status.id);
              return <div key={status.id} className={`column ${overStatus === status.id ? "over" : ""}`} onDragOver={(event) => { event.preventDefault(); setOverStatus(status.id); }} onDragLeave={() => setOverStatus(null)} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/task-id") || dragging; setOverStatus(null); setDragging(null); if (taskId) void moveTask(taskId, status.id); }}>
                <div className="column-head"><div className="column-title"><span className="status-mark" />{status.label}</div><span className="count">{tasksInColumn.length}</span></div>
                <div className="task-list">{tasksInColumn.map((task) => {
                  const tone = dueTone(task.dueDate, task.status);
                  return <button key={task.id} className="task-card" draggable onDragStart={(event) => { event.dataTransfer.setData("text/task-id", task.id); setDragging(task.id); }} onDragEnd={() => { setDragging(null); setOverStatus(null); }} onClick={() => setSelectedTask(task.id)} aria-label={`Apri task ${task.title}`}>
                    <p className="task-project">{projectName(task.projectId)}</p><h3 className="task-title">{task.title}</h3><p className="task-brief">{task.brief}</p>
                    <span className={`priority ${task.priority}`}>{task.priority}</span>
                    <div className="task-foot"><span className="task-assignee"><span className="mini-avatar">{initials(task.assignee)}</span>{task.assignee || "Da assegnare"}</span><span className={`due ${tone}`}><CalendarDays size={13} />{prettyDate(task.dueDate)}</span></div>
                  </button>;
                })}{tasksInColumn.length === 0 && <div className="empty-column">Nessuna task</div>}</div>
              </div>;
            })}
          </div>}
        </section>
      </>}
      {creating && <TaskEditor projects={bundle.projects} projectId={newProjectId} user={user} onClose={() => setCreating(false)} onCreated={handleCreated} onToast={setToast} />}
      {focusedTask && <TaskEditor key={focusedTask.id} task={focusedTask} projectName={projectName(focusedTask.projectId)} projects={bundle.projects} user={user} comments={bundle.comments.filter((comment) => comment.taskId === focusedTask.id)} attachments={bundle.attachments.filter((attachment) => attachment.taskId === focusedTask.id)} onClose={() => setSelectedTask(null)} onUpdated={() => void refresh(focusedTask.id)} onToast={setToast} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  </div>;
}

function LoginGate({ state, username, password, error, busy, onUsername, onPassword, onSubmit }: {
  state: "checking" | "anonymous"; username: string; password: string; error: string; busy: boolean;
  onUsername: (value: string) => void; onPassword: (value: string) => void; onSubmit: (event: FormEvent) => void;
}) {
  if (state === "checking") return <main className="login-page"><div className="login-card"><span className="brand-mark login-mark">A×N</span><p className="login-kicker">Spazio progetti · A × N</p><h1>Controllo accesso…</h1><p className="login-subtitle">Sto verificando la tua sessione.</p></div></main>;
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><span className="brand-mark login-mark">A×N</span><p className="login-kicker">Spazio progetti · A × N</p><h1 id="login-title">Accedi alla dashboard</h1><p className="login-subtitle">Inserisci le credenziali condivise per vedere task e consegne.</p><form className="login-form" onSubmit={onSubmit}>
    <label htmlFor="login-username">Username</label><input id="login-username" type="text" autoComplete="username" value={username} onChange={(event) => onUsername(event.target.value)} required maxLength={80} />
    <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPassword(event.target.value)} required maxLength={256} />
    {error && <p className="login-error" role="alert">{error}</p>}<button className="button primary login-submit" type="submit" disabled={busy}>{busy ? "Accesso…" : "Entra"}</button>
  </form><p className="login-footnote">Accesso condiviso per il team. La sessione resta attiva 7 giorni.</p></section></main>;
}

function TaskEditor({ task, projectName, projects, projectId, user, comments = [], attachments = [], onClose, onCreated, onUpdated, onToast }: {
  task?: Task; projectName?: string; projects: Project[]; projectId?: string; user: User; comments?: Comment[]; attachments?: Attachment[];
  onClose: () => void; onCreated?: (id: string) => void; onUpdated?: () => void; onToast: (message: string) => void;
}) {
  const isNew = !task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [brief, setBrief] = useState(task?.brief ?? "");
  const [deliverable, setDeliverable] = useState(task?.deliverable ?? "");
  const [selectedProject, setSelectedProject] = useState(task?.projectId ?? projectId ?? projects[0]?.id ?? "bookingolf");
  const [assignee, setAssignee] = useState(task?.assignee ?? "Nandini");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? "backlog");
  const [priority, setPriority] = useState(task?.priority ?? "media");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!title.trim()) { onToast("Aggiungi un titolo alla task"); return; }
    setSaving(true);
    try {
      const response = isNew
        ? await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, brief, deliverable, projectId: selectedProject, assignee, dueDate }) })
        : await fetch(`/api/tasks/${task!.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, brief, deliverable, assignee, dueDate, status, priority }) });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json();
      if (isNew) onCreated?.(data.task.id);
      else { onToast("Modifiche salvate"); onUpdated?.(); }
    } catch (reason) { onToast(reason instanceof Error ? reason.message : "Non riesco a salvare le modifiche."); }
    finally { setSaving(false); }
  }

  async function uploadFile(file?: File) {
    if (!file || !task) return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const extensions = accepted.split(",").map((value) => value.replace(/^\./, "").toLowerCase());
    if (!extensions.includes(extension)) { onToast("Questo formato non è consentito."); return; }
    if (file.size > 50 * 1024 * 1024) { onToast("Il limite è 50 MB per file."); return; }
    setUploading(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({fileName:file.name,fileSize:file.size}) });
      if (!response.ok) throw new Error(await responseError(response));
      const upload = await response.json();
      const result = await fetch(upload.uploadUrl, { method:"PUT", headers:{"content-type":upload.contentType}, body:file });
      if (!result.ok) throw new Error("Caricamento non riuscito. Riprova.");
      const complete = await fetch(`/api/tasks/${task.id}/attachments/complete`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:upload.id})});
      if (!complete.ok) throw new Error(await responseError(complete));
      onToast("File caricato"); onUpdated?.();
    } catch (reason) { onToast(reason instanceof Error ? reason.message : "Caricamento non riuscito."); }
    finally { setUploading(false); }
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault();
    if (!task || !commentText.trim()) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: commentText }) });
      if (!response.ok) throw new Error(await responseError(response));
      setCommentText(""); onToast("Commento aggiunto"); onUpdated?.();
    } catch (reason) { onToast(reason instanceof Error ? reason.message : "Commento non salvato."); }
  }

  const projectLabel = projectName ?? projects.find((project) => project.id === selectedProject)?.name ?? "Progetto";
  return <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
    <header className="dialog-head"><div><h2 id="task-dialog-title">{isNew ? "Nuova task" : title || "Dettagli task"}</h2><p>{isNew ? "Definisci la prima consegna e la sua scadenza." : projectLabel}</p></div><button className="icon-button" aria-label="Chiudi" onClick={onClose}><X size={17} /></button></header>
    <div className="dialog-body">
      <div className="form-grid">
        <div className="field wide"><label htmlFor="task-title">Titolo</label><input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></div>
        <div className="field"><label htmlFor="task-project">Progetto</label><select id="task-project" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)} disabled={!isNew}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
        <div className="field"><label htmlFor="task-assignee">Responsabile</label><input id="task-assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)} maxLength={80} placeholder="Nandini" /></div>
        <div className="field"><label htmlFor="task-due">Scadenza</label><input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
        {!isNew && <><div className="field"><label htmlFor="task-status">Stato</label><select id="task-status" value={status} onChange={(event) => setStatus(event.target.value as Status)}>{statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="field"><label htmlFor="task-priority">Priorità</label><select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="bassa">Bassa</option><option value="media">Media</option><option value="alta">Alta</option></select></div></>}
        <div className="field wide"><label htmlFor="task-brief">Brief</label><textarea id="task-brief" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={5000} placeholder="Cosa serve e qual è l'obiettivo?" /></div>
        <div className="field wide"><label htmlFor="task-deliverable">Risultato atteso</label><textarea id="task-deliverable" value={deliverable} onChange={(event) => setDeliverable(event.target.value)} maxLength={2000} placeholder="Per esempio: preview desktop/mobile e file sorgente." /></div>
      </div>

      {!isNew && <>
        <section className="dialog-section"><h3 className="section-title">File della consegna</h3><p className="deliverable">{deliverable || "Aggiungi una nota sul formato del risultato atteso."}</p><div className="upload-row" style={{ marginTop: 12 }}>
          <label className={`button ${uploading ? "" : "accent"}`} htmlFor={`upload-${task!.id}`}><Upload size={14} />{uploading ? "Caricamento…" : "Carica un file"}</label><input id={`upload-${task!.id}`} className="file-input" type="file" accept={accepted} disabled={uploading} onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <span className="hint">Preview e sorgenti · max 50 MB</span>
        </div>
        <div className="attachment-list">{attachments.map((file) => {
          const canPreview = file.contentType.startsWith("image/") && file.contentType !== "image/svg+xml" || file.contentType === "application/pdf" || file.contentType.startsWith("video/");
          return <div className="attachment" key={file.id}><span className="file-type"><FileText size={16} /></span><div className="attachment-info"><a className="attachment-name" href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">{file.fileName}</a><div className="attachment-meta">{sizeLabel(file.fileSize)} · {file.uploadedBy}</div></div>{canPreview && <button className="button small" onClick={() => setPreviewId(previewId === file.id ? null : file.id)}>{previewId === file.id ? "Chiudi" : "Anteprima"}</button>}</div>;
        })}{attachments.length === 0 && <div className="hint">Qui compariranno i file sorgente e le preview.</div>}</div>
        {previewId && attachments.some((file) => file.id === previewId && file.contentType.startsWith("image/")) && <img src={`/api/files/${previewId}?preview=1`} alt="Anteprima del file" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, border: "1px solid #e3eaeb" }} />}
        {previewId && attachments.some((file) => file.id === previewId && file.contentType === "application/pdf") && <iframe title="Anteprima PDF" src={`/api/files/${previewId}?preview=1`} style={{ width: "100%", height: 380, border: "1px solid #e3eaeb", borderRadius: 10 }} />}
        {previewId && attachments.some((file) => file.id === previewId && file.contentType.startsWith("video/")) && <video controls src={`/api/files/${previewId}?preview=1`} style={{ width: "100%", maxHeight: 360, borderRadius: 10 }} />}
        </section>

        <section className="dialog-section"><h3 className="section-title">Commenti</h3><div className="comments">{comments.map((comment) => <article className="comment" key={comment.id}><div className="comment-head"><span className="mini-avatar">{initials(comment.authorName)}</span>{comment.authorName.split(" ")[0]}<time>{new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(comment.createdAt))}</time></div><p>{comment.body}</p></article>)}{comments.length === 0 && <div className="hint">Ancora nessun commento.</div>}</div><form className="comment-form" onSubmit={sendComment}><textarea aria-label="Scrivi un commento" value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Scrivi un commento o un feedback…" maxLength={2000} /><button className="button small" type="submit"><MessageSquare size={13} />Invia</button></form></section>
      </>}
      <div className="dialog-actions"><div className="hint">{isNew ? "Potrai aggiungere file e commenti dopo aver creato la task." : "Le modifiche saranno visibili a chi ha accesso allo spazio."}</div><div className="action-group">{!isNew && status === "in_progress" && <button className="button small" onClick={() => setStatus("review")}><Check size={13} />Pronta per revisione</button>}<button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? "Salvataggio…" : isNew ? "Crea task" : "Salva modifiche"}</button></div></div>
    </div>
  </section></div>;
}
