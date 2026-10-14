"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { CREATABLE_DEPARTMENT_ROLES, ROLE_SECTIONS } from "@/lib/hms/role-sections";
import type { DepartmentLoginSummary } from "@/lib/hms/department-logins";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
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
    <div id="department-access-setup" className="scroll-mt-24 space-y-4">
      <HmsCard
        id="department-access"
        title="Department access"
        description="Give each department its own login and see which pages each role can open."
        icon={ShieldCheck}
        meaning="team"
        flush
        actions={
          <SettingsSectionInfo
            title="Department access"
            text="Create a login for each department (Front Desk, Housekeeping, Kitchen, etc.), reset passwords, and see which sections each role can reach. Security-sensitive — only Owner/Admin can create or reset logins, and it's an occasional task (new hires, password resets), not a daily one."
          />
        }
      >
        <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">Department roles, the sections they can open, and their login</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {["Role", "Sections they can open", "Login"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-5 py-3 text-left text-sm font-semibold text-slate-700"
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
                  <td className="px-5 py-3 text-sm text-slate-700">{row.sections}</td>
                  <td className="px-5 py-3 text-sm">
                    {hasLogin ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openManageDialog(row.role);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        View login
                        <span className="sr-only">: {row.role}</span>
                      </button>
                    ) : row.canCreateLogin ? (
                      <button
                        type="button"
                        onClick={() => focusRoleForm(row.role)}
                        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-800 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Create login
                        <span className="sr-only">: {row.role}</span>
                      </button>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                        Not created here
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </HmsCard>

      <form ref={formRef} onSubmit={handleCreate} className="scroll-mt-24">
        <HmsCard
          id="create-department-login"
          title="Create a department login"
          description="One shared login per department. You can change the email or reset the password later."
          icon={UserPlus}
          meaning="team"
        >
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <HmsField id="dept-login-name" label="Staff full name">
            <input
              id="dept-login-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={hmsInput}
              placeholder="e.g. John Doe"
              autoComplete="off"
              required
            />
          </HmsField>
          <HmsField id="dept-login-role" label="Department role" hint="Departments that already have a login are greyed out.">
            <select
              id="dept-login-role"
              value={departmentRole}
              onChange={(e) => setDepartmentRole(e.target.value)}
              aria-describedby="dept-login-role-hint"
              className={hmsInput}
            >
              {CREATABLE_DEPARTMENT_ROLES.map((role) => (
                <option key={role} value={role} disabled={createdRoles.includes(role)}>
                  {createdRoles.includes(role) ? `${role} (login created)` : role}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="dept-login-email" label="Login email">
            <input
              id="dept-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={hmsInput}
              placeholder="staff@hotel.com"
              autoComplete="off"
              required
            />
          </HmsField>
          <HmsField id="dept-login-password" label="Password" hint="At least 8 characters.">
            <input
              id="dept-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={hmsInput}
              aria-describedby="dept-login-password-hint"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </HmsField>
        </div>
        <HmsAlert message={error} />
        <button type="submit" disabled={loading} className={hmsButton.primary}>
          {loading ? "Creating…" : "Create login"}
        </button>
        </div>
        </HmsCard>
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
                <p className="text-sm font-medium text-slate-700">Staff name</p>
                <p className="mt-0.5 font-semibold text-slate-900">{activeLogin.fullName}</p>
              </div>

              <div>
                <label htmlFor="manage-login-email" className="mb-1 block text-sm font-medium text-slate-800">
                  Login email
                </label>
                <div className="flex gap-2">
                  <input
                    id="manage-login-email"
                    type="email"
                    value={manageEmail}
                    onChange={(e) => setManageEmail(e.target.value)}
                    className={`${hmsInput} min-w-0 flex-1`}
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
                    <Copy className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Passwords are stored securely and cannot be displayed. Set a new password below if
                needed.
              </div>

              <div>
                <label htmlFor="manage-login-password" className="mb-1 block text-sm font-medium text-slate-800">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="manage-login-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${hmsInput} pr-11`}
                    aria-describedby="manage-login-password-hint"
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => setShowNewPassword((value) => !value)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    aria-pressed={showNewPassword}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                <p id="manage-login-password-hint" className="mt-1 text-xs text-slate-600">
                  At least 8 characters.
                </p>
              </div>

              <div>
                <label htmlFor="manage-login-confirm" className="mb-1 block text-sm font-medium text-slate-800">
                  Confirm new password
                </label>
                <input
                  id="manage-login-confirm"
                  type={showNewPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={hmsInput}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <HmsAlert message={manageError} />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={closeManageDialog}>
                  Close
                </Button>
                <Button type="submit" disabled={manageLoading}>
                  {manageLoading ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
