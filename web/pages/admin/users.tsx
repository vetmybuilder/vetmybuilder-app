import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import LocationField from "@/components/forms/LocationField";
import { TRADE_TYPES } from "@/types/tradeTypes";

/* ========= Types ========= */
type User = {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "tradesman" | "admin";
  location: string | null;
  companyName?: string | null;
  trades?: string | null;
  areas?: string | null;
  status?: string | null;
  createdAt: string;
};

type ListResp = { items: User[]; total: number };

type ModalUser = {
  uid?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "user" | "tradesman" | "admin";
  location: string;
  companyName: string;
  trades: string;
  areas: string;
  status: string;
};

const emptyForm: ModalUser = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "user",
  location: "",
  companyName: "",
  trades: "",
  areas: "",
  status: "draft",
};

/* ========= Role badge ========= */
function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin"
      ? "bg-orange-900 text-orange-300"
      : role === "tradesman"
        ? "bg-emerald-900 text-emerald-300"
        : "bg-blue-900 text-blue-300";
  const label =
    role === "user" ? "homeowner" : role;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

/* ========= Page ========= */
export default function AdminUsersPage() {
  const { user } = useAuth();
  const api = useApi();

  /* --- list state --- */
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  /* --- filters --- */
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --- modal state --- */
  const [modalOpen, setModalOpen] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const [tradesOpen, setTradesOpen] = useState(false);
  const [tradesQuery, setTradesQuery] = useState("");
  const [tradesBucket, setTradesBucket] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<ModalUser>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* --- delete state --- */
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* --- access control --- */
  const [forbidden, setForbidden] = useState(false);

  /* ---- fetch ---- */
  const fetchUsers = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<ListResp>("/api/admin/users", {
        params: { q: q || undefined, role: roleFilter || undefined, limit, offset },
      });
      setForbidden(false);
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      const status = e?.response?.status ?? e?.status;
      if (status === 403) setForbidden(true);
    }
  }, [user, api, q, roleFilter, offset, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* debounced search */
  function handleSearchChange(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(val);
      setOffset(0);
    }, 300);
  }

  /* ---- modal helpers ---- */
  function openCreate() {
    setEditingUser(null);
    setForm({ ...emptyForm });
    setAreaQuery("");
    setTradesOpen(false);
    setSaveError("");
    setModalOpen(true);
  }

  function openEdit(u: any) {
    setEditingUser(u);
    setAreaQuery("");
    setTradesOpen(false);
    const t = u.tradesman || {};
    setForm({
      uid: u.uid,
      email: u.email,
      password: "",
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      location: u.location || "",
      companyName: t.companyName || u.companyName || "",
      trades: t.tradeTypes || u.trades || "",
      areas: t.serviceAreas || u.areas || "",
      status: t.status || u.status || "draft",
    });
    setSaveError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const body: Record<string, unknown> = {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        location: form.location || undefined,
      };
      if (form.password) body.password = form.password;
      if (form.role === "tradesman") {
        body.tradesman = {
          companyName: form.companyName,
          tradeTypes: form.trades,
          serviceAreas: form.areas,
          status: form.status,
        };
      }

      if (editingUser) {
        await api.put(`/api/admin/users/${editingUser.uid}`, body);
      } else {
        await api.post("/api/admin/users", body);
      }
      closeModal();
      fetchUsers();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---- delete helpers ---- */
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/users/${deleteTarget.uid}`);
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      /* swallow */
    } finally {
      setDeleting(false);
    }
  }

  /* ---- pagination ---- */
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* ========= Render ========= */
  return (
    <AuthedOnly>
      <Head>
        <title>User Management &bull; VetMyBuilder</title>
      </Head>

      <div className="min-h-screen bg-slate-900 text-slate-100">
        {/* header bar */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">

          {forbidden && (
            <div className="rounded-xl border border-red-800 bg-red-900/40 px-6 py-8 text-center">
              <h2 className="text-lg font-semibold text-red-300 mb-2">Access restricted</h2>
              <p className="text-sm text-red-400">You don't have permission to view this page.</p>
            </div>
          )}

          {!forbidden && (<>
          {/* title row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">User Management</h1>
              <AdminRefreshButton onRefresh={fetchUsers} />
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              data-testid="btn-create-user"
            >
              Create User
            </button>
          </div>

          {/* filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              placeholder="Search by name or email..."
              onChange={(e) => handleSearchChange(e.target.value)}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              data-testid="users-search"
            />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setOffset(0); }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              data-testid="users-role-filter"
            >
              <option value="">All roles</option>
              <option value="user">Homeowner</option>
              <option value="tradesman">Tradesman</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* table */}
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
            <table className="w-full text-sm" data-testid="users-table">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No users found
                    </td>
                  </tr>
                )}
                {items.map((u) => (
                  <tr key={u.uid} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-100">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.location || "-"}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          className="text-sm text-rose-400 hover:text-rose-300"
                          data-testid="btn-delete-user"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              Showing {items.length} of {total} users
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-slate-300">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setOffset(offset + limit)}
                className="rounded bg-slate-700 px-3 py-1 text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>)}
        </div>
      </div>

      {/* ========== Create / Edit modal ========== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="flex min-h-full items-start justify-center py-8">
          <div
            className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
            data-testid="user-modal"
          >
            <h2 className="mb-4 text-lg font-bold text-white">
              {editingUser ? "Edit User" : "Create User"}
            </h2>

            {saveError && (
              <div className="mb-4 rounded-lg border border-rose-700 bg-rose-900/50 px-3 py-2 text-sm text-rose-300" data-testid="user-modal-error">
                {saveError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* role toggle */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Role</label>
                <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
                  {(["user", "tradesman", "admin"] as const).map((r) => {
                    const labels: Record<string, string> = { user: "Homeowner", tradesman: "Tradesman", admin: "Admin" };
                    const testIds: Record<string, string> = { user: "role-toggle-homeowner", tradesman: "role-toggle-tradesman", admin: "role-toggle-admin" };
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: r }))}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                          form.role === r
                            ? "bg-blue-600 text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                        data-testid={testIds[r]}
                      >
                        {labels[r]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  data-testid="user-modal-email"
                />
              </div>

              {/* password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  Password{editingUser ? " (leave blank to keep current)" : ""}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  data-testid="user-modal-password"
                />
              </div>

              {/* first / last name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">First name</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    data-testid="user-modal-firstname"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Last name</label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    data-testid="user-modal-lastname"
                  />
                </div>
              </div>

              {/* location — homeowner/admin only, tradespeople use service areas */}
              {form.role !== "tradesman" && (
                <div data-testid="user-modal-location">
                  <label className="mb-1 block text-sm font-medium text-slate-300">Location</label>
                  <div className="[&_input]:bg-slate-900 [&_input]:text-white [&_input]:border-slate-600 [&_input]:placeholder-slate-500 [&_label]:hidden [&_.input]:bg-slate-900 [&_.input]:text-white [&_.input]:border-slate-600">
                    <LocationField
                      label=""
                      reasonText=""
                      placeholder="e.g. E4, N17, Chingford"
                      value={form.location}
                      onChange={(val, meta) => {
                        if (meta) {
                          const token = (meta as any).outward || (meta as any).sector || (meta as any).postcode || val;
                          setForm((f) => ({ ...f, location: token || val }));
                        } else {
                          setForm((f) => ({ ...f, location: val }));
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* tradesman-only fields */}
              {form.role === "tradesman" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Company name</label>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      data-testid="user-modal-company"
                    />
                  </div>
                  <div data-testid="user-modal-trades">
                    <label className="mb-1 block text-sm font-medium text-slate-300">Trade types</label>
                    <button
                      type="button"
                      onClick={() => { setTradesOpen((v) => !v); setTradesQuery(""); setTradesBucket(""); }}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-left text-slate-400 hover:border-slate-500 focus:border-blue-500 focus:outline-none"
                    >
                      {form.trades
                        ? <span className="text-white">{form.trades.split(",").filter(Boolean).length} trade{form.trades.split(",").filter(Boolean).length !== 1 ? "s" : ""} selected</span>
                        : "Select trades..."}
                    </button>
                    {form.trades && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.trades.split(",").map((s: string) => s.trim()).filter(Boolean).map((trade: string) => (
                          <span key={trade} className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                            {trade}
                            <button
                              type="button"
                              onClick={() => {
                                const next = form.trades.split(",").map((s: string) => s.trim()).filter((s: string) => s && s !== trade).join(",");
                                setForm((f) => ({ ...f, trades: next }));
                              }}
                              className="ml-0.5 text-slate-400 hover:text-white"
                              aria-label={`Remove ${trade}`}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {tradesOpen && (() => {
                      const active = TRADE_TYPES.filter((t) => t.active !== false);
                      const buckets = [...new Set(active.map((t) => t.buckets || "").filter(Boolean))];
                      const q = tradesQuery.trim().toLowerCase();
                      const filtered = active.filter((t) => {
                        if (tradesBucket && (t.buckets || "") !== tradesBucket) return false;
                        if (!q) return true;
                        if (t.label.toLowerCase().includes(q)) return true;
                        return (t.synonyms || []).some((s) => s.toLowerCase().includes(q));
                      });
                      const selectedSet = new Set(form.trades.split(",").map((s: string) => s.trim()).filter(Boolean));
                      return (
                        <div className="mt-2 rounded-lg border border-slate-600 bg-slate-800 p-3 space-y-2">
                          <input
                            type="search"
                            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Search trades..."
                            value={tradesQuery}
                            onChange={(e) => setTradesQuery(e.target.value)}
                          />
                          <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setTradesBucket("")}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${!tradesBucket ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                              All
                            </button>
                            {buckets.map((b) => (
                              <button key={b} type="button" onClick={() => setTradesBucket(b === tradesBucket ? "" : b)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${tradesBucket === b ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                                {b}
                              </button>
                            ))}
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            <div className="flex flex-wrap gap-1.5">
                              {filtered.length === 0 ? (
                                <p className="text-xs text-slate-500">No matches{q ? ` for "${q}"` : ""}.</p>
                              ) : filtered.map((t) => {
                                const sel = selectedSet.has(t.label);
                                return (
                                  <button key={t.label} type="button"
                                    onClick={() => {
                                      const current = [...selectedSet];
                                      const next = sel ? current.filter((s) => s !== t.label) : [...current, t.label];
                                      setForm((f) => ({ ...f, trades: next.join(",") }));
                                    }}
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${sel ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                                    {t.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div data-testid="user-modal-areas">
                    <label className="mb-1 block text-sm font-medium text-slate-300">Service areas</label>
                    <div className="[&_input]:bg-slate-900 [&_input]:text-white [&_input]:border-slate-600 [&_input]:placeholder-slate-500 [&_label]:hidden [&_.input]:bg-slate-900 [&_.input]:text-white [&_.input]:border-slate-600">
                      <LocationField
                        label=""
                        reasonText=""
                        placeholder="Type a postcode or place..."
                        value={areaQuery}
                        onChange={(val, meta) => {
                          setAreaQuery(val || "");
                          if (meta) {
                            const token = (meta as any).outward || (meta as any).sector || (meta as any).postcode || "";
                            if (token) {
                              const normalised = token.toUpperCase().trim();
                              const current = form.areas ? form.areas.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
                              if (!current.includes(normalised)) {
                                setForm((f) => ({
                                  ...f,
                                  areas: [...current, normalised].join(","),
                                }));
                              }
                            }
                            setAreaQuery("");
                          }
                        }}
                      />
                    </div>
                    {form.areas && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.areas.split(",").map((s: string) => s.trim()).filter(Boolean).map((area: string) => (
                          <span
                            key={area}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200"
                          >
                            {area}
                            <button
                              type="button"
                              onClick={() => {
                                const next = form.areas
                                  .split(",")
                                  .map((s: string) => s.trim())
                                  .filter((s: string) => s && s !== area)
                                  .join(",");
                                setForm((f) => ({ ...f, areas: next }));
                              }}
                              className="ml-0.5 text-slate-400 hover:text-white"
                              aria-label={`Remove ${area}`}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </>
              )}

              {/* actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                  data-testid="user-modal-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  data-testid="user-modal-submit"
                >
                  {saving ? "Saving..." : editingUser ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* ========== Delete confirmation ========== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-white">Delete User</h2>
            <p className="mb-4 text-sm text-slate-400">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">
                {deleteTarget.firstName} {deleteTarget.lastName}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                data-testid="btn-confirm-delete"
              >
                {deleting ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthedOnly>
  );
}
