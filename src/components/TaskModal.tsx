// src/components/TaskModal.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  priority?: "Low" | "Medium" | "High" | null;
  status: "todo" | "in_progress" | "done";
  sticky_color?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
  created_at?: string | null;
  position?: number | null;
};

type TaskModalProps = { isOpen: boolean; onClose: () => void; task?: Task | null; };
const TODO_COLOR = "#FFD166";

export default function TaskModal({ isOpen, onClose, task }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">(task?.priority ?? "Medium");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "todo");
  const [description, setDescription] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title ?? "");
      setPriority((task.priority as any) ?? "Medium");
      setStatus(task.status ?? "todo");
      setDescription(task.description ?? "");
    } else {
      setTitle(""); setPriority("Medium"); setStatus("todo"); setDescription("");
    }
  }, [task, isOpen]);

  if (!isOpen) return null;
  const close = () => onClose();

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (task?.id) {
        const patch: Partial<Task> = {
          title: title.trim(),
          description: description.trim() || null,
          priority, status,
        };
        if (status === "todo") { patch.sticky_color = TODO_COLOR; patch.assigned_to = null; }
        const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
        if (error) throw error;
      } else {
        const { data: s } = await supabase.auth.getSession();
        const uid = s?.session?.user?.id ?? null;
        const createRow = {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: "todo" as const,
          sticky_color: TODO_COLOR,
          created_by: uid,
          assigned_to: null,
        };
        const { error } = await supabase.from("tasks").insert([createRow]);
        if (error) throw error;
      }
      window.dispatchEvent(new CustomEvent("tasks:refresh"));
      close();
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!task?.id) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) alert(error.message);
    window.dispatchEvent(new CustomEvent("tasks:refresh"));
    close();
  }

  return (
    <div className="modal">
      <div className="modal-card">
        <h3 className="modal-title">{task ? "Edit Task" : "New Task"}</h3>

        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />

        <label className="label">Description</label>
        <textarea className="textarea" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={4} />

        <label className="label">Priority</label>
        <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
          <option>Low</option><option>Medium</option><option>High</option>
        </select>

        {task ? (
          <>
            <label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Completed</option>
            </select>
          </>
        ) : null}

        <div className="actions">
          {task?.id ? <button className="btn btn-danger" onClick={handleDelete}>Delete</button> : null}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>{saving ? "Saving..." : task ? "Save" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}
