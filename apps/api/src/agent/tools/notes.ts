/**
 * Notes Tool: CRUD operations for user notes stored in SQLite via Drizzle ORM.
 */

import { eq, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Tool } from "./types.js";

export interface NotesInput {
  action: "create" | "read" | "update" | "delete" | "list";
  id?: number;
  title?: string;
  content?: string;
  stockSymbol?: string;
}

export type NotesOutput =
  | { success: true; note: NoteRecord }
  | { success: true; notes: NoteRecord[] }
  | { success: true; deleted: true; id: number }
  | { success: false; error: string };

interface NoteRecord {
  id: number;
  title: string;
  content: string;
  stockSymbol: string | null;
  createdAt: string;
  updatedAt: string;
}

export const notesTool: Tool<NotesInput, NotesOutput> = {
  name: "notes",
  description:
    "Create, read, update, delete, or list user notes. Notes can optionally be associated with a stock symbol.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "read", "update", "delete", "list"],
        description: "The CRUD action to perform.",
      },
      id: {
        type: "number",
        description: "Note ID (required for read, update, delete).",
      },
      title: {
        type: "string",
        description: "Note title (required for create, optional for update).",
      },
      content: {
        type: "string",
        description: "Note content (required for create, optional for update).",
      },
      stockSymbol: {
        type: "string",
        description: "Optional stock symbol to associate with the note.",
      },
    },
    required: ["action"],
  },

  async execute(input: NotesInput): Promise<NotesOutput> {
    try {
      switch (input.action) {
        case "create": {
          if (!input.title || !input.content) {
            return { success: false, error: "title and content are required for create" };
          }
          const [note] = await db
            .insert(schema.notes)
            .values({
              title: input.title,
              content: input.content,
              stockSymbol: input.stockSymbol ?? null,
            })
            .returning();
          return { success: true, note: note as NoteRecord };
        }

        case "read": {
          if (input.id == null) {
            return { success: false, error: "id is required for read" };
          }
          const [note] = await db
            .select()
            .from(schema.notes)
            .where(eq(schema.notes.id, input.id))
            .limit(1);
          if (!note) {
            return { success: false, error: `Note with id ${input.id} not found` };
          }
          return { success: true, note: note as NoteRecord };
        }

        case "update": {
          if (input.id == null) {
            return { success: false, error: "id is required for update" };
          }
          const updates: Record<string, unknown> = {
            updatedAt: sql`(datetime('now'))`,
          };
          if (input.title !== undefined) updates.title = input.title;
          if (input.content !== undefined) updates.content = input.content;
          if (input.stockSymbol !== undefined) updates.stockSymbol = input.stockSymbol;

          const [note] = await db
            .update(schema.notes)
            .set(updates)
            .where(eq(schema.notes.id, input.id))
            .returning();
          if (!note) {
            return { success: false, error: `Note with id ${input.id} not found` };
          }
          return { success: true, note: note as NoteRecord };
        }

        case "delete": {
          if (input.id == null) {
            return { success: false, error: "id is required for delete" };
          }
          const [deleted] = await db
            .delete(schema.notes)
            .where(eq(schema.notes.id, input.id))
            .returning();
          if (!deleted) {
            return { success: false, error: `Note with id ${input.id} not found` };
          }
          return { success: true, deleted: true, id: input.id };
        }

        case "list": {
          const query = db.select().from(schema.notes);
          const notes = input.stockSymbol
            ? await query.where(eq(schema.notes.stockSymbol, input.stockSymbol))
            : await query;
          return { success: true, notes: notes as NoteRecord[] };
        }

        default:
          return { success: false, error: `Unknown action: ${String(input.action)}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  },
};

