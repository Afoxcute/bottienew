"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatProvider, useChatSheet } from "@/contexts/chat-context";
import { GoalsProvider } from "@/contexts/goals-context";
import { ChatSheet } from "@/components/chat/chat-sheet";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useGoals } from "@/hooks/use-goals";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { VoiceWaveform } from "@/components/chat/voice-waveform";
import {
  SettingsSidebar,
  ScreenStackWrapper,
} from "@/components/dashboard/settings-sidebar";
import { LoadingScreen } from "@/components/ui/loading-screen";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return <LoadingScreen progress={25} />;
  }

  return (
    <ChatProvider>
      <AppShell>{children}</AppShell>
    </ChatProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { isOpen, sidebarOpen, openSidebar, closeSidebar } = useChatSheet();
  const data = useDashboardData();
  const { goals: rawGoals, isLoading: goalsLoading, refetch: refetchGoals } = useGoals();

  const goalsMap = useMemo(
    () => Object.fromEntries(
      rawGoals.map((g) => [g.vaultId, { name: g.name, targetUsd: parseFloat(g.targetAmount) }])
    ),
    [rawGoals],
  );

  // Overlay pattern: mount app as soon as data is ready, loading screen fades out on top
  // This eliminates the gap between loading screen disappearing and content appearing
  const dataReady = !data.vaultsLoading && !goalsLoading;
  const [appMounted, setAppMounted] = useState(dataReady);
  const [overlayVisible, setOverlayVisible] = useState(!dataReady);
  const handleLoadingExit = useCallback(() => setOverlayVisible(false), []);

  // Mount app as soon as data is ready
  useEffect(() => {
    if (dataReady && !appMounted) setAppMounted(true);
  }, [dataReady, appMounted]);

  // Safety valve — never block longer than 6s
  useEffect(() => {
    const t = setTimeout(() => { setAppMounted(true); setOverlayVisible(false); }, 6000);
    return () => clearTimeout(t);
  }, []);

  const loadingProgress =
    !data.vaultsLoading && !goalsLoading ? 100 :
    !data.vaultsLoading ? 70 :
    !goalsLoading ? 40 :
    15;

  // Lock body scroll when chat sheet or sidebar is open
  useEffect(() => {
    if (isOpen || sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, sidebarOpen]);

  return (
    <GoalsProvider value={{ goals: goalsMap, refetch: refetchGoals }}>
      {/* Loading overlay — sits on top while data loads, then fades away revealing app beneath */}
      {overlayVisible && (
        <LoadingScreen
          progress={loadingProgress}
          skipEntry
          onExit={handleLoadingExit}
        />
      )}

      {/* App content — mounts as soon as data is ready, stagger plays while overlay fades */}
      {appMounted && (
        <div className="relative min-h-dvh bg-cream-dark">
          {/* Sidebar — dark full-screen bg, BEHIND the card */}
          <SettingsSidebar
            open={sidebarOpen}
            onClose={closeSidebar}
            walletBalanceUsd={data.walletBalanceUsd}
          />

          {/* Main content — floating card ON TOP, slides right to reveal sidebar */}
          <ScreenStackWrapper open={sidebarOpen} onOpen={openSidebar} onClose={closeSidebar}>
            <div className="flex min-h-dvh flex-col bg-cream-dark">
              <main className="flex-1 overflow-y-auto pb-20">{children}</main>
            </div>
          </ScreenStackWrapper>

          {/* Chat panel — always mounted, visibility controlled */}
          <ChatSheet visible={isOpen} />

          {/* Input bar — always visible except sidebar, z-60 above everything */}
          {!sidebarOpen && <ChatInputBar />}
        </div>
      )}
    </GoalsProvider>
  );
}

const morphEase = [0.16, 1, 0.3, 1] as const;
const morphProps = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.2, ease: morphEase },
};
const iconMorphProps = (dir: 1 | -1) => ({
  initial: { opacity: 0, scale: 0.6, rotate: dir * 90 },
  animate: { opacity: 1, scale: 1, rotate: 0 },
  exit: { opacity: 0, scale: 0.6, rotate: dir * -90 },
  transition: { duration: 0.15, ease: morphEase },
});

const MicIcon = ({ className = "text-sage" }: { className?: string }) => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M8 1a2.5 2.5 0 00-2.5 2.5v4a2.5 2.5 0 005 0v-4A2.5 2.5 0 008 1z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7.5a4 4 0 01-8 0M8 12.5v2M6.5 14.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-sage">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Fixed pill height — matches the action button's natural height so all states are identical
const PILL_INNER = "flex h-[66px] w-full items-center px-5";

