"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPlugins, installPlugin, enablePlugin, disablePlugin, uninstallPlugin,
  type Plugin,
} from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  enabled: "bg-green-100 text-green-700",
  installed: "bg-yellow-100 text-yellow-700",
  disabled: "bg-gray-100 text-gray-500",
  error: "bg-red-100 text-red-700",
};

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Install form
  const [installName, setInstallName] = useState("");
  const [installSource, setInstallSource] = useState("local");
  const [installUri, setInstallUri] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Confirm uninstall
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try { setPlugins(await getPlugins()); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load plugins"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  async function handleToggle(plugin: Plugin) {
    setActionLoading((p) => ({ ...p, [plugin.name]: true }));
    try {
      if (plugin.status === "enabled") { await disablePlugin(plugin.name); }
      else { await enablePlugin(plugin.name); }
      await loadPlugins();
    } catch { /* ignore */ }
    finally { setActionLoading((p) => ({ ...p, [plugin.name]: false })); }
  }

  async function handleUninstall(name: string) {
    if (confirmUninstall !== name) { setConfirmUninstall(name); return; }
    setActionLoading((p) => ({ ...p, [name]: true }));
    setConfirmUninstall(null);
    try { await uninstallPlugin(name); await loadPlugins(); }
    catch { /* ignore */ }
    finally { setActionLoading((p) => ({ ...p, [name]: false })); }
  }

  async function handleInstall(e: React.FormEvent) {
    e.preventDefault();
    setInstalling(true); setInstallMsg(null);
    try {
      await installPlugin({ name: installName, source: installSource, sourceUri: installUri || undefined });
      setInstallMsg({ ok: true, text: `Installed "${installName}" successfully!` });
      setInstallName(""); setInstallUri("");
      await loadPlugins();
    } catch (err) {
      setInstallMsg({ ok: false, text: err instanceof Error ? err.message : "Install failed" });
    } finally { setInstalling(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Plugin Marketplace</h1>

      {/* Installed Plugins */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Installed Plugins</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-lg border bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : plugins.length === 0 ? (
          <p className="text-sm text-gray-400">No plugins installed.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plugins.map((p) => (
              <div key={p.name} className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] || STATUS_STYLES.disabled}`}>
                    {p.status}
                  </span>
                </div>
                {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                {p.version && <p className="text-xs text-gray-400">v{p.version}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleToggle(p)} disabled={actionLoading[p.name]}
                    className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
                      p.status === "enabled" ? "bg-yellow-500 hover:bg-yellow-600" : "bg-green-600 hover:bg-green-700"
                    }`}>
                    {actionLoading[p.name] ? "…" : p.status === "enabled" ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => handleUninstall(p.name)} disabled={actionLoading[p.name]}
                    className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {confirmUninstall === p.name ? "Confirm?" : "Uninstall"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Install New Plugin */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Install New Plugin</h2>
        <form onSubmit={handleInstall} className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-gray-600">Plugin Name</label>
            <input type="text" value={installName} onChange={(e) => setInstallName(e.target.value)}
              placeholder="my-plugin" required
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Source</label>
            <select value={installSource} onChange={(e) => setInstallSource(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
              <option value="local">Local</option>
              <option value="npm">NPM</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-gray-600">Source URI</label>
            <input type="text" value={installUri} onChange={(e) => setInstallUri(e.target.value)}
              placeholder="path or URL (optional)"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" disabled={installing || !installName.trim()}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {installing ? "Installing…" : "Install"}
          </button>
        </form>
        {installMsg && (
          <p className={`mt-2 text-sm ${installMsg.ok ? "text-green-600" : "text-red-600"}`}>{installMsg.text}</p>
        )}
      </section>
    </div>
  );
}

