import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Download, ExternalLink, MessageSquare, StickyNote, Trash2, Upload } from "lucide-react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";

/**
 * Interactive SVG Annotator (React)
 *
 * v1 goal: share with execs.
 * - Upload an SVG
 * - Click any icon/shape/group to view what it is
 * - Add Notes + Comments per item
 * - Export ALL as HTML (exec-friendly), SVG (tooltips+metadata), or JSON
 */

const STORAGE_KEY = "svg-annotator:v1";

type CommentItem = { id: string; text: string; createdAt: string };

type Annotation = {
  title: string;
  description: string; // Notes
  comments: CommentItem[];
};

type ExportFormat = "html" | "json" | "svg";

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  try {
    // @ts-ignore
    return crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function cssEscapeSafe(value: string) {
  // @ts-ignore
  const esc = (globalThis as any).CSS?.escape;
  if (typeof esc === "function") return esc(value);
  return value.replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
}

function stripScripts(svgEl: Element) {
  svgEl.querySelectorAll("script").forEach((s) => s.remove());
}

function getElementKey(el: Element) {
  return el.getAttribute("id") || el.getAttribute("data-annot-key") || null;
}

function safeParseSvg(svgText: string) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return { svg: null as string | null, error: "No <svg> root found in file." };

  stripScripts(svg);

  // Make root responsive
  svg.setAttribute(
    "style",
    [svg.getAttribute("style") || "", "max-width:100%;height:auto;"].join(" ")
  );

  // If no ids exist, auto-assign keys
  const anyIds = svg.querySelector(
    "g[id], path[id], rect[id], circle[id], ellipse[id], polygon[id], polyline[id], line[id], text[id]"
  );

  let autoIndex = 1;
  const groups = Array.from(svg.querySelectorAll("g"));
  const shapes = Array.from(
    svg.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line, text")
  );

  function assignAutoKey(el: Element) {
    if (el.getAttribute("id")) return;
    if (el.getAttribute("data-annot-key")) return;
    el.setAttribute("data-annot-key", `auto_${autoIndex++}`);
  }

  if (!anyIds) {
    // Prefer groups that contain shapes (cleaner clicks)
    groups.forEach((g) => {
      if (g.querySelector("path, rect, circle, ellipse, polygon, polyline, line, text")) assignAutoKey(g);
    });
    // Fallback: any shape
    if (!svg.querySelector("[data-annot-key]")) shapes.forEach(assignAutoKey);
  }

  // Ensure selectable elements feel clickable
  const selectable = Array.from(svg.querySelectorAll("[id], [data-annot-key]"));
  selectable.forEach((el) => {
    const existing = el.getAttribute("style") || "";
    el.setAttribute(
      "style",
      `${existing}; cursor:pointer; pointer-events:all; transition: filter .15s ease, outline .15s ease;`
    );
  });

  return { svg: new XMLSerializer().serializeToString(svg), error: null as string | null };
}

function AnimatedButton({ children, className = "", ...props }: any) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: "spring", stiffness: 450, damping: 28 }}
      className="inline-block"
    >
      <Button
        {...props}
        className={`${className} transition-shadow duration-200 hover:shadow-md active:shadow-sm`}
      >
        {children}
      </Button>
    </motion.div>
  );
}

