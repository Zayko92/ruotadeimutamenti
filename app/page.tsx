"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MODEL_PRESETS } from "@/server-utils/models";

type ApiResponse = {
  content: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    [k: string]: unknown;
  };
  error?: string;
};

function tokenizeWords(text: string): string[] {
  const m = text.match(/\S+\s*/g);
  return m ?? [];
}
function detokenize(tokens: string[]): string {
  return tokens.join("");
}
function msLabel(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round((ms / 1000) * 10) / 10;
  return `${s}s`;
}

export default function Page() {
  const [inputText, setInputText] = useState<string>(
      "Nel mondo nulla resta fermo: anche le frasi cambiano pelle."
  );

  const [superPrompt, setSuperPrompt] = useState<string>(
      [
        "Sei un narratore-metabolizzatore di testi.",
        "L'utente ti fornisce un testo: trattalo come materia viva.",
        "",
        "Obiettivo:",
        "- Il testo è la tua base, ma tu puoi cambiarlo, un certo numero di parole alla volta.",
        "- Il cambiamento è una storia, e deve avere senso.",
        "- Introduci variazioni sottili e coerenti: cambia alcune parole, sostituisci sinonimi, sposta lievemente il ritmo, se poche parole possono cambiare la storia lasciando un senso compiuto, fallo.",
        "- Non distruggere la sensatezza delle frasi: le cose devono rimanere umanamente leggibili",
        "",
        "Nota:",
        "Divertiti, è questo il ciclo dell'universo: stesso seme, diversa fioritura."
      ].join("\n")
  );

  // Parametri
  const [timeParamMs, setTimeParamMs] = useState<number>(2000);
  const [wordsPerStep, setWordsPerStep] = useState<number>(3);
  const [temperature, setTemperature] = useState<number>(0.75);
  const [maxTokens, setMaxTokens] = useState<number>(700);
  const [renderMode, setRenderMode] = useState<"markdown" | "raw">("markdown");

  // Modello unico scelto da dropdown
  const modelOptions = useMemo(() => {
    // Ordina: production, system, preview, custom
    const order = new Map<string, number>([
      ["production", 1],
      ["system", 2],
      ["preview", 3],
      ["custom", 4]
    ]);
    return [...MODEL_PRESETS].sort((a, b) => (order.get(a.tier) ?? 99) - (order.get(b.tier) ?? 99));
  }, []);

  const defaultModel = modelOptions.find((m) => m.id === "llama-3.1-8b-instant")?.id ?? modelOptions[0]?.id ?? "";
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

  // Stato esecuzione
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Conteggio generazioni completate
  const [cycleCount, setCycleCount] = useState<number>(0);

  // Output
  const [displayText, setDisplayText] = useState<string>(inputText);

  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastTokens, setLastTokens] = useState<number | null>(null);

  // Refs
  const inFlightRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  const cursorRef = useRef<number>(0);
  const displayTokensRef = useRef<string[]>(tokenizeWords(inputText));
  const targetTokensRef = useRef<string[]>(tokenizeWords(inputText));

  const paramsRef = useRef({
    inputText,
    superPrompt,
    wordsPerStep,
    temperature,
    maxTokens,
    selectedModel
  });

  useEffect(() => {
    paramsRef.current = {
      inputText,
      superPrompt,
      wordsPerStep,
      temperature,
      maxTokens,
      selectedModel
    };
  }, [inputText, superPrompt, wordsPerStep, temperature, maxTokens, selectedModel]);

  async function fetchGroq() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const started = performance.now();

    const res = await fetch("/api/groq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text: paramsRef.current.inputText,
        superPrompt: paramsRef.current.superPrompt,
        model: paramsRef.current.selectedModel,
        temperature: paramsRef.current.temperature,
        maxTokens: paramsRef.current.maxTokens
      })
    });

    const data = (await res.json()) as ApiResponse;

    const ended = performance.now();
    setLastLatencyMs(Math.round(ended - started));

    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    return data;
  }

  function doWordWheelStep() {
    const display = displayTokensRef.current;
    const target = targetTokensRef.current;
    if (target.length === 0) return;

    const maxLen = Math.max(display.length, target.length);
    if (maxLen === 0) return;

    if (display.length < maxLen) display.push(...Array.from({ length: maxLen - display.length }, () => ""));
    if (target.length < maxLen) {
      targetTokensRef.current = target.concat(Array.from({ length: maxLen - target.length }, () => ""));
    }

    const step = Math.max(1, Math.floor(paramsRef.current.wordsPerStep));
    const start = cursorRef.current % maxLen;

    for (let i = 0; i < step; i++) {
      const idx = (start + i) % maxLen;
      display[idx] = targetTokensRef.current[idx] ?? "";
    }

    cursorRef.current = (start + step) % maxLen;
    setDisplayText(detokenize(display));
  }

  async function tick() {
    // 1) cambia N parole live
    doWordWheelStep();

    // 2) 1 sola richiesta alla volta
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);

    try {
      const data = await fetchGroq();
      const content = (data.content ?? "").trim();

      const usageTotal = typeof data.usage?.total_tokens === "number" ? data.usage.total_tokens : null;
      setLastTokens(usageTotal);

      // nuovo target; il word-wheel lo “muta” a chunk
      targetTokensRef.current = tokenizeWords(content.length ? content : "(risposta vuota)");

      // generazione completata
      setCycleCount((c) => c + 1);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Errore sconosciuto");
    } finally {
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => void tick(), timeParamMs);
    void tick();

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, timeParamMs]);

  function start() {
    setError(null);
    setLastLatencyMs(null);
    setLastTokens(null);
    setCycleCount(0);

    cursorRef.current = 0;

    const base = inputText.trim().length ? inputText : "(testo vuoto)";
    displayTokensRef.current = tokenizeWords(base);
    targetTokensRef.current = tokenizeWords(base);

    setDisplayText(base);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    abortRef.current?.abort();
    inFlightRef.current = false;
  }

  function resetToSeed() {
    const base = inputText.trim().length ? inputText : "(testo vuoto)";
    cursorRef.current = 0;
    displayTokensRef.current = tokenizeWords(base);
    targetTokensRef.current = tokenizeWords(base);
    setDisplayText(base);
    setError(null);
    setCycleCount(0);
    setLastLatencyMs(null);
    setLastTokens(null);
  }

  return (
      <div className="frame">
        <header className="header">
          <div className="titleRow">
            <div>
              <h1 className="title">LA RUOTA DEI MUTAMENTI</h1>
              <p className="subtitle">
                Ogni tick riscrive <b>{wordsPerStep}</b> parole. La realtà è un ciclo in continuo mutamento. L'Universo ti sopravviverà.
              </p>

              {/* animazione pixelata di mutamento */}
              <div className={running ? "mutationBar isRunning" : "mutationBar"} aria-hidden="true">
                {Array.from({ length: 28 }).map((_, i) => (
                    <span key={i} className="px" />
                ))}
                <span className="mutationGlow" />
              </div>
            </div>

            <div className="headerRight">
              <div className="pill">
                <span className="pillLabel">CICLO</span>
                <span className="pillValue">#{cycleCount}</span>
              </div>

              <div className="pill">
                <span className="pillLabel">MODEL</span>
                <span className="pillValue">{selectedModel || "—"}</span>
              </div>

              <div className="selectWrap">
                <label className="selectLabel" htmlFor="modelSelect">
                  SCEGLI IL TUO MODELLO
                </label>
                <select
                    id="modelSelect"
                    className="select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={running}
                    title={running ? "Ferma il ciclo per cambiare modello" : "Seleziona un modello"}
                >
                  {modelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.id}
                      </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        <div className="grid">
          <section className="panel">
            <h2 className="panelTitle">IL SEME DEL MONDO</h2>

            <label className="label">
              Testo (seme)
              <textarea
                  className="textarea"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  spellCheck={false}
              />
            </label>

            <label className="label">
              Le leggi del mondo
              <textarea
                  className="textarea"
                  value={superPrompt}
                  onChange={(e) => setSuperPrompt(e.target.value)}
                  rows={7}
                  spellCheck={false}
              />
            </label>

            <div className="row">
              <button className={running ? "btn btnStop" : "btn btnStart"} onClick={running ? stop : start} type="button">
                {running ? "TRATTIENI LA REALTA'" : "LIBERA LA MUTAZIONE"}
              </button>

              <button className="btn btnAlt" onClick={resetToSeed} disabled={running} type="button">
                RIAVVOLGI IL NASTRO
              </button>
            </div>

            <div className="hr" />

            <h3 className="panelSubTitle">LE LEGGI DEL CAMBIAMENTO</h3>

            <div className="rangeRow">
              <div className="rangeLabel">
                Time Param <span className="muted">({msLabel(timeParamMs)})</span>
              </div>
              <input
                  className="range"
                  type="range"
                  min={500}
                  max={15000}
                  step={250}
                  value={timeParamMs}
                  onChange={(e) => setTimeParamMs(parseInt(e.target.value, 10))}
              />
              <div className="rangeHint">500ms … 15s</div>
            </div>

            <div className="rangeRow">
              <div className="rangeLabel">
                Parole per tick <span className="muted">({wordsPerStep})</span>
              </div>
              <input
                  className="range"
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={wordsPerStep}
                  onChange={(e) => setWordsPerStep(parseInt(e.target.value, 10))}
              />
              <div className="rangeHint">1 … 20</div>
            </div>

            <div className="rangeRow">
              <div className="rangeLabel">
                Temperature <span className="muted">({temperature.toFixed(2)})</span>
              </div>
              <input
                  className="range"
                  type="range"
                  min={0}
                  max={1.6}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <div className="rangeHint">0.00 … 1.60</div>
            </div>

            <label className="label">
              Max tokens
              <input
                  className="input"
                  type="number"
                  min={16}
                  max={32768}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </label>

            <div className="row">
              <div className="radioGroup" role="radiogroup" aria-label="Render mode">
                <label className="radio">
                  <input
                      type="radio"
                      name="renderMode"
                      checked={renderMode === "markdown"}
                      onChange={() => setRenderMode("markdown")}
                  />
                  Markdown
                </label>
                <label className="radio">
                  <input
                      type="radio"
                      name="renderMode"
                      checked={renderMode === "raw"}
                      onChange={() => setRenderMode("raw")}
                  />
                  Raw
                </label>
              </div>
            </div>

            <div className="hr" />

            <div className="stats">
              <div className="stat">
                <span className="muted">Latency</span>
                <span>{lastLatencyMs == null ? "—" : `${lastLatencyMs}ms`}</span>
              </div>
              <div className="stat">
                <span className="muted">Tokens</span>
                <span>{lastTokens == null ? "—" : lastTokens}</span>
              </div>
              <div className="stat">
                <span className="muted">Modello</span>
                <span>{selectedModel || "—"}</span>
              </div>
            </div>

            {error && (
                <div className="errorBox">
                  <div className="errorTitle">WORLD ERROR</div>
                  <div className="errorText">{error}</div>
                </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panelTitle">LO SCHERMO DEI MUTAMENTI</h2>

            <div className="crt">
              {renderMode === "markdown" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
              ) : (
                  <pre className="pre">{displayText}</pre>
              )}
            </div>

            <div className="footerNote">
              Niente sfuggirà alle forze del cambiamento. Rispetto a questo, è necessario essere coraggiosi. Accettare ciò che non possiamo fermare. Abbandonarci al flusso...
            </div>
          </section>
        </div>
      </div>
  );
}
