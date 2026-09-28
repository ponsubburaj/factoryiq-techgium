import { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const NAV = [
  ["dashboard", "Dashboard", "▦"],
  ["demo", "Demo Center", "▶"],
  ["mira", "MIRA Assistant", "✦"],
  ["knowledge", "Knowledge Base", "▤"],
  ["audit", "Audit Log", "◷"],
  ["equipment", "Equipment", "◫"],
  ["maintenance", "Maintenance", "⌁"],
  ["quality", "Quality", "◇"],
  ["architecture", "Architecture", "⌘"],
];

const DEMOS = [
  ["Grounded maintenance answer", "How do I resolve CNC-01 error E42?"],
  ["Evidence abstention", "How do I repair a Boeing 747 engine?"],
  ["Safety escalation", "How do I bypass the CNC-01 safety interlock?"],
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [health, setHealth] = useState(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [visionQuestion, setVisionQuestion] = useState("Analyze this equipment image and identify any visible condition relevant to the approved manufacturing knowledge.");
  const [uploading, setUploading] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [auditFilter, setAuditFilter] = useState("ALL");
  const [evidence, setEvidence] = useState(null);

  const refresh = async () => {
    try {
      const [docs, logs, h] = await Promise.all([
        api("/api/documents"),
        api("/api/audit"),
        api("/api/health"),
      ]);
      setDocuments(docs);
      setAudit(logs);
      setHealth(h);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { refresh(); }, []);

  const ask = async (value = query) => {
    const q = value.trim();
    if (!q) return;
    setPage("mira");
    setBusy(true);
    setError("");
    setResult(null);
    setQuery(q);
    try {
      const data = await api("/api/mira/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      setResult(data);
      const logs = await api("/api/audit");
      setAudit(logs);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api("/api/documents/upload", { method: "POST", body: form });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const analyzeVision = async () => {
    if (!selectedImage) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", selectedImage);
      form.append("question", visionQuestion);
      const data = await api("/api/mira/vision", { method: "POST", body: form });
      setResult(data);
      setPage("mira");
      const logs = await api("/api/audit");
      setAudit(logs);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitApproval = async (decision) => {
    if (!result?.answer) return;
    setBusy(true);
    try {
      await api("/api/mira/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          decision,
          notes: approvalNotes,
        }),
      });
      setApprovalNotes("");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async (source) => {
    try {
      const data = await api(`/api/documents/${source.document_id}/evidence?page=${source.page}`);
      setEvidence(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const clearAudit = async () => {
    if (!window.confirm("Clear the audit log?")) return;
    try {
      await api("/api/audit", { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const stats = useMemo(() => ({
    documents: documents.length,
    current: documents.filter(d => d.status === "current").length,
    superseded: documents.filter(d => d.status === "superseded").length,
    queries: audit.filter(a => ["MIRA_QUERY", "MIRA_ABSTAIN", "MIRA_ESCALATION"].includes(a.type)).length,
    escalations: audit.filter(a => a.type === "MIRA_ESCALATION").length,
  }), [documents, audit]);

  const filteredAudit = audit.filter((event) => {
    if (auditFilter === "ALL") return true;
    if (auditFilter === "QUERIES") return event.type.startsWith("MIRA_");
    if (auditFilter === "ESCALATIONS") return event.type === "MIRA_ESCALATION";
    if (auditFilter === "APPROVALS") return event.type === "EXPERT_APPROVAL";
    if (auditFilter === "DOCUMENTS") return event.type === "DOCUMENT_UPLOAD";
    if (auditFilter === "VISION") return event.type === "VISION_ANALYSIS";
    return true;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>FACTORY<span>IQ</span></strong>
            <small>MANUFACTURING INTELLIGENCE</small>
          </div>
        </div>

        <div className="system-state">
          <span className={`pulse ${health?.status === "ok" ? "online" : ""}`} />
          <span>{health?.status === "ok" ? "SYSTEM ONLINE" : "CONNECTING"}</span>
        </div>

        <nav>
          {NAV.map(([id, label, icon]) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => setPage(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>GOVERNED AI</div>
          <small>Evidence-first decision support</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">PLANT INTELLIGENCE PLATFORM</span>
            <span className="topbar-title">FactoryIQ</span>
          </div>
          <div className="topbar-meta">
            <span className="live-dot" /> API {health?.status === "ok" ? "CONNECTED" : "OFFLINE"}
            <span className="divider" />
            {health?.documents ?? documents.length} knowledge documents
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <strong>System notice</strong>
            <span>{error}</span>
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {page === "dashboard" && <Dashboard stats={stats} audit={audit} ask={ask} setPage={setPage} />}
        {page === "demo" && <DemoCenter ask={ask} setPage={setPage} />}
        {page === "mira" && (
          <Mira
            query={query}
            setQuery={setQuery}
            ask={ask}
            result={result}
            busy={busy}
            approvalNotes={approvalNotes}
            setApprovalNotes={setApprovalNotes}
            submitApproval={submitApproval}
            selectedImage={selectedImage}
            setSelectedImage={setSelectedImage}
            imagePreview={imagePreview}
            setImagePreview={setImagePreview}
            visionQuestion={visionQuestion}
            setVisionQuestion={setVisionQuestion}
            analyzeVision={analyzeVision}
            openEvidence={openEvidence}
          />
        )}
        {page === "knowledge" && <Knowledge documents={documents} uploadDocument={uploadDocument} uploading={uploading} openEvidence={openEvidence} />}
        {page === "audit" && <Audit events={filteredAudit} filter={auditFilter} setFilter={setAuditFilter} clearAudit={clearAudit} />}
        {page === "equipment" && <Placeholder title="Equipment Intelligence" text="Equipment-specific profiles, telemetry and digital-twin integrations are prepared as the next extension point." />}
        {page === "maintenance" && <Placeholder title="Maintenance Workspace" text="Maintenance history, RCA records and corrective-action workflows can be connected to the same governed evidence layer." />}
        {page === "quality" && <Placeholder title="Quality Intelligence" text="Quality alerts and non-conformance workflows can use the same citation, revision and approval controls." />}
        {page === "architecture" && <Architecture />}
      </main>

      {evidence && <EvidenceModal evidence={evidence} close={() => setEvidence(null)} />}
    </div>
  );
}

function Dashboard({ stats, audit, ask, setPage }) {
  return (
    <section className="page">
      <div className="hero">
        <div>
          <span className="eyebrow">GOVERNED GENAI FOR INDUSTRIAL OPERATIONS</span>
          <h1>Manufacturing intelligence<br /><span>with evidence.</span></h1>
          <p>FactoryIQ connects plant knowledge, multimodal inspection and deterministic AI governance so operators can get traceable answers without uncontrolled hallucination.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => setPage("demo")}>Launch Demo Center →</button>
            <button className="secondary-button" onClick={() => setPage("mira")}>Open MIRA</button>
          </div>
        </div>
        <div className="hero-orbit">
          <div className="orbit-ring ring-a" /><div className="orbit-ring ring-b" />
          <div className="orbit-core">MIRA</div>
          <span className="orbit-node node-a">SOP</span>
          <span className="orbit-node node-b">RCA</span>
          <span className="orbit-node node-c">QA</span>
          <span className="orbit-node node-d">VISION</span>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Knowledge Documents" value={stats.documents} />
        <Stat label="Current Revisions" value={stats.current} />
        <Stat label="Superseded Tracked" value={stats.superseded} />
        <Stat label="Governed Queries" value={stats.queries} />
        <Stat label="Escalations" value={stats.escalations} />
      </div>

      <div className="section-heading"><div><span className="eyebrow">LIVE WORKFLOW</span><h2>What MIRA can demonstrate</h2></div></div>
      <div className="capability-grid">
        <Capability title="Grounded Answers" text="Answers are generated from approved manufacturing evidence with document, revision and page traceability." icon="01" />
        <Capability title="Revision Governance" text="Current documents are preferred while superseded revisions remain detectable for governance checks." icon="02" />
        <Capability title="Safe Abstention" text="Weak or missing evidence results in abstention instead of fabricated procedures." icon="03" />
        <Capability title="Expert Escalation" text="Safety-critical requests enter a human approval workflow and become auditable events." icon="04" />
      </div>

      <div className="two-column">
        <div className="panel">
          <div className="panel-head"><span>QUICK DEMOS</span><button onClick={() => setPage("demo")}>View all →</button></div>
          {DEMOS.map(([title, q]) => (
            <button className="quick-row" key={q} onClick={() => ask(q)}>
              <span className="quick-index">{title.slice(0, 2).toUpperCase()}</span>
              <span><strong>{title}</strong><small>{q}</small></span>
              <b>→</b>
            </button>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head"><span>RECENT ACTIVITY</span><button onClick={() => setPage("audit")}>Audit →</button></div>
          {audit.slice(0, 5).map((e) => <AuditMini event={e} key={e.id} />)}
          {!audit.length && <Empty text="No audit events yet." />}
        </div>
      </div>
    </section>
  );
}

function DemoCenter({ ask, setPage }) {
  const cards = [
    ["01", "Grounded maintenance answer", "How do I resolve CNC-01 error E42?", () => ask("How do I resolve CNC-01 error E42?")],
    ["02", "Evidence abstention", "How do I repair a Boeing 747 engine?", () => ask("How do I repair a Boeing 747 engine?")],
    ["03", "Safety governance", "How do I bypass the CNC-01 safety interlock?", () => ask("How do I bypass the CNC-01 safety interlock?")],
    ["04", "Multimodal inspection", "Upload a machine image and connect visual observations to plant evidence.", () => setPage("mira")],
  ];
  return (
    <section className="page">
      <PageHeading eyebrow="TECHGIUM DEMONSTRATION" title="FactoryIQ Demo Center" text="A controlled presentation surface for the capabilities that define the FactoryIQ manufacturing intelligence workflow." badge="LIVE DEMO MODE" />
      <div className="demo-banner"><b>✦</b><span><strong>Demo narrative</strong><small>Retrieve → Verify → Govern → Cite → Escalate → Audit</small></span></div>
      <div className="demo-grid">
        {cards.map(([n, title, text, action]) => (
          <div className="demo-card" key={n}>
            <div className="demo-card-top"><span>{n}</span><em>READY</em></div>
            <h3>{title}</h3><p>{text}</p>
            <button className="primary-button" onClick={action}>{n === "04" ? "Open vision demo →" : "Run demo →"}</button>
          </div>
        ))}
      </div>
      <div className="proof-grid">
        <div className="panel"><div className="panel-head"><span>THE EVIDENCE CHAIN</span></div><Proof items={["Operator asks a plant question","MIRA retrieves approved evidence","Current revision is preferred","Answer exposes source citations"]} /></div>
        <div className="panel"><div className="panel-head"><span>CONTROLLED FAILURE MODES</span></div><Proof items={["Weak evidence → ABSTAIN","Safety request → ESCALATE","Expert decision → APPROVAL","Every important action → AUDIT"]} /></div>
      </div>
    </section>
  );
}

function Mira(props) {
  const { query, setQuery, ask, result, busy, approvalNotes, setApprovalNotes, submitApproval, selectedImage, setSelectedImage, imagePreview, setImagePreview, visionQuestion, setVisionQuestion, analyzeVision, openEvidence } = props;
  const chooseImage = (file) => {
    setSelectedImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };
  return (
    <section className="page">
      <PageHeading eyebrow="MIRA • MANUFACTURING INTELLIGENCE & RESPONSE ASSISTANT" title="Ask the plant." text="Grounded answers, controlled failure modes and traceable evidence." badge="GOVERNED" />
      <div className="mira-grid">
        <div className="panel query-panel">
          <div className="panel-head"><span>TEXT QUERY</span><em>APPROVED CORPUS</em></div>
          <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask about a machine, SOP, error code, parameter, maintenance finding..." onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") ask(); }} />
          <div className="query-footer"><small>Ctrl/Cmd + Enter to run</small><button className="primary-button" disabled={busy} onClick={() => ask()}>{busy ? "PROCESSING..." : "Ask MIRA →"}</button></div>
          <div className="demo-chips">{DEMOS.map(([, q]) => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>
        </div>

        <div className="panel vision-panel">
          <div className="panel-head"><span>VISION INSPECTION</span><em>MULTIMODAL</em></div>
          <label className="dropzone">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => chooseImage(e.target.files?.[0])} />
            {imagePreview ? <img src={imagePreview} alt="Equipment preview" /> : <><b>＋</b><strong>Drop equipment image</strong><small>JPG, PNG or WEBP</small></>}
          </label>
          <input className="text-input" value={visionQuestion} onChange={e => setVisionQuestion(e.target.value)} />
          <button className="secondary-button full" disabled={!selectedImage || busy} onClick={analyzeVision}>{busy ? "ANALYZING..." : "Analyze image →"}</button>
        </div>
      </div>

      {result && <ResultCard result={result} query={query} approvalNotes={approvalNotes} setApprovalNotes={setApprovalNotes} submitApproval={submitApproval} openEvidence={openEvidence} />}
    </section>
  );
}

function ResultCard({ result, query, approvalNotes, setApprovalNotes, submitApproval, openEvidence }) {
  const decision = result.decision || "ANSWER";
  return (
    <div className={`result-card ${decision.toLowerCase()}`}>
      <div className="result-top">
        <div><span className="eyebrow">MIRA RESULT</span><h2>{decision === "ANSWER" ? "Evidence-grounded response" : decision === "ESCALATE" ? "Expert approval required" : decision === "ABSTAIN" ? "Insufficient evidence" : "Analysis complete"}</h2></div>
        <span className={`decision-badge ${decision.toLowerCase()}`}>{decision}</span>
      </div>

      <div className="result-body">
        <div className="answer-block">
          <div className="answer-label">RESPONSE</div>
          <div className="answer-text">{result.answer}</div>
          {result.reason && <div className="reason"><b>Governance:</b> {result.reason}</div>}
        </div>

        {decision === "ESCALATE" && (
          <div className="approval-box">
            <div><strong>Safety-critical request detected.</strong><small>An expert must make the decision before operational guidance is released.</small></div>
            <textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} placeholder="Optional expert notes..." />
            <div className="approval-actions">
              <button onClick={() => submitApproval("APPROVE")}>Approve</button>
              <button onClick={() => submitApproval("REJECT")}>Reject</button>
              <button onClick={() => submitApproval("MORE_EVIDENCE")}>Need More Evidence</button>
            </div>
          </div>
        )}

        {!!result.revision_notes?.length && <div className="revision-box"><b>REVISION GOVERNANCE</b>{result.revision_notes.map((n, i) => <p key={i}>{n.message}</p>)}</div>}
        {!!result.conflicts?.length && <div className="conflict-box"><b>CONFLICT DETECTED</b><p>Multiple current revisions require review before automatic answering.</p></div>}

        {!!result.sources?.length && (
          <div className="sources">
            <div className="answer-label">SOURCE EVIDENCE</div>
            {result.sources.map((s, i) => (
              <button className="source-row" key={`${s.document_id}-${s.page}-${i}`} onClick={() => openEvidence(s)}>
                <span className="source-num">{String(i + 1).padStart(2, "0")}</span>
                <span><strong>{s.filename}</strong><small>Rev {s.revision} · Page {s.page} · {s.category} · {s.status}</small></span>
                <b>{Number(s.score || 0).toFixed(2)} →</b>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Knowledge({ documents, uploadDocument, uploading, openEvidence }) {
  return (
    <section className="page">
      <PageHeading eyebrow="GOVERNED DOCUMENT REGISTRY" title="Knowledge Base" text="Approved plant evidence with revision and lifecycle awareness." badge={`${documents.length} DOCUMENTS`} />
      <div className="upload-strip">
        <div><strong>Add a manufacturing document</strong><small>PDF only · parsed page-by-page · revision detected from filename</small></div>
        <label className="primary-button upload-button">{uploading ? "UPLOADING..." : "Upload PDF →"}<input type="file" accept=".pdf,application/pdf" disabled={uploading} onChange={e => uploadDocument(e.target.files?.[0])} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>DOCUMENT</th><th>CATEGORY</th><th>REVISION</th><th>STATUS</th><th>FAMILY</th><th /></tr></thead>
          <tbody>
            {documents.map(d => (
              <tr key={d.id}>
                <td><strong>{d.filename}</strong><small>{d.pages?.length || 0} pages</small></td>
                <td>{d.category}</td><td>v{d.revision}</td>
                <td><span className={`status-pill ${d.status}`}>{d.status}</span></td>
                <td>{d.document_family}</td>
                <td><button className="link-button" onClick={() => openEvidence({document_id: d.id, page: 1})}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!documents.length && <Empty text="No documents registered." />}
      </div>
    </section>
  );
}

function Audit({ events, filter, setFilter, clearAudit }) {
  const filters = ["ALL", "QUERIES", "ESCALATIONS", "APPROVALS", "DOCUMENTS", "VISION"];
  return (
    <section className="page">
      <PageHeading eyebrow="TRACEABILITY" title="Audit Log" text="A chronological record of governed AI activity." badge={`${events.length} EVENTS`} />
      <div className="audit-toolbar">
        <div className="filter-row">{filters.map(f => <button key={f} className={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
        <button className="danger-button" onClick={clearAudit}>Clear log</button>
      </div>
      <div className="timeline">
        {events.map(e => (
          <div className="timeline-item" key={e.id}>
            <div className="timeline-line"><span /></div>
            <div className="timeline-card">
              <div><span className={`event-type ${e.type.toLowerCase()}`}>{e.type.replaceAll("_", " ")}</span><time>{new Date(e.timestamp).toLocaleString()}</time></div>
              <strong>{e.query || e.filename || e.decision || "System event"}</strong>
              {e.reason && <small>{e.reason}</small>}
              {e.notes && <small>Notes: {e.notes}</small>}
            </div>
          </div>
        ))}
        {!events.length && <Empty text="No events for this filter." />}
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section className="page">
      <PageHeading eyebrow="SYSTEM DESIGN" title="Architecture" text="Evidence first. Generation second. Governance always." badge="v1.0" />
      <div className="architecture-flow">
        {["DOCUMENTS", "INGESTION", "RETRIEVAL", "GOVERNANCE", "MIRA", "ANSWER / ABSTAIN / ESCALATE", "AUDIT"].map((x, i) => (
          <div className="arch-node" key={x}><span>{String(i + 1).padStart(2, "0")}</span><strong>{x}</strong>{i < 6 && <b>↓</b>}</div>
        ))}
      </div>
      <div className="proof-grid">
        <div className="panel"><div className="panel-head"><span>DESIGN PRINCIPLE</span></div><h3 className="panel-title">Evidence before generation.</h3><p className="panel-copy">The language model is a reasoning layer. It is not the authority. Approved manufacturing documents, revision state and governance controls determine what MIRA can present.</p></div>
        <div className="panel"><div className="panel-head"><span>EXTENSION POINTS</span></div><Proof items={["Vector database / embeddings","OCR for scanned manuals","MES / CMMS integration","Live machine telemetry","RBAC + SSO","Image-region citations"]} /></div>
      </div>
    </section>
  );
}

function Placeholder({ title, text }) {
  return <section className="page"><PageHeading eyebrow="EXTENSION MODULE" title={title} text={text} badge="READY TO EXTEND" /><div className="empty-module"><span>◈</span><h3>Connected to the same governance layer</h3><p>This module is intentionally scoped as an enterprise extension point in the prototype.</p></div></section>;
}

function PageHeading({ eyebrow, title, text, badge }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{badge && <span className="page-badge">{badge}</span>}</div>;
}

function Stat({ label, value }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div>; }
function Capability({ icon, title, text }) { return <div className="capability"><span>{icon}</span><div><h3>{title}</h3><p>{text}</p></div></div>; }
function Proof({ items }) { return <div className="proof">{items.map((x, i) => <div key={i}><span>✓</span>{x}</div>)}</div>; }
function AuditMini({ event }) { return <div className="audit-mini"><span>{event.type.replaceAll("_", " ")}</span><strong>{event.query || event.filename || event.decision || "System event"}</strong><small>{new Date(event.timestamp).toLocaleTimeString()}</small></div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }

function EvidenceModal({ evidence, close }) {
  return <div className="modal-backdrop" onClick={close}><div className="evidence-modal" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={close}>×</button>
    <span className="eyebrow">SOURCE EVIDENCE</span>
    <h2>{evidence.document.filename}</h2>
    <p>Revision {evidence.document.revision} · {evidence.document.category} · {evidence.document.status}</p>
    {evidence.pages.map(p => <div className="evidence-page" key={p.page}><span>PAGE {p.page}</span><pre>{p.text || "No extractable text."}</pre></div>)}
  </div></div>;
}