function ChatInputBar() {
  const { open, isOpen, activeSheet, chatInput, setChatInput, sendMessage, isStreaming } = useChatSheet();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    isRecording, isTranscribing, setIsTranscribing,
    error: voiceError, analyserNode,
    startRecording, stopRecording, cancelRecording, clearError,
  } = useVoiceRecorder();

  const IDLE_LABELS: Record<NonNullable<typeof activeSheet>["type"], string> = {
    deposit: "Deposit",
    withdraw: "Withdraw",
    swap: "Confirm",
    goal: "Save goal",
  };
  const stepLabel = activeSheet
    ? activeSheet.step === "idle"
      ? IDLE_LABELS[activeSheet.type]
      : activeSheet.step === "processing"
        ? "Processing..."
        : activeSheet.step === "success"
          ? "Done!"
          : "Try again"
    : null;
  const stepBg = activeSheet?.step === "error" ? "bg-fail" : "bg-sage";
  const isActionDisabled = activeSheet?.step === "processing" || activeSheet?.step === "success";

  useEffect(() => {
    if (isOpen && !activeSheet && !isRecording) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, activeSheet, isRecording]);

  useEffect(() => {
    if (voiceError) {
      const t = setTimeout(clearError, 3000);
      return () => clearTimeout(t);
    }
  }, [voiceError, clearError]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && !isStreaming) sendMessage(chatInput);
  };

  const handleMicTap = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (!blob) return;
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", blob, `voice.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Transcription failed");
        const { text } = await res.json();
        if (text?.trim()) {
          sendMessage(text.trim());
          if (!isOpen) open();
        }
      } catch {
        // Silently fail — user can type instead
      } finally {
        setIsTranscribing(false);
      }
    } else {
      startRecording();
    }
  };

  // Determine mode
  const mode = activeSheet ? "action"
    : isRecording ? "recording"
    : isTranscribing ? "transcribing"
    : isOpen ? "chat"
    : "idle";

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
      <div className="mx-auto max-w-lg lg:max-w-3xl">
        <div className="overflow-hidden rounded-full border border-border/60 bg-cream/70 shadow-[0_1px_8px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-colors duration-300">
          <AnimatePresence mode="wait" initial={false}>

            {mode === "action" && activeSheet && (
              <motion.div key="action" {...morphProps} className={`${PILL_INNER} justify-between`}>
                <button
                  onClick={activeSheet.onCancel}
                  disabled={activeSheet.step === "processing"}
                  className="font-body text-sm text-ink-light transition-opacity disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={activeSheet.onConfirm}
                  disabled={isActionDisabled}
                  className={`rounded-full ${stepBg} px-6 py-2 font-body text-sm text-cream transition-all duration-200 disabled:opacity-70 ${
                    activeSheet.step === "processing" ? "animate-pulse" : ""
                  }`}
                >
                  {stepLabel}
                </button>
              </motion.div>
            )}

            {mode === "recording" && (
              <motion.div key="recording" {...morphProps} className={`${PILL_INNER} gap-3`}>
                <button onClick={cancelRecording} className="rounded-full p-1 text-ink-light/60 transition-opacity hover:text-ink">
                  <CloseIcon />
                </button>
                <div className="flex-1">
                  <VoiceWaveform analyserNode={analyserNode} isRecording={isRecording} />
                </div>
                <button onClick={handleMicTap} className="rounded-full bg-sage p-1.5 text-cream transition-transform duration-200 active:scale-90">
                  <ArrowIcon />
                </button>
              </motion.div>
            )}

            {mode === "transcribing" && (
              <motion.div key="transcribing" {...morphProps} className={`${PILL_INNER} justify-center`}>
                <span className="animate-pulse font-body text-sm text-sage">Transcribing...</span>
              </motion.div>
            )}

            {mode === "chat" && (
              <motion.form key="chat" {...morphProps} onSubmit={handleChatSubmit} className={`${PILL_INNER} gap-3`}>
                <input
                  ref={inputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={voiceError ? "Mic unavailable — type instead" : "What are you saving for?"}
                  className="flex-1 bg-transparent font-body text-sm text-ink outline-none placeholder:text-ink-light/40"
                />
                <AnimatePresence mode="wait" initial={false}>
                  {chatInput.trim() ? (
                    <motion.button key="send" type="submit" disabled={isStreaming} {...iconMorphProps(-1)} className="rounded-full p-1 disabled:opacity-30">
                      <ArrowIcon />
                    </motion.button>
                  ) : (
                    <motion.button key="mic" type="button" onClick={handleMicTap} disabled={isStreaming} {...iconMorphProps(1)} className="rounded-full p-1 disabled:opacity-30">
                      <MicIcon />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.form>
            )}

            {mode === "idle" && (
              <motion.div key="idle" {...morphProps} className={`${PILL_INNER} gap-3`}>
                <button onClick={() => open()} className="flex-1 text-left font-body text-sm text-ink-light/50">
                  What are you saving for?
                </button>
                <button onClick={handleMicTap} className="rounded-full p-1">
                  <MicIcon className="text-ink-light/30" />
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
