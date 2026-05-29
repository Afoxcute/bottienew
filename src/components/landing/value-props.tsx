"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useInView,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { useVaults } from "@yo-protocol/react";

/* ── Data ─────────────────────────────────────────────────── */

const STATS = [
  { label: "Yield", type: "yield" as const, micro: "annual return, compounded automatically" },
  { label: "Fees", type: "fees" as const, micro: "no management, performance, or withdrawal fees" },
  { label: "Access", type: "access" as const, micro: "withdraw in seconds, no lock-up periods" },
];

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ── Yield: count 4 → 12 ─────────────────────────────────── */

function YieldNumber({ triggered, target = 12 }: { triggered: boolean; target?: number }) {
  const count = useMotionValue(Math.max(target - 8, 2));
  const display = useTransform(count, (v) => `Up to ${Math.round(v)}%`);

  useEffect(() => {
    if (!triggered) return;
    const ctrl = animate(count, target, { duration: 1.5, ease: "easeOut" });
    return () => ctrl.stop();
  }, [triggered, count, target]);

  return (
    <motion.p className="font-display tabular-nums text-[clamp(3.5rem,12vw,4.5rem)] leading-none tracking-tight text-ink">
      {display}
    </motion.p>
  );
}

/* ── Fees: countdown 100 → 0 → "Zero" ────────────────────── */

function FeesNumber({ triggered }: { triggered: boolean }) {
  const count = useMotionValue(100);
  const [done, setDone] = useState(false);
  const display = useTransform(count, (v) => String(Math.round(v)));

  useEffect(() => {
    if (!triggered) return;
    const ctrl = animate(count, 0, {
      duration: 1.8,
      ease: "easeOut",
      onComplete: () => setTimeout(() => setDone(true), 120),
    });
    return () => ctrl.stop();
  }, [triggered, count]);

  return (
    <AnimatePresence mode="wait">
      {!done ? (
        <motion.p
          key="count"
          exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
          className="font-display tabular-nums text-[clamp(3.5rem,12vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          {display}
        </motion.p>
      ) : (
        <motion.p
          key="word"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease }}
          className="font-display text-[clamp(3.5rem,12vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          Zero
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ── Access: clock 00:00 → 24:00 → "24/7" ────────────────── */

function AccessNumber({ triggered }: { triggered: boolean }) {
  const count = useMotionValue(0);
  const [done, setDone] = useState(false);
  const display = useTransform(count, (v) => {
    const h = Math.round(v);
    return `${h.toString().padStart(2, "0")}:00`;
  });

  useEffect(() => {
    if (!triggered) return;
    const ctrl = animate(count, 24, {
      duration: 1.4,
      ease: "easeOut",
      onComplete: () => setTimeout(() => setDone(true), 180),
    });
    return () => ctrl.stop();
  }, [triggered, count]);

  return (
    <AnimatePresence mode="wait">
      {!done ? (
        <motion.p
          key="clock"
          exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
          className="font-display tabular-nums text-[clamp(3.5rem,12vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          {display}
        </motion.p>
      ) : (
        <motion.p
          key="final"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease }}
          className="font-display tabular-nums text-[clamp(3.5rem,12vw,4.5rem)] leading-none tracking-tight text-ink"
        >
          24/7
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ── Single stat row ─────────────────────────────────────── */

function StatRow({
  stat,
  delay,
  isParentInView,
  maxApy,
}: {
  stat: (typeof STATS)[number];
  delay: number;
  isParentInView: boolean;
  maxApy?: number;
}) {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!isParentInView || triggered) return;
    const t = setTimeout(() => setTriggered(true), delay);
    return () => clearTimeout(t);
  }, [isParentInView, delay, triggered]);

  const show = triggered;

  return (
    <div>
      {/* Label */}
      <motion.p
        className="font-display italic text-lg text-sage/70"
        initial={{ opacity: 0 }}
        animate={show ? { opacity: 1 } : {}}
        transition={{ delay: 0.12, duration: 0.35 }}
      >
        {stat.label}
      </motion.p>

      {/* Number */}
      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
        transition={{ delay: 0.18, duration: 0.75, ease }}
        className="mt-1"
      >
        {stat.type === "yield" && <YieldNumber triggered={triggered} target={maxApy} />}
        {stat.type === "fees" && <FeesNumber triggered={triggered} />}
        {stat.type === "access" && <AccessNumber triggered={triggered} />}
      </motion.div>

      {/* Micro context */}
      <motion.p
        className="mt-3 font-body text-sm leading-snug text-ink-light/50 text-pretty"
        initial={{ opacity: 0 }}
        animate={show ? { opacity: 1 } : {}}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        {stat.micro}
      </motion.p>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────── */

export function ValueProps() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.35 });
  const { vaults } = useVaults();
  const maxApy = useMemo(() => {
    if (!vaults?.length) return 12;
    const apys = vaults.map((v) => parseFloat(v.yield?.["7d"] ?? "0")).filter((n) => !isNaN(n));
    return apys.length ? Math.round(Math.max(...apys)) : 12;
  }, [vaults]);

  return (
    <section ref={sectionRef} className="flex min-h-dvh flex-col justify-center px-6 py-16">
      <motion.p
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={isInView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
        transition={{ duration: 0.6, ease }}
        className="font-display italic text-2xl text-sage/70 text-balance"
      >
        Why Bottie
      </motion.p>

      <div className="mt-10 flex flex-col gap-10">
        {STATS.map((stat, i) => (
          <StatRow key={stat.label} stat={stat} delay={i * 280} isParentInView={isInView} maxApy={maxApy} />
        ))}
      </div>
    </section>
  );
}
