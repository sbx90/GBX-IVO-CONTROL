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
  AlertTriangle,
  Ruler,
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
import type { Client, KitDefinition, KitDefinitionComponent, IssueDefinition, ProductDimension, ProductCatalogItem } from "@/lib/types/database";
import {
  useProductDimensions,
  useUpsertProductDimension,
  useDeleteProductDimension,
} from "@/hooks/use-product-dimensions";
import {
  useProductCatalog,
  useAddProductCatalogItem,
  useUpdateProductCatalogItem,
  useDeleteProductCatalogItem,
} from "@/hooks/use-product-catalog";
import {
  useIssueDefinitions,
  useCreateIssueDefinition,
  useUpdateIssueDefinition,
  useDeleteIssueDefinition,
} from "@/hooks/use-issue-definitions";
import {
  useKitDefinitions,
  useCreateKitDefinition,
  useUpdateKitDefinition,
  useDeleteKitDefinition,
} from "@/hooks/use-kit-definitions";
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

type Tab = "appearance" | "clients" | "users" | "deployment" | "kit_definition" | "issues" | "pdd";

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
  const { data: catalog = [], isLoading: isLoadingCatalog } = useProductCatalog();

  const [unlocked, setUnlocked] = useState(!initial);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");

  // Keyed by part_number (reference)
  const [pnQtys, setPnQtys] = useState<Record<string, number>>(() => {
    if (!initial) return {};
    const r: Record<string, number> = {};
    for (const c of initial.components) {
      r[c.reference] = c.quantity;
    }
    return r;
  });

  const isPending = createDef.isPending || updateDef.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const components: KitDefinitionComponent[] = Object.entries(pnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([reference, quantity]) => ({ reference, quantity }));
    if (initial) {
      await updateDef.mutateAsync({ id: initial.id, updates: { name: name.trim(), components } });
    } else {
      await createDef.mutateAsync({ name: name.trim(), components });
    }
    onSave();
  }

  const qInput = "w-14 h-7 text-center text-xs bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  if (!unlocked) {
    return (
      <div className="mt-2 p-4 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 space-y-3">
        <p className="text-xs font-medium text-zinc-400">Password required to edit kit quantities</p>
        <Input
          type="password"
          placeholder="Enter password"
          value={pwInput}
          onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (pwInput === "ivocontrol") { setUnlocked(true); setPwInput(""); }
              else setPwError(true);
            }
          }}
          className="h-8 text-sm bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
          autoFocus
        />
        {pwError && <p className="text-xs text-red-400">Incorrect password</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="h-8 text-zinc-400">Cancel</Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white"
            onClick={() => {
              if (pwInput === "ivocontrol") { setUnlocked(true); setPwInput(""); }
              else setPwError(true);
            }}
          >
            Unlock
          </Button>
        </div>
      </div>
    );
  }

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
          Products
        </p>
        {isLoadingCatalog ? (
          <p className="text-xs text-zinc-500 py-2">Loading products...</p>
        ) : catalog.length === 0 ? (
          <p className="text-xs text-zinc-500 py-2">No products found. Add them in the PDD tab.</p>
        ) : (
          <div className="space-y-1">
            {catalog.map(({ id, part_number }) => {
              const qty = pnQtys[part_number] ?? 0;
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className={cn(
                    "flex-1 text-xs font-mono transition-colors",
                    qty > 0 ? "text-gray-800 dark:text-zinc-200" : "text-gray-400 dark:text-zinc-500"
                  )}>
                    {part_number}
                  </span>
                  <Input
                    type="number"
                    value={qty === 0 ? "" : qty}
                    placeholder="0"
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setPnQtys((p) => ({ ...p, [part_number]: isNaN(v) ? 0 : v }));
                    }}
                    className={qInput}
                  />
                </div>
              );
            })}
          </div>
        )}
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

