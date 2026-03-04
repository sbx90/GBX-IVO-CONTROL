"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from "@/lib/constants";
import type { Task, TaskStatus, TaskPriority, CreateTaskInput } from "@/lib/types/database";

// ─── helpers ────────────────────────────────────────────────

function dueDateBadge(due: string | null, status: TaskStatus) {
  if (!due || status === "DONE") return null;
  const d = parseISO(due);
  if (isPast(d) && !isToday(d)) {
    return <span className="text-xs font-semibold text-red-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" />Overdue · {format(d, "MMM d")}</span>;
  }
  if (isToday(d)) {
    return <span className="text-xs font-semibold text-amber-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" />Today</span>;
  }
  return <span className="text-xs text-zinc-500 flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(d, "MMM d")}</span>;
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "TODO",
};

// ─── TaskRow ────────────────────────────────────────────────

function TaskRow({ task, onEdit, onDelete }: { task: Task; onEdit: (t: Task) => void; onDelete: (id: string) => void }) {
  const updateTask = useUpdateTask();
  const statusCfg = TASK_STATUS_CONFIG[task.status];
  const isDone = task.status === "DONE";

  function cycleStatus() {
    updateTask.mutate({ id: task.id, updates: { status: STATUS_CYCLE[task.status] } });
  }

  return (
    <div className={`group flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${isDone ? "border-zinc-800/40 bg-zinc-900/30 opacity-60" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
      {/* Status toggle */}
      <button
        onClick={cycleStatus}
        disabled={updateTask.isPending}
        title={`Mark as ${STATUS_CYCLE[task.status]}`}
        className={`flex-shrink-0 h-5 w-5 rounded-full border-2 transition-colors ${isDone ? "border-green-500 bg-green-500/20" : task.status === "IN_PROGRESS" ? "border-blue-400 bg-blue-400/10" : "border-zinc-600 hover:border-zinc-400"}`}
      >
        {isDone && <span className="flex items-center justify-center text-green-400 text-[10px] font-bold">✓</span>}
        {task.status === "IN_PROGRESS" && <span className="flex items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-blue-400 m-auto block" /></span>}
      </button>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isDone ? "line-through text-zinc-500" : "text-zinc-200"}`}>{task.title}</p>
        {task.description && <p className="text-xs text-zinc-600 truncate mt-0.5">{task.description}</p>}
        <div className="flex items-center gap-3 mt-1">
          {dueDateBadge(task.due_date, task.status)}
          {task.assigned_to && <span className="text-xs text-zinc-600">→ {task.assigned_to}</span>}
        </div>
      </div>

      {/* Status badge */}
      <Badge className={`text-xs shrink-0 ${statusCfg.bgColor} ${statusCfg.color} border-0`}>
        {statusCfg.label}
      </Badge>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-zinc-600 hover:text-red-400 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── PrioritySection ────────────────────────────────────────

function PrioritySection({
  priority,
  tasks,
  onEdit,
  onDelete,
  onAdd,
}: {
  priority: TaskPriority;
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onAdd: (priority: TaskPriority) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = TASK_PRIORITY_CONFIG[priority];
  const activeTasks = tasks.filter(t => t.status !== "DONE");
  const doneTasks = tasks.filter(t => t.status === "DONE");
  const overdue = activeTasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)));

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(v => !v)} className="flex items-center gap-2 group">
          <span className={`h-2 w-2 rounded-full ${cfg.dotColor} flex-shrink-0`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label} Priority</span>
          <span className="text-xs text-zinc-600">{activeTasks.length} active</span>
          {overdue.length > 0 && (
            <Badge className="bg-red-400/10 text-red-400 border border-red-400/20 text-[10px] px-1.5 py-0 h-4">
              {overdue.length} overdue
            </Badge>
          )}
          {collapsed ? <ChevronRight className="h-3 w-3 text-zinc-600" /> : <ChevronDown className="h-3 w-3 text-zinc-600" />}
        </button>
        <div className="flex-1 h-px bg-zinc-800" />
        <button
          onClick={() => onAdd(priority)}
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-1.5 pl-4">
          {activeTasks.length === 0 && doneTasks.length === 0 && (
            <p className="text-xs text-zinc-700 py-2 pl-1">No tasks. Click Add to create one.</p>
          )}
          {activeTasks.map(t => (
            <TaskRow key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {doneTasks.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider pl-1">Done ({doneTasks.length})</p>
              {doneTasks.map(t => (
                <TaskRow key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TaskForm ───────────────────────────────────────────────

function TaskForm({
  open,
  initialPriority,
  editTask,
  onClose,
}: {
  open: boolean;
  initialPriority: TaskPriority;
  editTask: Task | null;
  onClose: () => void;
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState(editTask?.title ?? "");
  const [description, setDescription] = useState(editTask?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(editTask?.priority ?? initialPriority);
  const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? "TODO");
  const [dueDate, setDueDate] = useState(editTask?.due_date ?? "");
  const [assignedTo, setAssignedTo] = useState(editTask?.assigned_to ?? "");

  // Reset form when dialog opens
  function handleOpenChange(o: boolean) {
    if (!o) onClose();
  }

  function handleSubmit() {
    if (!title.trim()) return;
    const payload: CreateTaskInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      due_date: dueDate || null,
      assigned_to: assignedTo.trim() || undefined,
    };
    if (editTask) {
      updateTask.mutate({ id: editTask.id, updates: payload }, { onSuccess: onClose });
    } else {
      createTask.mutate(payload, { onSuccess: onClose });
    }
  }

  const isPending = createTask.isPending || updateTask.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTask ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Title *</Label>
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleSubmit(); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="HIGH" className="text-red-400">🔴 High</SelectItem>
                  <SelectItem value="NORMAL" className="text-zinc-400">⚪ Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {(["TODO", "IN_PROGRESS", "DONE"] as TaskStatus[]).map(s => (
                    <SelectItem key={s} value={s} className={`${TASK_STATUS_CONFIG[s].color}`}>
                      {TASK_STATUS_CONFIG[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Assigned To</Label>
              <Input
                placeholder="Name or email"
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs">Description <span className="text-zinc-600 font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Additional details…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400">Cancel</Button>
            <Button
              size="sm"
              className="bg-[#16a34a] hover:bg-[#15803d] text-white"
              onClick={handleSubmit}
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Saving…" : editTask ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function TasksPage() {
  const { data: tasks = [], isLoading } = useTasks();
  const deleteTask = useDeleteTask();

  const [formOpen, setFormOpen] = useState(false);
  const [formPriority, setFormPriority] = useState<TaskPriority>("HIGH");
  const [editTask, setEditTask] = useState<Task | null>(null);

  function openAdd(priority: TaskPriority) {
    setEditTask(null);
    setFormPriority(priority);
    setFormOpen(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setFormPriority(task.priority);
    setFormOpen(true);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    deleteTask.mutate(id);
  }

  const highTasks = tasks.filter(t => t.priority === "HIGH");
  const normalTasks = tasks.filter(t => t.priority === "NORMAL");

  const overdueCount = tasks.filter(t =>
    t.status !== "DONE" && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
  ).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Tasks</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {tasks.filter(t => t.status !== "DONE").length} active
            {overdueCount > 0 && <span className="text-red-400 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <Button
          onClick={() => openAdd("HIGH")}
          className="bg-[#16a34a] hover:bg-[#15803d] text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <PrioritySection
            priority="HIGH"
            tasks={highTasks}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openAdd}
          />
          <PrioritySection
            priority="NORMAL"
            tasks={normalTasks}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openAdd}
          />
        </div>
      )}

      <TaskForm
        key={editTask?.id ?? "new"}
        open={formOpen}
        initialPriority={formPriority}
        editTask={editTask}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
