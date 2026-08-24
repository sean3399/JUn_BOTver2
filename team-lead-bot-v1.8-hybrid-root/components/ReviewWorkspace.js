"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  Loader2,
  MapPin,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { compareReviewVersions } from "@/lib/reviewWorkflow";

const AXIS_LABEL = {
  facts: "사실성",
  causality: "인과성",
  legitimacy: "정당성",
  proportionality: "비례성",
  execution: "실행성",
  communication: "전달성",
};

const READINESS = {
  READY: { label: "Ready", cls: "bg-[#E6F4EA] text-[#2E7D32]" },
  READY_WITH_RISK: { label: "Ready with Risk", cls: "bg-[#FFF4CE] text-[#7A5A00]" },
  NOT_READY: { label: "Not Ready", cls: "bg-[#FDE7E9] text-[#A4262C]" },
};

const FORMAT_BUTTONS = [
  { key: "teams", label: "Teams" },
  { key: "mail", label: "이메일" },
  { key: "oral", label: "구두 30초" },
  { key: "onepage", label: "1페이지" },
  { key: "three", label: "결론 3줄" },
];

function normalizedProjectKey(review) {
  const raw = review?.fileNames?.[0] || review?.files?.[0]?.name || "검토 문서";
  return String(raw)
    .replace(/\.[^.]+$/, "")
    .replace(/(?:\s|_|-)*(?:v|ver|version)\s*\d+(?:\.\d+)?$/i, "")
    .replace(/(?:\s|_|-)*(?:20\d{6}|(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))$/i, "")
    .replace(/(?:\s|_|-)*(?:최종|수정본|수정|final)$/i, "")
    .replace(/\(\d+\)$/g, "")
    .trim() || raw;
}

function Badge({ children, className = "bg-[#F3F3F3] text-[#616161]" }) {
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>;
}

function Delta({ value }) {
  const n = Number(value || 0);
  if (!n) return <span className="text-[#8A8886]">0</span>;
  return <span className={n > 0 ? "text-[#2E7D32]" : "text-[#A4262C]"}>{n > 0 ? `+${n}` : n}</span>;
}

