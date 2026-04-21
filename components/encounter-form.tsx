"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Bot, Mic, Sparkles, Square } from "lucide-react";
import type { DiagnosisCode, EncounterInput } from "@/lib/types";
import { diagnosisLabels, diagnosisOrder } from "@/lib/diagnoses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const RAPID_END_MS = 480;
const MAX_RAPID_END_BURST = 14;
const MAX_START_FAILURES = 7;

export interface EncounterFormProps {
  patientName: string;
  input: EncounterInput;
  encounterActive: boolean;
  startSignal: number;
  onAgeChange: (age: number | null) => void;
  onSexChange: (sex: EncounterInput["sex"]) => void;
  onTranscriptChange: (transcript: string) => void;
  onToggleDiagnosis: (diagnosis: DiagnosisCode) => void;
  onEnablePsychotherapyChange: (enabled: boolean) => void;
  onAiChart: () => void | Promise<void>;
  onPolishTranscript: () => void | Promise<void>;
  onRecordVisit: () => void;
  aiChartLoading?: boolean;
  polishLoading?: boolean;
  aiChartError?: string | null;
  onEndEncounter: () => void;
  captureHidden?: boolean;
}

export default function EncounterForm({
  patientName,
  input,
  encounterActive,
  startSignal,
  onAgeChange,
  onSexChange,
  onTranscriptChange,
  onToggleDiagnosis,
  onEnablePsychotherapyChange,
  onAiChart,
  onPolishTranscript,
  onRecordVisit,
  aiChartLoading = false,
  polishLoading = false,
  aiChartError = null,
  onEndEncounter,
  captureHidden = false,
}: EncounterFormProps) {
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef(input.transcript);
  const micSessionAliveRef = useRef(false);
  const userPausedMicRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartGenRef = useRef(0);
  const rapidEndBurstRef = useRef(0);
  const lastEndAtRef = useRef(0);
  const startFailCountRef = useRef(0);
  const giveUpAutoMicRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [micPausedByUser, setMicPausedByUser] = useState(false);
  const [micStallNotice, setMicStallNotice] = useState<string | null>(null);
  const [dictationSupported, setDictationSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  useEffect(() => {
    transcriptRef.current = input.transcript;
  }, [input.transcript]);

  useEffect(() => {
    const win = window as Window & { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const speechRecognition = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    setDictationSupported(Boolean(speechRecognition));
  }, []);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      micSessionAliveRef.current = false;
      restartGenRef.current += 1;
      recognitionRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [input.transcript]);

  function giveUpMicReconnect(message: string) {
    if (giveUpAutoMicRef.current) {
      return;
    }
    giveUpAutoMicRef.current = true;
    userPausedMicRef.current = true;
    setMicPausedByUser(true);
    setMicStallNotice(message);
    setIsListening(false);
    restartGenRef.current += 1;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort?.();
    } catch {
    }
    recognitionRef.current = null;
  }

  useEffect(() => {
    if (captureHidden) {
      micSessionAliveRef.current = false;
      restartGenRef.current += 1;
      userPausedMicRef.current = false;
      setMicPausedByUser(false);
      setMicStallNotice(null);
      setSpeechError(null);
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      stopDictationInternal(false);
      return;
    }
    if (encounterActive) {
      micSessionAliveRef.current = true;
      giveUpAutoMicRef.current = false;
      rapidEndBurstRef.current = 0;
      lastEndAtRef.current = 0;
      startFailCountRef.current = 0;
      restartGenRef.current += 1;
      userPausedMicRef.current = false;
      setMicPausedByUser(false);
      setMicStallNotice(null);
      setSpeechError(null);
      const id = requestAnimationFrame(() => {
        startDictationInternal(false);
      });
      return () => {
        micSessionAliveRef.current = false;
        restartGenRef.current += 1;
        cancelAnimationFrame(id);
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = null;
        }
        stopDictationInternal(false);
      };
    }

    micSessionAliveRef.current = false;
    restartGenRef.current += 1;
    giveUpAutoMicRef.current = false;
    rapidEndBurstRef.current = 0;
    startFailCountRef.current = 0;
    userPausedMicRef.current = false;
    setMicPausedByUser(false);
    setMicStallNotice(null);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    stopDictationInternal(false);
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterActive, startSignal, captureHidden]);

  function buildRecognitionTranscript(event: any): string {
    const results = Array.from(event.results as ArrayLike<any>);
    return results
      .map((result) => result[0]?.transcript ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stopDictationInternal(userInitiated: boolean) {
    if (userInitiated) {
      userPausedMicRef.current = true;
      setMicPausedByUser(true);
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop?.();
    } catch {
    }
    try {
      recognitionRef.current?.abort?.();
    } catch {
    }
    recognitionRef.current = null;
    setIsListening(false);
  }

  function scheduleRestart() {
    if (!micSessionAliveRef.current || userPausedMicRef.current || giveUpAutoMicRef.current) {
      return;
    }
    restartGenRef.current += 1;
    const gen = restartGenRef.current;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    const delay = Math.min(
      7500,
      420 +
        startFailCountRef.current * 520 +
        rapidEndBurstRef.current * 90 +
        Math.floor(Math.random() * 180),
    );
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (gen !== restartGenRef.current) {
        return;
      }
      if (!micSessionAliveRef.current || userPausedMicRef.current || giveUpAutoMicRef.current) {
        return;
      }
      startDictationInternal(false);
    }, delay);
  }

  function startDictationInternal(userClickedDictate: boolean) {
    const win = window as Window & { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SpeechRecognition = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setDictationSupported(false);
      return;
    }

    if (!userClickedDictate && !micSessionAliveRef.current) {
      return;
    }

    if (userClickedDictate) {
      giveUpAutoMicRef.current = false;
      rapidEndBurstRef.current = 0;
      startFailCountRef.current = 0;
      lastEndAtRef.current = 0;
      userPausedMicRef.current = false;
      setMicPausedByUser(false);
      setMicStallNotice(null);
      restartGenRef.current += 1;
    }

    if (giveUpAutoMicRef.current && !userClickedDictate) {
      return;
    }

    if (userPausedMicRef.current && !userClickedDictate) {
      return;
    }

    try {
      recognitionRef.current?.stop?.();
    } catch {
    }
    try {
      recognitionRef.current?.abort?.();
    } catch {
    }
    recognitionRef.current = null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    const baseTranscript = transcriptRef.current.trim();

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (!micSessionAliveRef.current) {
        return;
      }
      rapidEndBurstRef.current = 0;
      startFailCountRef.current = 0;
      const sessionTranscript = buildRecognitionTranscript(event);
      const combinedTranscript = [baseTranscript, sessionTranscript].filter(Boolean).join(" ").trim();
      transcriptRef.current = combinedTranscript;
      onTranscriptChange(combinedTranscript);
    };

    recognition.onerror = (event: any) => {
      const code = event?.error ?? "unknown";
      if (code === "aborted") {
        return;
      }
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (!micSessionAliveRef.current) {
        return;
      }
      setIsListening(false);
      recognitionRef.current = null;
      if (code === "not-allowed") {
        setSpeechError("Microphone blocked — allow access in the browser address bar, or type the visit.");
        return;
      }
      if (userPausedMicRef.current || giveUpAutoMicRef.current) {
        return;
      }
      if (code === "no-speech") {
        scheduleRestart();
        return;
      }
      if (code === "network" || code === "audio-capture" || code === "service-not-allowed") {
        startFailCountRef.current += 2;
      } else {
        startFailCountRef.current += 1;
      }
      if (startFailCountRef.current >= MAX_START_FAILURES) {
        giveUpMicReconnect("The microphone hit repeated errors. Tap Dictate to try again.");
        return;
      }
      scheduleRestart();
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (!micSessionAliveRef.current) {
        return;
      }
      setIsListening(false);
      recognitionRef.current = null;
      if (userPausedMicRef.current || giveUpAutoMicRef.current) {
        return;
      }
      const now = Date.now();
      if (now - lastEndAtRef.current < RAPID_END_MS) {
        rapidEndBurstRef.current += 1;
      } else {
        rapidEndBurstRef.current = 1;
      }
      lastEndAtRef.current = now;
      if (rapidEndBurstRef.current >= MAX_RAPID_END_BURST) {
        giveUpMicReconnect("The microphone kept disconnecting. Tap Dictate to try again.");
        return;
      }
      scheduleRestart();
    };

    recognitionRef.current = recognition;
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      if (!micSessionAliveRef.current || userPausedMicRef.current || giveUpAutoMicRef.current) {
        return;
      }
      startFailCountRef.current += 1;
      if (startFailCountRef.current >= MAX_START_FAILURES) {
        giveUpMicReconnect("Could not start the microphone. Tap Dictate to try again.");
        return;
      }
      scheduleRestart();
    }
  }

  function toggleDictation() {
    if (micPausedByUser) {
      startDictationInternal(true);
      return;
    }
    stopDictationInternal(true);
  }

  const transcriptBusy = aiChartLoading || polishLoading;
  const showLiveBanner = !captureHidden && encounterActive && dictationSupported && !speechError;
  const recordingSessionHot = showLiveBanner && !micPausedByUser;
  const userPausedStrip = showLiveBanner && micPausedByUser;

  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-700/80 bg-slate-900/70 text-slate-100 transition-[box-shadow] duration-300",
        recordingSessionHot ? "ring-2 ring-red-500/80 shadow-[0_0_24px_-4px_rgba(239,68,68,0.45)]" : "",
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Fast LTC psych follow-up note capture</CardTitle>
            <CardDescription className="mt-1 max-w-2xl text-slate-300">
              {captureHidden
                ? "Visit capture uses Record visit from the dashboard. Adjust encounter metadata below, then end and save when finished."
                : "Use HTTPS or localhost for the microphone. Open Record visit for a full-screen capture (MediaRecorder → OpenAI transcription → chart). Polish text and AI chart visit refine the transcript. Dictate adds optional live browser captions."}
            </CardDescription>
          </div>
          {encounterActive ? (
            <Button type="button" variant="secondary" size="sm" onClick={onEndEncounter}>
              <Square className="h-4 w-4" />
              <span>End &amp; Save Encounter</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {encounterActive && !captureHidden ? (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 sm:px-5",
              recordingSessionHot
                ? "border-red-500/60 bg-red-950/40"
                : userPausedStrip
                  ? "border-amber-500/50 bg-amber-950/30"
                  : "border-slate-600 bg-slate-950/50",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              {recordingSessionHot ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <p className="text-sm font-semibold text-red-100">
                    Recording visit for {patientName.trim() || "this patient"} — mic stays on until you pause
                  </p>
                </>
              ) : null}
              {userPausedStrip ? (
                <p className="text-sm font-medium text-amber-100">
                  {micStallNotice ? (
                    micStallNotice
                  ) : (
                    <>
                      Mic paused — tap <span className="font-semibold">Dictate</span> to resume, or type below.
                    </>
                  )}
                </p>
              ) : null}
              {!dictationSupported ? (
                <p className="text-sm text-amber-100">
                  This browser does not support speech recognition. Type the visit in the box below (Chrome or Edge on desktop works best).
                </p>
              ) : null}
              {speechError ? <p className="text-sm text-red-200">{speechError}</p> : null}
            </div>
            {recordingSessionHot ? (
              <p className="mt-2 text-xs text-red-200/90">
                Text appears in the box as the browser captures speech. Short gaps are normal; the engine reconnects in the background.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-200">Age</span>
            <Input
              inputMode="numeric"
              type="number"
              min={0}
              placeholder="e.g. 78"
              value={input.age ?? ""}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (next === "") {
                  onAgeChange(null);
                  return;
                }

                const parsedAge = Number(next);
                onAgeChange(Number.isFinite(parsedAge) ? parsedAge : null);
              }}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-200">Sex</span>
            <Select
              value={input.sex ?? ""}
              onChange={(event) => onSexChange((event.currentTarget.value || null) as EncounterInput["sex"])}
            >
              <option value="">Select sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </label>

          <label className="space-y-2 sm:col-span-1">
            <span className="text-sm font-medium text-slate-200">Generate 90833</span>
            <div className="flex h-11 items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-4 shadow-sm">
              <span className="text-sm text-slate-200">Psychotherapy note</span>
              <Switch
                checked={input.enablePsychotherapy}
                onCheckedChange={onEnablePsychotherapyChange}
              />
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-200">Diagnoses</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {diagnosisOrder.map((diagnosis) => {
              const checked = input.diagnoses.includes(diagnosis);
              return (
                <label
                  key={diagnosis}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    checked ? "border-primary/40 bg-primary/10" : "border-slate-700 bg-slate-950/50",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => onToggleDiagnosis(diagnosis)} />
                  <span className="text-sm font-medium text-slate-100">{diagnosisLabels[diagnosis]}</span>
                </label>
              );
            })}
          </div>
        </div>

        {captureHidden ? null : (
          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-sm font-medium text-slate-200">Visit transcript</span>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
                  Record visit opens a dedicated page: capture audio, transcribe, and build the chart automatically. Use Dictate here for quick draft text, or polish then AI chart below.
                </p>
              </div>
              <Button
                type="button"
                variant={!micPausedByUser ? "secondary" : "outline"}
                size="sm"
                onClick={toggleDictation}
                disabled={!dictationSupported || !encounterActive}
              >
                {!micPausedByUser ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{!micPausedByUser ? "Pause mic" : "Dictate"}</span>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRecordVisit}
                disabled={!encounterActive || transcriptBusy}
                className="border-slate-600"
              >
                <AudioLines className="h-4 w-4" />
                <span>Record visit</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onPolishTranscript()}
                disabled={!encounterActive || !input.transcript.trim() || transcriptBusy}
                className="border-slate-600"
              >
                <Sparkles className="h-4 w-4" />
                <span>{polishLoading ? "Polishing…" : "Polish text"}</span>
              </Button>
            </div>
            <Textarea
              ref={textareaRef}
              value={input.transcript}
              onChange={(event) => onTranscriptChange(event.currentTarget.value)}
              className={cn(
                "min-h-[260px] resize-y text-[15px] leading-7",
                recordingSessionHot ? "border-red-500/40 bg-slate-950/80" : "",
              )}
              placeholder="After Record visit you return here with transcript and chart sections filled. You can also Dictate, paste, or type, then Polish or AI chart."
              spellCheck={false}
            />
            {aiChartError ? <p className="text-sm leading-6 text-red-400">{aiChartError}</p> : null}
            {recordingSessionHot && isListening ? (
              <p className="text-xs text-sky-300">Heard audio — updating transcript.</p>
            ) : null}
            {recordingSessionHot && !isListening ? (
              <p className="text-xs text-slate-400">Reconnecting microphone (waits longer after errors)…</p>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter
        className={cn(
          "hidden flex-wrap gap-3 border-t border-slate-700/80 bg-slate-950/40 px-5 py-4 sm:px-6",
          !captureHidden && "sm:flex",
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onRecordVisit}
          disabled={!encounterActive || transcriptBusy}
          className="min-w-0 flex-1 border-slate-600"
        >
          <AudioLines className="h-4 w-4" />
          <span>Record visit</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void onPolishTranscript()}
          disabled={!encounterActive || !input.transcript.trim() || transcriptBusy}
          className="min-w-0 flex-1 border-slate-600"
        >
          <Sparkles className="h-4 w-4" />
          <span>{polishLoading ? "Polishing…" : "Polish text"}</span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => void onAiChart()}
          disabled={transcriptBusy}
          className="min-w-0 flex-[2] border-cyan-700/60 bg-cyan-950/30"
        >
          <Bot className="h-4 w-4" />
          <span>{aiChartLoading ? "AI charting…" : "AI chart visit"}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
