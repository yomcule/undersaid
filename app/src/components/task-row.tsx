"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Row, Cell, EditIcon, BinIcon, SaveIcon } from "@/components/ui";
import { firstName } from "@/lib/name";

type Option = { code: string; label: string };
type Person = { id: string; full_name: string };

type Task = {
  id: string;
  title: string;
  type_code: string | null;
  type_label: string | null;
  status_code: string;
  status_label: string;
  is_open: boolean;
  assignee_id: string | null;
  assignee_name: string | null;
  due_on: string | null;
  is_overdue: boolean;
  priority: number;
};

const fieldCls =
  "w-full border-b border-bone bg-transparent pb-1 text-sm focus:border-indigo focus:outline-none";

/**
 * A row that edits in place. It used to be a link to a full detail page —
 * fine for comments and description, overkill for flipping a status. The
 * save icon only appears while editing, so the row's resting state stays a
 * plain pencil rather than always showing a control with nothing to save.
 */
export function TaskRow({
  task,
  statuses,
  types,
  people,
  updateTask,
  archiveTask,
  toggleDone,
}: {
  task: Task;
  statuses: Option[];
  types: Option[];
  people: Person[];
  updateTask: (formData: FormData) => void;
  archiveTask: (formData: FormData) => void;
  toggleDone: (formData: FormData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(task.status_code === "done");
  const [title, setTitle] = useState(task.title);
  const [typeCode, setTypeCode] = useState(task.type_code ?? "");
  const [statusCode, setStatusCode] = useState(task.status_code);
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
  const [dueOn, setDueOn] = useState(task.due_on ?? "");
  const [priority, setPriority] = useState(task.priority);

  function reset() {
    setTitle(task.title);
    setTypeCode(task.type_code ?? "");
    setStatusCode(task.status_code);
    setAssigneeId(task.assignee_id ?? "");
    setDueOn(task.due_on ?? "");
    setPriority(task.priority);
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("title", title);
    fd.set("type_code", typeCode);
    fd.set("status_code", statusCode);
    fd.set("assignee_id", assigneeId);
    fd.set("due_on", dueOn);
    fd.set("priority", String(priority));
    startTransition(() => updateTask(fd));
    setEditing(false);
  }

  function handleCancel() {
    reset();
    setEditing(false);
  }

  function handleToggleDone(checked: boolean) {
    setDone(checked);
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("done", String(checked));
    startTransition(() => toggleDone(fd));
  }

  return (
    <Row>
      <Cell nowrap>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => handleToggleDone(e.target.checked)}
            aria-label={done ? "Mark not done" : "Mark done"}
            title={done ? "Mark not done" : "Mark done"}
            className="size-4 accent-indigo"
          />
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldCls}
              aria-label="Title"
            />
          ) : (
            <Link
              href={`/tasks/${task.id}`}
              className={`hover:text-indigo ${done ? "text-iron line-through" : ""}`}
            >
              {task.title}
            </Link>
          )}
        </div>
      </Cell>
      <Cell nowrap>
        {editing ? (
          <select
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value)}
            className={`data ${fieldCls}`}
            aria-label="Type"
          >
            <option value="">—</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-iron">{task.type_label ?? "—"}</span>
        )}
      </Cell>
      <Cell nowrap>
        {editing ? (
          <select
            value={statusCode}
            onChange={(e) => setStatusCode(e.target.value)}
            className={fieldCls}
            aria-label="Status"
          >
            {statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <span className={task.is_open ? undefined : "text-iron"}>{task.status_label}</span>
        )}
      </Cell>
      <Cell nowrap>
        {editing ? (
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={fieldCls}
            aria-label="Assignee"
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-iron">{firstName(task.assignee_name) ?? "—"}</span>
        )}
      </Cell>
      <Cell mono nowrap>
        {editing ? (
          <input
            type="date"
            value={dueOn ?? ""}
            onChange={(e) => setDueOn(e.target.value)}
            className={`data ${fieldCls}`}
            aria-label="Due"
          />
        ) : (
          <span className={task.is_overdue ? "text-madder" : undefined}>
            {task.due_on
              ? new Date(task.due_on).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })
              : "—"}
          </span>
        )}
      </Cell>
      <Cell mono>
        {editing ? (
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className={`data ${fieldCls}`}
            aria-label="Priority"
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          task.priority
        )}
      </Cell>
      <Cell>
        <div className="flex items-center gap-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                aria-label="Save task"
                title="Save"
                className="text-iron hover:text-indigo disabled:opacity-50"
              >
                <SaveIcon />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                aria-label="Cancel edit"
                title="Cancel"
                className="text-iron hover:text-madder"
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit task"
              title="Edit"
              className="text-iron hover:text-indigo"
            >
              <EditIcon />
            </button>
          )}
          <form action={archiveTask}>
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" aria-label="Bin task" title="Bin" className="text-iron hover:text-madder">
              <BinIcon />
            </button>
          </form>
        </div>
      </Cell>
    </Row>
  );
}
