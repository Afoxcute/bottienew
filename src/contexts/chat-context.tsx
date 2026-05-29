"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { DashboardData } from "@/hooks/use-dashboard-data";

export interface ActiveSheet {
  type: "deposit" | "withdraw" | "swap" | "goal";
  onConfirm: () => void;
  onCancel: () => void;
  step: "idle" | "processing" | "success" | "error";
}

interface ChatContextType {
  isOpen: boolean;
  open: (prefill?: string) => void;
  close: () => void;
  prefill: string | null;
  clearPrefill: () => void;
  dashboardData: DashboardData | null;
  registerDashboardData: (data: DashboardData) => void;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  activeSheet: ActiveSheet | null;
  setActiveSheet: React.Dispatch<React.SetStateAction<ActiveSheet | null>>;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendMessage: (text: string) => void;
  registerSendMessage: (fn: (text: string) => void) => void;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const dataRef = useRef<DashboardData | null>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);

  const open = useCallback((msg?: string) => {
    if (msg) setPrefill(msg);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const clearPrefill = useCallback(() => setPrefill(null), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const registerDashboardData = useCallback((data: DashboardData) => {
    dataRef.current = data;
  }, []);

  const registerSendMessage = useCallback((fn: (text: string) => void) => {
    sendRef.current = fn;
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (sendRef.current && text.trim()) {
      sendRef.current(text);
      setChatInput("");
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        open,
        close,
        prefill,
        clearPrefill,
        get dashboardData() {
          return dataRef.current;
        },
        registerDashboardData,
        sidebarOpen,
        openSidebar,
        closeSidebar,
        activeSheet,
        setActiveSheet,
        chatInput,
        setChatInput,
        sendMessage,
        registerSendMessage,
        isStreaming,
        setIsStreaming,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatSheet() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatSheet must be used within ChatProvider");
  return ctx;
}
