import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { API_BASE_URL } from "./config";

declare global {
  interface Window {
    getAccessToken?: () => Promise<string | null>;
    getUserName?: () => string | null;
    logout?: () => Promise<void>;
  }
}

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

type PersistedUiState = {
  logsByRow: Record<string, string[]>;
  actionsByRow: Record<string, ServerActionState>;
  selectedRowKey: string | null;
  selectedServer: ServerRow | null;
  searchQuery: string;
  activePage: "dashboard" | "settings" | "about";
};

const UI_STATE_STORAGE_KEY = "altzen-cockpit-ui-state-v1";

type SkillOption = {
  id: string | number;
  skillName: string;
};

type PeopleRow = {
  personId: string | number | null;
  apolloId: string | number | null;
  firstName: string;
  lastName: string;
  title: string;
  titleId: number | null;
  skillName: string;
  country: string;
  mobile: string;
  email: string;
  personMsgStatusId: string | number | null;
  linkedin: string;
  organization: string;
  isWhatsApp: boolean;
  isLinkedin: boolean;
  linkedinMsgCount: number | null;
  whatsappMsgCount: number | null;
};

type PushMessageOption = {
  pushMsgId: string | number;
  pushMsgName: string;
};

type MsgStatusOption = {
  value: string;
  label: string;
};

function handleSSELogging(
  url: string,
  rowKey: string,
  setLogsByRow: Dispatch<SetStateAction<Record<string, string[]>>>
): AbortController {
  const controller = new AbortController();

  const appendLog = (message: string) => {
    setLogsByRow((current) => ({
      ...current,
      [rowKey]: [...(current[rowKey] ?? []), message]
    }));
  };

  void (async () => {
    const token = (await window.getAccessToken?.()) ?? null;

    await fetchEventSource(url, {
      method: "GET",
      signal: controller.signal,
      openWhenHidden: true,
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined,
      onmessage: (event) => {
        if (event.event === "close") {
          appendLog("Log stream closed by server.");
          controller.abort();
          return;
        }

        if (typeof event.data === "string" && event.data.length > 0) {
          appendLog(event.data);
          return;
        }

        appendLog("Received a non-text log event.");
      },
      onerror: (error) => {
        throw error;
      }
    });
  })().catch((error) => {
    if (controller.signal.aborted) {
      return;
    }

    console.error("SSE connection failed.", error);
    appendLog("Log stream disconnected.");
  });

  return controller;
}

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

function normalizeServerDetailForm(payload: unknown): AddServerFormState {
  const parsed = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data =
    parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : parsed;

  const getValue = (...candidates: unknown[]) => {
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        return candidate;
      }
      if (typeof candidate === "number") {
        return String(candidate);
      }
    }
    return "";
  };

  const isDeletedCandidate =
    data.isDeleted ?? data.is_deleted ?? data.deleted ?? data.softDeleted ?? data.soft_deleted;

  return {
    serverIp: getValue(data.serverIP, data.serverIp, data.ipAddress, data.ip, data.address),
    domainName: getValue(data.domainName, data.domain, data.host, data.hostname),
    rootUsername: getValue(data.rootUserName, data.rootUsername, data.rootUser),
    rootUserPassword: getValue(data.password, data.rootUserPassword, data.rootPassword),
    hanaDbUsername: getValue(data.hanaUserName, data.hanaDbUsername, data.hanaUsername),
    hanaDbPassword: getValue(data.hanaPassword, data.hanaDbPassword),
    hanaPort: getValue(data.hanaPort, data.port),
    hanaBackupPath: getValue(data.hanaBackupPath, data.backupPath),
    isDeleted: typeof isDeletedCandidate === "boolean" ? isDeletedCandidate : false
  };
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

function normalizePeoplePageInitData(payload: unknown): {
  skills: SkillOption[];
} {
  const parsed = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data =
    parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : parsed;

  const skillsSource =
    Array.isArray(data.skills)
      ? data.skills
      : Array.isArray(data.skillset)
        ? data.skillset
        : Array.isArray(data.skillSet)
          ? data.skillSet
          : [];

  const skills = skillsSource.reduce<SkillOption[]>((accumulator, entry) => {
    if (!entry || typeof entry !== "object") {
      return accumulator;
    }

    const row = entry as Record<string, unknown>;
    const idCandidate = row.id ?? row.skillId ?? row.skillID ?? row.skill_id ?? null;
    if (typeof idCandidate !== "string" && typeof idCandidate !== "number") {
      return accumulator;
    }

    accumulator.push({
      id: idCandidate,
      skillName: getText(row.skillname ?? row.skillName ?? row.name, "Unknown Skill")
    });

    return accumulator;
  }, []);

  return { skills };
}

function normalizePeopleList(payload: unknown): PeopleRow[] {
  let source: unknown[] = [];

  if (Array.isArray(payload)) {
    source = payload;
  } else if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.data)) source = p.data;
    else if (Array.isArray(p.people)) source = p.people;
    else if (Array.isArray(p.items)) source = p.items;
  }

  return source.reduce<PeopleRow[]>((acc, entry) => {
    if (!entry || typeof entry !== "object") return acc;
    const row = entry as Record<string, unknown>;
    const organizationObject =
      row.organization && typeof row.organization === "object"
        ? (row.organization as Record<string, unknown>)
        : null;
    const personIdCandidate = row.personId ?? row.person_id ?? row.id ?? row.apolloId ?? row.apollo_id ?? null;
    const idCandidate = row.apolloId ?? row.apollo_id ?? row.id ?? null;
    const titleIdCandidate = row.titleId ?? row.title_id ?? row.titleID ?? null;
    const personMsgStatusIdCandidate =
      row.personMsgStatusId ?? row.person_msg_status_id ?? row.msgStatusId ?? row.msg_status_id ?? null;
    acc.push({
      personId:
        typeof personIdCandidate === "string" || typeof personIdCandidate === "number"
          ? personIdCandidate
          : null,
      apolloId: typeof idCandidate === "string" || typeof idCandidate === "number" ? idCandidate : null,
      firstName: getText(row.firstName ?? row.first_name ?? row.firstname, ""),
      lastName: getText(row.lastName ?? row.last_name ?? row.lastname, ""),
      title: getText(row.title ?? row.jobTitle ?? row.job_title, ""),
      titleId: typeof titleIdCandidate === "number" ? titleIdCandidate : (typeof titleIdCandidate === "string" && !isNaN(Number(titleIdCandidate)) ? Number(titleIdCandidate) : null),
      skillName: getText(row.skillName ?? row.skill_name, ""),
      country: getText(row.country ?? row.countryName ?? row.country_name ?? "", ""),
      mobile: getText(row.mobile ?? row.phone ?? row.mobilePhone, ""),
      email: getText(row.email ?? row.emailAddress ?? row.email_id, ""),
      personMsgStatusId:
        typeof personMsgStatusIdCandidate === "string" || typeof personMsgStatusIdCandidate === "number"
          ? personMsgStatusIdCandidate
          : null,
      linkedin: getText(row.linkedin ?? row.linkedinUrl ?? row.linkedin_url, ""),
      isWhatsApp:
        typeof row.isWhatsApp === "boolean"
          ? row.isWhatsApp
          : typeof row.isWhatsapp === "boolean"
            ? row.isWhatsapp
            : false,
      isLinkedin:
        typeof row.isLinkedin === "boolean"
          ? row.isLinkedin
          : typeof row.isLinkedIn === "boolean"
            ? row.isLinkedIn
            : false,
      linkedinMsgCount:
        typeof row.linkedinMsgCount === "number"
          ? row.linkedinMsgCount
          : typeof row.linkedinMsgCount === "string" && !isNaN(Number(row.linkedinMsgCount))
            ? Number(row.linkedinMsgCount)
            : null,
      whatsappMsgCount:
        typeof row.whatsappMsgCount === "number"
          ? row.whatsappMsgCount
          : typeof row.whatsappMsgCount === "string" && !isNaN(Number(row.whatsappMsgCount))
            ? Number(row.whatsappMsgCount)
            : null,
      organization: getText(
        organizationObject?.name ?? row.organizationName ?? row.company ?? row.organization,
        ""
      )
    });
    return acc;
  }, []);
}