function AnimatedPill({ children, className = "", ...props }: any) {
  return (
    <motion.label
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98, y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-shadow duration-200 hover:shadow-md active:shadow-sm ${className}`}
      {...props}
    >
      {children}
    </motion.label>
  );
}

function buildAnnotatedSvg(svgMarkup: string, annotations: Record<string, Annotation>) {
  try {
    const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return svgMarkup;

    stripScripts(svg);

    const SVG_NS = "http://www.w3.org/2000/svg";

    // Replace old metadata
    const old = svg.querySelector("metadata#svg-annotator-metadata");
    if (old) old.remove();

    const meta = doc.createElementNS(SVG_NS, "metadata");
    meta.setAttribute("id", "svg-annotator-metadata");
    meta.textContent = JSON.stringify({ exportedAt: nowIso(), annotations });
    svg.insertBefore(meta, svg.firstChild);

    function ensureChild(el: Element, tag: string) {
      const found = Array.from(el.children).find((c) => c.tagName?.toLowerCase() === tag);
      if (found) return found;
      const created = doc.createElementNS(SVG_NS, tag);
      el.insertBefore(created, el.firstChild);
      return created;
    }

    Object.entries(annotations).forEach(([key, a]) => {
      const el = doc.getElementById(key) || svg.querySelector(`[data-annot-key="${key}"]`);
      if (!el) return;

      const title = ensureChild(el, "title");
      const desc = ensureChild(el, "desc");

      const label = (a.title || "").trim() || key;
      const notes = (a.description || "").trim();
      const comments = (a.comments || []).map((c) => c.text).filter(Boolean);

      const tooltip: string[] = [label];
      if (notes) tooltip.push(`Notes: ${notes}`);
      if (comments.length) tooltip.push(`Comments: ${comments.slice(0, 2).join(" • ")}`);
      title.textContent = tooltip.join("\n");

      const full: string[] = [];
      full.push(`Label: ${label}`);
      full.push(notes ? `Notes: ${notes}` : "Notes: (none)");
      if (comments.length) {
        full.push("Comments:");
        comments.slice(0, 10).forEach((t) => full.push(`- ${t}`));
      } else {
        full.push("Comments: (none)");
      }
      desc.textContent = full.join("\n");
    });

    return new XMLSerializer().serializeToString(svg);
  } catch {
    return svgMarkup;
  }
}

function buildHtmlPackage(svgMarkup: string, annotations: Record<string, Annotation>) {
  // Remove scripts + avoid literal </script> inside injected HTML.
  let cleanSvg = svgMarkup || "";
  try {
    const doc = new DOMParser().parseFromString(cleanSvg, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (svg) {
      stripScripts(svg);
      svg.setAttribute(
        "style",
        [svg.getAttribute("style") || "", "max-width:100%;height:auto;"].join(" ")
      );
      cleanSvg = new XMLSerializer().serializeToString(svg);
    }
  } catch {
    // keep original
  }
  cleanSvg = cleanSvg.replace(/<\/(script)/gi, "<\\/$1");

  const svgJsString = JSON.stringify(cleanSvg);
  const safeJson = JSON.stringify({ exportedAt: nowIso(), annotations }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SVG Notes Package</title>
  <style>
    :root{--card:#ffffff;--muted:#475569;--border:rgba(148,163,184,.35);--accent:#2563eb;}
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:radial-gradient(circle at 20% 20%,#eef2ff,#f8fafc); color:#0f172a;}
    .wrap{max-width:1200px;margin:0 auto;padding:24px;}
    .top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,#e0f2fe,#f8fafc);border:1px solid var(--border);box-shadow:0 14px 40px rgba(15,23,42,.08);}
    .title{font-weight:700;letter-spacing:-.02em;font-size:20px;color:#0f172a;}
    .sub{color:var(--muted);font-size:13px;margin-top:4px;max-width:70ch}
    .grid{display:grid;grid-template-columns:1fr 360px;gap:14px;margin-top:14px;align-items:start;}
    @media (max-width: 980px){.grid{grid-template-columns:1fr;}}
      .card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.08);}
      .card .hd{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:center;font-weight:700;color:#0f172a;}
      .card .bd{padding:14px;}
      .badge{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-size:12px;background:rgba(148,163,184,.08);}
      .svgBox{background:white;border:1px solid var(--border);border-radius:16px;padding:12px;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.6);}
      .k{color:#0f172a;font-weight:600;}
    .muted{color:var(--muted);font-size:13px;line-height:1.45}
    .muted.small{font-size:12px}
      .box{border:1px solid var(--border);border-radius:14px;padding:10px;background:#f8fafc;white-space:pre-wrap}
      .hint{margin-top:10px;color:var(--muted);font-size:12px}
      .pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;border:1px solid var(--border);padding:6px 12px;font-size:12px;color:#0f172a;background:#f8fafc;}
      .pill.soft{border-color:rgba(148,163,184,.3);background:rgba(148,163,184,.15);color:#0f172a;}
      .detailWrap{display:flex;flex-direction:column;gap:10px}
      .detailHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .detailStats{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
      .detailKey{font-size:13px;color:#0f172a;word-break:break-all;margin-top:4px}
      .noteCard{border:1px solid var(--border);border-radius:14px;padding:10px;background:#f8fafc;box-shadow:0 10px 25px rgba(15,23,42,.08)}
      .commentList{display:flex;flex-direction:column;gap:10px}
      .commentCard{padding:10px;border-radius:12px;border:1px solid var(--border);background:white;color:#0f172a;font-size:13px;line-height:1.45;box-shadow:0 6px 16px rgba(15,23,42,.06)}
      .commentCard .ts{display:block;color:var(--muted);font-size:11px;margin-top:6px}

    #svgHost svg [id],
    #svgHost svg [data-annot-key]{ transition: filter .15s ease, outline .15s ease; cursor:pointer; pointer-events:all; }
    #svgHost svg [id]:hover,
    #svgHost svg [data-annot-key]:hover{ filter: drop-shadow(0 0 6px rgba(59,130,246,.45)); }
  </style>
</head>
<body>
  <div class="wrap" id="svg-annotator-package">
    <div class="top">
      <div>
        <div class="title">Interactive SVG – click-to-explain</div>
        <div class="sub">Open this file in a browser. Click any icon/shape to see Notes + Comments on the right.</div>
      </div>
      <div class="badge"><span>Export:</span> <span class="k">All items</span></div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="hd" style="justify-content:space-between">
          <span class="badge" id="countBadge">Annotated: 0</span>
          <span class="badge" id="selBadge">Selected: none</span>
        </div>
        <div class="bd">
          <div class="svgBox" id="svgHost"></div>
          <div class="hint">Tip: If clicking feels too granular, group paths into a &lt;g id=\"...\"&gt; per icon before exporting.</div>
        </div>
      </div>

      <div class="card">
        <div class="hd">Details</div>
        <div class="bd">
          <div class="muted" id="emptyState">Click an icon in the SVG to see its Notes and Comments.</div>

          <div id="detailBody" class="detailWrap" style="display:none">
            <div class="detailHeader">
              <div>
                <div class="pill soft">Selected element</div>
                <div class="detailKey" id="selectedKeyLabel">Key: —</div>
              </div>
              <div class="detailStats">
                <span class="pill soft" id="notesChip">Notes</span>
                <span class="pill soft" id="commentsChip">0 comments</span>
              </div>
            </div>

            <div class="noteCard">
              <div class="muted small" style="margin-bottom:6px">Notes</div>
              <div class="box" id="notesBox"></div>
            </div>

            <div class="noteCard">
              <div class="muted small" style="margin-bottom:6px">Comments</div>
              <div class="commentList" id="commentsList"></div>
              <div class="muted small" id="noComments" style="display:none">Add comment under Comments.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script type="application/json" id="annotationsJson">${safeJson}</script>

    <script>
      (function(){
        var svgHost = document.getElementById('svgHost');
        var countBadge = document.getElementById('countBadge');
        var selBadge = document.getElementById('selBadge');
        var emptyState = document.getElementById('emptyState');
        var detailBody = document.getElementById('detailBody');
        var notesBox = document.getElementById('notesBox');
        var commentsList = document.getElementById('commentsList');
        var noComments = document.getElementById('noComments');
        var selectedKeyLabel = document.getElementById('selectedKeyLabel');
        var notesChip = document.getElementById('notesChip');
        var commentsChip = document.getElementById('commentsChip');

        var raw = document.getElementById('annotationsJson').textContent || '{}';
        var parsed = {};
        try{ parsed = JSON.parse(raw); }catch(e){ parsed = {}; }
        var annotations = (parsed && parsed.annotations) || {};

        countBadge.textContent = 'Annotated: ' + Object.keys(annotations).length;
        svgHost.innerHTML = ${svgJsString};

        var svg = svgHost.querySelector('svg');
        if(!svg) return;

        var selectedEl = null;

        function cssEscape(s){
          try {
            return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_\-]/g, function(m){ return '\\' + m; });
          } catch(e){
            return s;
          }
        }

        function getKey(el){
          if(!el || el === svg) return null;
          return el.getAttribute && (el.getAttribute('id') || el.getAttribute('data-annot-key'));
        }

        function findKey(el){
          var cur = el;
          while(cur && cur !== svg){
            var k = getKey(cur);
            if(k) return k;
            cur = cur.parentNode;
          }
          return null;
        }

        function setStyle(el, style){
          try{ el.setAttribute('style', style); }catch(e){}
        }

        function clearHighlight(){
          if(selectedEl){
            var orig = selectedEl.getAttribute('data-annot-orig-style') || '';
            setStyle(selectedEl, orig);
          }
          selectedEl = null;
        }

        function highlightByKey(key){
          clearHighlight();
          var el = svg.querySelector('#'+cssEscape(key)) || svg.querySelector('[data-annot-key="'+key+'"]');
          if(!el) return;
          selectedEl = el;
          if(!el.getAttribute('data-annot-orig-style')){
            el.setAttribute('data-annot-orig-style', el.getAttribute('style') || '');
          }
          var base = el.getAttribute('data-annot-orig-style') || '';
          setStyle(el, base + '; filter: drop-shadow(0 0 6px rgba(59,130,246,.75)); outline: 2px solid rgba(59,130,246,.95); outline-offset: 2px;');
        }

        function setDetails(key){
          selBadge.textContent = 'Selected: ' + key;
          if(selectedKeyLabel) selectedKeyLabel.textContent = 'Key: ' + key;
          emptyState.style.display = 'none';
          detailBody.style.display = 'block';

          var a = annotations[key] || {};
          var notes = (a.description || '').trim();
          notesBox.textContent = notes ? notes : 'Add notes under Notes.';
          if(notesChip) notesChip.textContent = notes ? 'Notes captured' : 'No notes yet';

          while(commentsList.firstChild) commentsList.removeChild(commentsList.firstChild);
          var comments = (a.comments || []).filter(Boolean);
          if(commentsChip) commentsChip.textContent = comments.length + (comments.length === 1 ? ' comment' : ' comments');
          if(!comments.length){
            noComments.style.display = 'block';
          } else {
            noComments.style.display = 'none';
            for(var i=0;i<comments.length;i++){
              var text = comments[i] && comments[i].text;
              if(!text) continue;
              var card = document.createElement('div');
              card.className = 'commentCard';
              card.textContent = text;
              var meta = document.createElement('span');
              meta.className = 'ts';
              meta.textContent = comments[i].createdAt ? new Date(comments[i].createdAt).toLocaleString() : '';
              card.appendChild(meta);
              commentsList.appendChild(card);
            }
            if(!commentsList.childElementCount){ noComments.style.display = 'block'; }
          }
        }

        svg.addEventListener('click', function(evt){
          var key = findKey(evt.target);
          if(!key) return;
          highlightByKey(key);
          setDetails(key);
        });
      })();
    </script>
  </div>
</body>
</html>`;
}

function copyText(text: string) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DetailsField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  className = "",
  textarea,
  readOnly,
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  textarea?: boolean;
  readOnly?: boolean;
}) {
  const shared = {
    value: value ?? "",
    onChange: (e: any) => onChange?.(e.target.value),
    placeholder,
    readOnly,
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Label className="text-slate-700">{label}</Label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {textarea ? (
        <Textarea className="min-h-[90px] bg-white" {...shared} />
      ) : (
        <Input className="bg-white" {...shared} />
      )}
    </div>
  );
}