// ─── Issue Definitions Tab ──────────────────────────────────────
function IssueDefinitionsTab() {
  const { data: definitions, isLoading } = useIssueDefinitions();
  const createDef = useCreateIssueDefinition();
  const updateDef = useUpdateIssueDefinition();
  const deleteDef = useDeleteIssueDefinition();
  const [showForm, setShowForm] = useState(false);
  const [editingDef, setEditingDef] = useState<IssueDefinition | null>(null);
  const [name, setName] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");

  function openAdd() { setName(""); setKeywordsRaw(""); setEditingDef(null); setShowForm(true); }
  function openEdit(def: IssueDefinition) { setName(def.name); setKeywordsRaw(def.keywords.join(", ")); setEditingDef(def); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingDef(null); setName(""); setKeywordsRaw(""); }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const keywords = keywordsRaw.split(",").map(k => k.trim()).filter(Boolean);
    if (editingDef) {
      updateDef.mutate({ id: editingDef.id, updates: { name: trimmedName, keywords } }, { onSuccess: closeForm });
    } else {
      createDef.mutate({ name: trimmedName, keywords }, { onSuccess: closeForm });
    }
  }

  function handleDelete(def: IssueDefinition) {
    if (!confirm(`Delete issue definition "${def.name}"?`)) return;
    deleteDef.mutate(def.id);
  }

  const isSaving = createDef.isPending || updateDef.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Issue Definitions</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            Define issue categories matched against LOT import comments
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={openAdd} className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Definition
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border border-zinc-700 rounded-lg p-4 space-y-3 bg-zinc-800/40">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Issue Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Not Sent, Factory Failure"
              className="h-8 text-sm bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Keywords <span className="text-zinc-600">(comma-separated, case-insensitive)</span></Label>
            <Input
              value={keywordsRaw}
              onChange={e => setKeywordsRaw(e.target.value)}
              placeholder="e.g. not sent, pending, hold"
              className="h-8 text-sm bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || !name.trim()} className="h-7 bg-[#16a34a] hover:bg-[#15803d] text-white">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editingDef ? "Save" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={closeForm} className="h-7 text-zinc-400">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading definitions...</div>
        ) : !definitions || definitions.length === 0 ? (
          <div className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">No issue definitions yet</p>
            <p className="text-xs text-zinc-600 mt-1">Add definitions to match factory comments during LOT import</p>
          </div>
        ) : (
          definitions.map((def) => (
            <div key={def.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/60 group transition-colors">
              <div className="h-8 w-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{def.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {def.keywords.length === 0 ? (
                    <span className="text-xs text-zinc-600">No keywords</span>
                  ) : (
                    def.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-mono">{kw}</span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(def)}
                  className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(def)}
                  disabled={deleteDef.isPending}
                  className="p-1.5 rounded-md hover:bg-red-900/20 text-zinc-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  {deleteDef.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Product Catalog Section (P/N list) ────────────────────────
function ProductCatalogSection() {
  const { data: items = [], isLoading } = useProductCatalog();
  const addItem = useAddProductCatalogItem();
  const updateItem = useUpdateProductCatalogItem();
  const deleteItem = useDeleteProductCatalogItem();

  const [editingId, setEditingId] = useState<string | null>(null); // id or "new"
  const [value, setValue] = useState("");

  function startAdd() { setValue(""); setEditingId("new"); }
  function startEdit(item: ProductCatalogItem) { setValue(item.part_number); setEditingId(item.id); }
  function cancel() { setEditingId(null); setValue(""); }

  function handleSave() {
    const pn = value.trim();
    if (!pn) return;
    if (editingId === "new") {
      addItem.mutate(pn, { onSuccess: cancel });
    } else if (editingId) {
      updateItem.mutate({ id: editingId, part_number: pn }, { onSuccess: cancel });
    }
  }

  function handleDelete(item: ProductCatalogItem) {
    if (!confirm(`Delete part number "${item.part_number}"?`)) return;
    deleteItem.mutate(item.id);
  }

  const isSaving = addItem.isPending || updateItem.isPending;
  const inputCls = "h-7 px-2 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#16a34a] flex-1 font-mono";

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/80 border-b border-zinc-700">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">GBX Part Numbers</p>
        {editingId === null && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1 text-xs text-[#16a34a] hover:text-[#15803d] font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add P/N
          </button>
        )}
      </div>

      <div className="divide-y divide-zinc-800/60">
        {isLoading ? (
          <div className="px-3 py-3 text-xs text-zinc-500">Loading...</div>
        ) : (
          <>
            {items.map(item =>
              editingId === item.id ? (
                <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/40">
                  <input
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancel(); }}
                    className={inputCls}
                    autoFocus
                  />
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !value.trim()}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-medium disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                  <button onClick={cancel} className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/40 group transition-colors">
                  <span className="flex-1 text-xs font-mono text-zinc-300">{item.part_number}</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deleteItem.isPending}
                      className="p-1.5 rounded hover:bg-red-900/20 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      {deleteItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              )
            )}
            {editingId === "new" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/40">
                <input
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") cancel(); }}
                  placeholder="GBXIVO-IMB_..."
                  className={inputCls}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={isSaving || !value.trim()}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-medium disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </button>
                <button onClick={cancel} className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {items.length === 0 && editingId === null && (
              <div className="px-3 py-3 text-xs text-zinc-600">No part numbers yet. Click "Add P/N" to get started.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Product Dimension Definitions Tab ─────────────────────────
type DraftDim = {
  part_number: string;
  size_cm: string;
  volume_m3: string;
  weight_kg: string;
  boxes_qty: string;
  qty_per_box: string;
};

const EMPTY_DRAFT: DraftDim = {
  part_number: "",
  size_cm: "",
  volume_m3: "",
  weight_kg: "",
  boxes_qty: "",
  qty_per_box: "",
};

function dimToDraft(d: ProductDimension): DraftDim {
  return {
    part_number: d.part_number,
    size_cm: d.size_cm ?? "",
    volume_m3: d.volume_m3 != null ? String(d.volume_m3) : "",
    weight_kg: d.weight_kg != null ? String(d.weight_kg) : "",
    boxes_qty: d.boxes_qty != null ? String(d.boxes_qty) : "",
    qty_per_box: d.qty_per_box != null ? String(d.qty_per_box) : "",
  };
}

function ProductDimensionsTab() {
  const { data: dimensions = [], isLoading } = useProductDimensions();
  const upsert = useUpsertProductDimension();
  const deleteDim = useDeleteProductDimension();

  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pwInput === "ivocontrol") {
      setUnlocked(true);
      setPwError(false);
      setPwInput("");
    } else {
      setPwError(true);
      setPwInput("");
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftDim>(EMPTY_DRAFT);

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  }

  function startEdit(d: ProductDimension) {
    setDraft(dimToDraft(d));
    setEditingId(d.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  function patchDraft(key: keyof DraftDim, value: string) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const pn = draft.part_number.trim();
    if (!pn) return;
    upsert.mutate(
      {
        part_number: pn,
        size_cm: draft.size_cm.trim() || null,
        volume_m3: draft.volume_m3 ? parseFloat(draft.volume_m3) : null,
        weight_kg: draft.weight_kg ? parseFloat(draft.weight_kg) : null,
        boxes_qty: draft.boxes_qty ? parseInt(draft.boxes_qty, 10) : null,
        qty_per_box: draft.qty_per_box ? parseInt(draft.qty_per_box, 10) : null,
      },
      { onSuccess: cancelEdit }
    );
  }

  function handleDelete(d: ProductDimension) {
    if (!confirm(`Delete dimensions for "${d.part_number}"?`)) return;
    deleteDim.mutate(d.id);
  }

  const isSaving = upsert.isPending;

  const inputCls = "h-7 px-1.5 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#16a34a] w-full";

  function EditRow({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
    return (
      <tr className="border-b border-zinc-800 bg-zinc-800/40">
        <td className="px-2 py-1.5 w-48">
          <Input
            value={draft.part_number}
            onChange={e => patchDraft("part_number", e.target.value)}
            placeholder="GBXIVO-IMB_..."
            className={inputCls}
            autoFocus
          />
        </td>
        <td className="px-2 py-1.5 w-28">
          <Input
            value={draft.size_cm}
            onChange={e => patchDraft("size_cm", e.target.value)}
            placeholder="41 x 46 x 41"
            className={inputCls}
          />
        </td>
        <td className="px-2 py-1.5 w-20">
          <Input
            value={draft.volume_m3}
            onChange={e => patchDraft("volume_m3", e.target.value)}
            placeholder="0.078"
            type="number"
            step="0.001"
            className={inputCls}
          />
        </td>
        <td className="px-2 py-1.5 w-20">
          <Input
            value={draft.weight_kg}
            onChange={e => patchDraft("weight_kg", e.target.value)}
            placeholder="12"
            type="number"
            step="0.1"
            className={inputCls}
          />
        </td>
        <td className="px-2 py-1.5 w-16">
          <Input
            value={draft.boxes_qty}
            onChange={e => patchDraft("boxes_qty", e.target.value)}
            placeholder="11"
            type="number"
            className={inputCls}
          />
        </td>
        <td className="px-2 py-1.5 w-16">
          <Input
            value={draft.qty_per_box}
            onChange={e => patchDraft("qty_per_box", e.target.value)}
            placeholder="12"
            type="number"
            className={inputCls}
          />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={onSave}
              disabled={isSaving || !draft.part_number.trim()}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={onCancel}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 space-y-5">
        <div className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Ruler className="h-6 w-6 text-zinc-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-200">PDD is locked</p>
          <p className="text-xs text-zinc-500 mt-1">Enter the password to edit product dimensions</p>
        </div>
        <form onSubmit={handleUnlock} className="flex flex-col items-center gap-3 w-56">
          <Input
            type="password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false); }}
            placeholder="Password"
            autoFocus
            className={cn(
              "bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-center",
              pwError && "border-red-500 focus-visible:ring-red-500"
            )}
          />
          {pwError && <p className="text-xs text-red-400 -mt-1">Incorrect password</p>}
          <Button type="submit" className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white">
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ProductCatalogSection />

      <div className="flex items-start justify-between pr-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Product Dimension Definitions</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            Foundational size, weight and packaging data per GBX part number
          </p>
        </div>
        {editingId === null && (
          <Button size="sm" onClick={startAdd} className="h-8 bg-[#16a34a] hover:bg-[#15803d] text-white flex-shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Row
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-800/80 border-b border-zinc-700">
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">GBX P/N</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">Size (cm)</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">Vol (m³)</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">Weight (kg)</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">Boxes</th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider">Qty/Box</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">Loading...</td>
                </tr>
              ) : (
                <>
                  {dimensions.map(d =>
                    editingId === d.id ? (
                      <EditRow key={d.id} onSave={handleSave} onCancel={cancelEdit} />
                    ) : (
                      <tr key={d.id} className="border-b border-zinc-800 hover:bg-zinc-800/40 group transition-colors">
                        <td className="px-3 py-2 font-mono text-zinc-200 font-medium">{d.part_number}</td>
                        <td className="px-3 py-2 text-zinc-400">{d.size_cm ?? <span className="text-zinc-700">—</span>}</td>
                        <td className="px-3 py-2 text-zinc-400">{d.volume_m3 ?? <span className="text-zinc-700">—</span>}</td>
                        <td className="px-3 py-2 text-zinc-400">{d.weight_kg ?? <span className="text-zinc-700">—</span>}</td>
                        <td className="px-3 py-2 text-zinc-400">{d.boxes_qty ?? <span className="text-zinc-700">—</span>}</td>
                        <td className="px-3 py-2 text-zinc-400">{d.qty_per_box ?? <span className="text-zinc-700">—</span>}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(d)}
                              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(d)}
                              disabled={deleteDim.isPending}
                              className="p-1.5 rounded hover:bg-red-900/20 text-zinc-500 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              {deleteDim.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  {editingId === "new" && (
                    <EditRow onSave={handleSave} onCancel={cancelEdit} />
                  )}
                  {dimensions.length === 0 && editingId === null && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center">
                        <Ruler className="h-8 w-8 mx-auto text-zinc-700 mb-2" />
                        <p className="text-sm text-zinc-500">No product dimensions yet</p>
                        <p className="text-xs text-zinc-600 mt-1">Add rows to define packaging data per part number</p>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
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
    { id: "issues", label: "Issues", icon: AlertTriangle },
    { id: "pdd", label: "PDD", icon: Ruler },
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
      <DialogContent className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 w-[62vw] sm:max-w-[62vw] p-0 gap-0">
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
            {activeTab === "issues" && <IssueDefinitionsTab />}
            {activeTab === "pdd" && <ProductDimensionsTab />}
            {activeTab === "deployment" && <DeploymentTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
