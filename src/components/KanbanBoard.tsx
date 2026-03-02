import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import TaskModal, { type Task } from "./TaskModal";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

type Status = "todo" | "in_progress" | "done";
const STATUS: Status[] = ["todo", "in_progress", "done"];
const LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Completed",
};
const TODO_COLOR = "#FFD166";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  color: string | null;
};

export default function KanbanBoard({
  stickyColor,
  currentUserId,
}: {
  stickyColor: string;
  currentUserId: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  async function fetchProfiles() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, color");
    const map: Record<string, Profile> = {};
    for (const p of (data || []) as Profile[]) map[p.id] = p;
    setProfiles(map);
  }
  async function fetchTasks() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) console.error("fetchTasks error", error);
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchProfiles();
    fetchTasks();
    const refresh = () => {
      fetchTasks();
      fetchProfiles();
    };
    window.addEventListener("tasks:refresh", refresh);
    const channel = supabase
      .channel("public:tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => refresh()
      )
      .subscribe();
    return () => {
      window.removeEventListener("tasks:refresh", refresh);
      supabase.removeChannel(channel);
    };
  }, []);

  const columns = useMemo(() => {
    const by: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) by[t.status]?.push(t);
    return by;
  }, [tasks]);

  function openNew() {
    setSelectedTask(null);
    setModalOpen(true);
  }
  function openEdit(task: Task) {
    setSelectedTask(task);
    setModalOpen(true);
  }

  async function persistTaskPatch(id: string, patch: Partial<Task>) {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) console.error("persistTaskPatch error", error);
  }
  async function persistPositions(items: Task[]) {
    const updates = items.map((t, idx) => ({ id: t.id, position: idx }));
    const { error } = await supabase
      .from("tasks")
      .upsert(updates, { onConflict: "id" });
    if (error) console.error("persistPositions error", error);
  }

  function assigneeLabel(t: Task) {
    if (t.status === "todo") return "Unassigned";
    const p = t.assigned_to ? profiles[t.assigned_to] : null;
    return p?.full_name || p?.email || "Unassigned";
  }

  async function moveTo(id: string, to: Status) {
    const patch: Partial<Task> = { status: to };
    if (to === "todo") {
      patch.sticky_color = TODO_COLOR;
      patch.assigned_to = null;
    }
    if (to === "in_progress") {
      patch.sticky_color = stickyColor;
      patch.assigned_to = currentUserId;
    }
    await persistTaskPatch(id, patch);
    window.dispatchEvent(new CustomEvent("tasks:refresh"));
  }

  function localMove(
    sourceArr: Task[],
    destArr: Task[],
    sourceIdx: number,
    destIdx: number,
    toStatus: Status,
    newColor?: string,
    assignee?: string | null
  ) {
    const item = sourceArr[sourceIdx];
    sourceArr.splice(sourceIdx, 1);
    const moved = {
      ...item,
      status: toStatus,
      sticky_color: newColor ?? item.sticky_color,
      assigned_to: assignee === undefined ? item.assigned_to ?? null : assignee,
    } as Task;
    destArr.splice(destIdx, 0, moved);
    return moved;
  }

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    const fromCol = source.droppableId as Status;
    const toCol = destination.droppableId as Status;
    if (
      !["todo", "in_progress", "done"].includes(fromCol) ||
      !["todo", "in_progress", "done"].includes(toCol)
    )
      return;

    const fromArr = [...columns[fromCol]];
    const toArr = fromCol === toCol ? fromArr : [...columns[toCol]];

    let newColor: string | undefined;
    let newAssignee: string | null | undefined = undefined;
    if (toCol === "todo") {
      newColor = TODO_COLOR;
      newAssignee = null;
    }
    if (toCol === "in_progress") {
      newColor = stickyColor;
      newAssignee = currentUserId;
    }

    const moved = localMove(
      fromArr,
      toArr,
      source.index,
      destination.index,
      toCol,
      newColor,
      newAssignee
    );

    const nextColumns = {
      ...columns,
      [fromCol]: fromCol === toCol ? toArr : fromArr,
      [toCol]: toArr,
    };
    const untouched = tasks.filter(
      (t) => t.status !== fromCol && t.status !== toCol
    );
    setTasks([
      ...untouched,
      ...nextColumns.todo,
      ...nextColumns.in_progress,
      ...nextColumns.done,
    ]);

    await persistTaskPatch(draggableId, {
      status: toCol,
      sticky_color: moved.sticky_color,
      assigned_to: moved.assigned_to ?? null,
    });
    await persistPositions(nextColumns[fromCol]);
    if (fromCol !== toCol) await persistPositions(nextColumns[toCol]);
    window.dispatchEvent(new CustomEvent("tasks:refresh"));
  };

  return (
    <div className="kanban">
      <div className="kanban-header">
        <h2>Drug Discovery Board</h2>
        <button onClick={openNew} className="btn btn-primary">
          New Task
        </button>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="columns">
            {STATUS.map((col) => (
              <Droppable droppableId={col} key={col}>
                {(provided) => (
                  <div className="column">
                    <h3 className="col-title">{LABEL[col]}</h3>
                    <div
                      className="items"
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {columns[col].map((t, idx) => (
                        <Draggable draggableId={t.id} index={idx} key={t.id}>
                          {(drag) => (
                            <div
                              className={`card note square note-${col}`}
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              onClick={() => openEdit(t)}
                              style={{
                                background: t.sticky_color ?? "#ffd",
                                ...drag.draggableProps.style,
                              }}
                            >
                              <div className="note-tape" />
                              <div className="note-header" />
                              <div
                                className={`prio prio-${(
                                  t.priority || "Medium"
                                ).toLowerCase()}`}
                              >
                                {t.priority || "Medium"}
                              </div>
                              <div className={`ribbon ribbon-${col}`}>
                                {LABEL[col]}
                              </div>

                              {/* Title and description above overlays */}
                              <div
                                className="card-title"
                                style={{ position: "relative", zIndex: 3 }}
                              >
                                {t.title || "Untitled"}
                              </div>
                              {t.description ? (
                                <div
                                  className="card-desc"
                                  style={{ position: "relative", zIndex: 3 }}
                                >
                                  {t.description}
                                </div>
                              ) : null}

                              <div
                                className="card-meta"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="assignee">
                                  {assigneeLabel(t)}
                                </span>

                                <span className={`meta-status ${t.status}`}>
                                  {LABEL[t.status]}
                                </span>

                                <div className="actions-mini">
                                  {t.status === "todo" && (
                                    <button
                                      className="mini"
                                      onClick={() =>
                                        moveTo(t.id, "in_progress")
                                      }
                                    >
                                      Mark In Prog
                                    </button>
                                  )}
                                  {t.status === "in_progress" && (
                                    <button
                                      className="mini"
                                      onClick={() => moveTo(t.id, "done")}
                                    >
                                      Mark Done
                                    </button>
                                  )}
                                  {t.status === "done" && (
                                    <button className="mini" disabled>
                                      Yay! Completed
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}

      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        task={selectedTask}
      />
    </div>
  );
}
