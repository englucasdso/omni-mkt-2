import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, Target, Network, Filter, CheckCircle2, AlertCircle, Clock, User, Info, Shield, LogOut, Trash2, Plus, Settings, Landmark, LayoutList, RefreshCw, Check, Loader2, KeyRound, Activity, ArrowRight, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Download, Sparkles, FileText, Layers, Tag, Code2, Eye, ArrowUpDown, Calendar, RotateCcw, SlidersHorizontal } from "lucide-react";

/** Painel flutuante de progresso da sincronização com o Confluence. */
export const SyncWidget = ({ job, onCancel }: { job: any, onCancel: () => void }) => {
  if (!job.active) return null;

  const hasTotal = typeof job.total === "number" && job.total > 0;
  const isSuccess = job.status === "success";
  const isError = job.status === "error";
  const isRunning = job.status === "running";
  const isDeterminate = isSuccess || (isRunning && hasTotal);
  const displayPercentage = isSuccess ? 100 : (hasTotal ? Math.max(0, Math.min(99, Number(job.percentage) || 0)) : null);
  const currentMessage = job.message || "Validando sessão do Confluence...";

  const cleanErrorMsg = isError
    ? String(job.errorMsg || "Não foi possível concluir a sincronização.").split("\n")[0].trim()
    : "";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="fixed bottom-6 right-6 z-[100] bg-white dark:bg-slate-900 rounded-xl shadow-overlay border border-omni-line dark:border-slate-700 p-4 w-[340px] flex flex-col gap-3 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 dark:bg-slate-700 overflow-hidden">
        {isDeterminate ? (
          <div 
            className={`h-full transition-all duration-300 ease-out ${isError ? 'bg-red-500' : isSuccess ? 'bg-emerald-600' : 'bg-omni-action'}`} 
            style={{ width: `${displayPercentage ?? 0}%` }}
          />
        ) : isError ? (
          <div className="h-full w-full bg-red-500" />
        ) : (
          <div className="h-full w-2/5 bg-bradesco-red animate-pulse rounded-full" />
        )}
      </div>
      
      <div className="flex items-start justify-between mt-1">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
             {isRunning && <Loader2 className="w-5 h-5 text-bradesco-red animate-spin" />}
             {isSuccess && <CheckCircle2 className="w-5 h-5 text-green-500" />}
             {isError && <AlertTriangle className="w-5 h-5 text-red-500" />}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-gray-900 dark:text-slate-50 text-sm truncate">
                {isRunning ? "Sincronizando com o Confluence" : isSuccess ? "Sincronização concluída" : "A sincronização falhou"}
              </span>
              {displayPercentage !== null && !isError && (
                <span className="text-xs font-bold text-gray-700 dark:text-slate-200 tabular-nums shrink-0">
                  {displayPercentage}%
                </span>
              )}
            </div>

            {isRunning && hasTotal && (
              <span className="text-[11px] text-gray-700 dark:text-slate-300 font-semibold leading-tight mt-0.5 tabular-nums">
                {job.processed} de {job.total} páginas
              </span>
            )}

            {isSuccess && hasTotal && (
              <span className="text-[11px] text-gray-700 dark:text-slate-300 font-semibold leading-tight mt-0.5 tabular-nums">
                {job.total} páginas processadas
              </span>
            )}

            <span className="text-[11.5px] text-gray-500 dark:text-slate-400 leading-snug mt-0.5">
              {isError
                ? "Não foi possível concluir"
                : isSuccess
                  ? ((job.failed > 0 || job.reused > 0)
                      ? `${job.succeeded} lidas · ${job.reused} reutilizadas · ${job.failed} com falha`
                      : currentMessage)
                  : currentMessage}
            </span>
          </div>
        </div>
      </div>
      
      {isError && (
        <div className="text-[12px] text-red-800 bg-red-50 border border-red-100 p-2.5 rounded-lg mt-1 space-y-1">
          <p className="font-medium">{cleanErrorMsg}</p>
          <p className="text-red-700/90">O inventário anterior foi mantido sem alterações. Verifique o acesso ao Confluence e tente de novo.</p>
        </div>
      )}
      
      {isRunning && (
        <button 
          onClick={onCancel}
          className="text-[12px] font-medium text-gray-500 dark:text-slate-400 hover:text-red-700 transition-colors w-full text-left flex items-center gap-1.5 px-1 py-1 mt-1"
        >
          <X className="w-3 h-3" /> Cancelar e manter o inventário atual
        </button>
      )}
    </motion.div>
  );
};
