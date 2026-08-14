"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  Users,
  Calendar,
  Phone,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  X,
  Loader2,
  FileText,
  Video,
  Copy,
  Check,
  Trash2,
  Lock,
  HelpCircle,
  ChevronRight,
} from "lucide-react";

const STORAGE_KEY = "team-lead-bot:messages:v183";
const MODE_KEY = "team-lead-bot:mode:v183";
const ACCESS_KEY = "team-lead-bot:access:v183";
const MAX_FILES = 5;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const SIDEBAR_ITEMS = [
  { name: "팀장님 (개인 시뮬레이터)", preview: "V1.8.3 · Adaptive Manager", time: "지금", active: true, initials: "팀장" },
  { name: "주간업무 채널", preview: "회의록 공유드립니다", time: "어제", active: false, initials: "주간" },
  { name: "프로젝트 채널", preview: "확인했습니다!", time: "화요일", active: false, initials: "PR" },
  { name: "동료 A", preview: "넵 감사합니다", time: "월요일", active: false, initials: "동료" },
];

const STARTERS = [
  "이 기획안 방향 검토 부탁드립니다",
  "예산을 300만원 더 올리려고 합니다",
  "신청 기한이 하루 지났는데 예외 처리해도 될까요",
  "다음 단계로 뭘 하면 좋을지 방향을 못 잡겠어요",
];

const STRUCTURE_TEMPLATE = `1. 결론·요청 — 지금 무엇을 승인/결정 받아야 하는지 1문장
2. 팩트 — 현재 현상·수치·이력만 먼저 정리 (해석과 분리)
3. 원인 — 왜 발생했는지와 그 원인이 맞다는 근거
4. 정당성 — 금액 산식·규정·전결·기존 공지/선례 중 필요한 근거
5. 해결·운영 — 문제에 비례한 개선안 + 담당·일정·예외·대안
6. 효과 — 적용 후 무엇이 달라지는지`;

const RISK_STYLE = {
  HIGH: { bg: "#FDE7E9", fg: "#A4262C", label: "HIGH" },
  MEDIUM: { bg: "#FFF4CE", fg: "#8A6D00", label: "MEDIUM" },
  LOW: { bg: "#E6F4EA", fg: "#2E7D32", label: "LOW" },
};

const BASIS_STYLE = {
  good: { bg: "#E6F4EA", fg: "#2E7D32", label: "확인" },
  partial: { bg: "#FFF4CE", fg: "#8A6D00", label: "보완" },
  missing: { bg: "#FDE7E9", fg: "#A4262C", label: "누락" },
  na: { bg: "#F0F0F0", fg: "#8A8886", label: "해당없음" },
};

const AXIS_LABEL = {
  facts: "사실성",
  causality: "인과성",
  legitimacy: "정당성",
  proportionality: "비례성",
  execution: "실행성",
  communication: "전달성",
};

const RELATION_LABEL = {
  SAME: "매우 유사",
  SIMILAR: "유사",
  PATTERN: "패턴 참고",
};

