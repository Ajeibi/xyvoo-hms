"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { CREATABLE_DEPARTMENT_ROLES, ROLE_SECTIONS } from "@/lib/hms/role-sections";
import type { DepartmentLoginSummary } from "@/lib/hms/department-logins";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DepartmentAccessSetup({
  slug,
  initialDepartmentLogins,
}: {
  slug: string;
  initialDepartmentLogins: DepartmentLoginSummary[];
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departmentRole, setDepartmentRole] = useState(CREATABLE_DEPARTMENT_ROLES[0] || "Front Desk");
  const [logins, setLogins] = useState(initialDepartmentLogins);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  const [manageRole, setManageRole] = useState<string | null>(null);
  const [manageEmail, setManageEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState("");

  const createdRoles = useMemo(() => logins.map((login) => login.departmentRole), [logins]);
  const activeLogin = useMemo(
    () => (manageRole ? logins.find((login) => login.departmentRole === manageRole) ?? null : null),
    [logins, manageRole],
  );

  const focusRoleForm = (role: string) => {
    setDepartmentRole(role);
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openManageDialog = (role: string) => {
    const login = logins.find((item) => item.departmentRole === role);
    if (!login) return;
    setManageRole(role);
    setManageEmail(login.email);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setManageError("");
  };

  const closeManageDialog = () => {
    setManageRole(null);
    setManageEmail("");
    setNewPassword("");
    setConfirmPassword("");
    setManageError("");
  };

  const copyEmail = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastSuccess("Email copied");
    } catch {
      toastError("Could not copy email");
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/hotel/staff/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        full_name: fullName,
        email,
        password,
        department_role: departmentRole,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = data.error || "Unable to create department login.";
      setError(msg);
      toastError("Could not create login", msg);
      return;
    }

    toastSuccess("Department login created");
    const listRes = await fetch(`/api/hotel/staff?slug=${encodeURIComponent(slug)}`);
    const listData = (await listRes.json().catch(() => ({}))) as { logins?: DepartmentLoginSummary[] };
    if (listRes.ok && listData.logins) {
      setLogins(listData.logins);
      const nextAvailableRole = CREATABLE_DEPARTMENT_ROLES.find(
        (role) => !listData.logins!.some((login) => login.departmentRole === role),
      );
      if (nextAvailableRole) setDepartmentRole(nextAvailableRole);
    } else {
      setLogins((current) =>
        current.some((login) => login.departmentRole === departmentRole)
          ? current
          : [
              ...current,
              {
                departmentRole,
                email,
                fullName: fullName.trim(),
                userId: "",
              },
            ],
      );
      const nextAvailableRole = CREATABLE_DEPARTMENT_ROLES.find(
        (role) => role !== departmentRole && !createdRoles.includes(role),
      );
      if (nextAvailableRole) setDepartmentRole(nextAvailableRole);
    }

    setFullName("");
    setEmail("");
    setPassword("");
  };

  const handleUpdateLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manageRole) return;

    if (newPassword && newPassword !== confirmPassword) {
      setManageError("New passwords do not match.");
      return;
    }

    const emailChanged = manageEmail.trim() !== (activeLogin?.email ?? "");
    if (!newPassword && !emailChanged) {
      setManageError("Change the email or enter a new password.");
      return;
    }

    setManageLoading(true);
    setManageError("");

    const res = await fetch("/api/hotel/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        department_role: manageRole,
        ...(emailChanged ? { email: manageEmail.trim() } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setManageLoading(false);

    if (!res.ok) {
      const msg = data.error || "Unable to update department login.";
      setManageError(msg);
      toastError("Could not update login", msg);
      return;
    }

    if (data.login) {
      setLogins((current) =>
        current.map((login) => (login.departmentRole === manageRole ? data.login : login)),
      );
    }

    toastSuccess(newPassword ? "Password updated" : "Login email updated");
    setNewPassword("");
    setConfirmPassword("");
    if (!newPassword) {
      closeManageDialog();
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Department Access Setup</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Owner/Admin should configure department logins and set passwords for each operational unit.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Role Sections</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60">
              {["Role", "Sections they access", "Login setup"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ROLE_SECTIONS.map((row) => {
              const hasLogin = row.canCreateLogin && createdRoles.includes(row.role);
              return (
                <tr
                  key={row.role}
                  className={hasLogin ? "cursor-pointer hover:bg-slate-50/80" : undefined}
                  onClick={hasLogin ? () => openManageDialog(row.role) : undefined}
                >
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{row.role}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{row.sections}</td>
                  <td className="px-5 py-3 text-xs">
                    {hasLogin ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openManageDialog(row.role);
                        }}
                        className="cursor-pointer rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        View login
                      </button>
                    ) : row.canCreateLogin ? (
                      <button
                        type="button"
                        onClick={() => focusRoleForm(row.role)}
                        className="cursor-pointer rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        Create login
                      </button>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-500">
                        No login creation
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        ref={formRef}
        onSubmit={handleCreate}
        className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-sm font-semibold text-slate-800">Create Department Login</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Staff full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="e.g. John Doe"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Department role</label>
            <select
              value={departmentRole}
              onChange={(e) => setDepartmentRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              {CREATABLE_DEPARTMENT_ROLES.map((role) => (
                <option key={role} value={role} disabled={createdRoles.includes(role)}>
                  {createdRoles.includes(role) ? `${role} (login created)` : role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Login email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="staff@hotel.com"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Department Login"}
        </button>
      </form>

      <Dialog open={manageRole != null} onOpenChange={(open) => !open && closeManageDialog()}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{manageRole} login</DialogTitle>
            <DialogDescription>
              Review the configured email and set a new password if the team needs a reset.
            </DialogDescription>
          </DialogHeader>

          {activeLogin ? (
            <form onSubmit={handleUpdateLogin} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Staff name</p>
                <p className="mt-1 font-medium text-slate-900">{activeLogin.fullName}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Login email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={manageEmail}
                    onChange={(e) => setManageEmail(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-lg"
                    onClick={() => void copyEmail(manageEmail)}
                    aria-label="Copy email"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Passwords are stored securely and cannot be displayed. Set a new password below if
                needed.
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">New password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-800"
                    placeholder="Minimum 8 characters"
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-slate-700"
                    onClick={() => setShowNewPassword((value) => !value)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  Confirm new password
                </label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                  placeholder="Re-enter new password"
                  minLength={8}
                />
              </div>

              {manageError ? <p className="text-sm text-red-600">{manageError}</p> : null}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={closeManageDialog}>
                  Close
                </Button>
                <Button type="submit" disabled={manageLoading}>
                  {manageLoading ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
