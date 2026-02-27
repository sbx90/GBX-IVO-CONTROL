"use client";

import { useState, useEffect, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  Settings,
  Sun,
  Moon,
  Users,
  UserCog,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
  Globe,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Package,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
} from "@/hooks/use-clients";
import type { Client, KitDefinition, KitDefinitionComponent, ComponentType } from "@/lib/types/database";
import {
  useKitDefinitions,
  useCreateKitDefinition,
  useUpdateKitDefinition,
  useDeleteKitDefinition,
} from "@/hooks/use-kit-definitions";
import { COMPONENT_CONFIG, STOCK_COMPONENT_ORDER } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_CONFIG } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";
import {
  listTeamMembers,
  createTeamMember,
  updateTeamMemberRole,
  deleteTeamMember,
  type TeamMember,
} from "@/app/actions/users";
import { toast } from "sonner";

type Tab = "appearance" | "clients" | "users" | "deployment" | "kit_definition";

const ROLE_BADGE: Record<UserRole, string> = {
  admin: "bg-[#16a34a]/15 text-[#16a34a]",
  stock_agent: "bg-blue-500/15 text-blue-400",
  ticket_agent: "bg-amber-500/15 text-amber-400",
  production_agent: "bg-emerald-500/15 text-emerald-400",
};

// ─── Appearance Tab ────────────────────────────────────────────
function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">Theme</h3>
        <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4">
          Choose your preferred color scheme
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme("light")}
            className={cn(
              "flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium transition-all",
              theme === "light"
                ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600"
            )}
          >
            <div className={cn(
              "w-12 h-8 rounded-md border-2 flex items-center justify-center",
              theme === "light" ? "border-[#16a34a] bg-white" : "border-gray-200 dark:border-zinc-700 bg-white"
            )}>
              <Sun className="h-4 w-4 text-amber-500" />
            </div>
            Light
            {theme === "light" && <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium transition-all",
              theme === "dark"
                ? "border-[#16a34a] bg-[#16a34a]/10 text-[#16a34a]"
                : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600"
            )}
          >
            <div className={cn(
              "w-12 h-8 rounded-md border-2 flex items-center justify-center",
              theme === "dark" ? "border-[#16a34a] bg-zinc-900" : "border-gray-200 dark:border-zinc-700 bg-zinc-900"
            )}>
              <Moon className="h-4 w-4 text-slate-300" />
            </div>
            Dark
            {theme === "dark" && <Check className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Client Row ────────────────────────────────────────────────
function ClientRow({
  client,
  onEdit,
  onDelete,
}: {
  client: Client;
  onEdit: (c: Client) => void;
  onDelete: (id: string) => void;
}) {
  const deleteClient = useDeleteClient();

  function handleDelete() {
    if (!confirm(`Delete client "${client.name}"?`)) return;
    deleteClient.mutate(client.id);
    onDelete(client.id);
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/60 group transition-colors">
      <div className="h-8 w-8 rounded-full bg-[#16a34a]/15 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-[#16a34a]">
          {client.name[0]?.toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
          {client.name}
        </p>
        {(client.email || client.phone) && (
          <p className="text-xs text-gray-500 dark:text-zinc-500 truncate">
            {client.email ?? client.phone}
          </p>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(client)}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteClient.isPending}
          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Delete"
        >
          {deleteClient.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Client Form ───────────────────────────────────────────────
function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Client;
  onSave: () => void;
  onCancel: () => void;
}) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const isPending = createClient.isPending || updateClient.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    if (initial) {
      await updateClient.mutateAsync({ id: initial.id, updates: payload });
    } else {
      await createClient.mutateAsync(payload);
    }
    onSave();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 space-y-3"
    >
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-600 dark:text-zinc-400">Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company or client name"
            className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600 dark:text-zinc-400">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.com"
              className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600 dark:text-zinc-400">Phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-8 text-gray-500 dark:text-zinc-400"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!name.trim() || isPending}
          className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Check className="h-3.5 w-3.5 mr-1" />
          )}
          {initial ? "Save" : "Add Client"}
        </Button>
      </div>
    </form>
  );
}

