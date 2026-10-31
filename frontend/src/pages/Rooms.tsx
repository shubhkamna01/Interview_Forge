import { useState, type SyntheticEvent } from "react";
import { api, type Room } from "../api";
import { Async } from "../components/Async";
import { ConfirmButton } from "../components/ConfirmButton";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { useAction } from "../hooks/useAction";
import { useAsync } from "../hooks/useAsync";

export function Rooms() {
  const state = useAsync(() => api.rooms.list(), []);
  const { busy, run } = useAction();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [editing, setEditing] = useState<{ id: string; name: string; capacity: string } | null>(null);

  async function add(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await run(() => api.rooms.create({ name: name.trim(), capacity: Number(capacity) }), "Room added.");
    if (ok) {
      setName("");
      state.reload();
    }
  }

  async function save(room: Room) {
    if (!editing) return;
    const ok = await run(() => api.rooms.update(room.id, { name: editing.name.trim(), capacity: Number(editing.capacity) }), "Room updated.");
    if (ok) {
      setEditing(null);
      state.reload();
    }
  }

  async function remove(room: Room) {
    const ok = await run(async () => {
      await api.rooms.remove(room.id);
      return true;
    }, "Room deleted.");
    if (ok) state.reload();
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">RESOURCES</p>
          <h1>Rooms</h1>
          <p className="subtitle">Interviews are only placed in a room that is free and big enough for the round.</p>
        </div>
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Add a room</h2>
            <p>Capacity is the number of people it can hold.</p>
          </div>
        </div>
        <form className="inline-form" onSubmit={add}>
          <Field label="Room name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 101" required maxLength={60} />
          </Field>
          <Field label="Capacity">
            <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </Field>
          <button className="primary-button" disabled={busy || !name.trim()}>
            <Icon name="plus" size={16} /> Add room
          </button>
        </form>
      </article>

      <article className="panel panel-spaced">
        <div className="panel-heading">
          <div>
            <h2>All rooms</h2>
          </div>
        </div>
        <Async state={state}>
          {(rooms) =>
            rooms.length === 0 ? (
              <p className="empty-note">No rooms yet. Add at least one before generating a schedule.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>CAPACITY</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) =>
                      editing?.id === r.id ? (
                        <tr key={r.id}>
                          <td>
                            <input className="cell-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Room name" />
                          </td>
                          <td>
                            <input className="cell-input narrow" type="number" min={1} value={editing.capacity} onChange={(e) => setEditing({ ...editing, capacity: e.target.value })} aria-label="Capacity" />
                          </td>
                          <td className="row-actions">
                            <button className="primary-button small" disabled={busy} onClick={() => save(r)}>Save</button>
                            <button className="secondary-button small" onClick={() => setEditing(null)}>Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id}>
                          <td><strong>{r.name}</strong></td>
                          <td>{r.capacity} people</td>
                          <td className="row-actions">
                            <button className="secondary-button small" onClick={() => setEditing({ id: r.id, name: r.name, capacity: String(r.capacity) })}>
                              <Icon name="edit" size={14} /> Edit
                            </button>
                            <ConfirmButton className="danger-button small" disabled={busy} onConfirm={() => remove(r)}>
                              <Icon name="trash" size={14} /> Delete
                            </ConfirmButton>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </article>
    </>
  );
}
