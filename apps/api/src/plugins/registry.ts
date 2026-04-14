/**
 * PluginRegistry: DB-backed CRUD for the plugins table.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { PluginStatus } from "./types.js";

export interface PluginRecord {
  id: number;
  name: string;
  description: string;
  version: string;
  source: string;
  sourceUri: string;
  status: string;
  config: string | null;
  installedAt: string;
  updatedAt: string;
}

export class PluginRegistry {
  /** List all plugins from DB. */
  async list(): Promise<PluginRecord[]> {
    return db.select().from(schema.plugins).all();
  }

  /** Get a single plugin by name. */
  async get(name: string): Promise<PluginRecord | undefined> {
    const rows = await db
      .select()
      .from(schema.plugins)
      .where(eq(schema.plugins.name, name))
      .limit(1);
    return rows[0];
  }

  /** Insert or update a plugin record. */
  async save(plugin: {
    name: string;
    description: string;
    version: string;
    source: string;
    sourceUri: string;
    status?: string;
    config?: string | null;
  }): Promise<void> {
    const existing = await this.get(plugin.name);
    if (existing) {
      await db
        .update(schema.plugins)
        .set({
          description: plugin.description,
          version: plugin.version,
          source: plugin.source,
          sourceUri: plugin.sourceUri,
          status: plugin.status ?? existing.status,
          config: plugin.config ?? existing.config,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.plugins.name, plugin.name));
    } else {
      await db.insert(schema.plugins).values({
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        source: plugin.source,
        sourceUri: plugin.sourceUri,
        status: plugin.status ?? "installed",
        config: plugin.config ?? null,
      });
    }
  }

  /** Update the status of a plugin. */
  async updateStatus(name: string, status: PluginStatus): Promise<void> {
    await db
      .update(schema.plugins)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(schema.plugins.name, name));
  }

  /** Remove a plugin from the DB. */
  async remove(name: string): Promise<void> {
    await db.delete(schema.plugins).where(eq(schema.plugins.name, name));
  }
}