// ─── Clients Tab ───────────────────────────────────────────────
function ClientsTab() {
  const { data: clients, isLoading } = useClients();
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  function handleEdit(client: Client) {
    setEditingClient(client);
    setShowForm(false);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingClient(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Clients</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            Manage the clients that can be linked to tickets
          </p>
        </div>
        {!showForm && !editingClient && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Client
          </Button>
        )}
      </div>

      {showForm && !editingClient && (
        <ClientForm onSave={handleFormClose} onCancel={handleFormClose} />
      )}

      <div className="space-y-0.5">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-zinc-500">
            Loading clients...
          </div>
        ) : !clients || clients.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="h-8 w-8 mx-auto text-gray-300 dark:text-zinc-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-zinc-500">No clients yet</p>
            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
              Add your first client above
            </p>
          </div>
        ) : (
          clients.map((client) => (
            <div key={client.id}>
              <ClientRow
                client={client}
                onEdit={handleEdit}
                onDelete={() => {}}
              />
              {editingClient?.id === client.id && (
                <ClientForm
                  initial={client}
                  onSave={handleFormClose}
                  onCancel={handleFormClose}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────
function UsersTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("stock_agent");
  const [showPassword, setShowPassword] = useState(false);

  function reload() {
    setLoading(true);
    listTeamMembers()
      .then(setMembers)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;
    startTransition(async () => {
      try {
        await createTeamMember(newEmail.trim(), newPassword, newRole, newName.trim());
        toast.success(`${newEmail} added`);
        setNewEmail(""); setNewPassword(""); setNewName(""); setNewRole("stock_agent");
        setShowForm(false);
        reload();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to create user");
      }
    });
  }

  function handleRoleChange(userId: string, role: UserRole) {
    startTransition(async () => {
      try {
        await updateTeamMemberRole(userId, role);
        setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role } : m));
        toast.success("Role updated");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to update role");
      }
    });
  }

  function handleDelete(member: TeamMember) {
    if (!confirm(`Remove ${member.email} from the team?`)) return;
    startTransition(async () => {
      try {
        await deleteTeamMember(member.id);
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        toast.success("User removed");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to delete user");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Team Members</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            Manage staff accounts and their access levels
          </p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Member
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600 dark:text-zinc-400">Email *</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="staff@example.com"
                className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600 dark:text-zinc-400">Full Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600 dark:text-zinc-400">Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600 dark:text-zinc-400">Role *</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                  {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([role, cfg]) => (
                    <SelectItem key={role} value={role} className="text-sm">
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              className="h-8 text-gray-500 dark:text-zinc-400"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!newEmail.trim() || !newPassword.trim() || isPending}
              className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Create Account
            </Button>
          </div>
        </form>
      )}

      {/* Members list */}
      <div className="space-y-0.5">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-zinc-500">
            Loading team...
          </div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center">
            <UserCog className="h-8 w-8 mx-auto text-gray-300 dark:text-zinc-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-zinc-500">No team members yet</p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/60 group transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-[#16a34a]/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-[#16a34a]">
                  {(member.full_name ?? member.email)[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {member.full_name && (
                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate leading-tight">
                    {member.full_name}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-zinc-500 truncate">
                  {member.email}
                </p>
              </div>
              <Select
                value={member.role ?? "none"}
                onValueChange={(v) => handleRoleChange(member.id, v as UserRole)}
                disabled={isPending}
              >
                <SelectTrigger className={cn(
                  "h-6 text-xs border-0 shadow-none px-2 rounded-full font-medium w-auto gap-1",
                  member.role ? ROLE_BADGE[member.role] : "bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400"
                )}>
                  <SelectValue placeholder="Assign role" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                  {!member.role && (
                    <SelectItem value="none" disabled className="text-xs text-gray-400 dark:text-zinc-500">
                      Assign role...
                    </SelectItem>
                  )}
                  {(Object.entries(ROLE_CONFIG) as [UserRole, typeof ROLE_CONFIG[UserRole]][]).map(([role, cfg]) => (
                    <SelectItem key={role} value={role} className="text-sm">
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => handleDelete(member)}
                disabled={isPending}
                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
                title="Remove user"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Deployment Tab ────────────────────────────────────────────
const PRODUCTION_URL = "https://gbx-ivo-control.vercel.app";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-center rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 overflow-hidden">
        <p className="flex-1 px-3 py-2.5 font-mono text-sm text-gray-800 dark:text-zinc-200 truncate min-w-0">
          {value}
        </p>
        <button
          onClick={handleCopy}
          title="Copy"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-l transition-all flex-shrink-0",
            copied
              ? "border-green-500/30 bg-green-500/10 text-green-500"
              : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-zinc-100"
          )}
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5" />Copied!</>
          ) : (
            <><Copy className="h-3.5 w-3.5" />Copy</>
          )}
        </button>
      </div>
    </div>
  );
}

function DeploymentTab() {
  return (
    <div className="space-y-6 pr-10">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">
          Deployment Info
        </h3>
        <p className="text-xs text-gray-500 dark:text-zinc-500 mb-5">
          Production deployment details for sharing and reference
        </p>

        <div className="space-y-4">
          <CopyRow label="Production URL" value={PRODUCTION_URL} />
          <CopyRow label="Domain" value="gbx-ivo-control.vercel.app" />
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 dark:border-zinc-800">
        <a
          href={PRODUCTION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-zinc-100 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open in browser
        </a>
      </div>
    </div>
  );
}

const PS_VARIANTS = [
  { key: "ps1" as const, label: "GBXIVO-IMB-PS1" },
  { key: "ps2" as const, label: "GBXIVO-IMB-PS2" },
  { key: "ps3" as const, label: "GBXIVO-IMB-PS3" },
];
const WIFI_VARIANTS = [
  { key: "rcw1" as const, label: "GBXIVO-IMB_RCW1" },
  { key: "rcw2" as const, label: "GBXIVO-IMB_RCW2" },
];

// ─── Kit Definition Form ────────────────────────────────────────
function KitDefinitionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: KitDefinition;
  onSave: () => void;
  onCancel: () => void;
}) {
  const createDef = useCreateKitDefinition();
  const updateDef = useUpdateKitDefinition();
  const [name, setName] = useState(initial?.name ?? "");
  const [compQtys, setCompQtys] = useState<Partial<Record<ComponentType, number>>>(() => {
    if (!initial) return {};
    const r: Partial<Record<ComponentType, number>> = {};
    for (const c of initial.components) {
      if (c.component_type !== "POWER_SUPPLY" && c.component_type !== "WIFI_ANTENNA") {
        r[c.component_type] = c.quantity;
      }
    }
    return r;
  });
  const [psQtys, setPsQtys] = useState(() => {
    if (!initial) return { ps1: 0, ps2: 0, ps3: 0 };
    const find = (ref: string) =>
      initial.components.find((c) => c.component_type === "POWER_SUPPLY" && c.reference === ref)?.quantity ?? 0;
    return { ps1: find("GBXIVO-IMB-PS1"), ps2: find("GBXIVO-IMB-PS2"), ps3: find("GBXIVO-IMB-PS3") };
  });
  const [wifiQtys, setWifiQtys] = useState(() => {
    if (!initial) return { rcw1: 0, rcw2: 0 };
    const find = (ref: string) =>
      initial.components.find((c) => c.component_type === "WIFI_ANTENNA" && c.reference === ref)?.quantity ?? 0;
    return { rcw1: find("GBXIVO-IMB_RCW1"), rcw2: find("GBXIVO-IMB_RCW2") };
  });

  const isPending = createDef.isPending || updateDef.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const components: KitDefinitionComponent[] = [];
    for (const type of STOCK_COMPONENT_ORDER) {
      if (type === "POWER_SUPPLY") {
        for (const { key, label } of PS_VARIANTS) {
          if (psQtys[key] > 0)
            components.push({ component_type: "POWER_SUPPLY", reference: label, quantity: psQtys[key] });
        }
      } else if (type === "WIFI_ANTENNA") {
        for (const { key, label } of WIFI_VARIANTS) {
          if (wifiQtys[key] > 0)
            components.push({ component_type: "WIFI_ANTENNA", reference: label, quantity: wifiQtys[key] });
        }
      } else {
        const qty = compQtys[type as ComponentType] ?? 0;
        if (qty > 0) components.push({ component_type: type as ComponentType, quantity: qty });
      }
    }
    if (initial) {
      await updateDef.mutateAsync({ id: initial.id, updates: { name: name.trim(), components } });
    } else {
      await createDef.mutateAsync({ name: name.trim(), components });
    }
    onSave();
  }

  const qInput = "w-14 h-7 text-center text-xs bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 space-y-4"
    >
      <div className="space-y-1">
        <Label className="text-xs text-gray-600 dark:text-zinc-400">Kit Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. IMB-KIT"
          className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2">
          Components
        </p>
        <div className="space-y-1">
          {STOCK_COMPONENT_ORDER.map((type) => {
            if (type === "POWER_SUPPLY") {
              return (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-medium text-gray-600 dark:text-zinc-400 pt-1">Power Supply</p>
                  {PS_VARIANTS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-zinc-700">
                      <span className="flex-1 text-xs font-mono text-gray-600 dark:text-zinc-400">{label}</span>
                      <Input
                        type="number"
                        value={psQtys[key] === 0 ? "" : psQtys[key]}
                        placeholder="0"
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          setPsQtys((p) => ({ ...p, [key]: isNaN(v) ? 0 : v }));
                        }}
                        className={qInput}
                      />
                    </div>
                  ))}
                </div>
              );
            }
            if (type === "WIFI_ANTENNA") {
              return (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-medium text-gray-600 dark:text-zinc-400 pt-1">WiFi + Cell Antenna</p>
                  {WIFI_VARIANTS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-zinc-700">
                      <span className="flex-1 text-xs font-mono text-gray-600 dark:text-zinc-400">{label}</span>
                      <Input
                        type="number"
                        value={wifiQtys[key] === 0 ? "" : wifiQtys[key]}
                        placeholder="0"
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          setWifiQtys((p) => ({ ...p, [key]: isNaN(v) ? 0 : v }));
                        }}
                        className={qInput}
                      />
                    </div>
                  ))}
                </div>
              );
            }
            const label =
              type === "MAIN_BOARD"
                ? "Main Board (Enclosure)"
                : COMPONENT_CONFIG[type as ComponentType].label;
            const qty = compQtys[type as ComponentType] ?? 0;
            return (
              <div key={type} className="flex items-center gap-2">
                <span className="flex-1 text-xs text-gray-600 dark:text-zinc-400">{label}</span>
                <Input
                  type="number"
                  value={qty === 0 ? "" : qty}
                  placeholder="0"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setCompQtys((p) => ({ ...p, [type as ComponentType]: isNaN(v) ? 0 : v }));
                  }}
                  className={qInput}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-8 text-gray-500 dark:text-zinc-400"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!name.trim() || isPending}
          className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Check className="h-3.5 w-3.5 mr-1" />
          )}
          {initial ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

// ─── Kit Definition Tab ─────────────────────────────────────────
function KitDefinitionTab() {
  const { data: definitions, isLoading } = useKitDefinitions();
  const deleteKitDef = useDeleteKitDefinition();
  const [showForm, setShowForm] = useState(false);
  const [editingDef, setEditingDef] = useState<KitDefinition | null>(null);

  function handleFormClose() {
    setShowForm(false);
    setEditingDef(null);
  }

  function handleDelete(def: KitDefinition) {
    if (!confirm(`Delete kit definition "${def.name}"?`)) return;
    deleteKitDef.mutate(def.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Kit Definitions</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            Define which components make up each kit type
          </p>
        </div>
        {!showForm && !editingDef && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Kit
          </Button>
        )}
      </div>

      {showForm && !editingDef && (
        <KitDefinitionForm onSave={handleFormClose} onCancel={handleFormClose} />
      )}

      <div className="space-y-0.5">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-zinc-500">
            Loading definitions...
          </div>
        ) : !definitions || definitions.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="h-8 w-8 mx-auto text-gray-300 dark:text-zinc-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-zinc-500">No kit definitions yet</p>
            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
              Add your first kit definition above
            </p>
          </div>
        ) : (
          definitions.map((def) => (
            <div key={def.id}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/60 group transition-colors">
                <div className="h-8 w-8 rounded-full bg-[#16a34a]/15 flex items-center justify-center flex-shrink-0">
                  <Package className="h-3.5 w-3.5 text-[#16a34a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{def.name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-500">
                    {def.components.length === 0
                      ? "No components defined"
                      : `${def.components.length} component${def.components.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditingDef(def); setShowForm(false); }}
                    className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(def)}
                    disabled={deleteKitDef.isPending}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    {deleteKitDef.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              {editingDef?.id === def.id && (
                <KitDefinitionForm
                  initial={def}
                  onSave={handleFormClose}
                  onCancel={handleFormClose}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("appearance");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "appearance", label: "Appearance", icon: Sun },
    { id: "clients", label: "Clients", icon: Users },
    { id: "users", label: "Team", icon: UserCog },
    { id: "kit_definition", label: "Kit Defs", icon: Package },
    { id: "deployment", label: "Deployment", icon: Globe },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors w-full">
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 w-[49vw] sm:max-w-[49vw] p-0 gap-0">
        <div className="flex h-[560px] overflow-hidden rounded-[inherit]">
          {/* Left nav */}
          <div className="w-40 flex-shrink-0 border-r border-gray-200 dark:border-zinc-800 p-3 flex flex-col gap-1">
            <DialogHeader className="mb-3 px-2">
              <DialogTitle className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                Settings
              </DialogTitle>
            </DialogHeader>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left",
                  activeTab === id
                    ? "bg-[#16a34a]/15 text-[#16a34a]"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden">
            {activeTab === "appearance" && <AppearanceTab />}
            {activeTab === "clients" && <ClientsTab />}
            {activeTab === "users" && <UsersTab />}
            {activeTab === "kit_definition" && <KitDefinitionTab />}
            {activeTab === "deployment" && <DeploymentTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
