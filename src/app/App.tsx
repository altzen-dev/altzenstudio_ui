import { useEffect, useState } from "react";

type ServerRow = {
  serverConfigId: string | number | null;
  domainName: string;
  ipAddress: string;
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

export default function App() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionsByRow, setActionsByRow] = useState<Record<string, ServerActionState>>({});
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchServers = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await fetch("http://localhost:8082/api/v1/hbs/servers");
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="flex w-full items-center gap-4 py-4">
          <img
            src="https://cdn.prod.website-files.com/64b4def37ae684b348f630c4/64bf7db761bc3b0f8b6da64d_SAPVista.com_MainLogo_Orange.webp"
            alt="SAPVISTA logo"
            className="h-auto w-[clamp(140px,22vw,320px)] max-w-full rounded-none border border-slate-700 bg-slate-900 p-1 object-contain"
          />
          <h1 className="text-left text-2xl font-semibold tracking-wide sm:text-3xl">Cockpit</h1>
        </div>
      </header>

      <main className="w-full py-6">
        <div className="grid grid-cols-[20%_40%_40%] gap-4">
          {/* Left column — server nodes */}
          <div>
        {isLoading && <p className="text-sm text-slate-300">Loading servers...</p>}

        {!isLoading && loadError && (
          <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">{loadError}</p>
        )}

        {!isLoading && !loadError && servers.length === 0 && (
          <p className="text-sm text-slate-300">No servers were returned by the API.</p>
        )}

        {!isLoading && !loadError && servers.length > 0 && (
          <div className="grid gap-4">
            {servers.map((server, index) => {
              const rowKey = String(server.serverConfigId ?? `${server.domainName}-${index}`);
              const action =
                actionsByRow[rowKey] ??
                ({
                  status: "idle",
                  message: ""
                } satisfies ServerActionState);
              const isSending = action.status === "sending";

              return (
                <article
                  key={rowKey}
                  className={`rounded-xl border p-2 transition-colors ${
                    isSending ? "border-green-500 bg-green-500/10 text-green-100" : "border-slate-800 bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onDoubleClick={() => handleServerAction(server, rowKey)}
                      disabled={action.status === "sending"}
                      title="Double-click to send request"
                      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSending
                          ? "border-green-400 bg-green-500/20 text-green-100"
                          : "border-slate-700 bg-slate-800 hover:border-slate-500"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-5 w-5 ${isSending ? "text-green-100" : "text-slate-200"}`}
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 11h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Zm3 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm0-11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
                        />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-base font-medium ${isSending ? "text-green-100" : "text-slate-100"}`}>
                        {server.domainName}
                      </p>
                      <p className={`truncate text-sm ${
                        action.status === "sending" ? "text-green-200" :
                        action.status === "error" ? "text-red-300" :
                        action.status === "success" ? "text-green-300" :
                        "text-slate-400"
                      }`}>
                        {action.status === "sending" ? "Submitting..." :
                         action.status === "error" ? action.message :
                         action.status === "success" ? "Success" :
                         "Ready"}
                      </p>
                    </div>
                  </div>


                </article>
              );
            })}
          </div>
        )}
          </div>
          {/* Middle column — response panel */}
          <div className="px-4">
            {selectedRowKey && (() => {
              const sel = actionsByRow[selectedRowKey] ?? { status: "idle", message: "" };
              const selServer = servers.find((s, i) => String(s.serverConfigId ?? `${s.domainName}-${i}`) === selectedRowKey);
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  {selServer && (
                    <p className="mb-3 text-sm font-medium text-slate-300">{selServer.domainName}</p>
                  )}
                  {sel.status === "success" && (
                    <pre className="break-words whitespace-pre-wrap rounded-md bg-slate-950 px-3 py-2 text-xs text-green-300">{sel.message}</pre>
                  )}
                  {sel.status === "error" && (
                    <pre className="break-words whitespace-pre-wrap rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{sel.message}</pre>
                  )}
                </div>
              );
            })()}
          </div>
          {/* Right column */}
          <div />
        </div>
      </main>
    </div>
  );
}
