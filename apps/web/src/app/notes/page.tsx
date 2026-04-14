"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getNotes, createNote, updateNote, deleteNote, type Note,
} from "@/lib/api";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSymbol, setFilterSymbol] = useState("");

  // Create form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [stockSymbol, setStockSymbol] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotes(filterSymbol || undefined);
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [filterSymbol]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createNote({ title, content, stockSymbol: stockSymbol || undefined });
      setTitle("");
      setContent("");
      setStockSymbol("");
      await load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  }

  async function handleUpdate(id: number) {
    try {
      await updateNote(id, { title: editTitle, content: editContent });
      setEditingId(null);
      await load();
    } catch { /* ignore */ }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote(id);
      await load();
    } catch { /* ignore */ }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Notes</h1>

      {/* Filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter by stock symbol…"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Create Form */}
      <form onSubmit={handleCreate} className="mb-8 rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <h2 className="font-semibold">Create Note</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Stock symbol (optional)"
            value={stockSymbol}
            onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <textarea
          placeholder="Content…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create Note"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Notes List */}
      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && notes.length === 0 && !error && (
        <p className="text-gray-500">No notes yet.</p>
      )}

      <div className="space-y-3">
        {notes.map((note) => (
          <div key={note.id} className="rounded-lg border bg-white p-4 shadow-sm">
            {editingId === note.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(note.id)} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">Save</button>
                  <button onClick={() => setEditingId(null)} className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{note.title}</h3>
                    {note.stockSymbol && (
                      <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {note.stockSymbol}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => startEdit(note)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(note.id)} className="text-red-600 hover:underline">Delete</button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                <p className="mt-2 text-xs text-gray-400">{new Date(note.createdAt).toLocaleString()}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
