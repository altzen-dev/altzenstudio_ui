import { useEffect, useState } from "react";

type ServerRow = {
  serverConfigId: string | number | null;
  domainName: string;
  ipAddress: string;
};

type AddServerFormState = {
  serverIp: string;
  domainName: string;
  rootUsername: string;
  rootUserPassword: string;
  hanaDbUsername: string;
  hanaDbPassword: string;
  hanaPort: string;
  hanaBackupPath: string;
  isDeleted: boolean;
};

type ActionStatus = "idle" | "sending" | "success" | "error";

type ServerActionState = {
  status: ActionStatus;
  message: string;
};

function getText(value: unknown, fallback = "N/A") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function normalizeServerRows(payload: unknown): ServerRow[] {
  let sourceRows: unknown[] = [];

  if (Array.isArray(payload)) {
    sourceRows = payload;
  } else if (payload && typeof payload === "object") {
    const parsed = payload as Record<string, unknown>;
    if (Array.isArray(parsed.servers)) {
      sourceRows = parsed.servers;
    } else if (Array.isArray(parsed.data)) {
      sourceRows = parsed.data;
    } else if (Array.isArray(parsed.items)) {
      sourceRows = parsed.items;
    }
  }

  return sourceRows.reduce<ServerRow[]>((accumulator, row) => {
    if (!row || typeof row !== "object") {
      return accumulator;
    }

    const item = row as Record<string, unknown>;
    const idCandidate =
      item.serverConfigId ?? item.serverconfigid ?? item.serverId ?? item.id ?? item.configId ?? null;

    accumulator.push({
      serverConfigId:
        typeof idCandidate === "string" || typeof idCandidate === "number" ? idCandidate : null,
      domainName: getText(item.domainName ?? item.domain ?? item.host ?? item.hostname),
      ipAddress: getText(item.serverIP ?? item.serverIp ?? item.ipAddress ?? item.ip ?? item.address)
    });

    return accumulator;
  }, []);
}

async function getResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function formatPayload(payload: unknown) {
  if (payload === null) {
    return "No response body.";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "Response received, but it could not be formatted.";
  }
}

const initialAddServerForm: AddServerFormState = {
  serverIp: "",
  domainName: "",
  rootUsername: "",
  rootUserPassword: "",
  hanaDbUsername: "",
  hanaDbPassword: "",
  hanaPort: "",
  hanaBackupPath: "",
  isDeleted: false
};

