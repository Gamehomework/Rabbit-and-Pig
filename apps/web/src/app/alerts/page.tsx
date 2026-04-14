"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getNotificationChannels, saveNotificationChannel, sendNotification,
  getNotificationHistory,
  type NotificationChannel, type NotificationHistoryItem,
} from "@/lib/api";

const CHANNEL_TYPES = ["telegram", "whatsapp", "wechat"] as const;
const CHANNEL_LABELS: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", wechat: "WeChat" };
const CHANNEL_FIELDS: Record<string, string[]> = {
  telegram: ["botToken", "chatId"],
  whatsapp: ["apiKey", "phoneNumberId"],
  wechat: ["appId", "appSecret"],
};

export default function AlertsPage() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveMsg, setSaveMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // Test send
  const [testChannel, setTestChannel] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // History
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const chs = await getNotificationChannels();
      setChannels(chs);
      const cfgs: Record<string, Record<string, string>> = {};
      const defs: Record<string, boolean> = {};
      for (const ch of chs) {
        cfgs[ch.channelType] = { ...ch.config };
        defs[ch.channelType] = !!ch.isDefault;
      }
      setConfigs(cfgs);
      setDefaults(defs);
    } catch { /* empty */ }
    finally { setChannelsLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setHistory(await getNotificationHistory()); }
    catch { /* empty */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { loadChannels(); loadHistory(); }, [loadChannels, loadHistory]);

  function updateConfig(type: string, field: string, value: string) {
    setConfigs((p) => ({ ...p, [type]: { ...(p[type] || {}), [field]: value } }));
  }

  async function handleSave(type: string) {
    setSaving((p) => ({ ...p, [type]: true }));
    setSaveMsg((p) => ({ ...p, [type]: undefined as unknown as { ok: boolean; text: string } }));
    try {
      await saveNotificationChannel({ channelType: type, config: configs[type] || {}, isDefault: defaults[type] });
      setSaveMsg((p) => ({ ...p, [type]: { ok: true, text: "Saved!" } }));
      await loadChannels();
    } catch (err) {
      setSaveMsg((p) => ({ ...p, [type]: { ok: false, text: err instanceof Error ? err.message : "Failed" } }));
    } finally { setSaving((p) => ({ ...p, [type]: false })); }
  }

  async function handleTestSend(e: React.FormEvent) {
    e.preventDefault();
    setTestSending(true); setTestResult(null);
    try {
      await sendNotification({ channel: testChannel, message: testMessage, recipient: testRecipient });
      setTestResult({ ok: true, text: "Notification sent!" });
      loadHistory();
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : "Send failed" });
    } finally { setTestSending(false); }
  }

  const configured = (type: string) => channels.some((c) => c.channelType === type);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Alerts &amp; Notifications</h1>

      {/* Channel Configuration */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Channel Configuration</h2>
        {channelsLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg border bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {CHANNEL_TYPES.map((type) => (
              <div key={type} className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{CHANNEL_LABELS[type]}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${configured(type) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {configured(type) ? "Configured" : "Not configured"}
                  </span>
                </div>
                {CHANNEL_FIELDS[type].map((field) => (
                  <input key={field} type="text" placeholder={field}
                    value={configs[type]?.[field] || ""}
                    onChange={(e) => updateConfig(type, field, e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={defaults[type] || false}
                    onChange={(e) => setDefaults((p) => ({ ...p, [type]: e.target.checked }))}
                    className="rounded" />
                  Set as Default
                </label>
                <button onClick={() => handleSave(type)} disabled={saving[type]}
                  className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving[type] ? "Saving…" : "Save"}
                </button>
                {saveMsg[type] && (
                  <p className={`text-xs ${saveMsg[type].ok ? "text-green-600" : "text-red-600"}`}>{saveMsg[type].text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Test Send */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Test Send</h2>
        <form onSubmit={handleTestSend} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Channel</label>
            <select value={testChannel} onChange={(e) => setTestChannel(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Select…</option>
              {channels.map((c) => <option key={c.channelType} value={c.channelType}>{CHANNEL_LABELS[c.channelType] || c.channelType}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-gray-600">Message</label>
            <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Test message…"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Recipient</label>
            <input type="text" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="user/id"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" disabled={testSending || !testChannel || !testMessage}
            className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {testSending ? "Sending…" : "Send"}
          </button>
        </form>
        {testResult && (
          <p className={`mt-2 text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>{testResult.text}</p>
        )}
      </section>

      {/* Notification History */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Notification History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">No notifications sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5">{CHANNEL_LABELS[item.channel] || item.channel}</td>
                    <td className="px-3 py-1.5 text-gray-600">{item.recipient}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate text-gray-600">{item.message}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.status === "sent" ? "bg-green-100 text-green-700" :
                        item.status === "rate_limited" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-400">{new Date(item.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

