"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface UserAccess {
  email: string;
  name: string;
  active: boolean;
  perms: string[];
  isOwner: boolean;
  createdAt: string;
}

interface ApiResponse {
  users: UserAccess[];
  currentUser: UserAccess;
  allPermissions: readonly string[];
}

const PERM_LABELS: Record<string, string> = {
  pnl: "📈 P&L",
  egresos: "💰 Egresos",
  proveedores: "🏢 Proveedores",
  caja: "💵 Caja diaria",
  descuentos: "💸 Descuentos",
  alertas: "🔔 Alertas",
  facturas: "📸 Carga de facturas",
  consumo: "📊 Consumo",
  stock: "📦 Stock",
  menu: "🍣 Menú",
  competencia: "🏯 Competencia",
};

export default function UsuariosPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newAdminAll, setNewAdminAll] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/usuarios");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const togglePerm = (user: UserAccess, perm: string) => {
    if (user.isOwner) return;
    if (user.perms.includes("*")) {
      // Si tiene *, sacar * y dejar solo este perm
      saveUser({ ...user, perms: [perm] });
    } else if (user.perms.includes(perm)) {
      saveUser({ ...user, perms: user.perms.filter((p) => p !== perm) });
    } else {
      saveUser({ ...user, perms: [...user.perms, perm] });
    }
  };

  const toggleAllPerms = (user: UserAccess) => {
    if (user.isOwner) return;
    const hasAll = user.perms.includes("*");
    saveUser({ ...user, perms: hasAll ? [] : ["*"] });
  };

  const toggleActive = (user: UserAccess) => {
    if (user.isOwner) return;
    saveUser({ ...user, active: !user.active });
  };

  const saveUser = async (user: UserAccess) => {
    setSaving(user.email);
    setError(null);
    try {
      const res = await fetch("/api/erp/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.name,
          perms: user.perms,
          active: user.active,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData((prev) => prev ? { ...prev, users: d.users } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };

  const removeUser = async (email: string) => {
    if (!confirm(`¿Eliminar acceso de ${email}? El usuario podrá seguir logueándose pero no podrá entrar a Administración.`)) return;
    setSaving(email);
    setError(null);
    try {
      const res = await fetch(`/api/erp/usuarios?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData((prev) => prev ? { ...prev, users: d.users } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };

  const addUser = async () => {
    if (!newEmail || !newName) {
      setError("Falta email o nombre");
      return;
    }
    const perms = newAdminAll ? ["*"] : Array.from(newPerms);
    if (perms.length === 0) {
      setError("Asigná al menos un permiso o marcá 'Acceso total'");
      return;
    }
    setSaving(newEmail);
    setError(null);
    try {
      const res = await fetch("/api/erp/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          perms,
          active: true,
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData((prev) => prev ? { ...prev, users: d.users } : prev);
      // Reset form
      setNewEmail("");
      setNewName("");
      setNewPerms(new Set());
      setNewAdminAll(false);
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Usuarios y permisos</h1>
        <p className="text-xs text-gray-400 mt-1">
          Solo el owner (matiaskweller@gmail.com) puede modificar permisos. Los usuarios deben además
          estar en <code className="bg-gray-100 px-1 rounded">ALLOWED_EMAILS</code> para poder loguearse.
        </p>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">⚠️ {error}</div>}

      {data && !loading && (
        <>
          {/* Add user button */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              {showAddForm ? "✕ Cancelar" : "+ Agregar usuario"}
            </button>
          </div>

          {/* Add user form */}
          {showAddForm && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Nuevo usuario</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="usuario@gmail.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Nombre</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del usuario"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs text-gray-500 uppercase mb-2 block">Permisos</label>
                <label className="flex items-center gap-2 mb-3 text-sm bg-emerald-50 px-3 py-2 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAdminAll}
                    onChange={(e) => {
                      setNewAdminAll(e.target.checked);
                      if (e.target.checked) setNewPerms(new Set());
                    }}
                  />
                  <span className="font-medium text-emerald-700">Acceso total (admin)</span>
                </label>
                {!newAdminAll && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {data.allPermissions.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                        <input
                          type="checkbox"
                          checked={newPerms.has(p)}
                          onChange={(e) => {
                            const next = new Set(newPerms);
                            if (e.target.checked) next.add(p);
                            else next.delete(p);
                            setNewPerms(next);
                          }}
                        />
                        {PERM_LABELS[p] || p}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={addUser}
                disabled={!!saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Crear usuario"}
              </button>
            </div>
          )}

          {/* Users list */}
          <div className="space-y-3">
            {data.users.map((u) => {
              const isSaving = saving === u.email;
              const hasAll = u.perms.includes("*");
              return (
                <div
                  key={u.email}
                  className={`bg-white border rounded-xl p-4 ${u.isOwner ? "border-blue-300 bg-blue-50/30" : "border-gray-200"} ${!u.active ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-navy">{u.name || "(sin nombre)"}</span>
                        {u.isOwner && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">OWNER</span>
                        )}
                        {hasAll && !u.isOwner && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
                        )}
                        {!u.active && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">INACTIVO</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!u.isOwner && (
                        <>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={isSaving}
                            className={`text-xs px-2 py-1 rounded-md ${
                              u.active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            } disabled:opacity-50`}
                          >
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            onClick={() => removeUser(u.email)}
                            disabled={isSaving}
                            className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            🗑 Eliminar
                          </button>
                        </>
                      )}
                      {isSaving && <span className="text-xs text-gray-400">guardando...</span>}
                    </div>
                  </div>

                  {/* Acceso total toggle */}
                  {!u.isOwner && (
                    <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasAll}
                        onChange={() => toggleAllPerms(u)}
                        disabled={isSaving}
                      />
                      <span className="font-medium text-emerald-700">Acceso total a todas las secciones</span>
                    </label>
                  )}

                  {/* Permission grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                    {data.allPermissions.map((p) => {
                      const has = hasAll || u.perms.includes(p);
                      return (
                        <label
                          key={p}
                          className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded transition-colors ${
                            u.isOwner || hasAll ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                          } ${has ? "bg-emerald-50 text-emerald-700" : "text-gray-500"}`}
                        >
                          <input
                            type="checkbox"
                            checked={has}
                            disabled={u.isOwner || hasAll || isSaving}
                            onChange={() => togglePerm(u, p)}
                          />
                          {PERM_LABELS[p] || p}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-xs text-gray-400">
            Cambios se guardan automáticamente en MASUNORI_ERP_CONFIG / Usuarios. Cache de 5 min.
          </div>
        </>
      )}
    </div>
  );
}
