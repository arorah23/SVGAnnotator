import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Copy, Download, ExternalLink, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

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
    :root{--card:#0f172a;--muted:#94a3b8;--border:rgba(148,163,184,.25);--accent:#3b82f6;}
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:linear-gradient(180deg,#0b1220,#060a13); color:white;}
    .wrap{max-width:1200px;margin:0 auto;padding:18px;}
    .top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}
    .title{font-weight:700;letter-spacing:-.02em}
    .sub{color:var(--muted);font-size:13px;margin-top:4px;max-width:70ch}
    .grid{display:grid;grid-template-columns:1fr 360px;gap:14px;margin-top:14px;}
    @media (max-width: 980px){.grid{grid-template-columns:1fr;}}
    .card{background:rgba(15,23,42,.6);border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.35);}
    .card .hd{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:center;font-weight:700;}
    .card .bd{padding:14px;}
    .badge{display:inline-flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-size:12px;}
    .svgBox{background:rgba(2,6,23,.45);border:1px solid var(--border);border-radius:16px;padding:12px;overflow:auto;}
    .k{color:#e2e8f0;}
    .muted{color:var(--muted);font-size:13px;line-height:1.45}
    .box{border:1px solid var(--border);border-radius:14px;padding:10px;background:rgba(2,6,23,.35);white-space:pre-wrap}
    .list{margin:0;padding-left:18px;color:#e2e8f0;font-size:13px;}
    .list li{margin:6px 0;}
    .hint{margin-top:10px;color:var(--muted);font-size:12px}

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

          <div id="detailBody" style="display:none">
            <div style="margin-top:10px">
              <div class="muted" style="margin-bottom:6px">Notes</div>
              <div class="box" id="notesBox"></div>
            </div>

            <div style="margin-top:12px">
              <div class="muted" style="margin-bottom:6px">Comments</div>
              <div class="box">
                <ul class="list" id="commentsList"></ul>
                <div class="muted" id="noComments" style="display:none">Add comment under Comments.</div>
              </div>
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
          emptyState.style.display = 'none';
          detailBody.style.display = 'block';

          var a = annotations[key] || {};
          var notes = (a.description || '').trim();
          notesBox.textContent = notes ? notes : 'Add notes under Notes.';

          while(commentsList.firstChild) commentsList.removeChild(commentsList.firstChild);
          var comments = (a.comments || []).map(function(c){return c && c.text;}).filter(Boolean);
          if(!comments.length){
            noComments.style.display = 'block';
          } else {
            noComments.style.display = 'none';
            for(var i=0;i<comments.length;i++){
              var li = document.createElement('li');
              li.textContent = comments[i];
              commentsList.appendChild(li);
            }
          }
        }

        svg.addEventListener('click', function(e){
          var key = findKey(e.target);
          if(!key) return;
          highlightByKey(key);
          setDetails(key);
        }, false);
      })();
    </script>
  </div>