export default function App() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionsByRow, setActionsByRow] = useState<Record<string, ServerActionState>>({});
  const [logsByRow, setLogsByRow] = useState<Record<string, string[]>>({});
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerRow | null>(null);
  const [backupMenuError, setBackupMenuError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePage, setActivePage] = useState<"dashboard" | "settings" | "about">("dashboard");
  const [isSapBasisMenuOpen, setIsSapBasisMenuOpen] = useState(false);
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [addServerForm, setAddServerForm] = useState<AddServerFormState>(initialAddServerForm);
  const [isAddServerSubmitting, setIsAddServerSubmitting] = useState(false);
  const [addServerSubmitError, setAddServerSubmitError] = useState("");


  const filteredServers = servers.filter((server) =>
    server.domainName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedLogs = selectedRowKey ? logsByRow[selectedRowKey] ?? [] : [];

  const fetchServers = async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("http://localhost:8084/api/v1/servers/summaries", {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      const payload = await getResponsePayload(response);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const normalizedRows = normalizeServerRows(payload);
      setServers(normalizedRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load server list.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchServers();
  }, []);

  const handleServerAction = async (server: ServerRow, rowKey: string) => {
    setSelectedRowKey(rowKey);
    if (server.serverConfigId === null) {
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: "serverConfigId is missing for this row."
        }
      }));
      return;
    }

    setActionsByRow((current) => ({
      ...current,
      [rowKey]: {
        status: "sending",
        message: "Submitting request..."
      }
    }));

    try {
      const response = await fetch("http://localhost:8082/api/v1/hbs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serverConfigId: server.serverConfigId
        })
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "success",
          message: formatPayload(payload)
        }
      }));
    } catch (error) {
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to send request."
        }
      }));
    }
  };

  const handleHanaBackup = async () => {
    if (!selectedRowKey || !selectedServer) {
      setBackupMenuError("OOPS You have not selected any server yet");
      return;
    }

    if (selectedServer.serverConfigId === null) {
      setActionsByRow((current) => ({
        ...current,
        [selectedRowKey]: {
          status: "error",
          message: "serverId is missing for this row."
        }
      }));
      return;
    }

    setBackupMenuError("");
    setIsSapBasisMenuOpen(false);

    const rowKey = selectedRowKey;
    const server = selectedServer;

    setActionsByRow((current) => ({
      ...current,
      [rowKey]: {
        status: "sending",
        message: "Submitting HANA Backup request..."
      }
    }));

    const handleHanaBackup = (url: string) => {
      const es = new EventSource(url);

      const handleEvent = (event: MessageEvent) => {
        setLogsByRow((current) => ({
          ...current,
          [rowKey]: [...(current[rowKey] ?? []), event.data as string]
        }));
      };

      es.onmessage = handleEvent;              // default          // named
      es.addEventListener("error", handleEvent);  // named

      es.addEventListener("close", () => {
        console.log("Server asked to close");
        setLogsByRow((current) => ({
          ...current,
          [rowKey]: [...(current[rowKey] ?? []), "Log stream closed by server."]
        }));
        es.close();
      });
    };

    try {
      
      handleHanaBackup(`http://localhost:8082/api/v1/hbs/logs/stream/${server.serverConfigId}`);

      const response = await fetch(
        `http://localhost:8082/api/v1/hbs/${encodeURIComponent(String(server.serverConfigId))}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const payload = await getResponsePayload(response);

      if (!response.ok) {
        throw new Error(
          formatPayload(payload) || `Request failed with status ${response.status}`
        );
      }

      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "success",
          message: formatPayload(payload)
        }
      }));
    } catch (error) {
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to send request."
        }
      }));
    }
  };

  const handleAddServerFieldChange = (field: keyof AddServerFormState, value: string) => {
    setAddServerForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleAddServerSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddServerSubmitError("");

    const mappedPayload = {
      serverIP: addServerForm.serverIp,
      domainName: addServerForm.domainName,
      rootUserName: addServerForm.rootUsername,
      password: addServerForm.rootUserPassword,
      hanaUserName: addServerForm.hanaDbUsername,
      hanaPassword: addServerForm.hanaDbPassword,
      hanaPort: addServerForm.hanaPort,
      hanaBackupPath: addServerForm.hanaBackupPath,
      isDeleted: addServerForm.isDeleted
    };

    try {
      setIsAddServerSubmitting(true);
      const response = await fetch("http://localhost:8084/api/v1/servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(mappedPayload)
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setAddServerForm(initialAddServerForm);
      setIsAddServerOpen(false);
      await fetchServers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit Add Server form";
      setAddServerSubmitError(message);
    } finally {
      setIsAddServerSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b-[0.25px] border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex w-full items-center gap-4 py-4">
          <h1 className="text-left text-2xl font-semibold tracking-wide sm:text-3xl">
            <span className="text-[#e8471b]">Altzen</span> <span className="text-slate-900">Cockpit</span>
          </h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 w-full overflow-hidden">
        <div className="grid h-full grid-cols-[5%_95%] items-stretch">
          {/* Left Sidebar - 5% (Fixed Navigation) */}
          <div className="h-full border-r-[0.25px] border-slate-200 flex flex-col items-center pt-3 gap-4 bg-slate-50">
            <button
              onClick={() => setActivePage("dashboard")}
              className="p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
              title="Dashboard"
            >
              <img
                src="/icons/copilot.png"
                alt="icon"
                className="h-8 w-8 rounded object-cover"
              />
            </button>
            <div className="flex flex-col gap-2 w-full items-center">
              <button
                onClick={() => setActivePage("dashboard")}
                className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
                  activePage === "dashboard"
                    ? "bg-[#e8471b] text-white"
                    : "hover:bg-slate-200 text-slate-600"
                }`}
                title="Dashboard"
              >
                📊
              </button>
              <button
                onClick={() => setActivePage("settings")}
                className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
                  activePage === "settings"
                    ? "bg-[#e8471b] text-white"
                    : "hover:bg-slate-200 text-slate-600"
                }`}
                title="Settings"
              >
                ⚙️
              </button>
              <button
                onClick={() => setActivePage("about")}
                className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
                  activePage === "about"
                    ? "bg-[#e8471b] text-white"
                    : "hover:bg-slate-200 text-slate-600"
                }`}
                title="About"
              >
                ℹ️
              </button>
            </div>
          </div>

          {/* Right Content Area - 95% (Dynamic Content) */}
          <div className="h-full overflow-hidden">
            {/* Dashboard Page */}
            {activePage === "dashboard" && (
              <div className="h-full grid grid-cols-[20%_40%_40%] items-stretch">
                {/* Server nodes column */}
                <div className="h-full border-r-[0.25px] border-slate-200 flex flex-col">
                  {/* Search bar */}
                  <div className="border-b-[0.25px] border-slate-200 px-2 py-2">
                    <input
                      type="text"
                      placeholder="Search domains..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded border-[0.25px] border-slate-200 bg-white px-3 py-1 text-sm text-black placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                  {/* Content area */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {isLoading && <p className="text-sm text-slate-300 px-4 py-4">Loading servers...</p>}

                    {!isLoading && loadError && (
                      <p className="rounded-lg border-[0.25px] border-slate-200 bg-red-500/10 px-4 py-3 text-sm text-red-300 m-4">{loadError}</p>
                    )}

                    {!isLoading && !loadError && (
                      <div>
                        <table className="w-full table-fixed border-collapse text-left text-sm">
                          <colgroup>
                            <col className="w-[55%]" />
                            <col className="w-[45%]" />
                          </colgroup>
                          <thead>
                            <tr className="border-b-[0.25px] border-slate-200 bg-[#f1f5f9] text-slate-700">
                              <th className="px-2 py-2 font-medium">Domain</th>
                              <th className="px-2 py-2 font-medium">
                                <div className="flex items-center justify-between gap-2">
                                  <span>Status</span>
                                  <button
                                    type="button"
                                    className="text-3xl font-bold leading-none text-slate-900"
                                    title="Add Server"
                                    onClick={() => setIsAddServerOpen(true)}
                                  >
                                    +
                                  </button>
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {servers.length === 0 && (
                              <tr>
                                <td colSpan={2} className="px-2 py-4 text-sm text-slate-500">
                                  No servers were returned by the API.
                                </td>
                              </tr>
                            )}

                            {servers.length > 0 && filteredServers.length === 0 && (
                              <tr>
                                <td colSpan={2} className="px-2 py-4 text-sm text-slate-500">
                                  No matching domains found.
                                </td>
                              </tr>
                            )}

                            {filteredServers.length > 0 && filteredServers.map((server, index) => {
                                const rowKey = String(server.serverConfigId ?? `${server.domainName}-${index}`);
                                const action =
                                  actionsByRow[rowKey] ??
                                  ({
                                    status: "idle",
                                    message: ""
                                  } satisfies ServerActionState);
                                const isSending = action.status === "sending";
                                const agentCompleted = (logsByRow[rowKey] ?? []).some((log) =>
                                  log.includes("Agent completed")
                                );
                                const isGreen = isSending || ((logsByRow[rowKey]?.length ?? 0) > 0 && !agentCompleted);

                                return (
                                  <tr
                                    key={rowKey}
                                    onClick={() => {
                                      setSelectedRowKey(rowKey);
                                      setSelectedServer(server);
                                      setBackupMenuError("");
                                    }}
                                    onDoubleClick={() => handleServerAction(server, rowKey)}
                                    className={`cursor-pointer border-b-[0.25px] border-slate-200 ${
                                      isGreen
                                        ? "bg-green-500/10 text-black"
                                        : selectedRowKey === rowKey
                                          ? "bg-slate-200 text-black"
                                          : "bg-transparent hover:bg-slate-800/60 text-black"
                                    }`}
                                    title="Double-click anywhere on the row to submit"
                                  >
                                    <td className="break-words px-2 py-2 align-top text-black">
                                      {server.domainName}
                                    </td>
                                    <td className="break-words px-2 py-2 align-top text-black">
                                      {action.status === "sending"
                                        ? "Submitting..."
                                        : action.status === "error"
                                          ? action.message
                                          : action.status === "success"
                                            ? "Success"
                                            : "Ready"}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Response panel column */}
                <div className="flex h-full flex-col border-r-[0.25px] border-slate-200">
                  {/* Menu bar */}
                  <div className="flex gap-1 border-b-[0.25px] border-slate-200 bg-slate-100 px-1">
                    <div
                      className="relative"
                      onMouseEnter={() => setIsSapBasisMenuOpen(true)}
                      onMouseLeave={() => setIsSapBasisMenuOpen(false)}
                    >
                      <button className="whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 focus:outline-none">
                        SAP Basis
                      </button>
                      {isSapBasisMenuOpen && (
                        <div className="absolute left-0 top-full z-20 min-w-[140px] border-[0.25px] border-slate-300 bg-slate-100 shadow-md">
                        <button
                          onClick={handleHanaBackup}
                          className="block w-full px-3 py-2 text-left text-xs text-black hover:bg-slate-200"
                        >
                          HANA Backup
                        </button>
                        <button
                          className="block w-full border-t-[0.25px] border-slate-300 px-3 py-2 text-left text-xs text-black hover:bg-slate-200"
                        >
                          Install
                        </button>
                        </div>
                      )}
                    </div>
                    <div className="group relative">
                      <button className="whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 focus:outline-none">
                        Actions
                      </button>
                    </div>
                  </div>
                  {/* Grid content area */}
                  <div className="grid flex-1 min-h-0 grid-rows-[70%_30%]">
                    <div className="min-h-0 overflow-y-auto px-4 py-4">
                      {backupMenuError && (
                        <div className="mb-3 rounded border-[0.25px] border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {backupMenuError}
                        </div>
                      )}
                      {selectedRowKey && actionsByRow[selectedRowKey]?.message && (
                        <pre
                          className={`whitespace-pre-wrap break-words rounded border-[0.25px] px-3 py-3 text-xs ${
                            actionsByRow[selectedRowKey]?.status === "error"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : actionsByRow[selectedRowKey]?.status === "success"
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          {actionsByRow[selectedRowKey]?.message}
                        </pre>
                      )}
                    </div>
                    <div className="border-t-[0.25px] border-slate-200 px-4 py-4">
                      <h2 className="text-sm font-semibold text-black">System Properties</h2>
                    </div>
                  </div>
                </div>

                {/* Log stream column */}
                <div className="h-full overflow-y-auto border-l-[0.25px] border-slate-200 p-2 font-mono text-xs text-slate-700">
                  {selectedLogs.length === 0 ? (
                    <span className="text-slate-400">No logs yet.</span>
                  ) : (
                    selectedLogs.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-words border-b-[0.25px] border-slate-100 py-0.5">{line}</div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Settings Page */}
            {activePage === "settings" && (
              <div className="h-full overflow-y-auto px-8 py-8">
                <div className="max-w-2xl">
                  <h2 className="text-3xl font-bold text-slate-900 mb-6">Settings</h2>
                  <div className="space-y-6">
                    <div className="border-[0.25px] border-slate-200 rounded-lg p-6 bg-slate-50">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">Server Configuration</h3>
                      <p className="text-sm text-slate-600 mb-4">Configure API endpoints and connection settings</p>
                      <button className="px-4 py-2 bg-[#e8471b] text-white rounded hover:bg-[#c73a14] transition-colors">
                        Configure Servers
                      </button>
                    </div>
                    <div className="border-[0.25px] border-slate-200 rounded-lg p-6 bg-slate-50">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">Display Preferences</h3>
                      <p className="text-sm text-slate-600 mb-4">Customize the appearance and layout</p>
                      <button className="px-4 py-2 bg-[#e8471b] text-white rounded hover:bg-[#c73a14] transition-colors">
                        Customize Theme
                      </button>
                    </div>
                    <div className="border-[0.25px] border-slate-200 rounded-lg p-6 bg-slate-50">
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">Advanced Settings</h3>
                      <p className="text-sm text-slate-600 mb-4">Advanced options for power users</p>
                      <button className="px-4 py-2 bg-[#e8471b] text-white rounded hover:bg-[#c73a14] transition-colors">
                        Advanced Options
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* About Page */}
            {activePage === "about" && (
              <div className="h-full overflow-y-auto px-8 py-8">
                <div className="max-w-2xl">
                  <h2 className="text-3xl font-bold text-slate-900 mb-6">About Altzen Cockpit</h2>
                  <div className="space-y-4 text-slate-700">
                    <p className="text-base">
                      Altzen Cockpit is a comprehensive server management and monitoring platform designed to streamline your infrastructure operations.
                    </p>
                    <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Features</h3>
                    <ul className="list-disc list-inside space-y-2 text-sm">
                      <li>Real-time server monitoring and status tracking</li>
                      <li>Centralized server configuration management</li>
                      <li>Quick access to SAP Basis operations</li>
                      <li>Intuitive dashboard for system overview</li>
                      <li>Advanced filtering and search capabilities</li>
                    </ul>
                    <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Version</h3>
                    <p className="text-sm">Version 1.0.0</p>
                    <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-2">Support</h3>
                    <p className="text-sm">For support and inquiries, please contact the Altzen team.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {isAddServerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Add Server</h2>
              <button
                type="button"
                onClick={() => setIsAddServerOpen(false)}
                className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleAddServerSubmit} className="px-6 py-5">
              <input type="hidden" name="isDeleted" value={String(addServerForm.isDeleted)} />
              {addServerSubmitError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {addServerSubmitError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Server IP</span>
                  <input
                    type="text"
                    value={addServerForm.serverIp}
                    onChange={(event) => handleAddServerFieldChange("serverIp", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Domain name</span>
                  <input
                    type="text"
                    value={addServerForm.domainName}
                    onChange={(event) => handleAddServerFieldChange("domainName", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Root Username</span>
                  <input
                    type="text"
                    value={addServerForm.rootUsername}
                    onChange={(event) => handleAddServerFieldChange("rootUsername", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Root User Password</span>
                  <input
                    type="password"
                    value={addServerForm.rootUserPassword}
                    onChange={(event) => handleAddServerFieldChange("rootUserPassword", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA DB Username</span>
                  <input
                    type="text"
                    value={addServerForm.hanaDbUsername}
                    onChange={(event) => handleAddServerFieldChange("hanaDbUsername", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA DB Password</span>
                  <input
                    type="password"
                    value={addServerForm.hanaDbPassword}
                    onChange={(event) => handleAddServerFieldChange("hanaDbPassword", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA Port</span>
                  <input
                    type="text"
                    value={addServerForm.hanaPort}
                    onChange={(event) => handleAddServerFieldChange("hanaPort", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
                  <span>HANA Backup Path</span>
                  <input
                    type="text"
                    value={addServerForm.hanaBackupPath}
                    onChange={(event) => handleAddServerFieldChange("hanaBackupPath", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddServerOpen(false)}
                  disabled={isAddServerSubmitting}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddServerSubmitting}
                  className="rounded-md bg-[#e8471b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c73a14] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAddServerSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