const Panel = ({ title, children, actions }: any) => (
  <Card className="bg-white/90 border-slate-200 shadow-xl">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-lg font-semibold text-slate-800">{title}</CardTitle>
      {actions}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const SelectionInfo = ({
  svgStats,
  editMode,
  setEditMode,
  selectedKey,
  setSelectedKey,
  annotations,
}: any) => (
  <Card className="bg-white/90 border-slate-200 shadow-xl">
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">SVG Overview</p>
          <CardTitle className="text-xl font-semibold text-slate-900">{svgStats.name || "Untitled"}</CardTitle>
          <p className="text-sm text-slate-600">{svgStats.message || "Click a shape to annotate it."}</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700">
          <Switch checked={editMode} onCheckedChange={setEditMode} />
          <div>
            <div className="font-semibold text-slate-900">{editMode ? "Edit" : "View"}</div>
            <div className="text-xs text-slate-500">Toggle to switch mode</div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-slate-700">
        <Badge className="bg-slate-100 border-slate-200 text-slate-700">{svgStats.nodes} items</Badge>
        <Badge className="bg-slate-100 border-slate-200 text-slate-700">{svgStats.annotated} annotated</Badge>
        <Badge className="bg-slate-100 border-slate-200 text-slate-700">{svgStats.comments} comments</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm text-slate-600">
        <AnimatedPill onClick={() => setSelectedKey(null)}>
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <div>
            <div className="font-semibold text-slate-900">Deselect</div>
            <div className="text-xs text-slate-500">Clear active selection</div>
          </div>
        </AnimatedPill>
        <AnimatedPill onClick={() => setSelectedKey(selectedKey)}>
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <div>
            <div className="font-semibold text-slate-900">Focus active</div>
            <div className="text-xs text-slate-500">Keep current selection</div>
          </div>
        </AnimatedPill>
        <AnimatedPill>
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <div>
            <div className="font-semibold text-slate-900">{selectedKey ? "Selected item" : "Waiting for click"}</div>
            <div className="text-xs text-slate-500">
              {selectedKey
                ? `${selectedKey} — ${(annotations[selectedKey]?.title || "(no label)").slice(0, 50)}`
                : "Click an element inside the SVG"}
            </div>
          </div>
        </AnimatedPill>
      </div>
    </CardContent>
  </Card>
);

const CommentsPanel = ({
  comments,
  onAdd,
  onDelete,
  editable,
  disabled,
}: {
  comments: CommentItem[];
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
  editable: boolean;
  disabled?: boolean;
}) => {
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30">
            <MessageSquare className="h-4 w-4 text-blue-300" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Comments</div>
            <div className="text-xs text-slate-500">Quick thoughts tied to this element</div>
          </div>
        </div>
        <Badge className="bg-slate-100 text-slate-700 border-slate-200">{comments.length} total</Badge>
      </div>

      <div className="space-y-2 max-h-48 overflow-auto">
        {comments.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600 text-center">
            No comments yet. Share quick feedback here.
          </div>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="group rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5 transition-colors hover:border-blue-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm text-slate-900 leading-snug">{c.text}</div>
                <div className="text-[11px] text-slate-500">{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              {editable && (
                <button
                  className="mt-1 inline-flex rounded-lg border border-transparent p-1 text-xs text-slate-500 transition-colors hover:border-red-500/30 hover:bg-red-50 hover:text-red-500"
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editable && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/10 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Drop a quick thought</span>
            <span>{draft.trim().length} chars</span>
          </div>
          <Textarea
            value={draft}
            onChange={(e: any) => setDraft(e.target.value)}
            placeholder="Add a quick note or observation"
            disabled={disabled}
            className="bg-white border-slate-200"
          />
          <div className="flex justify-end">
            <AnimatedButton onClick={submit} disabled={!draft.trim() || disabled}>
              Add Comment
            </AnimatedButton>
          </div>
        </div>
      )}
    </div>
  );
};

const ExportPanel = ({
  svgMarkup,
  annotations,
  onCopy,
  onDownload,
  onPreview,
  disabled,
  format,
  setFormat,
  resultText,
}: any) => (
  <Panel
    title="Export"
    actions={
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Format</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-800"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="html">HTML (offline package)</option>
          <option value="svg">SVG (with metadata)</option>
          <option value="json">JSON</option>
        </select>
      </div>
    }
  >
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Export the annotated SVG as a shareable bundle. HTML includes a read-only viewer, SVG embeds metadata,
        and JSON captures raw notes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <AnimatedButton className="w-full" onClick={() => onDownload(format)} disabled={disabled}>
          <Download className="h-4 w-4 mr-2" /> Download
        </AnimatedButton>
        <AnimatedButton className="w-full" onClick={() => onCopy(format)} disabled={disabled}>
          <Copy className="h-4 w-4 mr-2" /> Copy
        </AnimatedButton>
        <AnimatedButton className="w-full" onClick={() => onPreview(format)} disabled={disabled}>
          <ExternalLink className="h-4 w-4 mr-2" /> Preview
        </AnimatedButton>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Preview</div>
            <div className="text-xs text-slate-500">Shows the generated output</div>
          </div>
          <Badge className="bg-slate-100 text-slate-700 border-slate-200">
            {format.toUpperCase()} Preview
          </Badge>
        </div>
        <Textarea value={resultText} readOnly className="min-h-[220px] font-mono text-xs" />
      </div>
    </div>
  </Panel>
);

function useLocalAnnotations() {
  const [state, setState] = useState<{ svg: string | null; annotations: Record<string, Annotation> }>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { svg: null, annotations: {} };
      const parsed = JSON.parse(raw);
      return { svg: parsed.svg || null, annotations: parsed.annotations || {} };
    } catch {
      return { svg: null, annotations: {} };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  return [state, setState] as const;
}

function useSvgStats(svgMarkup: string | null, annotations: Record<string, Annotation>) {
  return useMemo(() => {
    if (!svgMarkup) return { nodes: 0, annotated: 0, comments: 0, name: "", message: "Upload an SVG to begin." };

    const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    const svg = doc.querySelector("svg");
    const nodes = svg ? svg.querySelectorAll("[id], [data-annot-key]").length : 0;
    const annotated = Object.keys(annotations).length;
    const comments = Object.values(annotations).reduce((sum, a) => sum + (a.comments?.length || 0), 0);

    const name = svg?.getAttribute("id") || svg?.getAttribute("data-name") || svg?.getAttribute("name") || "SVG";

    return { nodes, annotated, comments, name, message: nodes ? "Click an element to annotate." : "No selectable nodes found." };
  }, [svgMarkup, annotations]);
}

function SvgPane({ svgMarkup, selectedKey, setSelectedKey }: any) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!svgMarkup) {
      host.innerHTML = "<div class='text-slate-500'>Upload an SVG to start.</div>";
      return;
    }

    host.innerHTML = svgMarkup;
    const svg = host.querySelector("svg");
    if (!svg) return;

    function findKey(el: Element | null): string | null {
      if (!el || el === svg) return null;
      const key = getElementKey(el);
      if (key) return key;
      return findKey(el.parentElement);
    }

    const handleClick = (evt: Event) => {
      const key = findKey(evt.target as Element | null);
      if (key) setSelectedKey(key);
    };

    svg.addEventListener("click", handleClick);
    return () => svg.removeEventListener("click", handleClick);
  }, [svgMarkup, setSelectedKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    svg.querySelectorAll("[data-annot-highlight]").forEach((el) => {
      el.removeAttribute("data-annot-highlight");
      const orig = el.getAttribute("data-annot-orig-style");
      if (orig) el.setAttribute("style", orig);
    });

    if (!selectedKey) return;
    const el = svg.querySelector(`#${cssEscapeSafe(selectedKey)}`) || svg.querySelector(`[data-annot-key="${selectedKey}"]`);
    if (!el) return;
    if (!el.getAttribute("data-annot-orig-style")) el.setAttribute("data-annot-orig-style", el.getAttribute("style") || "");
    const base = el.getAttribute("data-annot-orig-style") || "";
    el.setAttribute(
      "style",
      `${base}; filter: drop-shadow(0 0 6px rgba(59,130,246,.8)); outline: 2px solid rgba(59,130,246,.9); outline-offset: 2px;`
    );
    el.setAttribute("data-annot-highlight", "true");
  }, [selectedKey, svgMarkup]);

  return <div ref={hostRef} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-inner shadow-black/5" />;
}

