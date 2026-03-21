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
  const [searchQuery, setSearchQuery] = useState("");

  const filteredServers = servers.filter((server) =>
    server.domainName.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b-[0.25px] border-slate-200 bg-white/95 backdrop-blur">

        <div className="flex w-full items-center gap-4 py-4">
          <h1 className="text-left text-2xl font-semibold tracking-wide sm:text-3xl">
            <span className="text-[#e8471b]">Altzen</span> <span className="text-slate-900">Cockpit</span>
          </h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 w-full overflow-hidden">
        <div className="grid h-full grid-cols-[5%_20%_40%_35%] items-stretch">
          {/* First column */}
          <div className="h-full border-r-[0.25px] border-slate-200 flex flex-col items-center pt-3">
            <img
              src="/icons/copilot.png"
              alt="icon"
              className="h-8 w-8 rounded object-cover"
            />
          </div>
          {/* Second column — server nodes */}
          <div className="h-full border-r-[0.25px] border-slate-200 flex flex-col">
            {/* Search bar */}
            {!isLoading && !loadError && servers.length > 0 && (
              <div className="border-b-[0.25px] border-slate-200 px-2 py-2">
                <input
                  type="text"
                  placeholder="Search domains..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded border-[0.25px] border-slate-200 bg-white px-3 py-1 text-sm text-black placeholder-slate-500 focus:outline-none"
                />
              </div>
            )}
            {/* Content area */}
            <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="text-sm text-slate-300 px-4 py-4">Loading servers...</p>}

        {!isLoading && loadError && (
          <p className="rounded-lg border-[0.25px] border-slate-200 bg-red-500/10 px-4 py-3 text-sm text-red-300 m-4">{loadError}</p>
        )}

        {!isLoading && !loadError && servers.length === 0 && (
          <p className="text-sm text-slate-300 px-4 py-4">No servers were returned by the API.</p>
        )}

        {!isLoading && !loadError && servers.length > 0 && (
          <div>
            {filteredServers.length === 0 ? (
              <p className="text-sm text-slate-500 px-4 py-4">No matching domains found.</p>
            ) : (
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[55%]" />
                <col className="w-[45%]" />
              </colgroup>
              <thead>
                <tr className="border-b-[0.25px] border-slate-200 bg-slate-900/70 text-slate-300">
                  <th className="px-2 py-2 font-medium">Domain</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredServers.map((server, index) => {
                const rowKey = String(server.serverConfigId ?? `${server.domainName}-${index}`);
                const action =
                  actionsByRow[rowKey] ??
                  ({
                    status: "idle",
                    message: ""
                  } satisfies ServerActionState);
                const isSending = action.status === "sending";

                return (
                  <tr
                    key={rowKey}
                    onDoubleClick={() => handleServerAction(server, rowKey)}
                    className={`cursor-pointer border-b-[0.25px] border-slate-200 ${
                      isSending ? "bg-green-500/10 text-black" : "bg-transparent hover:bg-slate-800/60 text-black"
                    }`}
                    title="Double-click anywhere on the row to submit"
                  >
                    <td className="break-words px-2 py-2 align-top text-black">
                      {server.domainName}
                    </td>
                    <td
                      className="break-words px-2 py-2 align-top text-black"
                    >
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
            )}
            </div>
        )}
            </div>
          </div>
          {/* Third column — response panel */}
          <div className="flex h-full flex-col border-r-[0.25px] border-slate-200">
            {/* Menu bar */}
            <div className="flex border-b-[0.25px] border-slate-200">
              <button className="w-fit whitespace-nowrap px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 focus:outline-none">SAP Basis</button>
              <button className="w-fit whitespace-nowrap border-l-[0.25px] border-slate-200 px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 focus:outline-none">Actions</button>
            </div>
            {/* Grid content area */}
            <div className="grid flex-1 min-h-0 grid-rows-[70%_30%]">
              <div className="min-h-0 overflow-y-auto px-4 py-4">
                {selectedRowKey && (() => {
                  const sel = actionsByRow[selectedRowKey] ?? { status: "idle", message: "" };
                  const selServer = servers.find((s, i) => String(s.serverConfigId ?? `${s.domainName}-${i}`) === selectedRowKey);
                  return (
                    <div className="rounded-xl border-[0.25px] border-slate-200 bg-slate-900/60 p-4">
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
              <div className="border-t-[0.25px] border-slate-200 px-4 py-4">
                <h2 className="text-sm font-semibold text-black">System Properties</h2>
              </div>
            </div>
          </div>
          {/* Fourth column */}
          <div />
        </div>
      </main>
    </div>
  );
}
