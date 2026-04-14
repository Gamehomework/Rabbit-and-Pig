/**
 * Notes CRUD endpoints
 */

import type { FastifyInstance } from "fastify";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";

export async function notesRoutes(app: FastifyInstance) {
  // GET /api/notes — list notes, optional filter by stockSymbol
  app.get<{
    Querystring: { stockSymbol?: string };
  }>("/api/notes", async (request) => {
    const { stockSymbol } = request.query;

    if (stockSymbol) {
      return db
        .select()
        .from(schema.notes)
        .where(eq(schema.notes.stockSymbol, stockSymbol))
        .orderBy(schema.notes.createdAt);
    }

    return db.select().from(schema.notes).orderBy(schema.notes.createdAt);
  });

  // POST /api/notes — create a note
  app.post<{
    Body: { title: string; content: string; stockSymbol?: string };
  }>("/api/notes", {
    schema: {
      body: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string", minLength: 1 },
          content: { type: "string", minLength: 1 },
          stockSymbol: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const { title, content, stockSymbol } = request.body;
        const [note] = await db
          .insert(schema.notes)
          .values({ title, content, stockSymbol: stockSymbol ?? null })
          .returning();
        return reply.status(201).send(note);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create note";
        request.log.error(err, "Create note error");
        return reply.status(500).send({ error: message, statusCode: 500 });
      }
    },
  });

  // GET /api/notes/:id — get one note
  app.get<{
    Params: { id: string };
  }>("/api/notes/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) {
      return reply.status(400).send({ error: "Invalid note ID", statusCode: 400 });
    }

    const note = await db.query.notes.findFirst({
      where: (n, { eq }) => eq(n.id, id),
    });

    if (!note) {
      return reply.status(404).send({ error: "Note not found", statusCode: 404 });
    }

    return note;
  });

  // PUT /api/notes/:id — update a note
  app.put<{
    Params: { id: string };
    Body: { title?: string; content?: string; stockSymbol?: string };
  }>("/api/notes/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1 },
          content: { type: "string", minLength: 1 },
          stockSymbol: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) {
        return reply.status(400).send({ error: "Invalid note ID", statusCode: 400 });
      }

      const existing = await db.query.notes.findFirst({
        where: (n, { eq }) => eq(n.id, id),
      });
      if (!existing) {
        return reply.status(404).send({ error: "Note not found", statusCode: 404 });
      }

      try {
        const updates: Record<string, unknown> = {
          updatedAt: sql`(datetime('now'))`,
        };
        const { title, content, stockSymbol } = request.body;
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (stockSymbol !== undefined) updates.stockSymbol = stockSymbol;

        const [updated] = await db
          .update(schema.notes)
          .set(updates)
          .where(eq(schema.notes.id, id))
          .returning();
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update note";
        request.log.error(err, "Update note error");
        return reply.status(500).send({ error: message, statusCode: 500 });
      }
    },
  });

  // DELETE /api/notes/:id — delete a note
  app.delete<{
    Params: { id: string };
  }>("/api/notes/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) {
      return reply.status(400).send({ error: "Invalid note ID", statusCode: 400 });
    }

    const existing = await db.query.notes.findFirst({
      where: (n, { eq }) => eq(n.id, id),
    });
    if (!existing) {
      return reply.status(404).send({ error: "Note not found", statusCode: 404 });
    }

    await db.delete(schema.notes).where(eq(schema.notes.id, id));
    return reply.status(204).send();
  });
}

