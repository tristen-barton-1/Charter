"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Loader2, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chartFromConversation, createEncounter as apiCreateEncounter, fetchPatient, transcribeVisitAudio } from "@/lib/backend";
import type { EncounterInput, PatientRecord } from "@/lib/types";
import {
  buildSavedChart,
  createDefaultAppState,
  createWorkspaceFromPatient,
  loadPersistedAppState,
  mergeRecordFlowResultIntoState,
  savePersistedAppState,
  workspaceFromTranscriptDraft,
  type AppState,
} from "@/lib/charter-persisted-state";
import { RECORD_FLOW_CONTEXT_KEY, type RecordFlowContext, type RecordFlowResult } from "@/lib/record-flow-storage";

type Phase = "loading" | "preparing" | "recording" | "transcribing" | "charting" | "error";

function pickWhisperMimeType(): string | undefined {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const opt of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(opt)) {
      return opt;
    }
  }
  return undefined;
}

function readRecordContext(): RecordFlowContext | null {
  try {
    const raw = sessionStorage.getItem(RECORD_FLOW_CONTEXT_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as RecordFlowContext;
    if (!data.encounterInput || typeof data.encounterInput !== "object") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export default function RecordVisitPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = typeof params.patientId === "string" ? params.patientId : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [encounterInput, setEncounterInput] = useState<EncounterInput | null>(null);
  const [micSecureContext, setMicSecureContext] = useState(true);
  const [recorderCapable, setRecorderCapable] = useState(false);
  const [pauseSupported, setPauseSupported] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const abandonRecordingRef = useRef(false);

  const tearDownMedia = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    setMicSecureContext(window.isSecureContext);
    setRecorderCapable(typeof MediaRecorder !== "undefined");
    setPauseSupported(
      typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.prototype.pause === "function" &&
        typeof MediaRecorder.prototype.resume === "function",
    );
  }, []);

  useEffect(() => {
    if (!patientId) {
      setPhase("error");
      setErrorMessage("Missing patient.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const p = await fetchPatient(patientId);
        if (cancelled) {
          return;
        }
        const ctx = readRecordContext();
        const input: EncounterInput =
          ctx?.encounterInput ?? {
            age: p.age,
            sex: p.sex,
            diagnoses: p.diagnoses,
            transcript: "",
            enablePsychotherapy: p.enablePsychotherapy,
          };
        setPatient(p);
        setEncounterInput(input);
      } catch (e) {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage(e instanceof Error ? e.message : "Could not load patient.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (!patient || !encounterInput) {
      return;
    }
    if (!micSecureContext || !recorderCapable) {
      setPhase("error");
      setErrorMessage(
        !micSecureContext
          ? "Use HTTPS or localhost so the microphone can be used."
          : "This browser cannot record audio (try Chrome or Edge).",
      );
      return;
    }

    const p = patient;
    const input = encounterInput;

    async function runTranscribeAndChart(blob: Blob) {
      setErrorMessage(null);
      let transcriptText = "";
      try {
        transcriptText = await transcribeVisitAudio(blob);
      } catch (e) {
        setPhase("error");
        setErrorMessage(e instanceof Error ? e.message : "Transcription failed.");
        return;
      }

      setPhase("charting");
      try {
        const chartResult = await chartFromConversation({
          patient: p,
          transcript: transcriptText,
          encounterInput: input,
        });
        const payload: RecordFlowResult = {
          patientId: p.id,
          patient: p,
          encounterInput: input,
          transcript: transcriptText,
          polishedTranscript: chartResult.polishedTranscript,
          notes: chartResult.notes,
          parsed: chartResult.parsed,
        };
        const prev = loadPersistedAppState() ?? createDefaultAppState();
        const merged = mergeRecordFlowResultIntoState(prev, payload);
        const w = merged.workspaces[p.id];
        const startedAt = merged.encounterStartedAt ?? w.startedAt ?? new Date().toISOString();
        const draft = buildSavedChart(p.id, w, startedAt);
        let savedChart = draft;
        try {
          savedChart = await apiCreateEncounter(p.id, draft);
        } catch {
        }
        const finalized: AppState = {
          ...merged,
          encounterPatientId: null,
          encounterStartedAt: null,
          workspaces: {
            ...merged.workspaces,
            [p.id]: {
              ...w,
              charts: [savedChart, ...w.charts.filter((c) => c.id !== savedChart.id)],
              startedAt: null,
            },
          },
        };
        savePersistedAppState(finalized);
        sessionStorage.removeItem(RECORD_FLOW_CONTEXT_KEY);
        router.push(`/encounter/${p.id}?fromRecord=1`);
      } catch (e) {
        const prev = loadPersistedAppState() ?? createDefaultAppState();
        const baseW = prev.workspaces[p.id] ?? createWorkspaceFromPatient(p);
        const startedAt = prev.encounterStartedAt ?? baseW.startedAt ?? new Date().toISOString();
        const w = workspaceFromTranscriptDraft(p, input, transcriptText, baseW);
        const draft = buildSavedChart(p.id, w, startedAt);
        let savedChart = draft;
        try {
          savedChart = await apiCreateEncounter(p.id, draft);
        } catch {
        }
        const afterDraft: AppState = {
          ...prev,
          encounterPatientId: null,
          encounterStartedAt: null,
          workspaces: {
            ...prev.workspaces,
            [p.id]: {
              ...w,
              charts: [savedChart, ...w.charts.filter((c) => c.id !== savedChart.id)],
              startedAt: null,
            },
          },
        };
        savePersistedAppState(afterDraft);
        const hint =
          " Your transcript was saved under this patient’s Saved encounters—you can open it and tap Generate chart to try again.";
        setPhase("error");
        setErrorMessage((e instanceof Error ? e.message : "Chart generation failed.") + hint);
      }
    }

    let cancelled = false;

    void (async () => {
      try {
        abandonRecordingRef.current = false;
        setPhase("preparing");
        setErrorMessage(null);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const mimeType = pickWhisperMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        const sessionChunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            sessionChunks.push(event.data);
          }
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          if (cancelled || abandonRecordingRef.current) {
            return;
          }
          const blob = new Blob(sessionChunks, {
            type: recorder.mimeType || mimeType || "audio/webm",
          });
          if (blob.size < 256) {
            setPhase("error");
            setErrorMessage(
              "No audio was captured (empty recording). Check the mic and try again, or use another browser.",
            );
            return;
          }
          setPhase("transcribing");
          void runTranscribeAndChart(blob);
        };
        recorder.start(250);
        setRecordingPaused(false);
        setPhase("recording");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage("Microphone permission is required to record this visit.");
        }
      }
    })();

    return () => {
      cancelled = true;
      tearDownMedia();
    };
  }, [patient, encounterInput, micSecureContext, recorderCapable, tearDownMedia, router]);

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      return;
    }
    if (
      (rec.state === "recording" || rec.state === "paused") &&
      typeof rec.requestData === "function"
    ) {
      rec.requestData();
    }
    setRecordingPaused(false);
    rec.stop();
  }

  function togglePauseRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      return;
    }
    try {
      if (rec.state === "recording") {
        rec.pause();
        setRecordingPaused(true);
      } else if (rec.state === "paused") {
        rec.resume();
        setRecordingPaused(false);
      }
    } catch {
      setRecordingPaused(false);
    }
  }

  function handleCancel() {
    abandonRecordingRef.current = true;
    tearDownMedia();
    sessionStorage.removeItem(RECORD_FLOW_CONTEXT_KEY);
    const prev = loadPersistedAppState() ?? createDefaultAppState();
    const next = {
      ...prev,
      encounterPatientId: null,
      encounterStartedAt: null,
      viewMode: "dashboard" as const,
      workspaces:
        patient && patientId
          ? { ...prev.workspaces, [patientId]: createWorkspaceFromPatient(patient) }
          : prev.workspaces,
    };
    savePersistedAppState(next);
    router.push("/");
  }

  const title = patient?.name ? `Recording — ${patient.name}` : "Record visit";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {phase === "loading" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </p>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-lg">
          {phase === "recording" ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <span className="relative flex h-16 w-16">
                  {recordingPaused ? (
                    <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-600/90">
                      <Pause className="h-7 w-7 text-white" />
                    </span>
                  ) : (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/30" />
                      <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-600/90">
                        <span className="h-3 w-3 rounded-full bg-white" />
                      </span>
                    </>
                  )}
                </span>
              </div>
              <p className={`text-base font-medium ${recordingPaused ? "text-amber-100" : "text-red-100"}`}>
                {recordingPaused ? "Paused" : "Recording in progress"}
              </p>
              <p className="text-sm text-slate-400">
                {recordingPaused
                  ? "Recording is paused. Resume when you are ready to continue, or end to finish and generate the chart."
                  : pauseSupported
                    ? "Speak normally. Pause anytime if you need a break. When you stop, audio uploads and Whisper runs—then the chart is generated."
                    : "Speak normally. When you stop, audio uploads and Whisper runs—then the chart is generated."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                {pauseSupported ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="w-full border-slate-600 bg-slate-950/50 sm:flex-1"
                    onClick={togglePauseRecording}
                  >
                    {recordingPaused ? (
                      <>
                        <Play className="h-4 w-4" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4" />
                        <span>Pause</span>
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  className={`w-full bg-red-950/50 text-red-100 hover:bg-red-950/70 ${pauseSupported ? "sm:flex-1" : ""}`}
                  onClick={stopRecording}
                >
                  <Square className="h-4 w-4" />
                  <span>End / stop recording</span>
                </Button>
              </div>
              <Button type="button" variant="ghost" className="w-full text-slate-400" onClick={handleCancel}>
                Cancel and return
              </Button>
            </div>
          ) : null}

          {phase === "transcribing" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-cyan-400" />
              <p className="text-lg font-medium text-slate-100">Generating transcript</p>
              <p className="text-sm text-slate-400">
                Audio was uploaded as soon as you stopped; OpenAI is transcribing. This usually takes a few seconds.
              </p>
            </div>
          ) : null}

          {phase === "charting" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
              <p className="text-lg font-medium text-slate-100">Generating chart</p>
              <p className="text-sm text-slate-400">
                Building HPI, MSE, plan of care, and psychotherapy sections from the transcript.
              </p>
            </div>
          ) : null}

          {phase === "preparing" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
              <p className="text-sm text-slate-400">Starting microphone…</p>
              <Button type="button" variant="ghost" className="text-slate-400" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="space-y-4 py-4 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-amber-400" />
              <p className="text-sm text-slate-200">{errorMessage ?? "Something went wrong."}</p>
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => window.location.assign(`/encounter/${patientId}/record`)}>
                  Try again
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push(`/patients/${patientId}/history`)}
                >
                  Open saved encounters
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancel}>
                  Back to dashboard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