function normalizePeopleSearchResponse(payload: unknown): {
  persons: PeopleRow[];
  msgStatuses: MsgStatusOption[];
  totalPages: number;
  currentPage: number;
  pageSize: number;
} {
  const parsed = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data =
    parsed.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : parsed;

  const persons = Array.isArray(data.persons)
    ? normalizePeopleList(data.persons)
    : Array.isArray(parsed.persons)
      ? normalizePeopleList(parsed.persons)
      : normalizePeopleList(payload);

  const msgStatusesSource = data.msgStatuses ?? parsed.msgStatuses;
  const msgStatuses = Array.isArray(msgStatusesSource)
    ? msgStatusesSource.reduce<MsgStatusOption[]>((accumulator, entry) => {
        if (typeof entry === "string" || typeof entry === "number") {
          const text = String(entry).trim();
          const numericId = Number(text);
          if (text.length > 0 && Number.isFinite(numericId)) {
            accumulator.push({ value: String(Math.trunc(numericId)), label: text });
          }
          return accumulator;
        }

        if (!entry || typeof entry !== "object") {
          return accumulator;
        }

        const row = entry as Record<string, unknown>;
        const statusIdCandidate =
          row.personMsgStatusId ??
          row.person_msg_status_id ??
          row.msgStatusId ??
          row.msg_status_id ??
          row.id ??
          row.code ??
          row.value ??
          row.status;
        const valueText = getText(statusIdCandidate, "");
        const labelText = getText(
          row.label ?? row.statusName ?? row.msgStatusName ?? row.personMsgStatusName ?? row.name ?? row.value ?? row.status,
          ""
        );
        const numericId = Number(valueText);

        if (valueText.length === 0 || labelText.length === 0 || !Number.isFinite(numericId)) {
          return accumulator;
        }

        accumulator.push({
          value: String(Math.trunc(numericId)),
          label: labelText
        });

        return accumulator;
      }, [])
    : [];

  const totalPagesCandidate = data.totalPages ?? parsed.totalPages;
  const currentPageCandidate = data.currentPage ?? parsed.currentPage;
  const pageSizeCandidate = data.pageSize ?? parsed.pageSize;

  const totalPagesNumber =
    typeof totalPagesCandidate === "number"
      ? totalPagesCandidate
      : typeof totalPagesCandidate === "string"
        ? Number(totalPagesCandidate)
        : NaN;
  const currentPageNumber =
    typeof currentPageCandidate === "number"
      ? currentPageCandidate
      : typeof currentPageCandidate === "string"
        ? Number(currentPageCandidate)
        : NaN;
  const pageSizeNumber =
    typeof pageSizeCandidate === "number"
      ? pageSizeCandidate
      : typeof pageSizeCandidate === "string"
        ? Number(pageSizeCandidate)
        : NaN;

  return {
    persons,
    msgStatuses,
    totalPages: Number.isFinite(totalPagesNumber) && totalPagesNumber > 0 ? Math.trunc(totalPagesNumber) : 1,
    currentPage:
      Number.isFinite(currentPageNumber) && currentPageNumber > 0 ? Math.trunc(currentPageNumber) : 1,
    pageSize: Number.isFinite(pageSizeNumber) && pageSizeNumber > 0 ? Math.trunc(pageSizeNumber) : 25
  };
}

