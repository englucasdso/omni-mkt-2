import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, Target, Network, Filter, CheckCircle2, AlertCircle, Clock, User, Info, Shield, LogOut, Trash2, Plus, Settings, Landmark, LayoutList, RefreshCw, Check, Loader2, KeyRound, Activity, ArrowRight, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Download, Sparkles, FileText, Layers, Tag, Code2, Eye, ArrowUpDown, Calendar, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { User as UserType, UserRole, UserStatus } from "../../types";

export const AdminUsers = ({ users, onAddUser, onUpdateUser, onDeleteUser, onClose }: { 
  users: UserType[], 
  onAddUser: (u: Omit<UserType, 'id' | 'createdAt'>) => void,
  onUpdateUser: (u: UserType) => void,
  onDeleteUser: (id: string) => void,
  onClose: () => void 
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [formData, setFormData] = useState({ name: '', nickname: '', email: '', role: 'gestor360' as UserRole, status: 'ativo' as UserStatus });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate corporate email if needed, but not strictly asked, just "if applicable". Simple check could be `@bradesco.com.br` but we can leave without it or add a quick logic
    if (editingUser) {
      onUpdateUser({ ...editingUser, ...formData });
      setEditingUser(null);
    } else {
      onAddUser(formData);
      setShowAddForm(false);
    }
    setFormData({ name: '', nickname: '', email: '', role: 'gestor360', status: 'ativo' });
  };

  const startEdit = (user: UserType) => {
    setEditingUser(user);
    setFormData({ name: user.name, nickname: user.nickname || '', email: user.email, role: user.role, status: user.status || 'ativo' });
    setShowAddForm(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-white dark:bg-slate-900 dark:border-slate-800 backdrop-blur-xl p-8 flex flex-col"
    >
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-slate-50">Gestão de Usuários</h2>
            <p className="text-gray-500 dark:text-slate-400">Controle de acesso e permissões da plataforma</p>
          </div>
          <div className="flex items-center gap-4">
             {!showAddForm && (
                <button 
                  onClick={() => { setShowAddForm(true); setEditingUser(null); setFormData({ name: '', nickname: '', email: '', role: 'gestor360', status: 'ativo' }); }}
                  className="flex items-center gap-2 px-6 py-3 text-white rounded-2xl font-bold text-xs hover:opacity-90 transition-all shadow-xl dark:shadow-none shadow-red-200"
                   style={{ background: 'linear-gradient(90deg, #7D046D 0%, #cc092f 100%)' }}
                >
                  <Plus className="w-4 h-4" /> Novo Usuário
                </button>
             )}
            <button onClick={onClose} className="p-4 hover:bg-gray-100 dark:bg-slate-700 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {showAddForm ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-10 rounded-[40px] max-w-lg mx-auto">
            <h3 className="text-xl font-bold text-gray-900 dark:text-slate-50 mb-6">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 ml-4">Nome Completo</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="Nome do colaborador"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 ml-4">Apelido (Opcional)</label>
                <input 
                  type="text" 
                  value={formData.nickname}
                  onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="Apelido/Nome de exibição"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 ml-4">E-mail Corporativo</label>
                <input 
                  required
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="email@bradesco.com.br"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 ml-4">Perfil de Acesso</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200 appearance-none"
                >
                  <option value="gestor360">GESTOR 360 (Acesso Completo)</option>
                  <option value="estrategico">ESTRATÉGICO (Visão Estratégica)</option>
                  <option value="artefatos">ARTEFATOS (Hub de Artefatos)</option>
                  <option value="eventos">EVENTOS (Hub de Eventos)</option>
                  <option value="admin">ADMIN (Gestão Total)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 ml-4">Status</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as UserStatus })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200 appearance-none"
                >
                  <option value="ativo">ATIVO</option>
                  <option value="inativo">INATIVO</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-8 py-4 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-2xl font-bold text-xs hover:bg-gray-200 dark:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-8 py-4 text-white rounded-2xl font-bold text-xs hover:opacity-90 transition-all shadow-xl dark:shadow-none shadow-red-200"
                  style={{ background: 'linear-gradient(90deg, #7D046D 0%, #cc092f 100%)' }}
                >
                  {editingUser ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <div className="glass-card overflow-hidden rounded-[40px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">NOME / APELIDO</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">E-MAIL</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">PERFIL</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">STATUS</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:bg-slate-800/50 transition-colors">
                    <td className="p-6">
                      <p className="text-sm font-bold text-gray-900 dark:text-slate-50">{u.name}</p>
                      {u.nickname && <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">({u.nickname})</p>}
                    </td>
                    <td className="p-6 text-sm text-gray-500 dark:text-slate-400">{u.email}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black ${u.role === 'admin' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-100 dark:border-slate-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black ${u.status === 'ativo' || u.status === 'active' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                        {u.status === 'ativo' || u.status === 'active' ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td className="p-6 text-right space-x-2">
                       <button onClick={() => startEdit(u)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-bradesco-red transition-colors">Editar</button>
                       {users.length > 1 && (
                         <button onClick={() => onDeleteUser(u.id)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-bradesco-red transition-colors"><Trash2 className="w-4 h-4" /></button>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};