</body>
</html>`;
}

function runSelfTests() {
  // Test 1: safeParseSvg keeps existing ids selectable
  const sampleWithIds = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
    <g id="iconA"><rect x="5" y="5" width="20" height="20"/></g>
    <g id="iconB"><circle cx="60" cy="15" r="10"/></g>
  </svg>`;

  const r1 = safeParseSvg(sampleWithIds);
  if (!r1.svg || r1.error) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] safeParseSvg failed (ids)", r1);
    return;
  }

  const doc1 = new DOMParser().parseFromString(r1.svg, "image/svg+xml");
  const svg1 = doc1.querySelector("svg");
  const selectable1 = svg1 ? svg1.querySelectorAll("[id], [data-annot-key]") : null;
  if (!selectable1 || selectable1.length < 2) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] Expected selectable elements (ids)");
  }

  // Test 2: safeParseSvg auto-assigns keys when no ids exist
  const sampleNoIds = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
    <g><rect x="5" y="5" width="20" height="20"/></g>
    <path d="M 50 5 L 90 5 L 90 25 L 50 25 Z" />
  </svg>`;

  const r2 = safeParseSvg(sampleNoIds);
  if (!r2.svg || r2.error) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] safeParseSvg failed (no ids)", r2);
    return;
  }

  const doc2 = new DOMParser().parseFromString(r2.svg, "image/svg+xml");
  const svg2 = doc2.querySelector("svg");
  const hasAuto = svg2 ? svg2.querySelectorAll("[data-annot-key]") : null;
  if (!hasAuto || hasAuto.length === 0) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] Expected auto keys for SVG with no ids");
  }

  // Test 3: buildAnnotatedSvg embeds metadata
  const annotated = buildAnnotatedSvg(r2.svg, {
    auto_1: {
      title: "Icon 1",
      description: "Hello",
      comments: [{ id: "c1", text: "Hi", createdAt: nowIso() }],
    },
  });
  const doc3 = new DOMParser().parseFromString(annotated, "image/svg+xml");
  if (!doc3.querySelector("metadata#svg-annotator-metadata")) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] Annotated SVG missing metadata");
  }

  // Test 4: buildHtmlPackage contains markers and guidance
  const html = buildHtmlPackage(r2.svg, { auto_1: { title: "", description: "", comments: [] } });
  if (!html.includes("svg-annotator-package") || !html.includes("annotationsJson")) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] HTML package missing markers");
  }
  if (!html.includes("Add notes under Notes") || !html.includes("Add comment under Comments")) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] HTML package missing guidance text");
  }

  // Test 5: cssEscapeSafe can find ids with special chars
  const colonSvg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><g id="a:b"><rect width="10" height="10"/></g></svg>`;
  const r3 = safeParseSvg(colonSvg);
  if (!r3.svg || r3.error) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] safeParseSvg failed (colon id)", r3);
    return;
  }
  const d = new DOMParser().parseFromString(r3.svg, "image/svg+xml");
  const s = d.querySelector("svg");
  const found = s ? s.querySelector(`#${cssEscapeSafe("a:b")}`) : null;
  if (!found) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] cssEscapeSafe failed to find colon id");
  }

  // Test 6: ensure generated HTML doesn’t contain a literal closing script from SVG
  const trickySvg = `<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg><!-- </script> -->`;
  const html2 = buildHtmlPackage(trickySvg, {});
  if (html2.includes("</script><!--")) {
    // eslint-disable-next-line no-console
    console.error("[SvgAnnotator test] HTML package contains raw </script> sequence");
  }
}