export default function ReviewWorkspace({ reviews, onPatchReview, authHeaders }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const review of reviews) {
      const key = normalizedProjectKey(review);
      const arr = map.get(key) || [];
      arr.push(review);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return [...map.entries()];
  }, [reviews]);

  const [projectKey, setProjectKey] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!grouped.length) return;
    const exists = grouped.some(([key]) => key === projectKey);
    if (!exists) setProjectKey(grouped[grouped.length - 1][0]);
  }, [grouped, projectKey]);

  const versions = useMemo(() => grouped.find(([key]) => key === projectKey)?.[1] || [], [grouped, projectKey]);
  const selected = useMemo(() => {
    if (!versions.length) return null;
    return versions.find((x) => x.reviewId === selectedReviewId) || versions[versions.length - 1];
  }, [versions, selectedReviewId]);

  useEffect(() => {
    if (selected?.reviewId && selected.reviewId !== selectedReviewId) setSelectedReviewId(selected.reviewId);
    setFeedbackText(selected?.actualFeedback || "");
  }, [selected?.reviewId]);

  const selectedIndex = selected ? versions.findIndex((x) => x.reviewId === selected.reviewId) : -1;
  const previous = selectedIndex > 0 ? versions[selectedIndex - 1] : null;
  const comparison = useMemo(() => compareReviewVersions(previous, selected), [previous, selected]);
  const readiness = READINESS[selected?.reviewSummary?.readiness] || READINESS.NOT_READY;
  const visualFiles = (selected?.files || []).filter((file) => file?.visualReview?.enabled);

  async function workflow(action, payload, busy) {
    setError("");
    setBusyKey(busy);
    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리 실패");
      return data.result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusyKey("");
    }
  }

  async function createFix(issue) {
    if (!selected) return;
    const result = await workflow("suggest_fix", {
      issue,
      acceptedEdits: selected.acceptedEdits || [],
    }, `fix:${issue.id}`);
    if (!result) return;
    onPatchReview(selected.reviewId, {
      fixSuggestions: { ...(selected.fixSuggestions || {}), [issue.id]: result },
    });
  }

  function acceptFix(issue) {
    const suggestion = selected?.fixSuggestions?.[issue.id];
    if (!suggestion?.suggestedText) return;
    const rest = (selected.acceptedEdits || []).filter((x) => x.issueId !== issue.id);
    onPatchReview(selected.reviewId, {
      acceptedEdits: [...rest, {
        issueId: issue.id,
        issueTitle: issue.title,
        text: suggestion.suggestedText,
        acceptedAt: Date.now(),
      }],
    });
  }

  async function compareFeedback() {
    if (!selected || !feedbackText.trim()) return;
    const result = await workflow("compare_feedback", {
      issues: selected.issues || [],
      actualFeedback: feedbackText,
    }, "feedback");
    if (!result) return;
    onPatchReview(selected.reviewId, { actualFeedback: feedbackText.trim(), feedbackComparison: result });
  }

  async function generateSubmission(format) {
    if (!selected) return;
    const result = await workflow("submit_package", {
      format,
      analysis: selected.analysis,
      issues: selected.issues || [],
      acceptedEdits: selected.acceptedEdits || [],
      files: selected.files || [],
      note: selected.note || "",
    }, `submit:${format}`);
    if (!result) return;
    onPatchReview(selected.reviewId, {
      submission: { format, text: result.text, generatedAt: Date.now() },
    });
  }

  async function copySubmission() {
    const text = selected?.submission?.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {}
  }

  if (!reviews.length) {
    return (
      <div className="h-full flex items-center justify-center px-6 bg-[#FAFAFA]">
        <div className="max-w-md text-center">
          <div className="w-11 h-11 rounded-full bg-[#EBEBF9] text-[#5B5FC7] flex items-center justify-center mx-auto"><ClipboardCheck size={20} /></div>
          <div className="font-semibold mt-3">Review Cycle</div>
          <p className="text-sm text-[#616161] mt-1.5 leading-relaxed">파일을 검토하면 지적사항별 수정안, 근거 위치, 수정본 비교, 상신본, 실제 피드백 적중도를 여기서 이어서 관리합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAFA] px-4 sm:px-6 py-5">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-semibold text-base">Review Cycle</div>
              <Badge className={readiness.cls}>{readiness.label}</Badge>
            </div>
            <div className="text-xs text-[#777] mt-1">검토 → 수정안 → 수정본 비교 → 상신 → 실제 피드백 검증</div>
          </div>
          <div className="flex items-center gap-2">
            {grouped.length > 1 && (
              <select value={projectKey} onChange={(e) => { setProjectKey(e.target.value); setSelectedReviewId(""); }} className="text-xs border border-[#DADADA] rounded-lg bg-white px-2.5 py-2 outline-none max-w-[220px]">
                {grouped.map(([key]) => <option key={key} value={key}>{key}</option>)}
              </select>
            )}
            {versions.length > 1 && (
              <div className="relative">
                <select value={selected?.reviewId || ""} onChange={(e) => setSelectedReviewId(e.target.value)} className="appearance-none text-xs border border-[#DADADA] rounded-lg bg-white pl-2.5 pr-7 py-2 outline-none">
                  {versions.map((r, i) => <option key={r.reviewId} value={r.reviewId}>Version {i + 1}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-2.5 text-[#777] pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-[#E2E2E2] bg-white p-3">
            <div className="text-[10px] text-[#777]">현재 패턴 점수</div>
            <div className="text-xl font-semibold mt-1">{selected?.analysis?.total ?? "-"}</div>
            {comparison && <div className="text-[10px] mt-1">이전 대비 <Delta value={comparison.totalDelta} /></div>}
          </div>
          <div className="rounded-xl border border-[#E2E2E2] bg-white p-3">
            <div className="text-[10px] text-[#777]">현재 이슈</div>
            <div className="text-xl font-semibold mt-1">{selected?.issues?.length || 0}</div>
            <div className="text-[10px] mt-1 text-[#777]">HIGH {(selected?.issues || []).filter((x) => x.severity === "HIGH").length}</div>
          </div>
          <div className="rounded-xl border border-[#E2E2E2] bg-white p-3">
            <div className="text-[10px] text-[#777]">채택한 수정안</div>
            <div className="text-xl font-semibold mt-1">{selected?.acceptedEdits?.length || 0}</div>
            <div className="text-[10px] mt-1 text-[#777]">재업로드 후 해결 판정</div>
          </div>
          <div className="rounded-xl border border-[#E2E2E2] bg-white p-3">
            <div className="text-[10px] text-[#777]">실제 피드백 적중도</div>
            <div className="text-xl font-semibold mt-1">{selected?.feedbackComparison ? `${selected.feedbackComparison.accuracy}%` : "-"}</div>
            <div className="text-[10px] mt-1 text-[#777]">보고 후 검증</div>
          </div>
        </section>

        {!!visualFiles.length && (
          <section className="rounded-xl border border-[#DDDDEE] bg-white p-4">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={15} className="text-[#5B5FC7]" /><div className="text-sm font-semibold">Visual Document Review</div><Badge className="bg-[#EBEBF9] text-[#4F52A8]">OCR · 표 · 차트 · 캡처</Badge></div>
            <div className="grid md:grid-cols-2 gap-2.5">
              {visualFiles.map((file) => {
                const v = file.visualReview || {};
                const coverage = v.mode === "pdf-vision"
                  ? `${v.pagesAnalyzed || 0}/${v.totalPages || v.pagesAnalyzed || 0} 페이지`
                  : `${v.imagesAnalyzed || 0}/${v.totalImages || v.imagesAnalyzed || 0} 이미지`;
                return (
                  <div key={file.name} className="rounded-lg border border-[#E7E7E7] bg-[#FAFAFA] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold"><FileText size={12} />{file.name}</div>
                    <div className="text-[10px] text-[#666] mt-1">{v.mode === "pdf-vision" ? "PDF 페이지 이미지 + 텍스트" : v.mode === "embedded-image-vision" ? "삽입 이미지 Vision OCR" : "텍스트 중심 · 추가 OCR 불필요"} · {coverage}</div>
                    {v.truncated && <div className="text-[10px] text-[#8A5B00] mt-1">설정된 Visual 페이지 상한 때문에 일부 페이지는 텍스트 분석만 적용됨</div>}
                    {v.omitted > 0 && <div className="text-[10px] text-[#8A5B00] mt-1">이미지 {v.omitted}개는 Visual 상한으로 생략됨</div>}
                    {v.warning && <div className="text-[10px] text-[#A4262C] mt-1">Visual 경고 · {v.warning}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {comparison && (
          <section className="rounded-xl border border-[#DDDDEE] bg-white p-4">
            <div className="flex items-center gap-2 mb-3"><RefreshCw size={15} className="text-[#5B5FC7]" /><div className="text-sm font-semibold">수정 전 / 후 비교</div></div>
            <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
              <span className="font-medium">{comparison.totalBefore}</span><ArrowRight size={13} className="text-[#999]" /><span className="font-semibold">{comparison.totalAfter}</span>
              <Badge className={comparison.totalDelta >= 0 ? "bg-[#E6F4EA] text-[#2E7D32]" : "bg-[#FDE7E9] text-[#A4262C]"}><Delta value={comparison.totalDelta} /></Badge>
            </div>
            <div className="grid md:grid-cols-3 gap-2.5">
              <div className="rounded-lg bg-[#F3FAF4] p-3"><div className="text-[11px] font-semibold text-[#2E7D32]">해결됨 {comparison.resolved.length}</div>{comparison.resolved.slice(0, 3).map((x) => <div key={x.rule} className="text-[10.5px] mt-1.5">✓ {x.title}</div>)}</div>
              <div className="rounded-lg bg-[#FFF9E8] p-3"><div className="text-[11px] font-semibold text-[#7A5A00]">여전히 남음 {comparison.remaining.length}</div>{comparison.remaining.slice(0, 3).map((x) => <div key={x.rule} className="text-[10.5px] mt-1.5">! {x.title}</div>)}</div>
              <div className="rounded-lg bg-[#FFF1F2] p-3"><div className="text-[11px] font-semibold text-[#A4262C]">새로 발생 {comparison.newIssues.length}</div>{comparison.newIssues.slice(0, 3).map((x) => <div key={x.rule} className="text-[10.5px] mt-1.5">+ {x.title}</div>)}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#666]">
              {Object.entries(comparison.scoreDelta || {}).map(([key, value]) => <span key={key}>{AXIS_LABEL[key] || key} <Delta value={value} /></span>)}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-[#E2E2E2] bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2"><Target size={15} className="text-[#5B5FC7]" /><div className="text-sm font-semibold">Issues</div><Badge>{selected?.issues?.length || 0}</Badge></div>
            <div className="text-[10px] text-[#888]">수정안 채택만으로 해결 처리하지 않습니다.</div>
          </div>
          <div className="space-y-2.5">
            {(selected?.issues || []).map((issue) => {
              const suggestion = selected?.fixSuggestions?.[issue.id];
              const accepted = (selected?.acceptedEdits || []).some((x) => x.issueId === issue.id);
              const busy = busyKey === `fix:${issue.id}`;
              return (
                <div key={issue.id} className="rounded-lg border border-[#E7E7E7] p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={14} className={issue.severity === "HIGH" ? "text-[#A4262C] mt-0.5" : "text-[#A87400] mt-0.5"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold">{issue.title}</span>
                        <Badge className={issue.severity === "HIGH" ? "bg-[#FDE7E9] text-[#A4262C]" : "bg-[#FFF4CE] text-[#7A5A00]"}>{issue.severity}</Badge>
                        {accepted && <Badge className="bg-[#EBEBF9] text-[#4F52A8]">수정안 채택</Badge>}
                      </div>
                      <div className="text-[11px] leading-relaxed text-[#555] mt-1">{issue.question}</div>
                      {issue.evidence && (
                        <div className="mt-2 rounded-md bg-[#F8F8F8] px-2.5 py-2">
                          <div className="flex items-center gap-1 text-[9.5px] font-medium text-[#666]"><MapPin size={10} />{issue.evidence.file} · {issue.evidence.location}</div>
                          {issue.evidence.snippet && <div className="text-[10px] leading-relaxed text-[#666] mt-1">“{issue.evidence.snippet}”</div>}
                        </div>
                      )}
                      {!suggestion ? (
                        <button onClick={() => createFix(issue)} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#5B5FC7] hover:bg-[#F3F3FB] rounded px-2 py-1.5 disabled:opacity-50">
                          {busy ? <Loader2 size={11} className="animate-spin" /> : <PencilLine size={11} />}수정안 생성
                        </button>
                      ) : (
                        <div className="mt-2 rounded-lg border border-[#DDDDEE] bg-[#FBFBFE] p-2.5">
                          <div className="text-[10px] font-semibold text-[#5559A7]">제안 수정안</div>
                          <div className="text-[11px] leading-relaxed whitespace-pre-wrap mt-1">{suggestion.suggestedText}</div>
                          {!!suggestion.needsInput?.length && <div className="mt-2 text-[10px] text-[#8A5B00]">확인 필요 · {suggestion.needsInput.join(" / ")}</div>}
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={() => acceptFix(issue)} className="inline-flex items-center gap-1 text-[10.5px] rounded bg-[#5B5FC7] text-white px-2 py-1.5"><Check size={10} />작업본에 채택</button>
                            <button onClick={() => createFix(issue)} disabled={busy} className="text-[10.5px] text-[#616161] px-2 py-1.5 rounded hover:bg-white">다시 제안</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[#E2E2E2] bg-white p-4">
          <div className="flex items-center gap-2 mb-3"><Send size={15} className="text-[#5B5FC7]" /><div className="text-sm font-semibold">상신본 생성</div></div>
          <div className="flex flex-wrap gap-1.5">
            {FORMAT_BUTTONS.map((item) => (
              <button key={item.key} onClick={() => generateSubmission(item.key)} disabled={Boolean(busyKey)} className="text-xs border border-[#DADADA] bg-white rounded-lg px-3 py-2 hover:bg-[#F7F7F7] disabled:opacity-50">
                {busyKey === `submit:${item.key}` ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}{item.label}
              </button>
            ))}
          </div>
          {selected?.reviewSummary?.readiness !== "READY" && <div className="mt-2 text-[10.5px] text-[#8A5B00]">현재 미해결 이슈가 있어 생성 문안에도 확인 중인 항목이 남을 수 있습니다.</div>}
          {selected?.submission?.text && (
            <div className="mt-3 rounded-lg bg-[#F7F7F7] p-3">
              <div className="flex items-center justify-between mb-1.5"><div className="text-[10px] font-semibold text-[#666]">생성된 상신본</div><button onClick={copySubmission} className="text-[10px] flex items-center gap-1 text-[#5B5FC7]">{copied ? <Check size={10} /> : <Copy size={10} />}{copied ? "복사됨" : "복사"}</button></div>
              <div className="text-[11.5px] leading-relaxed whitespace-pre-wrap">{selected.submission.text}</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E2E2E2] bg-white p-4">
          <div className="flex items-center gap-2 mb-2"><MessageSquareText size={15} className="text-[#5B5FC7]" /><div className="text-sm font-semibold">실제 팀장 피드백 vs 예측</div></div>
          <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={3} placeholder="보고 후 실제로 받은 피드백을 그대로 붙여넣으세요." className="w-full resize-y rounded-lg border border-[#DADADA] px-3 py-2.5 text-xs outline-none focus:border-[#5B5FC7]" />
          <button onClick={compareFeedback} disabled={!feedbackText.trim() || busyKey === "feedback"} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#5B5FC7] text-white px-3 py-2 text-xs disabled:opacity-40">
            {busyKey === "feedback" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}예측과 비교
          </button>
          {selected?.feedbackComparison && (
            <div className="mt-3 rounded-lg border border-[#DDDDEE] p-3">
              <div className="flex items-center gap-2"><div className="text-xl font-semibold">{selected.feedbackComparison.accuracy}%</div><div className="text-xs text-[#555]">{selected.feedbackComparison.summary}</div></div>
              <div className="grid md:grid-cols-3 gap-2.5 mt-3">
                <div className="rounded bg-[#F3FAF4] p-2.5"><div className="text-[10px] font-semibold text-[#2E7D32]">적중 {selected.feedbackComparison.matched?.length || 0}</div>{(selected.feedbackComparison.matched || []).slice(0, 3).map((x, i) => <div key={i} className="text-[10px] mt-1">✓ {x.prediction}</div>)}</div>
                <div className="rounded bg-[#FFF9E8] p-2.5"><div className="text-[10px] font-semibold text-[#7A5A00]">예측만 {selected.feedbackComparison.missed?.length || 0}</div>{(selected.feedbackComparison.missed || []).slice(0, 3).map((x, i) => <div key={i} className="text-[10px] mt-1">! {x}</div>)}</div>
                <div className="rounded bg-[#FFF1F2] p-2.5"><div className="text-[10px] font-semibold text-[#A4262C]">예상 밖 {selected.feedbackComparison.surprises?.length || 0}</div>{(selected.feedbackComparison.surprises || []).slice(0, 3).map((x, i) => <div key={i} className="text-[10px] mt-1">+ {x}</div>)}</div>
              </div>
            </div>
          )}
        </section>

        {error && <div className="rounded-lg bg-[#FDE7E9] text-[#A4262C] px-3 py-2 text-xs">{error}</div>}

        <div className="text-[10px] text-[#888] leading-relaxed pb-3">
          근거 위치는 추출 텍스트와 Visual Review 결과를 함께 사용합니다. PPTX는 슬라이드·삽입 이미지·차트, PDF는 페이지 OCR, XLSX는 시트·행·셀, DOCX는 문단 기준으로 추적합니다. 복잡한 배치나 판독이 어려운 이미지는 위치가 근사치일 수 있습니다.
        </div>
      </div>
    </div>
  );
}
