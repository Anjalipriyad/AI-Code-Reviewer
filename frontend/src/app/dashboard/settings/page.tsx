"use client";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
        <Settings size={24} className="text-[var(--color-accent)]" />
        Settings
      </h1>
      <p className="text-sm text-white/40 mt-1">Configure your AI code reviewer preferences</p>
      <div className="glass rounded-xl p-12 mt-6 flex flex-col items-center justify-center text-center">
        <Settings size={48} className="text-white/10 mb-4" />
        <p className="text-sm text-white/30">Settings panel coming soon</p>
      </div>
    </motion.div>
  );
}
