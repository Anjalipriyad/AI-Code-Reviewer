"use client";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

export default function SecurityPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
        <Shield size={24} className="text-[var(--color-accent)]" />
        Security Audit
      </h1>
      <p className="text-sm text-white/40 mt-1">Deep security scanning across all connected repositories</p>
      <div className="glass rounded-xl p-12 mt-6 flex flex-col items-center justify-center text-center">
        <Shield size={48} className="text-white/10 mb-4" />
        <p className="text-sm text-white/30">Security audit dashboard coming soon</p>
      </div>
    </motion.div>
  );
}