function normalizePushMessageOptions(payload: unknown): PushMessageOption[] {
  let source: unknown[] = [];

  if (Array.isArray(payload)) {
    source = payload;
  } else if (payload && typeof payload === "object") {
    const parsed = payload as Record<string, unknown>;
    if (Array.isArray(parsed.data)) {
      source = parsed.data;
    } else if (Array.isArray(parsed.items)) {
      source = parsed.items;
    } else if (Array.isArray(parsed.pushMessages)) {
      source = parsed.pushMessages;
    }
  }

  return source.reduce<PushMessageOption[]>((accumulator, entry) => {
    if (!entry || typeof entry !== "object") {
      return accumulator;
    }

    const row = entry as Record<string, unknown>;
    const idCandidate = row.pushMsgId ?? row.pushmsgid ?? row.id ?? null;
    if (typeof idCandidate !== "string" && typeof idCandidate !== "number") {
      return accumulator;
    }

    accumulator.push({
      pushMsgId: idCandidate,
      pushMsgName: getText(row.pushMsgName ?? row.pushmsgname ?? row.name, "Unnamed Message")
    });

    return accumulator;
  }, []);
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
  const [userName, setUserName] = useState("User");
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
  const [showSettingsPeoplePage, setShowSettingsPeoplePage] = useState(false);
  const [selectedSkillset, setSelectedSkillset] = useState("");
  const [peopleSkills, setPeopleSkills] = useState<SkillOption[]>([]);
  const [isPeopleInitLoading, setIsPeopleInitLoading] = useState(false);
  const [peopleInitError, setPeopleInitError] = useState("");
  const [isPeopleFetchSubmitting, setIsPeopleFetchSubmitting] = useState(false);
  const [peopleFetchStatus, setPeopleFetchStatus] = useState("");
  const [peopleFetchStatusType, setPeopleFetchStatusType] = useState<ActionStatus>("idle");
  const [isSapBasisMenuOpen, setIsSapBasisMenuOpen] = useState(false);
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [addServerForm, setAddServerForm] = useState<AddServerFormState>(initialAddServerForm);
  const [isAddServerSubmitting, setIsAddServerSubmitting] = useState(false);
  const [addServerSubmitError, setAddServerSubmitError] = useState("");
  const [isEditServerOpen, setIsEditServerOpen] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | number | null>(null);
  const [editServerForm, setEditServerForm] = useState<AddServerFormState>(initialAddServerForm);
  const [isEditServerLoading, setIsEditServerLoading] = useState(false);
  const [isEditServerSubmitting, setIsEditServerSubmitting] = useState(false);
  const [editServerError, setEditServerError] = useState("");
  const [editServerSubmitError, setEditServerSubmitError] = useState("");
  const [peopleList, setPeopleList] = useState<PeopleRow[]>([]);
  const [isPeopleListLoading, setIsPeopleListLoading] = useState(false);
  const [peopleListError, setPeopleListError] = useState("");
  const [hasLoadedPeopleList, setHasLoadedPeopleList] = useState(false);
  const [currentPeoplePage, setCurrentPeoplePage] = useState(1);
  const [totalPeoplePages, setTotalPeoplePages] = useState(1);
  const [peopleRowsPerPage, setPeopleRowsPerPage] = useState(25);
  const [peopleMsgStatuses, setPeopleMsgStatuses] = useState<MsgStatusOption[]>([]);
  const [selectedStatusByPersonId, setSelectedStatusByPersonId] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [isMobilePresentFilter, setIsMobilePresentFilter] = useState("select");
  const [whatsappMsgCountFilter, setWhatsappMsgCountFilter] = useState("");
  const [linkedinMsgCountFilter, setLinkedinMsgCountFilter] = useState("");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<number | null>(null);
  const [appliedCountryFilter, setAppliedCountryFilter] = useState("");
  const [appliedIsMobilePresentFilter, setAppliedIsMobilePresentFilter] = useState<string | null>(null);
  const [appliedWhatsappMsgCountFilter, setAppliedWhatsappMsgCountFilter] = useState<number | null>(null);
  const [appliedLinkedinMsgCountFilter, setAppliedLinkedinMsgCountFilter] = useState<number | null>(null);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<Set<number>>(new Set());
  const [isPeopleEnrichSubmitting, setIsPeopleEnrichSubmitting] = useState(false);
  const [peopleEnrichStatus, setPeopleEnrichStatus] = useState("");
  const [peopleEnrichStatusType, setPeopleEnrichStatusType] = useState<ActionStatus>("idle");
  const [isMessagingModalOpen, setIsMessagingModalOpen] = useState(false);
  const [isMessagingWhatsappChecked, setIsMessagingWhatsappChecked] = useState(true);
  const [isMessagingLinkedinChecked, setIsMessagingLinkedinChecked] = useState(true);
  const [selectedMessageTitle, setSelectedMessageTitle] = useState("");
  const [messagingWarning, setMessagingWarning] = useState("");
  const [pushMessageOptions, setPushMessageOptions] = useState<PushMessageOption[]>([]);
  const [isPushMessagesLoading, setIsPushMessagesLoading] = useState(false);
  const [pushMessagesError, setPushMessagesError] = useState("");
  const sseByRowRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(UI_STATE_STORAGE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as Partial<PersistedUiState>;
      if (parsed.logsByRow) {
        setLogsByRow(parsed.logsByRow);
      }
      if (parsed.actionsByRow) {
        setActionsByRow(parsed.actionsByRow);
      }
      if (typeof parsed.selectedRowKey === "string" || parsed.selectedRowKey === null) {
        setSelectedRowKey(parsed.selectedRowKey);
      }
      if (parsed.selectedServer && typeof parsed.selectedServer === "object") {
        setSelectedServer(parsed.selectedServer as ServerRow);
      }
      if (typeof parsed.searchQuery === "string") {
        setSearchQuery(parsed.searchQuery);
      }
      if (parsed.activePage === "dashboard" || parsed.activePage === "settings" || parsed.activePage === "about") {
        setActivePage(parsed.activePage);
      }
    } catch {
      // Ignore malformed persisted state.
    }
  }, []);

  useEffect(() => {
    const payload: PersistedUiState = {
      logsByRow,
      actionsByRow,
      selectedRowKey,
      selectedServer,
      searchQuery,
      activePage
    };

    sessionStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [logsByRow, actionsByRow, selectedRowKey, selectedServer, searchQuery, activePage]);

  useEffect(() => {
    return () => {
      Object.values(sseByRowRef.current).forEach((controller) => {
        controller.abort();
      });
      sseByRowRef.current = {};
    };
  }, []);

  useEffect(() => {
    const resolvedName = window.getUserName?.();
    if (resolvedName && resolvedName.trim().length > 0) {
      setUserName(resolvedName.trim());
    }
  }, []);

  const handleLogoutClick = () => {
    void window.logout?.();
  };

  const startSSELogging = (url: string, rowKey: string) => {
    const existing = sseByRowRef.current[rowKey];
    if (existing) {
      existing.abort();
    }

    sseByRowRef.current[rowKey] = handleSSELogging(url, rowKey, setLogsByRow);
  };

  const stopSSELogging = (rowKey: string) => {
    const existing = sseByRowRef.current[rowKey];
    if (existing) {
      existing.abort();
      delete sseByRowRef.current[rowKey];
    }
  };


  const filteredServers = servers.filter((server) =>
    server.domainName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const safeCurrentPeoplePage = Math.min(currentPeoplePage, totalPeoplePages);
  const selectedLogs = selectedRowKey ? logsByRow[selectedRowKey] ?? [] : [];
  const currentPageSelectablePeopleIds = peopleList.reduce<number[]>((accumulator, person) => {
    const numericPersonId =
      typeof person.personId === "number"
        ? person.personId
        : typeof person.personId === "string"
          ? Number(person.personId)
          : NaN;
    const normalizedPersonId = Number.isFinite(numericPersonId) ? Math.trunc(numericPersonId) : null;

    if (normalizedPersonId !== null) {
      accumulator.push(normalizedPersonId);
    }

    return accumulator;
  }, []);
  const isCurrentPageFullySelected =
    currentPageSelectablePeopleIds.length > 0 &&
    currentPageSelectablePeopleIds.every((personId) => selectedPeopleIds.has(personId));

  useEffect(() => {
    if (currentPeoplePage > totalPeoplePages) {
      setCurrentPeoplePage(totalPeoplePages);
    }
  }, [currentPeoplePage, totalPeoplePages]);

  const fetchServers = async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/servers/summaries`, {
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
      const response = await fetch(`${API_BASE_URL}/api/v1/hbs`, {
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

  const handleDeleteServer = async (server: ServerRow, rowKey: string) => {
    setSelectedRowKey(rowKey);

    if (server.serverConfigId === null) {
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: "serverId is missing for this row."
        }
      }));
      return;
    }

    setActionsByRow((current) => ({
      ...current,
      [rowKey]: {
        status: "sending",
        message: "Deleting server..."
      }
    }));

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/servers/${encodeURIComponent(String(server.serverConfigId))}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json"
          }
        }
      );

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

      await fetchServers();
    } catch (error) {
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to delete server."
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

    

    try {
      
      startSSELogging(`${API_BASE_URL}/api/v1/hbs/logs/stream/${server.serverConfigId}`, rowKey);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/hbs/${encodeURIComponent(String(server.serverConfigId))}`,

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
      stopSSELogging(rowKey);
      setActionsByRow((current) => ({
        ...current,
        [rowKey]: {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to send request."
        }
      }));
    }
  };

  const handleInstall = async () => {
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
        message: "Submitting Install request..."
      }
    }));

    try {

      startSSELogging(`${API_BASE_URL}/api/v1/his/logs/stream/${server.serverConfigId}`, rowKey);
      const response = await fetch(
        `${API_BASE_URL}/api/v1/his/${encodeURIComponent(String(server.serverConfigId))}`,

        {
          method: "POST",
          headers: {
            Accept: "application/json"
          }
        }
      );

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
      stopSSELogging(rowKey);
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

    const toNullIfBlank = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const mappedPayload = {
      serverIP: addServerForm.serverIp,
      domainName: addServerForm.domainName,
      rootUserName: toNullIfBlank(addServerForm.rootUsername),
      password: addServerForm.rootUserPassword,
      hanaUserName: toNullIfBlank(addServerForm.hanaDbUsername),
      hanaPassword: addServerForm.hanaDbPassword,
      hanaPort: toNullIfBlank(addServerForm.hanaPort),
      hanaBackupPath: toNullIfBlank(addServerForm.hanaBackupPath),
      isDeleted: addServerForm.isDeleted
    };

    try {
      setIsAddServerSubmitting(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/servers`, {
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

  const handleEditServerFieldChange = (field: keyof AddServerFormState, value: string) => {
    setEditServerForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleOpenEditServerModal = async (server: ServerRow, rowKey: string) => {
    setSelectedRowKey(rowKey);
    setSelectedServer(server);

    if (server.serverConfigId === null) {
      setBackupMenuError("Server ID is missing for this row.");
      return;
    }

    setEditingServerId(server.serverConfigId);
    setIsEditServerOpen(true);
    setIsEditServerLoading(true);
    setEditServerError("");
    setEditServerSubmitError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/servers/${encodeURIComponent(String(server.serverConfigId))}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setEditServerForm(normalizeServerDetailForm(payload));
    } catch (error) {
      setEditServerError(error instanceof Error ? error.message : "Failed to load server details.");
      setEditServerForm(initialAddServerForm);
    } finally {
      setIsEditServerLoading(false);
    }
  };

  const handleEditServerSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditServerSubmitError("");

    if (editingServerId === null) {
      setEditServerSubmitError("Server ID is missing.");
      return;
    }

    const toNullIfBlank = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const mappedPayload = {
      serverIP: editServerForm.serverIp,
      domainName: editServerForm.domainName,
      rootUserName: toNullIfBlank(editServerForm.rootUsername),
      password: editServerForm.rootUserPassword,
      hanaUserName: toNullIfBlank(editServerForm.hanaDbUsername),
      hanaPassword: editServerForm.hanaDbPassword,
      hanaPort: toNullIfBlank(editServerForm.hanaPort),
      hanaBackupPath: toNullIfBlank(editServerForm.hanaBackupPath),
      isDeleted: editServerForm.isDeleted
    };

    try {
      setIsEditServerSubmitting(true);
      const response = await fetch(
        `${API_BASE_URL}/api/v1/servers/${encodeURIComponent(String(editingServerId))}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(mappedPayload)
        }
      );

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setIsEditServerOpen(false);
      setEditingServerId(null);
      setEditServerForm(initialAddServerForm);
      await fetchServers();
    } catch (error) {
      setEditServerSubmitError(error instanceof Error ? error.message : "Failed to update server.");
    } finally {
      setIsEditServerSubmitting(false);
    }
  };

  const handleDisplayPeopleClick = async () => {
    setShowSettingsPeoplePage(true);
    setPeopleInitError("");
    setIsPeopleInitLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people/page-init-data`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      const { skills } = normalizePeoplePageInitData(payload);
      setPeopleSkills(skills);
      setSelectedSkillset(skills.length > 0 ? String(skills[0].id) : "");
    } catch (error) {
      setPeopleSkills([]);
      setSelectedSkillset("");
      setPeopleInitError(error instanceof Error ? error.message : "Failed to load people page data.");
    } finally {
      setIsPeopleInitLoading(false);
    }
  };

  const fetchPeopleListPage = async (
    requestedPage: number,
    requestedPageSize: number,
    filters: {
      whatsAppMsgCount: number | null;
      linkedinMsgCount: number | null;
      personMsgStatusId: number | null;
      country: string;
      isMobilePresent: string | null;
    } = {
      whatsAppMsgCount: appliedWhatsappMsgCountFilter,
      linkedinMsgCount: appliedLinkedinMsgCountFilter,
      personMsgStatusId: appliedStatusFilter,
      country: appliedCountryFilter,
      isMobilePresent: appliedIsMobilePresentFilter
    }
  ) => {
    setPeopleListError("");
    setIsPeopleListLoading(true);
    setPeopleEnrichStatus("");
    setPeopleEnrichStatusType("idle");

    // Parse selectedSkillset as number (Long)
    const skillId = selectedSkillset ? Number(selectedSkillset) : null;
    if (!skillId || isNaN(skillId)) {
      setPeopleListError("Please select a valid skill.");
      setIsPeopleListLoading(false);
      return;
    }

    const requestBody = {
      skillId: skillId,
      whatsAppMsgCount: filters.whatsAppMsgCount,
      linkedinMsgCount: filters.linkedinMsgCount,
      pageNumber: requestedPage,
      numberPerPage: requestedPageSize,
      ...(filters.personMsgStatusId !== null ? { personMsgStatusId: filters.personMsgStatusId } : {}),
      ...(filters.country.length > 0 ? { country: filters.country } : {}),
      ...(filters.isMobilePresent !== null ? { isMobilePresent: filters.isMobilePresent } : {})
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      const normalizedResponse = normalizePeopleSearchResponse(payload);
      setPeopleList(normalizedResponse.persons);
      setPeopleMsgStatuses(normalizedResponse.msgStatuses);
      setTotalPeoplePages(normalizedResponse.totalPages);
      setCurrentPeoplePage(normalizedResponse.currentPage);
      setPeopleRowsPerPage(normalizedResponse.pageSize);
    } catch (error) {
      setPeopleListError(error instanceof Error ? error.message : "Failed to load people.");
    } finally {
      setIsPeopleListLoading(false);
    }
  };

  const handleDisplayPeopleList = async () => {
    setPeopleList([]);
    setPeopleMsgStatuses([]);
    setSelectedStatusByPersonId({});
    setSelectedPeopleIds(new Set<number>());
    setHasLoadedPeopleList(true);
    setCurrentPeoplePage(1);
    setTotalPeoplePages(1);
    setAppliedStatusFilter(null);
    setAppliedCountryFilter("");
    setAppliedIsMobilePresentFilter(null);
    setAppliedWhatsappMsgCountFilter(null);
    setAppliedLinkedinMsgCountFilter(null);
    await fetchPeopleListPage(1, peopleRowsPerPage, {
      whatsAppMsgCount: null,
      linkedinMsgCount: null,
      personMsgStatusId: null,
      country: "",
      isMobilePresent: null
    });
  };

  const handleFilterPeopleList = async () => {
    const trimmedStatus = statusFilter.trim();
    const trimmedCountry = countryFilter.trim();
    const trimmedWhatsappMsgCount = whatsappMsgCountFilter.trim();
    const trimmedLinkedinMsgCount = linkedinMsgCountFilter.trim();

    const nextStatus = trimmedStatus === "" ? null : Number(trimmedStatus);
    const nextWhatsappMsgCount =
      trimmedWhatsappMsgCount === "" ? null : Number(trimmedWhatsappMsgCount);
    const nextLinkedinMsgCount =
      trimmedLinkedinMsgCount === "" ? null : Number(trimmedLinkedinMsgCount);
    const nextIsMobilePresent =
      isMobilePresentFilter === "yes" ? "yes" : isMobilePresentFilter === "no" ? "no" : null;

    if (
      (nextStatus !== null && !Number.isFinite(nextStatus)) ||
      (nextWhatsappMsgCount !== null && !Number.isFinite(nextWhatsappMsgCount)) ||
      (nextLinkedinMsgCount !== null && !Number.isFinite(nextLinkedinMsgCount))
    ) {
      setPeopleListError(
        "Status, Whatsapp Msg Count and Linkedin Msg Count must be valid numbers."
      );
      return;
    }

    setPeopleList([]);
    setPeopleMsgStatuses([]);
    setSelectedStatusByPersonId({});
    setSelectedPeopleIds(new Set<number>());
    setHasLoadedPeopleList(true);
    setCurrentPeoplePage(1);
    setTotalPeoplePages(1);
    setAppliedStatusFilter(nextStatus === null ? null : Math.trunc(nextStatus));
    setAppliedCountryFilter(trimmedCountry);
    setAppliedIsMobilePresentFilter(nextIsMobilePresent);
    setAppliedWhatsappMsgCountFilter(
      nextWhatsappMsgCount === null ? null : Math.trunc(nextWhatsappMsgCount)
    );
    setAppliedLinkedinMsgCountFilter(
      nextLinkedinMsgCount === null ? null : Math.trunc(nextLinkedinMsgCount)
    );

    await fetchPeopleListPage(1, peopleRowsPerPage, {
      whatsAppMsgCount: nextWhatsappMsgCount === null ? null : Math.trunc(nextWhatsappMsgCount),
      linkedinMsgCount: nextLinkedinMsgCount === null ? null : Math.trunc(nextLinkedinMsgCount),
      personMsgStatusId: nextStatus === null ? null : Math.trunc(nextStatus),
      country: trimmedCountry,
      isMobilePresent: nextIsMobilePresent
    });
  };

  const handleSubmitSelectedPeople = async () => {
    const personsIds = Array.from(selectedPeopleIds)
      .map((id) => Math.trunc(id))
      .filter((id) => Number.isFinite(id));

    if (personsIds.length === 0) {
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus("Please select at least one person.");
      return;
    }

    setIsPeopleEnrichSubmitting(true);
    setPeopleEnrichStatusType("sending");
    setPeopleEnrichStatus("Submitting request...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ personsIds })
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setPeopleEnrichStatusType("success");
      setPeopleEnrichStatus(formatPayload(payload));
    } catch (error) {
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus(error instanceof Error ? error.message : "Failed to enrich selected people.");
    } finally {
      setIsPeopleEnrichSubmitting(false);
    }
  };

  const handleFetchPeopleFromApolloAndSave = async () => {
    setPeopleFetchStatusType("sending");
    setPeopleFetchStatus("Submitting request...");
    setIsPeopleFetchSubmitting(true);

    // Parse selectedSkillset as number (Long)
    const skillId = selectedSkillset ? Number(selectedSkillset) : null;
    if (!skillId || isNaN(skillId)) {
      setPeopleFetchStatusType("error");
      setPeopleFetchStatus("Please select a valid skill.");
      setIsPeopleFetchSubmitting(false);
      return;
    }

    const requestBody = {
      skillId: skillId
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setPeopleFetchStatusType("success");
      setPeopleFetchStatus(formatPayload(payload));
    } catch (error) {
      setPeopleFetchStatusType("error");
      setPeopleFetchStatus(error instanceof Error ? error.message : "Failed to fetch people from Apollo.");
    } finally {
      setIsPeopleFetchSubmitting(false);
    }
  };

  const handleOpenSettingsPage = () => {
    setActivePage("settings");
    void handleDisplayPeopleClick();
  };

  const handlePersonStatusChange = async (personId: number, statusValue: string) => {
    const normalizedStatusValue = statusValue.trim();
    const parsedStatusId =
      normalizedStatusValue.length > 0 && Number.isFinite(Number(normalizedStatusValue))
        ? Math.trunc(Number(normalizedStatusValue))
        : null;

    if (!Number.isFinite(personId) || parsedStatusId === null) {
      return;
    }

    const previousStatusValue = selectedStatusByPersonId[personId] ?? "";
    setSelectedStatusByPersonId((prev) => ({
      ...prev,
      [personId]: String(parsedStatusId)
    }));

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/people/updatePersonMsgStatus/${encodeURIComponent(String(personId))}/${encodeURIComponent(String(parsedStatusId))}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }
    } catch (error) {
      setSelectedStatusByPersonId((prev) => ({
        ...prev,
        [personId]: previousStatusValue
      }));
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus(
        error instanceof Error ? error.message : "Failed to update person message status."
      );
    }
  };

  const handleInitiateMessagingClick = async () => {
    setSelectedMessageTitle("");
    setIsMessagingWhatsappChecked(true);
    setIsMessagingLinkedinChecked(true);
    setMessagingWarning("");
    setPushMessagesError("");
    setIsMessagingModalOpen(true);

    setIsPushMessagesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people/getPushMsgNames`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      const options = normalizePushMessageOptions(payload);
      setPushMessageOptions(options);
      setSelectedMessageTitle(options.length > 0 ? String(options[0].pushMsgId) : "");
    } catch (error) {
      setPushMessageOptions([]);
      setSelectedMessageTitle("");
      setPushMessagesError(
        error instanceof Error ? error.message : "Failed to load message titles."
      );
    } finally {
      setIsPushMessagesLoading(false);
    }
  };

  const handleSendMessages = async () => {
    setMessagingWarning("");

    if (!isMessagingWhatsappChecked && !isMessagingLinkedinChecked) {
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus("Please select at least one channel.");
      return;
    }

    if (!selectedMessageTitle) {
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus("Please select a message title.");
      return;
    }

    const selectedPeople = peopleList.filter((person) => {
      const numericPersonId =
        typeof person.personId === "number"
          ? person.personId
          : typeof person.personId === "string"
            ? Number(person.personId)
            : NaN;
      const normalizedPersonId = Number.isFinite(numericPersonId) ? Math.trunc(numericPersonId) : null;

      return normalizedPersonId !== null && selectedPeopleIds.has(normalizedPersonId);
    });

    if (selectedPeople.length === 0) {
      setMessagingWarning("Please select at least one person");
      return;
    }

    const persons = selectedPeople.map((person) => {
      const numericPersonId =
        typeof person.personId === "number"
          ? person.personId
          : typeof person.personId === "string"
            ? Number(person.personId)
            : NaN;
      const normalizedPersonId = Number.isFinite(numericPersonId) ? Math.trunc(numericPersonId) : null;

      const selectedStatusValue =
        normalizedPersonId !== null ? selectedStatusByPersonId[normalizedPersonId] : undefined;
      const fallbackStatusValue =
        person.personMsgStatusId !== null ? String(person.personMsgStatusId) : "";
      const effectiveStatusValue = (selectedStatusValue ?? fallbackStatusValue).trim();
      const parsedStatusValue =
        effectiveStatusValue.length > 0 && Number.isFinite(Number(effectiveStatusValue))
          ? Math.trunc(Number(effectiveStatusValue))
          : null;

      return {
        personId: String(person.personId ?? ""),
        firstName: person.firstName,
        mobile: person.mobile,
        linkedin: person.linkedin,
        titleId: person.titleId ? Number(person.titleId) : null,
        personMsgStatusId: parsedStatusValue
      };
    });

    setIsPeopleEnrichSubmitting(true);
    setPeopleEnrichStatusType("sending");
    setPeopleEnrichStatus("Sending messages...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/people/sendMessages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          isWhatsappSelected: isMessagingWhatsappChecked,
          isLinkedinSelected: isMessagingLinkedinChecked,
          whatsappSelected: isMessagingWhatsappChecked,
          linkedinSelected: isMessagingLinkedinChecked,
          pushMsgId: Number(selectedMessageTitle),
          persons
        })
      });

      const payload = await getResponsePayload(response);
      if (!response.ok) {
        throw new Error(formatPayload(payload) || `Request failed with status ${response.status}`);
      }

      setPeopleEnrichStatusType("success");
      setPeopleEnrichStatus(formatPayload(payload));
    } catch (error) {
      setPeopleEnrichStatusType("error");
      setPeopleEnrichStatus(error instanceof Error ? error.message : "Failed to send messages.");
    } finally {
      setIsPeopleEnrichSubmitting(false);
      setIsMessagingModalOpen(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b-[0.25px] border-slate-200 bg-white/95 backdrop-blur">
        <div className="relative flex w-full items-center gap-4 py-4 pr-4">
          <img
            src="/icons/altzenLogo.webp"
            alt="Company logo"
            className="h-10 w-auto object-contain sm:h-11 ml-[17px]"
          />
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[40px] font-semibold text-slate-900 leading-none">
            Altzen Cockpit
          </h1>
          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-3 text-sm text-slate-700">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-600">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="8" r="3" />
                <path d="M5 19c0-3 3-5 7-5s7 2 7 5" />
              </svg>
            </span>
            <span className="max-w-[180px] truncate font-medium" title={userName}>
              {userName}
            </span>
            <button
              type="button"
              onClick={handleLogoutClick}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 w-full overflow-hidden">
        <div className="grid h-full grid-cols-[calc(5%-20px)_calc(95%+20px)] items-stretch">
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
                onClick={handleOpenSettingsPage}
                className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
                  activePage === "settings"
                    ? "bg-[#e8471b]"
                    : "hover:bg-slate-200"
                }`}
                title="Dhurandar"
              >
                <img
                  src="/icons/dhurandar.png"
                  alt="Dhurandar"
                  className="h-8 w-8 rounded object-cover"
                />
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
                            <col className="w-[50%]" />
                            <col className="w-[40%]" />
                            <col className="w-[10%]" />
                          </colgroup>
                          <thead>
                            <tr className="border-b-[0.25px] border-slate-200 bg-[#f1f5f9] text-slate-700">
                              <th className="px-2 py-2 font-bold">Domain</th>
                              <th className="px-2 py-2 font-bold">Status</th>
                              <th className="px-2 py-2 font-bold text-center">
                                <button
                                  type="button"
                                  className="text-3xl font-bold leading-none text-slate-900"
                                  title="Add Server"
                                  onClick={() => setIsAddServerOpen(true)}
                                >
                                  +
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {servers.length === 0 && (
                              <tr>
                                <td colSpan={3} className="px-2 py-4 text-sm text-slate-500">
                                  No servers were returned by the API.
                                </td>
                              </tr>
                            )}

                            {servers.length > 0 && filteredServers.length === 0 && (
                              <tr>
                                <td colSpan={3} className="px-2 py-4 text-sm text-slate-500">
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
                                  typeof log === "string" && log.includes("Agent completed")
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
                                    className={`cursor-pointer border-b-[0.25px] border-slate-200 ${
                                      isGreen
                                        ? "bg-green-500/10 text-black"
                                        : selectedRowKey === rowKey
                                          ? "bg-slate-200 text-black"
                                          : "bg-transparent hover:bg-slate-800/60 text-black"
                                    }`}
                                    title="Double-click on Domain to edit server"
                                  >
                                    <td className="break-words px-2 py-2 align-top text-black">
                                      <button
                                        type="button"
                                        onDoubleClick={(event) => {
                                          event.stopPropagation();
                                          void handleOpenEditServerModal(server, rowKey);
                                        }}
                                        className="max-w-full truncate text-left text-sm hover:text-[#e8471b]"
                                        title="Double-click to edit server"
                                      >
                                        {server.domainName}
                                      </button>
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
                                    <td className="px-2 py-2 align-top text-center text-black">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleDeleteServer(server, rowKey);
                                        }}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded bg-white text-base font-semibold leading-none text-slate-700 hover:bg-slate-100 hover:text-[#e8471b] focus:outline-none focus:border-transparent focus:ring-0"
                                        title="Delete Server"
                                      >
                                        -
                                      </button>
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
                          onClick={handleInstall}
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
              <div className="h-full p-4">
                {showSettingsPeoplePage ? (
                  <div className="h-full rounded-lg border-[0.25px] border-slate-200 bg-white grid grid-rows-[10%_90%]">
                      <div className="flex items-center gap-3 border-b-[0.25px] border-slate-200 px-4">
                        <label className="text-xs text-slate-700">
                          Skills
                          <select
                            value={selectedSkillset}
                            onChange={(event) => setSelectedSkillset(event.target.value)}
                            className="ml-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                          >
                            <option value="" disabled>
                              {isPeopleInitLoading ? "Loading skills..." : "Select Skill"}
                            </option>
                            {peopleSkills.map((skill) => (
                              <option key={skill.id} value={String(skill.id)}>
                                {skill.skillName}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={handleFetchPeopleFromApolloAndSave}
                          disabled={isPeopleFetchSubmitting}
                          className="rounded bg-[#e8471b] px-3 py-1 text-xs font-semibold text-white hover:bg-[#c73a14]"
                        >
                          {isPeopleFetchSubmitting ? "Submitting..." : "Fetch"}
                        </button>
                        <button
                          type="button"
                          onClick={handleDisplayPeopleList}
                          disabled={isPeopleListLoading}
                          className="rounded bg-[#e8471b] px-3 py-1 text-xs font-semibold text-white hover:bg-[#c73a14]"
                          style={{ marginLeft: 8 }}
                        >
                          {isPeopleListLoading ? "Loading..." : "Display"}
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitSelectedPeople}
                          disabled={isPeopleEnrichSubmitting}
                          className="rounded bg-[#e8471b] px-3 py-1 text-xs font-semibold text-white hover:bg-[#c73a14] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPeopleEnrichSubmitting ? "Enriching..." : "Enrich"}
                        </button>
                        <button
                          type="button"
                          onClick={handleInitiateMessagingClick}
                          disabled={isPeopleEnrichSubmitting}
                          className="rounded bg-[#e8471b] px-3 py-1 text-xs font-semibold text-white hover:bg-[#c73a14] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPeopleEnrichSubmitting ? "Sending..." : "Campaign"}
                        </button>
                      </div>

                      <div className="min-h-0 overflow-y-auto px-4 py-3 text-sm text-slate-600">
                        {isPeopleListLoading ? (
                          <p className="text-xs text-slate-400 px-2 py-2">Loading people...</p>
                        ) : peopleListError ? (
                          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {peopleListError}
                          </p>
                        ) : hasLoadedPeopleList ? (
                          <>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              {peopleEnrichStatus ? (
                                <span
                                  className={`max-w-[60%] whitespace-pre-wrap break-words rounded border px-3 py-1 text-xs ${
                                    peopleEnrichStatusType === "error"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : peopleEnrichStatusType === "success"
                                        ? "border-green-200 bg-green-50 text-green-700"
                                        : "border-slate-200 bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  {peopleEnrichStatus}
                                </span>
                              ) : <span className="text-xs text-slate-500">&nbsp;</span>}

                              <div className="ml-auto flex items-center gap-2">
                                <div className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Status</span>
                                    <select
                                      value={statusFilter}
                                      onChange={(event) => setStatusFilter(event.target.value)}
                                      className="w-28 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    >
                                      <option value="">Select</option>
                                      {peopleMsgStatuses.map((status) => (
                                        <option key={status.value} value={status.value}>
                                          {status.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Country</span>
                                    <input
                                      type="text"
                                      value={countryFilter}
                                      onChange={(event) => setCountryFilter(event.target.value)}
                                      className="w-24 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    />
                                  </label>
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Is Mobile Present</span>
                                    <select
                                      value={isMobilePresentFilter}
                                      onChange={(event) => setIsMobilePresentFilter(event.target.value)}
                                      className="w-20 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    >
                                      <option value="select">select</option>
                                      <option value="yes">yes</option>
                                      <option value="no">no</option>
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Whatsapp Msg Count</span>
                                    <input
                                      type="text"
                                      value={whatsappMsgCountFilter}
                                      onChange={(event) => setWhatsappMsgCountFilter(event.target.value)}
                                      className="w-20 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    />
                                  </label>
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Linkedin Msg Count</span>
                                    <input
                                      type="text"
                                      value={linkedinMsgCountFilter}
                                      onChange={(event) => setLinkedinMsgCountFilter(event.target.value)}
                                      className="w-20 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleFilterPeopleList();
                                    }}
                                    className="rounded bg-[#e8471b] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#c73a14]"
                                  >
                                    Filter
                                  </button>
                                </div>

                                <div className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                  <label className="flex items-center gap-1 text-xs font-normal text-slate-700">
                                    <span>Rows</span>
                                    <select
                                      value={peopleRowsPerPage}
                                      onChange={(event) => {
                                        const nextPageSize = Number(event.target.value);
                                        void fetchPeopleListPage(1, nextPageSize);
                                      }}
                                      className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none"
                                    >
                                      <option value={10}>10</option>
                                      <option value={25}>25</option>
                                      <option value={50}>50</option>
                                    </select>
                                  </label>
                                  <span className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-700">
                                    Page {safeCurrentPeoplePage} / {totalPeoplePages}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (safeCurrentPeoplePage <= 1) {
                                        return;
                                      }
                                      void fetchPeopleListPage(1, peopleRowsPerPage);
                                    }}
                                    disabled={safeCurrentPeoplePage <= 1}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    First
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (safeCurrentPeoplePage <= 1) {
                                        return;
                                      }
                                      void fetchPeopleListPage(safeCurrentPeoplePage - 1, peopleRowsPerPage);
                                    }}
                                    disabled={safeCurrentPeoplePage <= 1}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Prev
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (safeCurrentPeoplePage >= totalPeoplePages) {
                                        return;
                                      }
                                      void fetchPeopleListPage(safeCurrentPeoplePage + 1, peopleRowsPerPage);
                                    }}
                                    disabled={safeCurrentPeoplePage >= totalPeoplePages}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Next
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (safeCurrentPeoplePage >= totalPeoplePages) {
                                        return;
                                      }
                                      void fetchPeopleListPage(totalPeoplePages, peopleRowsPerPage);
                                    }}
                                    disabled={safeCurrentPeoplePage >= totalPeoplePages}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Last
                                  </button>
                                </div>
                              </div>
                            </div>
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                                  <th className="px-2 py-2 w-8 font-bold">
                                    <input
                                      type="checkbox"
                                      checked={isCurrentPageFullySelected}
                                      disabled={currentPageSelectablePeopleIds.length === 0}
                                      onChange={(event) => {
                                        const shouldSelectAll = event.target.checked;
                                        setSelectedPeopleIds((prev) => {
                                          const next = new Set(prev);

                                          if (shouldSelectAll) {
                                            currentPageSelectablePeopleIds.forEach((personId) => {
                                              next.add(personId);
                                            });
                                          } else {
                                            currentPageSelectablePeopleIds.forEach((personId) => {
                                              next.delete(personId);
                                            });
                                          }

                                          return next;
                                        });
                                      }}
                                    />
                                  </th>
                                  <th className="px-2 py-2 font-bold">Status</th>
                                  <th className="px-2 py-2 font-bold">ApolloId</th>
                                  <th className="px-2 py-2 font-bold">First Name</th>
                                  <th className="px-2 py-2 font-bold">Last Name</th>
                                  <th className="px-2 py-2 font-bold">Title</th>                                  
                                  <th className="px-2 py-2 font-bold">Mobile</th>
                                  <th className="px-2 py-2 font-bold">Email</th>
                                  <th className="px-2 py-2 font-bold">Linkedin</th>
                                  <th className="px-2 py-2 font-bold text-center">LinkedinT</th>
                                  <th className="px-2 py-2 font-bold text-center">WhatsAppT</th>
                                  <th className="px-2 py-2 font-bold">Organization</th>
                                  <th className="px-2 py-2 font-bold">Skill Name</th>
                                  <th className="px-2 py-2 font-bold">Country</th>
                                </tr>
                              </thead>
                              <tbody>
                                {peopleList.map((person, idx) => {
                                  const numericPersonId =
                                    typeof person.personId === "number"
                                      ? person.personId
                                      : typeof person.personId === "string"
                                        ? Number(person.personId)
                                        : NaN;
                                  const normalizedPersonId = Number.isFinite(numericPersonId)
                                    ? Math.trunc(numericPersonId)
                                    : null;
                                  const rowId = person.personId ?? person.apolloId ?? idx;
                                  const isChecked =
                                    normalizedPersonId !== null && selectedPeopleIds.has(normalizedPersonId);
                                  return (
                                    <tr
                                      key={rowId}
                                      className={`border-b border-slate-100 ${isChecked ? "bg-orange-50" : "hover:bg-slate-50"}`}
                                    >
                                      <td className="px-2 py-1">
                                        <input
                                          type="checkbox"
                                          name="personsIds"
                                          value={normalizedPersonId !== null ? String(normalizedPersonId) : ""}
                                          checked={isChecked}
                                          disabled={normalizedPersonId === null}
                                          onChange={() => {
                                            if (normalizedPersonId === null) {
                                              return;
                                            }
                                            setSelectedPeopleIds((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(normalizedPersonId)) {
                                                next.delete(normalizedPersonId);
                                              } else {
                                                next.add(normalizedPersonId);
                                              }
                                              return next;
                                            });
                                          }}
                                        />
                                      </td>
                                      <td className="px-2 py-1 text-slate-700">
                                        <select
                                          value={
                                            normalizedPersonId !== null
                                              ? (selectedStatusByPersonId[normalizedPersonId] ??
                                                (person.personMsgStatusId !== null
                                                  ? String(person.personMsgStatusId)
                                                  : ""))
                                              : ""
                                          }
                                          disabled={normalizedPersonId === null || peopleMsgStatuses.length === 0}
                                          onChange={(event) => {
                                            if (normalizedPersonId === null) {
                                              return;
                                            }
                                            const nextValue = event.target.value;
                                            void handlePersonStatusChange(normalizedPersonId, nextValue);
                                          }}
                                          className="w-[140px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#e8471b] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                          <option value="" disabled>
                                            {peopleMsgStatuses.length === 0 ? "No statuses" : "Select Status"}
                                          </option>
                                          {peopleMsgStatuses.map((status) => (
                                            <option key={status.value} value={status.value}>
                                              {status.label}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-2 py-1 text-slate-700">{String(person.apolloId ?? "")}</td>
                                      <td className="px-2 py-1 text-slate-700">{person.firstName}</td>
                                      <td className="px-2 py-1 text-slate-700">{person.lastName}</td>
                                      <td className="px-2 py-1 align-top text-slate-700 whitespace-normal break-words" title={person.title}>{person.title}</td>                                      
                                      <td className="px-2 py-1 text-slate-700">{person.mobile}</td>
                                      <td className="px-2 py-1 text-slate-700 break-all">{person.email}</td>
                                      <td className="px-2 py-1 text-slate-700">
                                        {person.linkedin ? (
                                          <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="text-[#e8471b] underline break-all">{person.linkedin}</a>
                                        ) : ""}
                                      </td>
                                      <td className="px-2 py-1 text-center text-slate-700">
                                        {person.linkedinMsgCount ?? "-"}
                                      </td>
                                      <td className="px-2 py-1 text-center text-slate-700">
                                        {person.whatsappMsgCount ?? "-"}
                                      </td>
                                      <td className="px-2 py-1 text-slate-700">{person.organization}</td>
                                      <td className="px-2 py-1 text-slate-700">{person.skillName}</td>
                                      <td className="px-2 py-1 text-slate-700">{person.country}</td>
                                    </tr>
                                  );
                                })}
                                {peopleList.length === 0 && (
                                  <tr>
                                    <td colSpan={14} className="px-2 py-6 text-center text-slate-500">
                                      No records to display.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </>
                        ) : peopleInitError ? (
                          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {peopleInitError}
                          </p>
                        ) : peopleFetchStatus ? (
                          <pre
                            className={`whitespace-pre-wrap break-words rounded border px-3 py-2 text-xs ${
                              peopleFetchStatusType === "error"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : peopleFetchStatusType === "success"
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {peopleFetchStatus}
                          </pre>
                        ) : (
                          "People page content area"
                        )}
                      </div>
                    </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border-[0.25px] border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600">
                    Loading people page...
                  </div>
                )}
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

      {isMessagingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Initiate Messaging</h3>
            {messagingWarning && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {messagingWarning}
              </div>
            )}
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isMessagingWhatsappChecked}
                  onChange={(event) => setIsMessagingWhatsappChecked(event.target.checked)}
                />
                <span>WhatsApp</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isMessagingLinkedinChecked}
                  onChange={(event) => setIsMessagingLinkedinChecked(event.target.checked)}
                />
                <span>Linkedin</span>
              </label>
              <label className="flex flex-col gap-1">
                <span>Message Title</span>
                <select
                  value={selectedMessageTitle}
                  onChange={(event) => setSelectedMessageTitle(event.target.value)}
                  disabled={isPushMessagesLoading || pushMessageOptions.length === 0}
                  className="rounded border border-slate-300 px-2 py-2 text-sm text-slate-900 focus:border-[#e8471b] focus:outline-none"
                >
                  <option value="" disabled>
                    {isPushMessagesLoading
                      ? "Loading message titles..."
                      : pushMessageOptions.length === 0
                        ? "No message titles available"
                        : "Select Message Title"}
                  </option>
                  {pushMessageOptions.map((message) => (
                    <option key={String(message.pushMsgId)} value={String(message.pushMsgId)}>
                      {message.pushMsgName}
                    </option>
                  ))}
                </select>
                {pushMessagesError && <span className="text-xs text-red-700">{pushMessagesError}</span>}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessagingWarning("");
                  setIsMessagingModalOpen(false);
                }}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendMessages}
                disabled={isPeopleEnrichSubmitting}
                className="rounded bg-[#e8471b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c73a14] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPeopleEnrichSubmitting ? "Sending..." : "Send Messages"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <span>Domain name *</span>
                  <input
                    name="domainName"
                    type="text"
                    value={addServerForm.domainName}
                    onChange={(event) => handleAddServerFieldChange("domainName", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Server IP *</span>
                  <input
                    name="serverIp"
                    type="text"
                    value={addServerForm.serverIp}
                    onChange={(event) => handleAddServerFieldChange("serverIp", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Root Username (Optional)</span>
                  <input
                    type="text"
                    value={addServerForm.rootUsername}
                    onChange={(event) => handleAddServerFieldChange("rootUsername", event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Root User Password *</span>
                  <input
                    type="password"
                    value={addServerForm.rootUserPassword}
                    onChange={(event) => handleAddServerFieldChange("rootUserPassword", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA DB Username (Optional)</span>
                  <input
                    type="text"
                    value={addServerForm.hanaDbUsername}
                    onChange={(event) => handleAddServerFieldChange("hanaDbUsername", event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA DB Password *</span>
                  <input
                    type="password"
                    value={addServerForm.hanaDbPassword}
                    onChange={(event) => handleAddServerFieldChange("hanaDbPassword", event.target.value)}
                    required
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>HANA Port (Optional)</span>
                  <input
                    type="text"
                    value={addServerForm.hanaPort}
                    onChange={(event) => handleAddServerFieldChange("hanaPort", event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
                  <span>HANA Backup Path (Optional)</span>
                  <input
                    type="text"
                    value={addServerForm.hanaBackupPath}
                    onChange={(event) => handleAddServerFieldChange("hanaBackupPath", event.target.value)}
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

      {isEditServerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Edit Server</h2>
              <button
                type="button"
                onClick={() => {
                  setIsEditServerOpen(false);
                  setEditingServerId(null);
                }}
                className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleEditServerSubmit} className="px-6 py-5">
              {isEditServerLoading ? (
                <p className="text-sm text-slate-600">Loading server details...</p>
              ) : (
                <>
                  {editServerError && (
                    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {editServerError}
                    </div>
                  )}
                  {editServerSubmitError && (
                    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {editServerSubmitError}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>Domain name *</span>
                      <input
                        type="text"
                        value={editServerForm.domainName}
                        onChange={(event) => handleEditServerFieldChange("domainName", event.target.value)}
                        required
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>Server IP *</span>
                      <input
                        type="text"
                        value={editServerForm.serverIp}
                        onChange={(event) => handleEditServerFieldChange("serverIp", event.target.value)}
                        required
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>Root Username (Optional)</span>
                      <input
                        type="text"
                        value={editServerForm.rootUsername}
                        onChange={(event) => handleEditServerFieldChange("rootUsername", event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>Root User Password *</span>
                      <input
                        type="text"
                        value={editServerForm.rootUserPassword}
                        onChange={(event) => handleEditServerFieldChange("rootUserPassword", event.target.value)}
                        required
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>HANA DB Username (Optional)</span>
                      <input
                        type="text"
                        value={editServerForm.hanaDbUsername}
                        onChange={(event) => handleEditServerFieldChange("hanaDbUsername", event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>HANA DB Password *</span>
                      <input
                        type="text"
                        value={editServerForm.hanaDbPassword}
                        onChange={(event) => handleEditServerFieldChange("hanaDbPassword", event.target.value)}
                        required
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>HANA Port (Optional)</span>
                      <input
                        type="text"
                        value={editServerForm.hanaPort}
                        onChange={(event) => handleEditServerFieldChange("hanaPort", event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
                      <span>HANA Backup Path (Optional)</span>
                      <input
                        type="text"
                        value={editServerForm.hanaBackupPath}
                        onChange={(event) => handleEditServerFieldChange("hanaBackupPath", event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#e8471b]"
                      />
                    </label>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditServerOpen(false);
                        setEditingServerId(null);
                      }}
                      disabled={isEditServerSubmitting}
                      className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isEditServerSubmitting || Boolean(editServerError)}
                      className="rounded-md bg-[#e8471b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c73a14] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isEditServerSubmitting ? "Saving..." : "Save"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