function Avatar({ initials, size = 32 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-medium shrink-0"
      style={{ width: size, height: size, background: "#5B5FC7", fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
}

function SmallBadge({ children, bg = "#F5F5F5", fg = "#616161" }) {
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: bg, color: fg }}>{children}</span>;
}

function AnalysisDrawer({ analysis, onClose }) {
  const defaultAxis = analysis?.weakAreas?.[0]?.key || "facts";
  const [selectedAxis, setSelectedAxis] = useState(defaultAxis);

  useEffect(() => {
    setSelectedAxis(analysis?.weakAreas?.[0]?.key || "facts");
  }, [analysis]);

  if (!analysis) return null;
  const risk = RISK_STYLE[analysis.riskLevel] || RISK_STYLE.LOW;
  const detail = analysis.axisDetails?.[selectedAxis] || {
    label: AXIS_LABEL[selectedAxis],
    score: analysis.scores?.[selectedAxis],
    band: "",
    summary: "이 축의 상세 근거는 다음 분석부터 표시됩니다.",
    positives: [],
    gaps: [],
    snippet: "",
  };
  const allQuestions = analysis.questions || [];

  return (
    <>
      <button aria-label="분석 닫기" onClick={onClose} className="fixed inset-0 bg-black/20 z-20 lg:hidden" />
      <aside className="fixed lg:relative right-0 top-0 h-full w-[min(94vw,430px)] lg:w-[410px] shrink-0 bg-white border-l border-[#E1E1E1] z-30 shadow-xl lg:shadow-none flex flex-col">
        <div className="px-4 py-3 border-b border-[#E8E8E8] flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">팀장님 판단 해설</div>
            <div className="text-[11px] text-[#777] mt-0.5">말풍선과 분리된 내부 판단 대시보드</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F5F5F5] text-[#616161]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-5">
          <section>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <SmallBadge bg="#EBEBF9" fg="#4F52A8">{analysis.decisionStage?.label || "검증 단계"}</SmallBadge>
              <SmallBadge bg={risk.bg} fg={risk.fg}>위험도 {risk.label}</SmallBadge>
              <SmallBadge>{analysis.reportTypeLabel || "일반 보고"}</SmallBadge>
              <SmallBadge bg="#EEF6FF" fg="#245E8C">패턴 점수 {analysis.total}</SmallBadge>
            </div>
            <div className="text-sm font-medium">이번 반응의 성격</div>
            <p className="text-xs leading-relaxed text-[#616161] mt-1">{analysis.decisionStage?.reason || "현재 문서에서 가장 먼저 걸릴 쟁점을 확인하는 단계입니다."}</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">팀장님이 중요하게 보는 6가지 축</div>
              <span className="text-[10px] text-[#8A8886]">클릭하면 근거 확인</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(analysis.scores || {}).map(([key, value]) => {
                const active = key === selectedAxis;
                const axis = analysis.axisDetails?.[key];
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedAxis(key)}
                    className={`text-left rounded-lg border px-2.5 py-2 transition ${active ? "border-[#5B5FC7] bg-[#F2F2FB]" : "border-[#E7E7E7] bg-[#F8F8F8] hover:bg-[#F3F3F3]"}`}
                  >
                    <div className="text-[10px] text-[#616161]">{AXIS_LABEL[key] || key}</div>
                    <div className="flex items-end justify-between mt-0.5 gap-1">
                      <span className="text-base font-semibold leading-none">{value}</span>
                      <span className="text-[9px] text-[#777] truncate">{axis?.band || ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 rounded-lg border border-[#E1E1E1] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">{detail.label} · {detail.score}</div>
                {detail.band && <SmallBadge>{detail.band}</SmallBadge>}
              </div>
              <p className="text-[11px] leading-relaxed text-[#525252] mt-1.5">{detail.summary}</p>
              {!!detail.positives?.length && (
                <div className="mt-2 space-y-1">
                  {detail.positives.slice(0, 3).map((x, i) => <div key={i} className="text-[10.5px] text-[#356A39]">✓ {x}</div>)}
                </div>
              )}
              {!!detail.gaps?.length && (
                <div className="mt-1.5 space-y-1">
                  {detail.gaps.slice(0, 3).map((x, i) => <div key={i} className="text-[10.5px] text-[#9A5D00]">! {x}</div>)}
                </div>
              )}
              {detail.snippet && (
                <div className="mt-2 rounded bg-[#F7F7F7] px-2.5 py-2">
                  <div className="text-[9px] font-semibold text-[#777] mb-0.5">현재 문서에서 잡힌 문맥</div>
                  <div className="text-[10.5px] leading-relaxed text-[#555]">“{detail.snippet}”</div>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="text-sm font-medium mb-2">어떤 근거에서 판단했나요?</div>
            <div className="space-y-2">
              <div className="rounded-lg border border-[#E7E7E7] p-3">
                <div className="text-[11px] font-semibold mb-2">현재 문서</div>
                <div className="space-y-2">
                  {(analysis.documentEvidence || []).slice(0, 5).map((item) => {
                    const s = BASIS_STYLE[item.status] || BASIS_STYLE.partial;
                    return (
                      <div key={item.key} className="flex gap-2 items-start">
                        <span className="mt-0.5 shrink-0 text-[9px] px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                        <div>
                          <div className="text-[10.5px] font-medium">{item.label}</div>
                          <div className="text-[10px] leading-relaxed text-[#777] mt-0.5">{item.reason}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-[#E7E7E7] p-3">
                <div className="text-[11px] font-semibold mb-2">반복적으로 관찰된 팀장님 판단 패턴</div>
                <div className="space-y-1.5">
                  {(analysis.managerPatterns || []).map((p, i) => <div key={i} className="text-[10.5px] leading-relaxed text-[#555]">• {p}</div>)}
                </div>
              </div>

              {analysis.precedent && (
                <div className="rounded-lg border border-[#DDE5F3] bg-[#F8FBFF] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold">유사한 실제 사례</div>
                    <SmallBadge bg="#E8F0FE" fg="#174EA6">{RELATION_LABEL[analysis.precedent.relationship] || "참고"}</SmallBadge>
                  </div>
                  <div className="text-[11px] font-medium mt-2">{analysis.precedent.title}</div>
                  <div className="text-[10px] text-[#5B6573] leading-relaxed mt-1">{analysis.precedent.reasoningPattern}</div>
                  <div className="mt-2 pt-2 border-t border-[#DFE7F2] text-[10px] leading-relaxed text-[#5B6573]">
                    <span className="font-semibold">과거 결과 요지:</span> {analysis.precedent.observedOutcome}
                  </div>
                  <div className="text-[9px] text-[#7A8490] mt-2">과거 사례는 정답지가 아니라 참고 근거이며, 현재 사실관계를 우선합니다.</div>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="text-sm font-medium mb-2">예상 후속질문</div>
            {allQuestions.length ? (
              <div className="space-y-2">
                {allQuestions.slice(0, 4).map((q, i) => (
                  <div key={i} className="flex gap-2 items-start rounded-lg bg-[#F7F7F7] px-2.5 py-2">
                    <span className="w-4 h-4 rounded-full bg-white border border-[#D9D9D9] text-[9px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[10.5px] leading-relaxed">{q.q}</div>
                      {q.rule && <div className="text-[9px] text-[#8A8886] mt-0.5">근거 축: {q.rule}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="text-[11px] text-[#777]">현재 문서 기준으로 추가 질문 가능성이 높게 잡힌 항목은 없습니다.</div>}
          </section>

          {!!analysis.judgmentBasis?.length && (
            <section>
              <div className="text-sm font-medium mb-2">판단에 반영하는 순서</div>
              <div className="space-y-1.5">
                {analysis.judgmentBasis.map((b, i) => (
                  <div key={`${b.label}-${i}`} className="flex items-center gap-2 text-[10.5px]">
                    <span className="w-5 h-5 rounded-full bg-[#F1F1F8] text-[#5559A7] flex items-center justify-center shrink-0 text-[9px] font-semibold">{i + 1}</span>
                    <div className="flex-1">
                      <span className="font-medium">{b.label}</span>
                      <span className="text-[#777]"> · {b.detail}</span>
                    </div>
                    <span className="text-[9px] text-[#6D6D6D]">{b.weight}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="text-[9px] leading-relaxed text-[#8A8886] border-t border-[#EEEEEE] pt-3">
            6축의 숫자는 통계적 확률이 아니라 실제 반응에서 추출한 규칙 기반 패턴 점수입니다. 첨부 문서는 현재 텍스트만 추출하므로 슬라이드의 색상·도형 배치·시각적 관계는 판정하지 않습니다.
          </div>
        </div>
      </aside>
    </>
  );
}

function AccessGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    if (!code.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "x-app-access-code": code.trim() } });
      if (!res.ok) throw new Error("접근 코드가 맞지 않습니다.");
      sessionStorage.setItem(ACCESS_KEY, code.trim());
      onUnlock(code.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full h-screen bg-[#EEEEF2] flex items-center justify-center px-5">
      <div className="w-full max-w-sm bg-white rounded-xl border border-[#E1E1E1] shadow-sm p-6">
        <div className="w-10 h-10 rounded-full bg-[#EBEBF9] text-[#5B5FC7] flex items-center justify-center mb-4"><Lock size={19} /></div>
        <div className="font-semibold text-lg">개인 시뮬레이터 접근</div>
        <p className="text-sm text-[#616161] mt-1.5">Vercel 환경변수에 설정한 APP_ACCESS_CODE를 입력하세요.</p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          placeholder="접근 코드"
          className="w-full border border-[#DADADA] rounded-lg px-3 py-2.5 text-sm mt-4 outline-none focus:border-[#5B5FC7]"
        />
        {error && <div className="text-xs text-[#A4262C] mt-2">{error}</div>}
        <button onClick={unlock} disabled={!code.trim() || loading} className="w-full mt-3 bg-[#5B5FC7] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
          {loading ? "확인 중…" : "들어가기"}
        </button>
      </div>
    </div>
  );
}

export default function ChatPane() {
  const [mode, setMode] = useState("messenger");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [tab, setTab] = useState("chat");
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [drawer, setDrawer] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedMode = localStorage.getItem(MODE_KEY);
      if (saved) setMessages(JSON.parse(saved));
      if (savedMode) setMode(savedMode);
      const cachedCode = sessionStorage.getItem(ACCESS_KEY) || "";
      setAccessCode(cachedCode);
    } catch (e) {}
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setAccessRequired(Boolean(data.accessProtected));
        setAccessReady(true);
      })
      .catch(() => setAccessReady(true));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function authHeaders(extra = {}) {
    return { ...extra, ...(accessCode ? { "x-app-access-code": accessCode } : {}) };
  }

  async function sendChat(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setError(null);
    setInput("");
    const userMsg = { role: "user", content, mode, kind: "text" };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "응답 실패");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, mode, kind: "text" }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendReview() {
    if (!pendingFiles.length || loading) return;
    setError(null);
    const note = input.trim();
    setInput("");
    const filesForRequest = [...pendingFiles];
    setPendingFiles([]);
    const fileNames = filesForRequest.map((f) => f.name);
    const userMsg = { role: "user", content: note, mode, kind: "file", fileNames };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const fd = new FormData();
      filesForRequest.forEach((f) => fd.append("file", f));
      fd.append("mode", mode);
      fd.append("note", note);
      fd.append("history", JSON.stringify(messages.slice(-8).map((m) => ({ role: m.role, content: m.content }))));
      const res = await fetch("/api/review", { method: "POST", headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검토 실패");
      const assistantMsg = { role: "assistant", content: data.reply, mode, kind: "text", analysis: data.analysis };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (pendingFiles.length) sendReview();
    else sendChat();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFilePick(e) {
    const incoming = [...(e.target.files || [])];
    if (!incoming.length) return;
    setPendingFiles((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (merged.length >= MAX_FILES) break;
        if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f);
      }
      const total = merged.reduce((sum, f) => sum + f.size, 0);
      if (total > MAX_UPLOAD_BYTES) {
        setError("Vercel 업로드 제한을 고려해 첨부파일 합계는 약 4MB 이하로 해주세요.");
        return prev;
      }
      setError(null);
      return merged;
    });
    e.target.value = "";
  }

  async function copyStructure() {
    try {
      await navigator.clipboard.writeText(STRUCTURE_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch (e) {}
  }

  function resetConversation() {
    if (!messages.length) {
      setMenuOpen(false);
      return;
    }
    if (window.confirm("대화 기록을 전부 지울까요? 되돌릴 수 없습니다.")) {
      setMessages([]);
      setDrawer(null);
      localStorage.removeItem(STORAGE_KEY);
    }
    setMenuOpen(false);
  }

  const reviewedFiles = messages.flatMap((m) => (m.kind === "file" ? (m.fileNames || []).map((name) => ({ name })) : []));

  if (!accessReady) return <div className="w-full h-screen bg-[#EEEEF2] flex items-center justify-center text-sm text-[#616161]">불러오는 중…</div>;
  if (accessRequired && !accessCode) return <AccessGate onUnlock={(code) => setAccessCode(code)} />;

  return (
    <div className="w-full h-screen flex bg-[#EEEEF2] text-[#242424] overflow-hidden">
      <div className="hidden md:flex w-14 flex-col items-center py-4 gap-5 bg-[#464775] text-white">
        <MessageSquare size={20} className="opacity-100" />
        <Users size={20} className="opacity-60" />
        <Calendar size={20} className="opacity-60" />
        <Phone size={20} className="opacity-60" />
        <div className="mt-auto"><Avatar initials="나" size={28} /></div>
      </div>

      <div className="hidden xl:flex flex-col w-72 bg-white border-r border-[#E1E1E1] shrink-0">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-md px-3 py-1.5">
            <Search size={15} className="text-[#616161]" />
            <input placeholder="검색" disabled className="bg-transparent outline-none text-sm placeholder:text-[#8a8886] w-full" />
          </div>
        </div>
        <div className="px-4 pb-2 text-xs font-semibold text-[#616161]">채팅</div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {SIDEBAR_ITEMS.map((item, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 cursor-default ${item.active ? "bg-[#EBEBF9]" : "hover:bg-[#F5F5F5]"}`}>
              <Avatar initials={item.initials} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  <span className="text-[11px] text-[#616161] shrink-0 ml-2">{item.time}</span>
                </div>
                <div className="text-xs text-[#616161] truncate">{item.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="bg-white border-b border-[#E1E1E1] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <Avatar initials="팀장" size={36} />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#6BB700] border-2 border-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[15px] leading-tight truncate">팀장님</div>
              <div className="text-xs text-[#616161] truncate">개인 시뮬레이터 · Adaptive Manager V1.8.3</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[#5B5FC7]">
            <button onClick={copyStructure} title="보고서 구조 템플릿 복사" className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-[#F5F5F5]">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? "복사됨" : "구조 템플릿"}</span>
            </button>
            <Phone size={18} className="opacity-70 hidden sm:block" />
            <Video size={18} className="opacity-70 hidden sm:block" />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} className="p-0.5 rounded hover:bg-[#F5F5F5]"><MoreHorizontal size={18} className="opacity-70" /></button>
              {menuOpen && (
                <div className="absolute right-0 top-7 z-10 bg-white border border-[#E1E1E1] rounded-lg shadow-lg py-1 w-40 text-[#242424]">
                  <button onClick={resetConversation} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#F5F5F5] text-left text-[#A4262C]"><Trash2 size={13} />대화 초기화</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border-b border-[#E1E1E1] px-5 flex gap-6 text-sm">
          {[{ id: "chat", label: "채팅" }, { id: "files", label: "파일" }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`py-2.5 border-b-2 transition ${tab === t.id ? "border-[#5B5FC7] text-[#5B5FC7] font-medium" : "border-transparent text-[#616161] hover:text-[#242424]"}`}>{t.label}</button>
          ))}
        </div>

        {tab === "chat" ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 bg-white">
              <div className="text-center text-[11px] text-[#616161] mb-4">오늘</div>
              {messages.length === 0 && (
                <div className="space-y-3 max-w-2xl">
                  <p className="text-sm text-[#616161]">보고서 파일을 첨부해서 검토받거나, 방향을 물어보세요. 팀장님 말풍선은 실제 채팅처럼 짧게 나오고, <HelpCircle size={12} className="inline -mt-0.5" />를 누르면 판단 근거와 6가지 축을 볼 수 있습니다.</p>
                  <div className="flex flex-col gap-2">
                    {STARTERS.map((s, i) => <button key={i} onClick={() => sendChat(s)} className="text-left text-sm px-3 py-2 rounded-lg bg-[#F5F5F5] hover:bg-[#EBEBF9] transition">{s}</button>)}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {messages.map((m, i) => m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[82%] sm:max-w-[76%]">
                      {m.kind === "file" && !!m.fileNames?.length && (
                        <div className="mb-1 flex flex-col items-end gap-1">
                          {m.fileNames.map((name) => <div key={name} className="flex items-center gap-1.5 bg-[#F5F5F5] rounded-lg px-2.5 py-1.5 text-xs text-[#242424]"><FileText size={13} />{name}</div>)}
                        </div>
                      )}
                      {m.content && <div className="bg-[#E1DFFD] rounded-lg rounded-tr-sm px-3.5 py-2 text-sm whitespace-pre-wrap">{m.content}</div>}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start gap-2">
                    <Avatar initials="팀장" size={28} />
                    <div className="max-w-[85%] sm:max-w-[78%] min-w-0">
                      <div className="text-xs text-[#616161] mb-0.5">팀장님</div>
                      <div className="flex items-start gap-1.5">
                        <div className="bg-[#F5F5F5] rounded-lg rounded-tl-sm px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed min-w-0">{m.content}</div>
                        {m.analysis && (
                          <button
                            onClick={() => setDrawer({ analysis: m.analysis, index: i })}
                            title="왜 이런 반응인지 보기"
                            className="mt-1 w-6 h-6 shrink-0 rounded-full border border-[#DADAEA] bg-white text-[#5B5FC7] flex items-center justify-center hover:bg-[#F3F3FB] transition"
                          >
                            <HelpCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start gap-2"><Avatar initials="팀장" size={28} /><div className="bg-[#F5F5F5] rounded-lg rounded-tl-sm px-3.5 py-2 text-sm flex items-center gap-2 text-[#616161]"><Loader2 size={13} className="animate-spin" />입력 중…</div></div>
                )}
                {error && <div className="text-sm px-3 py-2 rounded-lg bg-[#FDE7E9] text-[#A4262C] max-w-[75%]">{error}</div>}
              </div>
            </div>

            <div className="bg-white border-t border-[#E1E1E1] px-5 py-3">
              {!!pendingFiles.length && (
                <div className="mb-2 flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {pendingFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="inline-flex items-center gap-2 bg-[#F5F5F5] rounded-lg px-3 py-1.5 text-xs">
                        <FileText size={13} />{file.name}
                        <button onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))} className="text-[#616161] hover:text-[#242424]"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-[#8a8886]">첨부 파일의 추출 텍스트는 검토를 위해 OpenAI API로 전송됩니다. 문서 원문은 이 앱의 DB에 저장하지 않습니다.</span>
                </div>
              )}
              <div className="border border-[#E1E1E1] rounded-lg overflow-hidden">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={pendingFiles.length ? "검토 요청 메모 (선택)…" : "메시지 입력…"} rows={2} className="w-full resize-none outline-none px-3.5 py-2.5 text-sm" />
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-white">
                  <div className="flex items-center gap-1">
                    <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded hover:bg-[#F5F5F5] text-[#616161]" title="파일 첨부"><Paperclip size={16} /></button>
                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.pptx,.docx,.xlsx,.txt,.md,.csv" hidden onChange={handleFilePick} />
                    <button className="p-1.5 rounded hover:bg-[#F5F5F5] text-[#616161]" title="이모지" disabled><Smile size={16} /></button>
                    <select value={mode} onChange={(e) => setMode(e.target.value)} className="ml-1 text-xs border border-[#E1E1E1] rounded px-1.5 py-1 text-[#616161] bg-white outline-none">
                      <option value="messenger">메신저 톤</option><option value="mail">이메일 톤</option>
                    </select>
                  </div>
                  <button onClick={handleSend} disabled={loading || (!input.trim() && !pendingFiles.length)} className="p-1.5 rounded-full bg-[#5B5FC7] text-white disabled:opacity-30 disabled:bg-[#c7c7d6] transition"><Send size={15} /></button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 bg-white">
            <div className="text-sm font-medium mb-3">검토 요청한 파일</div>
            {reviewedFiles.length === 0 ? <div className="text-sm text-[#616161]">아직 검토 요청한 파일이 없습니다.</div> : (
              <div className="space-y-2">{reviewedFiles.map((f, i) => <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#F5F5F5] text-sm"><FileText size={15} className="text-[#5B5FC7]" />{f.name}<ChevronRight size={14} className="ml-auto text-[#999]" /></div>)}</div>
            )}
          </div>
        )}
      </div>

      {drawer?.analysis && <AnalysisDrawer key={drawer.index} analysis={drawer.analysis} onClose={() => setDrawer(null)} />}
    </div>
  );
}