function CommentsPanel({
  editable,
  comments,
  draft,
  setDraft,
  onSaveComment,
}: {
  editable: boolean;
  comments: CommentItem[];
  draft: string;
  setDraft: (v: string) => void;
  onSaveComment: () => void;
}) {
  const hasComments = (comments || []).length > 0;

  return (
    <div className="space-y-2">
      <Label className="text-sm">Comments</Label>

      {editable ? (
        <>
          <Textarea
            value={draft}
            placeholder="Add comment under Comments"
            className="min-h-[92px]"
            onChange={(e) => setDraft(e.target.value)}
          />

          {!hasComments ? (
            <div className="text-xs text-muted-foreground">
              Add comment under <span className="font-medium">Comments</span>.
            </div>
          ) : null}

          <AnimatedButton className="w-full" onClick={onSaveComment} disabled={!draft.trim()}>
            Add comment
          </AnimatedButton>

          {hasComments ? (
            <div className="rounded-2xl border bg-muted/10 p-3">
              <ul className="space-y-2">
                {comments
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((c) => (
                    <li key={c.id} className="rounded-xl border bg-background/50 p-2 text-sm">
                      <div className="whitespace-pre-wrap">{c.text}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
              </ul>
              {comments.length > 10 ? (
                <div className="mt-2 text-xs text-muted-foreground">Showing latest 10 comments.</div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border bg-muted/10 p-3 text-sm">
          {hasComments ? (
            <ul className="space-y-2">
              {comments
                .slice()
                .reverse()
                .slice(0, 10)
                .map((c) => (
                  <li key={c.id} className="rounded-xl border bg-background/50 p-2">
                    <div className="whitespace-pre-wrap">{c.text}</div>
                  </li>
                ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">No comments yet.</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SvgAnnotator() {
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const exportTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [svgText, setSvgText] = useState("");
  const [svgError, setSvgError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(true);

  // Drafts
  const [labelDraft, setLabelDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");

  // Export UX
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("html");
  const [exportFilename, setExportFilename] = useState("svg-notes.html");

  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({});

  useEffect(() => {
    const env =
      (typeof process !== "undefined" && (process as any).env && (process as any).env.NODE_ENV) ||
      "development";
    if (env !== "production") runSelfTests();
  }, []);

  // Load saved state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.svgText) setSvgText(parsed.svgText);
      if (parsed?.annotations) setAnnotations(parsed.annotations);
    } catch {
      // ignore
    }
  }, []);

  // Persist state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ svgText, annotations }, null, 2));
    } catch {
      // ignore
    }
  }, [svgText, annotations]);

  const parsedSvg = useMemo(() => {
    if (!svgText?.trim()) return { svg: null as string | null, error: null as string | null };
    return safeParseSvg(svgText);
  }, [svgText]);

  useEffect(() => {
    setSvgError(parsedSvg.error);
  }, [parsedSvg.error]);

  // Wire SVG click selection + highlight
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) return;

    const svgEl = host.querySelector("svg");
    if (!svgEl) return;

    const selectable = Array.from(svgEl.querySelectorAll("[id], [data-annot-key]"));

    // Cache original styles once
    selectable.forEach((el) => {
      if (!el.getAttribute("data-annot-orig-style")) {
        el.setAttribute("data-annot-orig-style", el.getAttribute("style") || "");
      }
    });

    function clearHighlight() {
      selectable.forEach((el) => {
        const orig = el.getAttribute("data-annot-orig-style") || "";
        el.setAttribute("style", orig);
        el.removeAttribute("data-selected");
      });
    }

    function highlight(key: string | null) {
      clearHighlight();
      if (!key) return;

      const el =
        svgEl.querySelector(`#${cssEscapeSafe(key)}`) ||
        svgEl.querySelector(`[data-annot-key=\"${key}\"]`);

      if (!el) return;
      el.setAttribute("data-selected", "true");

      const base = el.getAttribute("data-annot-orig-style") || "";
      el.setAttribute(
        "style",
        `${base}; filter: drop-shadow(0 0 6px rgba(59,130,246,.7)); outline: 2px solid rgba(59,130,246,.9); outline-offset: 2px;`
      );
    }

    function onClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;

      let el: Element | null = target;
      while (el && el !== svgEl && !getElementKey(el)) {
        el = el.parentElement;
      }

      const key = el && el !== svgEl ? getElementKey(el) : null;
      if (!key) return;
      setSelectedKey(key);
      highlight(key);
    }

    svgEl.addEventListener("click", onClick);
    highlight(selectedKey);

    return () => {
      svgEl.removeEventListener("click", onClick);
    };
  }, [parsedSvg.svg, selectedKey]);

  // Sync drafts on selection change
  useEffect(() => {
    setCommentDraft("");

    if (!selectedKey) {
      setLabelDraft("");
      setNotesDraft("");
      return;
    }

    const current = annotations[selectedKey] || { title: "", description: "", comments: [] };
    setLabelDraft(current.title || "");
    setNotesDraft(current.description || "");
  }, [selectedKey, annotations]);

  const selected = selectedKey ? annotations[selectedKey] : null;
  const selectedTitle = selected?.title || "";
  const selectedNotes = selected?.description || "";

  const annotatedCount = Object.keys(annotations).length;

  function upsertSelected(patch: Partial<Annotation>) {
    if (!selectedKey) return;
    setAnnotations((prev) => {
      const current = prev[selectedKey] || { title: "", description: "", comments: [] };
      return {
        ...prev,
        [selectedKey]: {
          ...current,
          ...patch,
          comments: patch.comments ?? current.comments ?? [],
        },
      };
    });
  }

  function addComment(text: string) {
    if (!selectedKey) return;
    const t = text.trim();
    if (!t) return;

    setAnnotations((prev) => {
      const current = prev[selectedKey] || { title: "", description: "", comments: [] };
      return {
        ...prev,
        [selectedKey]: {
          ...current,
          comments: [...(current.comments || []), { id: uuid(), text: t, createdAt: nowIso() }],
        },
      };
    });
  }

  function saveNotesOnly() {
    if (!selectedKey) return;
    upsertSelected({ title: labelDraft, description: notesDraft });
  }

  function saveCommentOnly() {
    if (!selectedKey) return;
    if (!commentDraft.trim()) return;
    addComment(commentDraft);
    setCommentDraft("");
  }

  function saveAll() {
    if (!selectedKey) return;
    upsertSelected({ title: labelDraft, description: notesDraft });
    if (commentDraft.trim()) {
      addComment(commentDraft);
      setCommentDraft("");
    }
  }

  function clearAll() {
    setAnnotations({});
    setSelectedKey(null);
  }

  function makeBlobUrl(text: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    return URL.createObjectURL(blob);
  }

  function downloadViaAnchor(filename: string, text: string, mime: string) {
    try {
      const url = makeBlobUrl(text, mime);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.target = "_blank";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch {
      return false;
    }
  }

  async function saveViaFilePicker(filename: string, text: string, mime: string, ext: string) {
    // @ts-ignore
    const picker = window.showSaveFilePicker;
    if (typeof picker !== "function") return false;

    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  async function copyToClipboard(text: string) {
    // Clipboard API can be blocked in previews/non-secure contexts.
    // Fallback: select textarea and execCommand copy.
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through
    }

    const ta = exportTextareaRef.current;
    if (ta) {
      try {
        ta.focus();
        ta.select();
        // @ts-ignore
        ta.setSelectionRange?.(0, ta.value.length);
        const ok = document.execCommand("copy");
        return ok;
      } catch {
        return false;
      }
    }

    return false;
  }

  function computeExport() {
    const baseSvgMarkup = parsedSvg.svg || svgText || "";

    let text = "";
    let filename = "";
    let mime = "";
    let ext = "";

    if (exportFormat === "html") {
      text = buildHtmlPackage(baseSvgMarkup, annotations);
      filename = "svg-notes.html";
      mime = "text/html";
      ext = "html";
    } else if (exportFormat === "svg") {
      text = buildAnnotatedSvg(baseSvgMarkup, annotations);
      filename = "diagram-annotated.svg";
      mime = "image/svg+xml";
      ext = "svg";
    } else {
      const payload = { exportedAt: nowIso(), svgText: baseSvgMarkup, annotations };
      text = JSON.stringify(payload, null, 2);
      filename = "svg-annotations.json";
      mime = "application/json";
      ext = "json";
    }

    return { text, filename, mime, ext };
  }

  async function exportData() {
    try {
      setExportStatus("");

      const { text, filename, mime, ext } = computeExport();
      setExportFilename(filename);
      setExportText(text);
      setExportOpen(true);

      // Try native save picker first
      const saved = await saveViaFilePicker(filename, text, mime, ext);
      if (saved) {
        setExportStatus("Saved via file picker.");
        return;
      }

      // Fallback to anchor download
      const downloaded = downloadViaAnchor(filename, text, mime);
      setExportStatus(
        downloaded
          ? "Download attempted (may be blocked in preview)."
          : "Download blocked — use Copy."
      );
    } catch (e) {
      setExportStatus("Export blocked — use Copy.");
      // eslint-disable-next-line no-console
      console.error("Export failed", e);
    }
  }

  async function handleCopyExport() {
    if (!exportText) return;
    const ok = await copyToClipboard(exportText);
    setExportStatus(ok ? "Copied to clipboard." : "Copy blocked — Ctrl/Cmd+A then Ctrl/Cmd+C.");
  }

  function handleDownloadExport() {
    if (!exportText) return;
    const mime =
      exportFormat === "html"
        ? "text/html"
        : exportFormat === "svg"
          ? "image/svg+xml"
          : "application/json";
    const ok = downloadViaAnchor(exportFilename, exportText, mime);
    setExportStatus(ok ? "Download attempted." : "Download blocked — use Copy.");
  }

  function handlePreviewExport() {
    if (!exportText) return;
    if (exportFormat !== "html") {
      setExportStatus("Preview is only available for HTML exports.");
      return;
    }
    try {
      const url = makeBlobUrl(exportText, "text/html");
      window.open(url, "_blank", "noopener,noreferrer");
      setExportStatus("Opened preview in a new tab.");
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setExportStatus("Preview blocked — use Download or Copy.");
    }
  }

  function onUploadSvg(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setSelectedKey(null);
      setSvgText(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen w-full bg-background p-4 md:p-6">
      <style>{`
        .svg-annotator svg [id],
        .svg-annotator svg [data-annot-key]{
          transition: filter .15s ease, outline .15s ease;
        }
        .svg-annotator svg [id]:hover,
        .svg-annotator svg [data-annot-key]:hover{
          filter: drop-shadow(0 0 6px rgba(59,130,246,.35));
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-4">
        {exportStatus ? (
          <div className="rounded-2xl border bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
            {exportStatus}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Interactive SVG – click-to-explain</h1>
            <p className="text-sm text-muted-foreground">
              Upload an SVG, click any icon/shape to view notes and comments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border px-3 py-2">
              <Switch id="edit" checked={editMode} onCheckedChange={setEditMode} />
              <Label htmlFor="edit" className="text-sm">
                Edit mode
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-xl border bg-background px-3 text-sm"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              >
                <option value="html">Export as: HTML (best for execs)</option>
                <option value="json">Export as: JSON</option>
                <option value="svg" disabled={!svgText?.trim()}>
                  Export as: Annotated SVG (hover tooltips)
                </option>
              </select>

              <AnimatedButton variant="secondary" onClick={exportData}>
                <Download className="mr-2 h-4 w-4" /> Export
              </AnimatedButton>
            </div>

            <AnimatedButton variant="outline" onClick={clearAll}>
              <Trash2 className="mr-2 h-4 w-4" /> Clear notes
            </AnimatedButton>
          </div>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {/* LEFT: SVG */}
              <div className="md:col-span-8">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Annotated: {annotatedCount}</Badge>
                      {selectedKey ? (
                        <Badge>Selected: {selectedKey}</Badge>
                      ) : (
                        <Badge variant="outline">Nothing selected</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <AnimatedPill>
                        <Upload className="h-4 w-4" />
                        <span>Upload SVG</span>
                        <Input
                          type="file"
                          accept="image/svg+xml,.svg"
                          className="sr-only"
                          onChange={(e) => onUploadSvg(e.target.files?.[0] || undefined)}
                        />
                      </AnimatedPill>
                    </div>
                  </div>

                  {svgError ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <div className="font-medium text-destructive">SVG error</div>
                      <div className="text-muted-foreground">{svgError}</div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border bg-muted/20 p-3">
                    {!svgText?.trim() ? (
                      <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">
                        Upload an SVG to begin. For best usability, ensure each icon/group has a meaningful{" "}
                        <span className="font-mono">id</span>.
                      </div>
                    ) : (
                      <div
                        ref={svgHostRef}
                        className="svg-annotator w-full overflow-auto rounded-2xl bg-background p-4"
                        dangerouslySetInnerHTML={{ __html: parsedSvg.svg || "" }}
                      />
                    )}
                  </div>

                  {svgText?.trim() ? (
                    <div className="text-xs text-muted-foreground">
                      Tip: If clicking feels “too granular”, group paths into a{" "}
                      <span className="font-mono">&lt;g id=&quot;...&quot;&gt;</span> per icon before exporting.
                    </div>
                  ) : null}
                </div>
              </div>

              {/* RIGHT: DETAILS */}
              <div className="md:col-span-4">
                <Card className="rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-center">Details</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {!selectedKey ? (
                      <div className="text-sm text-muted-foreground">
                        Click an icon in the SVG to see its Notes and Comments.
                      </div>
                    ) : (
                      <>
                        {/* Edit-only extras */}
                        {editMode ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">Item</div>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {selectedKey}
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm">Label</Label>
                              <Input
                                value={labelDraft}
                                placeholder="Optional label (friendly name)"
                                onChange={(e) => setLabelDraft(e.target.value)}
                              />
                            </div>
                          </div>
                        ) : null}

                        {/* Notes */}
                        <div className="space-y-2">
                          <Label className="text-sm">Notes</Label>

                          {editMode ? (
                            <>
                              <Textarea
                                value={notesDraft}
                                placeholder="Add notes under Notes"
                                className="min-h-[120px]"
                                onChange={(e) => setNotesDraft(e.target.value)}
                              />

                              {!notesDraft.trim() ? (
                                <div className="text-xs text-muted-foreground">
                                  Add notes under <span className="font-medium">Notes</span>.
                                </div>
                              ) : null}

                              <AnimatedButton
                                className="w-full"
                                onClick={saveNotesOnly}
                                disabled={
                                  !selectedKey ||
                                  (labelDraft === selectedTitle && notesDraft === selectedNotes)
                                }
                              >
                                Add notes
                              </AnimatedButton>
                            </>
                          ) : (
                            <div className="rounded-2xl border bg-muted/10 p-3 text-sm">
                              {selectedNotes.trim() ? (
                                selectedNotes
                              ) : (
                                <span className="text-muted-foreground">Add notes under Notes.</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Comments */}
                        <CommentsPanel
                          editable={editMode}
                          comments={selected?.comments || []}
                          draft={commentDraft}
                          setDraft={setCommentDraft}
                          onSaveComment={saveCommentOnly}
                        />

                        {/* Save both */}
                        {editMode ? (
                          <AnimatedButton
                            variant="secondary"
                            className="w-full"
                            onClick={saveAll}
                            disabled={
                              !selectedKey ||
                              (!commentDraft.trim() &&
                                labelDraft === selectedTitle &&
                                notesDraft === selectedNotes)
                            }
                          >
                            Save all
                          </AnimatedButton>
                        ) : null}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export panel */}
        {exportOpen ? (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Export contains <span className="font-medium">ALL</span> notes and comments for the image.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AnimatedButton variant="outline" onClick={handleCopyExport}>
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </AnimatedButton>
                  <AnimatedButton variant="outline" onClick={handleDownloadExport}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </AnimatedButton>
                  <AnimatedButton
                    variant="outline"
                    onClick={handlePreviewExport}
                    disabled={exportFormat !== "html"}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Preview
                  </AnimatedButton>
                </div>
              </div>

              <Textarea
                ref={exportTextareaRef}
                value={exportText}
                readOnly
                className="min-h-[220px] font-mono text-xs"
              />

              <div className="text-xs text-muted-foreground">
                Tip: For execs, use <span className="font-medium">HTML</span> export — they can open it in any browser and click items to see details.
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
