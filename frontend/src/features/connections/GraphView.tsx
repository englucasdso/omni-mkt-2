import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, Target, Network, Filter, CheckCircle2, AlertCircle, Clock, User, Info, Shield, LogOut, Trash2, Plus, Settings, Landmark, LayoutList, RefreshCw, Check, Loader2, KeyRound, Activity, ArrowRight, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Download, Sparkles, FileText, Layers, Tag, Code2, Eye, ArrowUpDown, Calendar, RotateCcw, SlidersHorizontal } from "lucide-react";
import { ConexoesCanvas } from "../../components/ConexoesCanvas";
import type { Artifact } from "../../types";
import { isCataloged } from "../../domain/artifacts";

/** Envoltório da árvore de Conexões: mantém a seleção e repassa o artefato-alvo vindo de "Ver na árvore". */
export const GraphView = ({ 
  data, 
  isEmbedded = false, 
  targetArtifactId,
  onClearTargetArtifactId,
  onClose, 
  onOpenMap 
}: { 
  data: Artifact[], 
  isEmbedded?: boolean, 
  targetArtifactId?: string | null,
  onClearTargetArtifactId?: () => void,
  onClose?: () => void, 
  onOpenMap?: (item: Artifact) => void 
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(targetArtifactId || null);

  useEffect(() => {
    if (targetArtifactId) {
      setSelectedItemId(targetArtifactId);
    }
  }, [targetArtifactId]);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
  }, []);

  const handleOpenItem = useCallback((item: Artifact) => {
    if (item && isCataloged(item)) {
      onOpenMap?.(item);
    }
  }, [onOpenMap]);

  const content = (
    <div className="flex-1 rounded-[40px] overflow-hidden border border-gray-100 dark:border-slate-700/50 shadow-sm relative w-full h-[calc(100vh-250px)] min-h-[600px] flex">
      <ConexoesCanvas 
        data={data} 
        selectedItemId={selectedItemId} 
        targetArtifactId={targetArtifactId}
        onClearTargetArtifactId={onClearTargetArtifactId}
        onSelectItem={handleSelectItem} 
        onOpenItem={handleOpenItem}
      />
    </div>
  );

  if (isEmbedded) {
    return <div className="flex flex-col h-[800px] min-h-[800px]">{content}</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-white dark:bg-slate-900 dark:border-slate-800 backdrop-blur-3xl p-12 flex flex-col"
    >
      <div className="flex justify-between items-center mb-12 px-4 max-w-7xl mx-auto w-full">
         <div className="flex items-center gap-4">
            <h1 className="brand-text text-2xl font-black tracking-tight text-gray-900 dark:text-slate-50 transition-colors">
              Hub de Artefatos
            </h1>
         </div>
         <button onClick={() => { if (onClose) onClose(); }} className="p-4 hover:bg-gray-100 dark:bg-slate-700 rounded-full transition-all hover:rotate-90">
            <X className="w-6 h-6 text-gray-400 dark:text-slate-500" />
         </button>
      </div>
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {content}
      </div>
    </motion.div>
  );
};

export default GraphView;
