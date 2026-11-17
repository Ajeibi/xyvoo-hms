"use client";

import { useMemo, useState } from "react";
import { Copy, KeyRound, ShieldCheck, UserPlus, UserX, UserCheck } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";
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

/** A readable temporary password (no look-alike characters) for the manager to hand over. */
function makeTemporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * The hotel's logins: a HOD and staff for each department. An owner/admin sees and manages every
 * department and creates HODs; a head of department (`department` set, `isAdmin` false) sees and manages
 * only their own department's staff.
 */
export default function DepartmentAccessSetup({
  slug,
  initialDepartmentLogins,
  isAdmin = true,
  department = null,
  hrEmployees = [],
}: {
  slug: string;
  initialDepartmentLogins: DepartmentLoginSummary[];
  isAdmin?: boolean;
  department?: string | null;
  /** HR records with no login yet, so a new login can be tied to one. */
  hrEmployees?: { id: string; name: string; jobTitle: string | null; department: string | null }[];
}) {
  const departments = CREATABLE_DEPARTMENT_ROLES;
  const [logins, setLogins] = useState(initialDepartmentLogins);

  const [fullName, setFullName] = useState("");
  const [deptRole, setDeptRole] = useState(department ?? departments.find((d) => d !== "Admin / GM") ?? "Front Desk");
  const [level, setLevel] = useState<"hod" | "staff">(isAdmin ? "hod" : "staff");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => makeTemporaryPassword());
  const [hrEmployeeId, setHrEmployeeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ signInName: string; password: string; fullName: string } | null>(null);

  const [resetFor, setResetFor] = useState<DepartmentLoginSummary | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resetError, setResetError] = useState("");

  const useUsername = level === "staff" || deptRole === "Admin / GM" ? true : username.trim().length > 0;
  const grouped = useMemo(() => {
    const byDept = new Map<string, DepartmentLoginSummary[]>();
    for (const login of logins) {
      if (!isAdmin && login.departmentRole !== department) continue;
      byDept.set(login.departmentRole, [...(byDept.get(login.departmentRole) ?? []), login]);
    }
    return [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [logins, isAdmin, department]);

  const refresh = async () => {
    const res = await fetch(`/api/hotel/staff?slug=${encodeURIComponent(slug)}`);
    const data = (await res.json().catch(() => ({}))) as { logins?: DepartmentLoginSummary[] };
    if (res.ok && data.logins) setLogins(data.logins);
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastSuccess(`${label} copied`);
    } catch {
      toastError(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    const res = await fetch("/api/hotel/staff/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        full_name: fullName,
        department_role: deptRole,
        level,
        username: useUsername ? username : undefined,
        email: email.trim() || undefined,
        password,
        hr_employee_id: hrEmployeeId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      const msg = data.error || "Unable to create the login.";
      setError(msg);
      toastError("Could not create login", msg);
      return;
    }
    toastSuccess("Login created");
    if (data.hrLinkError) toastError("Not linked to HR", data.hrLinkError);
    setHrEmployeeId("");
    setCreated({ signInName: data.signInName, password, fullName: fullName.trim() });
    setFullName("");
    setUsername("");
    setEmail("");
    setPassword(makeTemporaryPassword());
    await refresh();
  };

  const act = async (login: DepartmentLoginSummary, action: "suspend" | "reactivate" | "reset_pin") => {
    setBusy(login.userId);
    const res = await fetch("/api/hotel/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, user_id: login.userId, action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      toastError("Could not update login", data.error || "Please try again.");
      return;
    }
    toastSuccess(
      action === "suspend" ? `${login.fullName} suspended` : action === "reset_pin" ? `${login.fullName}'s PIN cleared` : `${login.fullName} reactivated`,
    );
    await refresh();
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetFor) return;
    setBusy(resetFor.userId);
    setResetError("");
    const res = await fetch("/api/hotel/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, user_id: resetFor.userId, action: "reset_password", password: resetPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setResetError(data.error || "Unable to reset the password.");
      return;
    }
    toastSuccess("Temporary password set", `${resetFor.fullName} must choose a new one at next sign-in.`);
    setResetFor(null);
    await refresh();
  };

  return (
    <div id="department-access-setup" className="scroll-mt-24 space-y-4">
      <HmsCard
        id="department-access"
        title={isAdmin ? "Logins by department" : `${department ?? "Your department"} team`}
        description={
          isAdmin
            ? "Every department has a head of department (HOD) and staff, each with their own login."
            : "Add your staff, suspend them when they leave, and reset a forgotten password."
        }
        icon={ShieldCheck}
        meaning="team"
        flush
        actions={
          <SettingsSectionInfo
            title="Logins"
            text="Each person signs in with their own login, so every action is tracked to them. A head of department can add, suspend and reset staff in their own department. Only an owner or admin can create a head of department. People are suspended, never deleted, so their history keeps their name."
          />
        }
      >
        {grouped.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600">No logins yet. Create the first one below.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {grouped.map(([dept, members]) => (
              <div key={dept} className="px-3 py-3 sm:px-6">
                {isAdmin ? <h3 className="mb-2 text-sm font-semibold text-slate-900">{dept}</h3> : null}
                <ul className="space-y-2">
                  {members.map((m) => {
                    const suspended = m.status === "suspended";
                    const manageable = isAdmin || m.staffLevel === "staff";
                    return (
                      <li
                        key={m.userId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                            {m.fullName}
                            <HmsPill tone={m.staffLevel === "hod" ? "blue" : "slate"}>{m.staffLevel === "hod" ? "HOD" : "Staff"}</HmsPill>
                            {suspended ? <HmsPill tone="amber">Suspended</HmsPill> : null}
                            {m.mustChangePassword ? <HmsPill tone="slate">Temporary password</HmsPill> : null}
                            {m.hrEmployeeId ? <HmsPill tone="slate">HR linked</HmsPill> : null}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                            <span className="truncate">{m.signInName ? `${m.signInName.split("@")[0]}@${slug}` : m.email}</span>
                            <button
                              type="button"
                              aria-label={`Copy sign-in for ${m.fullName}`}
                              className="rounded p-1 text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              onClick={() => void copy(m.signInName ? `${m.signInName.split("@")[0]}@${slug}` : m.email, "Sign-in")}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </p>
                        </div>
                        {manageable ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={hmsButton.small}
                              disabled={busy === m.userId}
                              onClick={() => {
                                setResetFor(m);
                                setResetPassword(makeTemporaryPassword());
                                setResetError("");
                              }}
                            >
                              <KeyRound className="h-4 w-4" aria-hidden /> Reset password
                            </button>
                            <button type="button" className={hmsButton.small} disabled={busy === m.userId} onClick={() => void act(m, "reset_pin")}>
                              Clear PIN
                            </button>
                            {suspended ? (
                              <button type="button" className={hmsButton.small} disabled={busy === m.userId} onClick={() => void act(m, "reactivate")}>
                                <UserCheck className="h-4 w-4" aria-hidden /> Reactivate
                              </button>
                            ) : (
                              <button type="button" className={hmsButton.small} disabled={busy === m.userId} onClick={() => void act(m, "suspend")}>
                                <UserX className="h-4 w-4" aria-hidden /> Suspend
                              </button>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </HmsCard>

      <form onSubmit={handleCreate} className="scroll-mt-24">
        <HmsCard
          id="create-login"
          title={isAdmin ? "Add a login" : "Add a staff member"}
          description="They sign in with the username and the temporary password you give them, then choose their own password."
          icon={UserPlus}
          meaning="team"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <HmsField id="login-name" label="Full name">
                <input id="login-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={hmsInput} placeholder="e.g. Amaka Obi" autoComplete="off" required />
              </HmsField>
              {isAdmin ? (
                <HmsField id="login-dept" label="Department">
                  <select
                    id="login-dept"
                    value={deptRole}
                    onChange={(e) => {
                      setDeptRole(e.target.value);
                      if (e.target.value === "Admin / GM") setLevel("hod");
                    }}
                    className={hmsInput}
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </HmsField>
              ) : null}
              {isAdmin ? (
                <HmsField id="login-level" label="Level" hint="A head of department can then add their own staff.">
                  <select id="login-level" value={level} onChange={(e) => setLevel(e.target.value as "hod" | "staff")} disabled={deptRole === "Admin / GM"} className={hmsInput}>
                    <option value="hod">Head of department (HOD)</option>
                    <option value="staff">Staff</option>
                  </select>
                </HmsField>
              ) : null}
              <HmsField
                id="login-username"
                label="Username"
                hint={`They type it as username@${slug}. Letters, digits, dot, dash, underscore.${level === "hod" ? " Leave empty to use an email instead." : ""}`}
              >
                <input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={hmsInput}
                  placeholder="amaka.obi"
                  autoComplete="off"
                  autoCapitalize="none"
                  required={level === "staff" || deptRole === "Admin / GM"}
                />
              </HmsField>
              <HmsField
                id="login-email"
                label={useUsername ? "Real email (optional)" : "Login email"}
                hint={useUsername ? "Only for recovery. They never sign in with it." : "They sign in with this email."}
              >
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={hmsInput} placeholder="name@example.com" autoComplete="off" required={!useUsername} />
              </HmsField>
              {hrEmployees.length > 0 ? (
                <HmsField id="login-hr" label="HR record (optional)" hint="Ties this login to the person's HR record, so rotas, leave and activity belong together.">
                  <select id="login-hr" value={hrEmployeeId} onChange={(e) => setHrEmployeeId(e.target.value)} className={hmsInput}>
                    <option value="">Not linked</option>
                    {hrEmployees
                      .filter((h) => !h.department || h.department === deptRole)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                          {h.jobTitle ? `, ${h.jobTitle}` : ""}
                        </option>
                      ))}
                  </select>
                </HmsField>
              ) : null}
              <HmsField id="login-password" label="Temporary password" hint="At least 8 characters. Share it with them in person.">
                <div className="flex gap-2">
                  <input id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${hmsInput} min-w-0 flex-1 font-mono`} minLength={8} autoComplete="off" required />
                  <button type="button" className={hmsButton.small} onClick={() => setPassword(makeTemporaryPassword())}>
                    New
                  </button>
                </div>
              </HmsField>
            </div>
            <HmsAlert message={error} />
            {created ? (
              <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">{created.fullName}&rsquo;s login is ready.</p>
                <p className="mt-1">
                  Sign in as <span className="font-mono">{created.signInName}</span> with the temporary password{" "}
                  <span className="font-mono">{created.password}</span>. They will be asked to choose their own at first sign-in. This password isn&rsquo;t shown again.
                </p>
              </div>
            ) : null}
            <button type="submit" disabled={creating} className={hmsButton.primary}>
              {creating ? "Creating…" : "Create login"}
            </button>
          </div>
        </HmsCard>
      </form>

      <Dialog open={resetFor != null} onOpenChange={(open) => !open && setResetFor(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset password for {resetFor?.fullName}</DialogTitle>
            <DialogDescription>
              Set a temporary password and give it to them. They choose their own at next sign-in. If they&rsquo;re signed in now, they&rsquo;ll be asked to change it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            <HmsField id="reset-password" label="Temporary password" hint="At least 8 characters.">
              <input id="reset-password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className={`${hmsInput} font-mono`} minLength={8} autoComplete="off" required />
            </HmsField>
            <HmsAlert message={resetError} />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setResetFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy === resetFor?.userId}>
                Set password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