function DetailsPane({
  selectedKey,
  annotations,
  setAnnotations,
  editMode,
}: {
  selectedKey: string | null;
  annotations: Record<string, Annotation>;
  setAnnotations: (a: Record<string, Annotation>) => void;
  editMode: boolean;
}) {
  if (!selectedKey) {
    return (
      <Panel title="Details">
        <div className="text-sm text-slate-400">Select an element in the SVG to view or edit its details.</div>
      </Panel>
    );
  }

  const data = annotations[selectedKey] || { title: "", description: "", comments: [] };
  const update = (patch: Partial<Annotation>) => {
    setAnnotations({
      ...annotations,
      [selectedKey]: { ...data, ...patch, comments: patch.comments ?? data.comments },
    });
  };

  const hasNotes = Boolean(data.description?.trim());
  const commentCount = data.comments?.length || 0;

  return (
    <Panel
      title={`Details — ${selectedKey}`}
      actions={!editMode && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">View only</Badge>}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-4 shadow-inner shadow-blue-200/40">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active element
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <StickyNote className="h-4 w-4 text-blue-500" />
                {data.title || "Untitled element"}
              </div>
              <div className="text-xs text-slate-500 break-all">Key: {selectedKey}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                {hasNotes ? "Notes added" : "No notes yet"}
              </Badge>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">{commentCount} comments</Badge>
            </div>
          </div>
        </div>

        <DetailsField
          label="Label"
          hint="Readable name"
          value={data.title}
          onChange={(v) => editMode && update({ title: v })}
          placeholder="What is this?"
          readOnly={!editMode}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/10"
        />
        <DetailsField
          label="Notes"
          hint="What to tell execs"
          value={data.description}
          onChange={(v) => editMode && update({ description: v })}
          placeholder="Explain what this element means"
          textarea
          readOnly={!editMode}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/10"
        />
        <CommentsPanel
          comments={data.comments || []}
          onAdd={(text) =>
            update({ comments: [...(data.comments || []), { id: uuid(), text, createdAt: nowIso() }] })
          }
          onDelete={(id) => update({ comments: data.comments.filter((c) => c.id !== id) })}
          editable={editMode}
          disabled={!selectedKey}
        />
      </div>
    </Panel>
  );
}

function ExportGenerator({ svgMarkup, annotations }: any) {
  const [format, setFormat] = useState<ExportFormat>("html");

  const resultText = useMemo(() => {
    if (!svgMarkup) return "Upload and annotate to preview exports.";

    if (format === "html") return buildHtmlPackage(svgMarkup, annotations);
    if (format === "svg") return buildAnnotatedSvg(svgMarkup, annotations);
    if (format === "json") return JSON.stringify({ exportedAt: nowIso(), annotations }, null, 2);

    return "";
  }, [format, svgMarkup, annotations]);

  function onCopy(fmt: ExportFormat) {
    if (!resultText) return;
    copyText(resultText);
  }

  function onDownload(fmt: ExportFormat) {
    if (!resultText) return;
    const ext = fmt === "html" ? "html" : fmt === "svg" ? "svg" : "json";
    downloadFile(`svg-annotations.${ext}`, resultText);
  }

  function onPreview(fmt: ExportFormat) {
    if (!resultText) return;
    const blob = new Blob([resultText], { type: fmt === "html" ? "text/html" : "text/plain" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <ExportPanel
      svgMarkup={svgMarkup}
      annotations={annotations}
      onCopy={onCopy}
      onDownload={onDownload}
      onPreview={onPreview}
      disabled={!svgMarkup}
      format={format}
      setFormat={setFormat}
      resultText={resultText}
    />
  );
}

function Uploader({ onUpload }: { onUpload: (markup: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result?.toString() || "";
      const { svg, error } = safeParseSvg(text);
      if (error || !svg) {
        setError(error || "Invalid SVG file.");
        return;
      }
      setError(null);
      onUpload(svg);
    };
    reader.readAsText(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-2">
      <div
        className="border-2 border-dashed border-slate-300 rounded-2xl p-6 bg-white/90 text-center text-slate-700 hover:border-blue-400 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-blue-500" />
          <div className="font-semibold text-slate-900">Drop SVG here or use the file picker</div>
          <div className="text-sm text-slate-600">We strip scripts and make elements clickable automatically.</div>
          <div className="mt-3">
            <input type="file" accept=".svg" onChange={onInputChange} className="hidden" id="svgUploader" />
            <label
              htmlFor="svgUploader"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition"
            >
              Choose SVG
            </label>
          </div>
        </div>
      </div>
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
}

export default function InteractiveSvgAnnotator() {
  const [editMode, setEditMode] = useState(true);
  const [state, setState] = useLocalAnnotations();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const stats = useSvgStats(state.svg, state.annotations);

  function updateAnnotations(next: Record<string, Annotation>) {
    setState({ ...state, annotations: next });
  }

  function handleUpload(svgMarkup: string) {
    setState({ svg: svgMarkup, annotations: {} });
    setSelectedKey(null);
  }

  function removeSvg() {
    setState({ svg: null, annotations: {} });
    setSelectedKey(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Interactive SVG Annotator</h1>
            <p className="text-sm text-slate-600">Upload an SVG, click elements, add notes, and export.</p>
          </div>
          {state.svg && (
            <AnimatedButton className="bg-rose-500 hover:bg-rose-400 text-white" onClick={removeSvg}>
              <Trash2 className="h-4 w-4 mr-2" /> Reset SVG
            </AnimatedButton>
          )}
        </div>

        {!state.svg && <Uploader onUpload={handleUpload} />}

        {state.svg && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <SelectionInfo
                svgStats={stats}
                editMode={editMode}
                setEditMode={setEditMode}
                selectedKey={selectedKey}
                setSelectedKey={setSelectedKey}
                annotations={state.annotations}
              />
              <Card className="bg-white/90 border-slate-200 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">SVG Canvas</CardTitle>
                  <p className="text-sm text-slate-600">Click an element to select and annotate it.</p>
                </CardHeader>
                <CardContent>
                  <SvgPane svgMarkup={state.svg} selectedKey={selectedKey} setSelectedKey={setSelectedKey} />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <DetailsPane
                selectedKey={selectedKey}
                annotations={state.annotations}
                setAnnotations={updateAnnotations}
                editMode={editMode}
              />
              <ExportGenerator svgMarkup={state.svg} annotations={state.annotations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
