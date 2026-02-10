const STORAGE_KEY = "projectHubData";
const SETTINGS_KEY = "projectHubSettings";
const ENTRA_SETTINGS_KEY = "projectHubEntraSettings";
const DB_NAME = "projectHubDB";
const DB_VERSION = 1;
const ATTACH_STORE = "attachments";
const HANDLE_STORE = "handles";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const EXPORT_ATTACHMENT_LIMIT = MAX_ATTACHMENT_SIZE;
const TIMELINE_MAX_ENTRIES = 50;
const SYNC_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let lastSyncTime = null;
let syncStatus = 'idle'; // 'idle' | 'saving' | 'syncing' | 'error'

const state = {
  projects: [],
  selectedId: null,
};

const settings = {
  autoSync: false,
};

const entraSettings = {
  clientId: "",
  tenantId: "common",
  drivePath: "ProjectHub/projects.json",
  redirectUri: "",
  useAppFolder: false,
  autoSync: false,
};

let dbPromise = null;
let saveDebounce = null;
let msalInstance = null;
let msalInitPromise = null;

const ui = {
  projectList: document.getElementById("projectList"),
  globalSearch: document.getElementById("globalSearch"),
  statusFilter: document.getElementById("statusFilter"),
  sortBy: document.getElementById("sortBy"),
  sampleDataBtn: document.getElementById("sampleDataBtn"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
  archiveList: document.getElementById("archiveList"),
  archiveEmpty: document.getElementById("archiveEmpty"),
  archiveCount: document.getElementById("archiveCount"),
  detailContent: document.getElementById("detailContent"),
  emptyState: document.getElementById("emptyState"),
  titleInput: document.getElementById("titleInput"),
  summaryInput: document.getElementById("summaryInput"),
  tagsInput: document.getElementById("tagsInput"),
  statusInput: document.getElementById("statusInput"),
  priorityInput: document.getElementById("priorityInput"),
  dueDateInput: document.getElementById("dueDateInput"),
  stuckReasonInput: document.getElementById("stuckReasonInput"),
  updatedAtLabel: document.getElementById("updatedAtLabel"),
  quickActionInput: document.getElementById("quickActionInput"),
  addActionBtn: document.getElementById("addActionBtn"),
  actionsList: document.getElementById("actionsList"),
  copyIncompleteBtn: document.getElementById("copyIncompleteBtn"),
  copyAllBtn: document.getElementById("copyAllBtn"),
  copySummaryBtn: document.getElementById("copySummaryBtn"),
  linkLabelInput: document.getElementById("linkLabelInput"),
  linkUrlInput: document.getElementById("linkUrlInput"),
  addLinkBtn: document.getElementById("addLinkBtn"),
  linksList: document.getElementById("linksList"),
  toggleLinkFormBtn: document.getElementById("toggleLinkFormBtn"),
  linkFormContainer: document.getElementById("linkFormContainer"),
  linksEmpty: document.getElementById("linksEmpty"),
  fileInput: document.getElementById("fileInput"),
  attachmentsList: document.getElementById("attachmentsList"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  exportFullBtn: document.getElementById("exportFullBtn"),
  importInput: document.getElementById("importInput"),
  toast: document.getElementById("toast"),
  syncSettingsBtn: document.getElementById("syncSettingsBtn"),
  entraLoginBtn: document.getElementById("entraLoginBtn"),
  entraLogoutBtn: document.getElementById("entraLogoutBtn"),
  entraConfigBtn: document.getElementById("entraConfigBtn"),
  entraClientIdInput: document.getElementById("entraClientIdInput"),
  entraTenantIdInput: document.getElementById("entraTenantIdInput"),
  entraDrivePathInput: document.getElementById("entraDrivePathInput"),
  entraRedirectUriInput: document.getElementById("entraRedirectUriInput"),
  entraRedirectUriHint: document.getElementById("entraRedirectUriHint"),
  entraRedirectUriSetBtn: document.getElementById("entraRedirectUriSetBtn"),
  entraAppFolderToggle: document.getElementById("entraAppFolderToggle"),
  entraLoadBtn: document.getElementById("entraLoadBtn"),
  entraSaveBtn: document.getElementById("entraSaveBtn"),
  entraStatus: document.getElementById("entraStatus"),
  entraAutoSyncToggle: document.getElementById("entraAutoSyncToggle"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  logContent: document.getElementById("logContent"),
  timelineList: document.getElementById("timelineList"),
  timelineEmpty: document.getElementById("timelineEmpty"),
};

const STATUS_LABELS = {
  idea: "アイデア",
  active: "進行中",
  stuck: "停滞",
  done: "完了",
  showcase: "殿堂入り",
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
};

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  return date.toLocaleString();
}

const TIMELINE_ACTION_LABELS = {
  created: "プロジェクト作成",
  status_changed: "ステータス変更",
  action_added: "アクション追加",
  action_completed: "アクション完了",
  action_deleted: "アクション削除",
  link_added: "リンク追加",
  link_deleted: "リンク削除",
  attachment_added: "添付追加",
  attachment_deleted: "添付削除",
  archived: "アーカイブ",
  unarchived: "アーカイブ解除",
};

function addTimelineEntry(project, action, details = "") {
  if (!project) return;
  const entry = {
    id: createId(),
    action,
    details,
    timestamp: nowIso(),
  };
  project.timeline = project.timeline || [];
  project.timeline.unshift(entry);
  if (project.timeline.length > TIMELINE_MAX_ENTRIES) {
    project.timeline = project.timeline.slice(0, TIMELINE_MAX_ENTRIES);
  }
}

function addLog(message, type = "info") {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  const dateStr = now.toLocaleDateString();
  const fullMsg = `${dateStr} ${timeStr} - ${message}`;

  if (ui.logContent) {
    if (ui.logContent.textContent === "まだ操作履歴はありません。") {
      ui.logContent.innerHTML = "";
    }
    const div = document.createElement("div");
    div.style.padding = "2px 0";
    if (type === "error") div.style.color = "#dc2626";
    if (type === "success") div.style.color = "#16a34a";
    div.textContent = fullMsg;
    ui.logContent.prepend(div);

    while (ui.logContent.children.length > 8) {
      ui.logContent.removeChild(ui.logContent.lastChild);
    }
  }
}

function handleError(error, userMessage = "エラーが発生しました") {
  console.error(error);
  addLog(userMessage, "error");
  showToast(userMessage);
}

// Online/Offline detection
window.addEventListener("online", async () => {
  showToast("オンラインに復帰しました");
  addLog("ネットワーク接続が復帰しました", "success");
  updateSyncIndicator();
  if (entraSettings.autoSync && entraSettings.clientId) {
    addLog("オンライン復帰: OneDrive同期を開始します...", "info");
    await saveToOneDrive();
  }
});

window.addEventListener("offline", () => {
  showToast("オフラインです。変更はローカルに保存されます");
  addLog("オフラインモードになりました", "info");
  updateSyncIndicator();
});

// Focus-based sync check
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    updateSyncIndicator();
    // Check OneDrive for updates if auto-sync is enabled and 5+ minutes since last sync
    if (entraSettings.autoSync && entraSettings.clientId && navigator.onLine) {
      const timeSinceLastSync = lastSyncTime ? Date.now() - lastSyncTime.getTime() : Infinity;
      if (timeSinceLastSync >= SYNC_CHECK_INTERVAL) {
        await checkOneDriveForUpdates();
      }
    }
  }
});

// Sync status indicator
function updateSyncIndicator() {
  const indicator = document.getElementById('syncIndicator');
  if (!indicator) return;

  const statusConfig = {
    idle: { icon: '✓', text: '同期完了', class: 'sync-idle' },
    saving: { icon: '⏳', text: '保存中...', class: 'sync-saving' },
    syncing: { icon: '☁️', text: 'OneDrive同期中...', class: 'sync-syncing' },
    error: { icon: '⚠️', text: '同期エラー', class: 'sync-error' }
  };

  const config = statusConfig[syncStatus] || statusConfig.idle;

  // Format time as HH:mm:ss explicitly
  let timeStr = '';
  if (lastSyncTime && lastSyncTime instanceof Date && !isNaN(lastSyncTime)) {
    const hours = lastSyncTime.getHours().toString().padStart(2, '0');
    const minutes = lastSyncTime.getMinutes().toString().padStart(2, '0');
    const seconds = lastSyncTime.getSeconds().toString().padStart(2, '0');
    timeStr = `${hours}:${minutes}:${seconds}`;
  }

  const lastSyncStr = timeStr ? `(${timeStr})` : '';
  const offlineBadge = !navigator.onLine ? '<span class="offline-badge">オフライン</span>' : '';

  // Show "Sync Complete" even on initial load if we have a time, or just default text
  let displayText = config.text;

  indicator.className = `sync-indicator ${config.class}`;
  indicator.innerHTML = `
    <span class="sync-icon">${config.icon}</span>
    <span class="sync-text">${displayText} <span class="sync-time">${lastSyncStr}</span></span>
    ${offlineBadge}
  `;
}

// Check OneDrive for newer data
async function checkOneDriveForUpdates() {
  if (!entraSettings.clientId || !navigator.onLine) return;

  try {
    const response = await graphRequest(buildGraphFileUrl(entraSettings.drivePath));
    if (!response) return;

    const blob = await response.blob();
    const text = await blob.text();
    const remoteData = JSON.parse(text);

    // Find the latest updatedAt from remote projects
    const remoteLatest = remoteData.projects?.reduce((latest, p) => {
      const pDate = new Date(p.updatedAt);
      return pDate > latest ? pDate : latest;
    }, new Date(0)) || new Date(0);

    // Find the latest updatedAt from local projects
    const localLatest = state.projects.reduce((latest, p) => {
      const pDate = new Date(p.updatedAt);
      return pDate > latest ? pDate : latest;
    }, new Date(0));

    // If remote is newer, show notification
    if (remoteLatest > localLatest) {
      showSyncNotification();
    }
  } catch (error) {
    console.error('OneDrive check failed:', error);
    // Silent fail - don't bother user with check errors
  }
}

// Show sync notification bar
function showSyncNotification() {
  let bar = document.getElementById('syncNotificationBar');
  if (bar) {
    bar.style.display = 'flex';
    return;
  }

  bar = document.createElement('div');
  bar.id = 'syncNotificationBar';
  bar.className = 'sync-notification-bar';
  bar.innerHTML = `
    <span class="sync-notification-icon">🔄</span>
    <span class="sync-notification-text">OneDriveに新しいデータがあります</span>
    <button class="sync-notification-btn primary" id="syncLoadBtn">読み込む</button>
    <button class="sync-notification-btn ghost" id="syncDismissBtn">無視</button>
  `;

  document.body.insertBefore(bar, document.body.firstChild);

  document.getElementById('syncLoadBtn').addEventListener('click', async () => {
    bar.style.display = 'none';
    await loadFromOneDrive();
  });

  document.getElementById('syncDismissBtn').addEventListener('click', () => {
    bar.style.display = 'none';
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACH_STORE)) {
        db.createObjectStore(ATTACH_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function putAttachmentBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACH_STORE, "readwrite");
    tx.objectStore(ATTACH_STORE).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAttachmentBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACH_STORE, "readonly");
    const req = tx.objectStore(ATTACH_STORE).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAttachmentBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTACH_STORE, "readwrite");
    tx.objectStore(ATTACH_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveSyncHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put({ key: "syncFile", handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSyncHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const req = tx.objectStore(HANDLE_STORE).get("syncFile");
    req.onsuccess = () => resolve(req.result ? req.result.handle : null);
    req.onerror = () => reject(req.error);
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.projects = (parsed.projects || []).map(normalizeProject);
    state.selectedId = parsed.selectedId || null;
  } catch (error) {
    console.error(error);
  }
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    settings.autoSync = Boolean(parsed.autoSync);
  } catch (error) {
    console.error(error);
  }
}

function loadEntraSettings() {
  const raw = localStorage.getItem(ENTRA_SETTINGS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    entraSettings.clientId = parsed.clientId || "";
    entraSettings.tenantId = parsed.tenantId || "common";
    entraSettings.drivePath = parsed.drivePath || "ProjectHub/projects.json";
    entraSettings.redirectUri = parsed.redirectUri || "";
    entraSettings.useAppFolder = Boolean(parsed.useAppFolder);
    entraSettings.autoSync = Boolean(parsed.autoSync);
  } catch (error) {
    console.error(error);
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      projects: state.projects,
      selectedId: state.selectedId,
    })
  );
}

function persistEntraSettings() {
  localStorage.setItem(
    ENTRA_SETTINGS_KEY,
    JSON.stringify({
      clientId: entraSettings.clientId,
      tenantId: entraSettings.tenantId,
      drivePath: entraSettings.drivePath,
      redirectUri: entraSettings.redirectUri,
      useAppFolder: entraSettings.useAppFolder,
      autoSync: entraSettings.autoSync,
    })
  );
}

function persistSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      autoSync: settings.autoSync,
    })
  );
}

function scheduleSave() {
  if (saveDebounce) window.clearTimeout(saveDebounce);
  syncStatus = 'saving';
  updateSyncIndicator();
  saveDebounce = window.setTimeout(() => {
    persistState();
    syncStatus = 'idle';
    updateSyncIndicator();
    if (entraSettings.autoSync) scheduleOneDriveSave();
  }, 400);
}

function scheduleOneDriveSave() {
  if (window.oneDriveDebounce) window.clearTimeout(window.oneDriveDebounce);
  window.oneDriveDebounce = window.setTimeout(() => {
    saveToOneDrive();
  }, 2000);
}

function forceSaveToOneDrive() {
  if (window.oneDriveDebounce) {
    window.clearTimeout(window.oneDriveDebounce);
    window.oneDriveDebounce = null;
  }
  saveToOneDrive();
}

function setSelected(id) {
  state.selectedId = id;
  scheduleSave();
  render();
}

function getSelectedProject() {
  return state.projects.find((project) => project.id === state.selectedId) || null;
}

function updateProject(project, updates) {
  Object.assign(project, updates, { updatedAt: nowIso() });
  scheduleSave();
  render();
}

function createProject() {
  const newProject = {
    id: createId(),
    title: "新規プロジェクト",
    summary: "",
    tags: [],
    status: "idea",
    priority: "medium",
    heat: "2",
    dueDate: "",
    stuckReason: "",
    resumeMemo: "",
    contextSnapshot: "",
    nextActions: [],
    links: [],
    attachments: [],
    archived: false,
    archivedAt: null,
    timeline: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  addTimelineEntry(newProject, "created");
  state.projects.unshift(newProject);
  setSelected(newProject.id);
}

function normalizeProject(project) {
  return {
    archived: false,
    archivedAt: null,
    heat: "2",
    resumeMemo: "",
    contextSnapshot: "",
    timeline: [],
    ...project,
  };
}

async function deleteProject() {
  const project = getSelectedProject();
  if (!project) return;
  if (project.status === "done" && !project.archived) {
    const archive = confirm(
      "完了プロジェクトはアーカイブに移動できます。\nOKでアーカイブへ移動、キャンセルで完全削除に進みます。"
    );
    if (archive) {
      updateProject(project, { archived: true, archivedAt: nowIso() });
      showToast("完了プロジェクトをアーカイブしました。");
      return;
    }
  }
  if (!confirm("このプロジェクトを完全に削除しますか？\n添付ファイルも削除されます。")) return;
  await deleteProjectAttachments(project);
  state.projects = state.projects.filter((item) => item.id !== project.id);
  state.selectedId = state.projects.find((item) => !item.archived)?.id || null;
  scheduleSave();
  render();
  showToast("プロジェクトを削除しました。");
}

function updateProjectFromForm() {
  const project = getSelectedProject();
  if (!project) return;
  if (!ui.titleInput.value.trim()) {
    showToast("タイトルは必須です。");
    return;
  }
  const updates = {
    title: ui.titleInput.value.trim(),
    summary: ui.summaryInput.value.trim(),
    tags: ui.tagsInput.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    status: ui.statusInput.value,
    priority: ui.priorityInput.value,
    heat: document.getElementById("heatInput").value,
    dueDate: ui.dueDateInput.value,
    stuckReason: ui.stuckReasonInput.value.trim(),
    resumeMemo: document.getElementById("resumeMemoInput").value.trim(),
    contextSnapshot: document.getElementById("contextSnapshotInput").value.trim(),
  };
  if (project.archived && updates.status !== "done") {
    updates.archived = false;
    updates.archivedAt = null;
  }
  // Track status change
  if (updates.status && updates.status !== project.status) {
    addTimelineEntry(project, "status_changed", `${STATUS_LABELS[project.status]} → ${STATUS_LABELS[updates.status]}`);

    // Auto-archive logic: Done -> Archive, Other -> Unarchive
    if (updates.status === "done") {
      if (!project.archived) {
        updates.archived = true;
        updates.archivedAt = nowIso();
        addTimelineEntry(project, "archived", "完了により自動アーカイブ");
        showToast("完了したプロジェクトをアーカイブに移動しました");
      }
    } else {
      // If moving FROM done to something else, unarchive
      if (project.archived) {
        updates.archived = false;
        updates.archivedAt = null;
        addTimelineEntry(project, "unarchived", "ステータス変更によりアーカイブ解除");
      }
    }
  }
  // Track manual archive/unarchive
  if (updates.archived === true && !project.archived && updates.status !== "done") {
    addTimelineEntry(project, "archived");
  } else if (updates.archived === false && project.archived) {
    addTimelineEntry(project, "unarchived");
  }
  updateProject(project, updates);
}

function addNextAction(text) {
  const project = getSelectedProject();
  if (!project || !text.trim()) return;
  const action = {
    id: createId(),
    text: text.trim(),
    done: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    order: project.nextActions.length,
  };
  project.nextActions.push(action);
  addTimelineEntry(project, "action_added", action.text);
  updateProject(project, { nextActions: project.nextActions });
}

function updateNextAction(actionId, updates) {
  const project = getSelectedProject();
  if (!project) return;
  const action = project.nextActions.find((item) => item.id === actionId);
  if (!action) return;
  // Track completion
  if (updates.done === true && !action.done) {
    addTimelineEntry(project, "action_completed", action.text);
  }
  Object.assign(action, updates, { updatedAt: nowIso() });
  updateProject(project, { nextActions: project.nextActions });
}

function deleteNextAction(actionId) {
  const project = getSelectedProject();
  if (!project) return;
  const action = project.nextActions.find((item) => item.id === actionId);
  if (action) {
    addTimelineEntry(project, "action_deleted", action.text);
  }
  project.nextActions = project.nextActions.filter((item) => item.id !== actionId);
  updateProject(project, { nextActions: project.nextActions });
}

function moveNextAction(actionId, direction) {
  const project = getSelectedProject();
  if (!project) return;
  const index = project.nextActions.findIndex((item) => item.id === actionId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= project.nextActions.length) return;
  const list = [...project.nextActions];
  const [item] = list.splice(index, 1);
  list.splice(targetIndex, 0, item);
  list.forEach((entry, idx) => {
    entry.order = idx;
  });
  updateProject(project, { nextActions: list });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("コピーしました。");
  } catch (error) {
    console.error(error);
    showToast("コピーに失敗しました。手動で選択してください。");
  }
}

function buildCopyText(includeAll) {
  const project = getSelectedProject();
  if (!project) return "";
  const actions = project.nextActions.filter((action) => includeAll || !action.done);
  return actions.map((action) => `- [${action.done ? "x" : " "}] ${action.text}`).join("\n");
}

function buildSummaryCopy() {
  const project = getSelectedProject();
  if (!project) return "";
  const header = `# ${project.title}\n${project.summary || ""}`.trim();
  const actions = buildCopyText(false);
  return `${header}\n\n## Next Actions\n${actions}`.trim();
}

function addLink() {
  const project = getSelectedProject();
  if (!project) return;
  const label = ui.linkLabelInput.value.trim();
  const url = ui.linkUrlInput.value.trim();
  if (!label || !url) {
    showToast("ラベルとURLを入力してください。");
    return;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) throw new Error("invalid");
  } catch (error) {
    console.error(error);
    showToast("URLはhttp/https形式で入力してください。");
    return;
  }
  project.links.push({ id: createId(), label, url });
  addTimelineEntry(project, "link_added", label);
  ui.linkLabelInput.value = "";
  ui.linkUrlInput.value = "";
  updateProject(project, { links: project.links });
}

function deleteLink(linkId) {
  const project = getSelectedProject();
  if (!project) return;
  const link = project.links.find((l) => l.id === linkId);
  if (link) {
    addTimelineEntry(project, "link_deleted", link.label);
  }
  project.links = project.links.filter((link) => link.id !== linkId);
  updateProject(project, { links: project.links });
}

async function handleFiles(files) {
  const project = getSelectedProject();
  if (!project) return;
  for (const file of files) {
    const attachment = {
      id: createId(),
      name: file.name,
      originalName: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      createdAt: nowIso(),
      stored: true,
    };

    if (file.size > MAX_ATTACHMENT_SIZE) {
      const storeMetaOnly = confirm(
        `${file.name} は10MBを超えています。保存せずメタ情報のみ登録しますか？\nキャンセルするとブラウザに保存します。`
      );
      if (storeMetaOnly) {
        attachment.stored = false;
        const externalUrl = prompt("外部保管URLがあれば入力してください（任意）") || "";
        if (externalUrl) attachment.externalUrl = externalUrl;
      }
    }

    project.attachments.push(attachment);

    if (attachment.stored) {
      try {
        await putAttachmentBlob(attachment.id, file);
      } catch (error) {
        console.error(error);
        attachment.stored = false;
        showToast("添付ファイルの保存に失敗しました。メタ情報のみ保存します。");
      }
    }
  }
  updateProject(project, { attachments: project.attachments });
  // Record timeline for each added file
  for (const file of files) {
    addTimelineEntry(project, "attachment_added", file.name);
  }
}

async function removeAttachment(attachmentId) {
  const project = getSelectedProject();
  if (!project) return;
  const target = project.attachments.find((att) => att.id === attachmentId);
  if (!target) return;
  if (!confirm("この添付ファイルを削除しますか？")) return;
  addTimelineEntry(project, "attachment_deleted", target.name);
  project.attachments = project.attachments.filter((att) => att.id !== attachmentId);
  if (target.stored) await deleteAttachmentBlob(target.id);
  updateProject(project, { attachments: project.attachments });
  ui.attachmentPreview.innerHTML = "<p>ファイルを選択するとプレビューが表示されます。</p>";
}

async function deleteProjectAttachments(project) {
  const storedAttachments = project.attachments.filter((attachment) => attachment.stored);
  await Promise.all(storedAttachments.map((attachment) => deleteAttachmentBlob(attachment.id)));
}

async function renderAttachmentPreview(attachment) {
  if (!attachment) return;
  if (!attachment.stored) {
    ui.attachmentPreview.innerHTML = `
      <div>
        <p>このファイルはメタ情報のみ保存されています。</p>
        ${attachment.externalUrl ? `<a href="${attachment.externalUrl}" target="_blank">外部URLを開く</a>` : ""}
      </div>
    `;
    return;
  }
  const blob = await getAttachmentBlob(attachment.id);
  if (!blob) {
    ui.attachmentPreview.innerHTML = "<p>ファイルが見つかりません。</p>";
    return;
  }
  const url = URL.createObjectURL(blob);
  const type = attachment.mime;
  if (type.includes("markdown") || attachment.name.endsWith(".md")) {
    const text = await blob.text();
    renderMarkdown(text);
  } else if (type.startsWith("text/") || attachment.name.endsWith(".txt")) {
    const text = await blob.text();
    ui.attachmentPreview.textContent = text;
  } else if (type === "application/pdf" || attachment.name.endsWith(".pdf")) {
    ui.attachmentPreview.innerHTML = `<embed src="${url}" type="application/pdf" />`;
  } else if (type.startsWith("image/")) {
    ui.attachmentPreview.innerHTML = `<img src="${url}" alt="${attachment.name}" />`;
  } else {
    ui.attachmentPreview.innerHTML = `<a href="${url}" download="${attachment.name}">ダウンロード</a>`;
  }
}

function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    const html = window.marked.parse(text);
    ui.attachmentPreview.innerHTML = window.DOMPurify.sanitize(html);
  } else {
    ui.attachmentPreview.textContent = text;
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.setTimeout(() => ui.toast.classList.remove("show"), 2000);
}

function matchesSearch(project, query) {
  if (!query) return true;
  const target = [
    project.title,
    project.summary,
    project.tags.join(" "),
    project.links.map((link) => `${link.label} ${link.url}`).join(" "),
    project.nextActions.map((action) => action.text).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return target.includes(query.toLowerCase());
}

function sortProjects(projects, sortBy) {
  const sorted = [...projects];
  if (sortBy === "heat") {
    sorted.sort((a, b) => (parseInt(b.heat) || 2) - (parseInt(a.heat) || 2));
  } else if (sortBy === "priority") {
    const order = { high: 0, medium: 1, low: 2 };
    sorted.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
  } else if (sortBy === "dueDate") {
    sorted.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  } else {
    sorted.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  return sorted;
}

function getActiveProjects() {
  return state.projects.filter((project) => !project.archived);
}

function getArchivedProjects() {
  return state.projects.filter((project) => project.archived);
}

function renderProjectList() {
  const query = ui.globalSearch.value.trim();
  const statusFilter = ui.statusFilter.value;
  const sortBy = ui.sortBy.value;
  const filtered = getActiveProjects().filter((project) => {
    // Weekend filter: active/idea with heat >= 3
    if (statusFilter === "weekend") {
      const heat = parseInt(project.heat) || 2;
      return (project.status === "active" || project.status === "idea") &&
        heat >= 3 && matchesSearch(project, query);
    }
    if (statusFilter !== "all" && project.status !== statusFilter) return false;
    return matchesSearch(project, query);
  });
  const sorted = sortProjects(filtered, sortBy);
  ui.projectList.innerHTML = "";
  sorted.forEach((project) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `project-card ${project.id === state.selectedId ? "active" : ""}`;
    const dueDate = project.dueDate ? new Date(project.dueDate) : null;
    const isOverdue = dueDate && dueDate < new Date() && project.status !== "done";
    const pendingActions = project.nextActions.filter((action) => !action.done).length;
    card.innerHTML = `
      <div class="title">${project.title}</div>
      <div class="meta">
        <span class="status-pill status-${project.status}">${STATUS_LABELS[project.status]}</span>
        <span class="priority-${project.priority}">優先度: ${PRIORITY_LABELS[project.priority]}</span>
        <span class="heat-indicator">${"🔥".repeat(parseInt(project.heat || 2))}</span>
        <span class="${isOverdue ? "due-over" : ""}">期限: ${project.dueDate || "-"}</span>
        <span>未完了: ${pendingActions}</span>
      </div>
      <div class="meta">更新: ${formatDate(project.updatedAt)}</div>
      <div class="meta">
        ${project.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
    `;
    if (project.status === "stuck") {
      const lastUpdate = new Date(project.updatedAt);
      const diff = Date.now() - lastUpdate.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      if (days > 7) {
        card.classList.add("stuck-urgent-bg");
        card.innerHTML += `<div class="stuck-urgent">⚠️ 7日以上経過</div>`;
      } else {
        card.style.borderColor = "#fca5a5";
      }
    }
    card.addEventListener("click", () => {
      setSelected(project.id);
      if (window.innerWidth <= 1024) toggleSidebar(false);
    });
    ui.projectList.appendChild(card);
  });
  renderArchiveList();
}

function renderArchiveList() {
  const query = ui.globalSearch.value.trim();
  const archived = getArchivedProjects().filter((project) => matchesSearch(project, query));
  const sorted = sortProjects(archived, "updatedAt");
  ui.archiveList.innerHTML = "";
  sorted.forEach((project) => {
    const card = document.createElement("div");
    card.className = "archive-card";
    card.innerHTML = `
      <span class="archive-title">${project.title}</span>
      <button class="ghost resume-btn" data-id="${project.id}">開発再開する</button>
    `;
    card.querySelector(".resume-btn").addEventListener("click", () => {
      resumeProject(project.id);
    });
    ui.archiveList.appendChild(card);
  });
  ui.archiveCount.textContent = archived.length ? `(${archived.length})` : "";
  ui.archiveEmpty.style.display = archived.length ? "none" : "block";
}

function resumeProject(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  addTimelineEntry(project, "unarchived", "開発再開");
  updateProject(project, {
    archived: false,
    archivedAt: null,
    status: "active"
  });
  setSelected(projectId);
  showToast("開発を再開しました");
}

function renderProjectDetail() {
  const project = getSelectedProject();
  if (!project) {
    ui.detailContent.style.display = "none";
    ui.emptyState.style.display = "block";
    return;
  }
  ui.detailContent.style.display = "flex";
  ui.emptyState.style.display = "none";
  ui.titleInput.value = project.title;
  ui.summaryInput.value = project.summary;
  ui.tagsInput.value = project.tags.join(", ");
  ui.statusInput.value = project.status;
  ui.priorityInput.value = project.priority;
  ui.dueDateInput.value = project.dueDate || "";
  ui.stuckReasonInput.value = project.stuckReason || "";
  ui.updatedAtLabel.textContent = formatDate(project.updatedAt);

  renderActions(project);
  renderLinks(project);
  renderAttachments(project);
}

function renderActions(project) {
  const list = [...project.nextActions].sort((a, b) => a.order - b.order);
  ui.actionsList.innerHTML = "";
  list.forEach((action) => {
    const item = document.createElement("li");
    item.className = `check-item ${action.done ? "done" : ""}`;
    item.innerHTML = `
      <input type="checkbox" ${action.done ? "checked" : ""} />
      <input type="text" value="${action.text.replace(/"/g, "&quot;")}" />
      <div class="check-actions">
        <button class="ghost" data-action="up">↑</button>
        <button class="ghost" data-action="down">↓</button>
        <button class="ghost" data-action="delete">削除</button>
      </div>
    `;
    const checkbox = item.querySelector("input[type='checkbox']");
    const textInput = item.querySelector("input[type='text']");
    checkbox.addEventListener("change", () => {
      updateNextAction(action.id, { done: checkbox.checked });
    });
    textInput.addEventListener("input", () => {
      updateNextAction(action.id, { text: textInput.value });
    });
    item.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const actionType = button.dataset.action;
        if (actionType === "delete") deleteNextAction(action.id);
        if (actionType === "up") moveNextAction(action.id, -1);
        if (actionType === "down") moveNextAction(action.id, 1);
      });
    });
    ui.actionsList.appendChild(item);
  });
}

function renderLinks(project) {
  ui.linksList.innerHTML = "";
  if (project.links.length === 0) {
    ui.linksEmpty.style.display = "block";
    return;
  }
  ui.linksEmpty.style.display = "none";
  project.links.forEach((link) => {
    const item = document.createElement("li");
    item.className = "link-item-compact";
    item.innerHTML = `
      <a href="${link.url}" target="_blank" rel="noopener" class="link-label">${link.label}</a>
      <div class="link-actions">
        <button class="ghost-icon" data-action="copy" title="コピー">📋</button>
        <button class="ghost-icon" data-action="delete" title="削除">🗑️</button>
      </div>
    `;
    item.querySelector("button[data-action='copy']").addEventListener("click", () => {
      copyText(link.url);
    });
    item.querySelector("button[data-action='delete']").addEventListener("click", () => {
      deleteLink(link.id);
    });
    ui.linksList.appendChild(item);
  });
}

function renderAttachments(project) {
  ui.attachmentsList.innerHTML = "";
  project.attachments.forEach((attachment) => {
    const item = document.createElement("div");
    item.className = "attachment-item";
    item.innerHTML = `
      <div>
        <strong>${attachment.name}</strong>
        <div class="muted">${(attachment.size / 1024).toFixed(1)} KB | ${attachment.mime}</div>
      </div>
      <div class="actions">
        <button class="ghost" data-action="preview">表示</button>
        <button class="ghost" data-action="delete">削除</button>
      </div>
    `;
    item.querySelector("button[data-action='preview']").addEventListener("click", () => {
      renderAttachmentPreview(attachment);
    });
    item.querySelector("button[data-action='delete']").addEventListener("click", () => {
      removeAttachment(attachment.id);
    });
    ui.attachmentsList.appendChild(item);
  });
}

function renderTimeline(project) {
  if (!ui.timelineList || !ui.timelineEmpty) return;
  ui.timelineList.innerHTML = "";
  const timeline = project.timeline || [];
  if (timeline.length === 0) {
    ui.timelineEmpty.style.display = "block";
    return;
  }
  ui.timelineEmpty.style.display = "none";
  timeline.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "timeline-item";
    const label = TIMELINE_ACTION_LABELS[entry.action] || entry.action;
    const details = entry.details ? `: ${entry.details}` : "";
    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleString();
    item.innerHTML = `
      <span class="timeline-label">${label}${details}</span>
      <span class="timeline-time">${timeStr}</span>
    `;
    ui.timelineList.appendChild(item);
  });
}

async function buildExportPayload(includeAttachments) {
  const payload = {
    projects: state.projects,
    selectedId: state.selectedId,
    exportedAt: nowIso(),
  };
  if (!includeAttachments) return payload;
  const attachments = [];
  for (const project of state.projects) {
    for (const attachment of project.attachments) {
      if (!attachment.stored) continue;
      if (attachment.size > EXPORT_ATTACHMENT_LIMIT) continue;
      const blob = await getAttachmentBlob(attachment.id);
      if (!blob) continue;
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      attachments.push({ id: attachment.id, dataUrl });
    }
  }
  payload.attachmentData = attachments;
  payload.attachmentLimit = EXPORT_ATTACHMENT_LIMIT;
  return payload;
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportData(includeAttachments) {
  const payload = await buildExportPayload(includeAttachments);
  const filename = includeAttachments ? "projects-full.json" : "projects.json";
  downloadJson(payload, filename);
  showToast("エクスポートしました。");
}

async function importData(file) {
  const text = await file.text();
  try {
    const payload = JSON.parse(text);
    state.projects = (payload.projects || []).map(normalizeProject);
    state.selectedId = payload.selectedId || state.projects[0]?.id || null;
    if (payload.attachmentData) {
      for (const entry of payload.attachmentData) {
        if (!entry.dataUrl) continue;
        const blob = await (await fetch(entry.dataUrl)).blob();
        await putAttachmentBlob(entry.id, blob);
      }
    }
    scheduleSave();
    render();
    showToast("インポートしました。");
  } catch (error) {
    console.error(error);
    showToast("インポートに失敗しました。");
  }
}

async function ensureMsalInstance() {
  if (!window.msal) {
    showToast("MSALが読み込まれていません。ネットワーク接続を確認してください。");
    return null;
  }
  if (!msalInstance) {
    msalInstance = new window.msal.PublicClientApplication({
      auth: {
        clientId: entraSettings.clientId,
        authority: `https://login.microsoftonline.com/${entraSettings.tenantId}`,
        redirectUri: entraSettings.redirectUri || window.location.origin,
      },
      cache: { cacheLocation: "localStorage" },
    });
  }
  if (!msalInitPromise) {
    msalInitPromise = msalInstance.initialize();
  }
  await msalInitPromise;
  return msalInstance;
}

function resetMsalInstance() {
  msalInstance = null;
  msalInitPromise = null;
}

function renderEntraSettings() {
  ui.entraClientIdInput.value = entraSettings.clientId;
  ui.entraTenantIdInput.value = entraSettings.tenantId || "common";
  ui.entraDrivePathInput.value = entraSettings.drivePath || "ProjectHub/projects.json";
  ui.entraRedirectUriInput.value = entraSettings.redirectUri || window.location.origin;
  ui.entraAppFolderToggle.checked = entraSettings.useAppFolder;
  if (ui.entraRedirectUriHint) {
    ui.entraRedirectUriHint.textContent = window.location.origin;
  }
}

function ensureEntraConfig() {
  const nextClientId = ui.entraClientIdInput.value.trim();
  const nextTenantId = ui.entraTenantIdInput.value.trim() || "common";
  const nextDrivePath = ui.entraDrivePathInput.value.trim() || "ProjectHub/projects.json";
  const nextRedirectUri = ui.entraRedirectUriInput.value.trim() || window.location.origin;
  const nextUseAppFolder = ui.entraAppFolderToggle.checked;
  if (!nextClientId) {
    showToast("Client IDが設定されていません。");
    return false;
  }
  try {
    new URL(nextRedirectUri);
  } catch (error) {
    console.error(error);
    showToast("Redirect URIが正しい形式ではありません。");
    return false;
  }
  const previousSettings = {
    clientId: entraSettings.clientId,
    tenantId: entraSettings.tenantId,
    redirectUri: entraSettings.redirectUri,
    useAppFolder: entraSettings.useAppFolder,
  };
  entraSettings.clientId = nextClientId;
  entraSettings.tenantId = nextTenantId;
  entraSettings.drivePath = nextDrivePath;
  entraSettings.redirectUri = nextRedirectUri;
  entraSettings.useAppFolder = nextUseAppFolder;
  persistEntraSettings();
  const updated =
    previousSettings.clientId !== entraSettings.clientId ||
    previousSettings.tenantId !== entraSettings.tenantId ||
    previousSettings.redirectUri !== entraSettings.redirectUri ||
    previousSettings.useAppFolder !== entraSettings.useAppFolder;
  if (updated) {
    resetMsalInstance();
  }
  renderEntraSettings();
  return true;
}

function promptEntraSettings() {
  return ensureEntraConfig();
}

function configureEntraSettings() {
  if (ensureEntraConfig()) {
    ui.entraStatus.textContent = "設定を更新しました。";
  }
}

async function entraLogin() {
  if (!promptEntraSettings()) return;
  const msalApp = await ensureMsalInstance();
  if (!msalApp) return;
  try {
    const result = await msalApp.loginPopup({
      scopes: ["User.Read", "Files.ReadWrite"],
    });
    msalApp.setActiveAccount(result.account);
    if (ui.entraStatus) ui.entraStatus.textContent = `サインイン中: ${result.account.username}`;
    addLog(`サインイン成功: ${result.account.username}`, "success");
  } catch (error) {
    console.error(error);
    addLog(`サインイン失敗: ${error.message || error}`, "error");
    if (String(error?.message || "").includes("redirect_uri")) {
      ui.entraStatus.textContent = "サインインに失敗しました。設定を確認してください。";
      showToast("リダイレクトURIが一致しません。設定を再入力してください。");
    } else {
      showToast("サインインに失敗しました。");
    }
  }
}

async function entraLogout() {
  if (!msalInstance) return;
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) return;
  await msalInstance.logoutPopup({ account });
  if (ui.entraStatus) ui.entraStatus.textContent = "未サインイン";
  addLog("サインアウトしました", "info");
}

async function getGraphToken() {
  if (!promptEntraSettings()) return null;
  const msalApp = await ensureMsalInstance();
  if (!msalApp) return null;
  const account = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
  if (!account) {
    await entraLogin();
  }
  const activeAccount = msalApp.getActiveAccount() || msalApp.getAllAccounts()[0];
  if (!activeAccount) return null;
  msalApp.setActiveAccount(activeAccount);
  try {
    const response = await msalApp.acquireTokenSilent({
      account: activeAccount,
      scopes: ["User.Read", "Files.ReadWrite"],
    });
    return response.accessToken;
  } catch (error) {
    console.error(error);
    const response = await msalApp.acquireTokenPopup({
      account: activeAccount,
      scopes: ["User.Read", "Files.ReadWrite"],
    });
    return response.accessToken;
  }
}

async function graphRequest(url, options = {}) {
  const token = await getGraphToken();
  if (!token) return null;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch (error) {
      console.error(error);
    }
    const message = `Graph API error: ${response.status} ${response.statusText}`.trim();
    const errorWithStatus = new Error(detail ? `${message} - ${detail}` : message);
    errorWithStatus.status = response.status;
    throw errorWithStatus;
  }
  return response;
}

function buildGraphFileUrl(path) {
  const safePath = encodeURIComponent(path);
  if (entraSettings.useAppFolder) {
    return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${safePath}:/content`;
  }
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${safePath}:/content`;
}

async function loadFromOneDrive() {
  syncStatus = 'syncing';
  updateSyncIndicator();
  try {
    const response = await graphRequest(buildGraphFileUrl(entraSettings.drivePath));
    if (!response) {
      syncStatus = 'idle';
      updateSyncIndicator();
      return;
    }
    const blob = await response.blob();
    await importData(blob);
    if (ui.entraStatus) ui.entraStatus.textContent = "OneDriveから読み込みました。";
    addLog("OneDrive 読み込み成功", "success");
    lastSyncTime = new Date();
    syncStatus = 'idle';
    updateSyncIndicator();
  } catch (error) {
    console.error(error);
    addLog(`OneDrive 読み込み失敗: ${error.status || error.message || error}`, "error");
    syncStatus = 'error';
    updateSyncIndicator();
    if (error?.status === 404) {
      if (ui.entraStatus) ui.entraStatus.textContent = "OneDrive読み込みに失敗しました。保存先パスを確認してください。";
      showToast("指定した保存先パスが見つかりません。");
    } else if (error?.status === 401 || error?.status === 403) {
      if (ui.entraStatus) ui.entraStatus.textContent = "OneDrive読み込みに失敗しました。権限を確認してください。";
      showToast("サインイン権限を確認してください。");
    } else {
      if (ui.entraStatus) ui.entraStatus.textContent = "OneDrive読み込みに失敗しました。";
      showToast("OneDrive読み込みに失敗しました。");
    }
  }
}

async function saveToOneDrive() {
  syncStatus = 'syncing';
  updateSyncIndicator();
  try {
    addLog("OneDrive 保存開始 (添付込)...", "info");
    const payload = await buildExportPayload(true); // Always include attachments
    await graphRequest(buildGraphFileUrl(entraSettings.drivePath), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload, null, 2),
    });
    if (ui.entraStatus) ui.entraStatus.textContent = "OneDriveへ保存しました。";
    addLog("OneDrive 保存成功", "success");
    lastSyncTime = new Date();
    syncStatus = 'idle';
    updateSyncIndicator();
  } catch (error) {
    console.error(error);
    addLog(`OneDrive 保存失敗: ${error.status || error.message || error}`, "error");
    syncStatus = 'error';
    updateSyncIndicator();
    if (error?.status === 401 || error?.status === 403) {
      if (ui.entraStatus) ui.entraStatus.textContent = "OneDrive保存に失敗しました。権限を確認してください。";
      showToast("サインイン権限を確認してください。");
    } else {
      if (ui.entraStatus) ui.entraStatus.textContent = "OneDrive保存に失敗しました。";
      showToast("OneDrive保存に失敗しました。");
    }
  }
}

function initSampleData() {
  if (state.projects.length) return;
  const sample = {
    id: createId(),
    title: "Project Hub サンプル",
    summary: "突発プロジェクトを整理するためのデモです。",
    tags: ["demo", "urgent"],
    status: "active",
    priority: "high",
    dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    stuckReason: "",
    nextActions: [
      { id: createId(), text: "要件を整理する", done: false, createdAt: nowIso(), updatedAt: nowIso(), order: 0 },
      { id: createId(), text: "次のチャットをまとめる", done: false, createdAt: nowIso(), updatedAt: nowIso(), order: 1 },
    ],
    links: [{ id: createId(), label: "ChatGPT", url: "https://chat.openai.com/" }],
    attachments: [],
    archived: false,
    archivedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.projects = [sample];
  state.selectedId = sample.id;
  scheduleSave();
  render();
}

function renderProjectDetailMore() {
  const project = getSelectedProject();
  if (!project) return;
  document.getElementById("heatInput").value = project.heat || "2";
  document.getElementById("resumeMemoInput").value = project.resumeMemo || "";
  document.getElementById("contextSnapshotInput").value = project.contextSnapshot || "";
}

// ==========================================
// Dashboard Stats & View Toggle (Phase 2)
// ==========================================

let currentView = 'card'; // 'card' or 'table'

function updateDashboardStats() {
  const projects = getActiveProjects();
  const activeCount = projects.filter(p => p.status === 'active').length;
  const stuckCount = projects.filter(p => p.status === 'stuck').length;
  const ideaCount = projects.filter(p => p.status === 'idea').length;
  const showcaseCount = projects.filter(p => p.status === 'showcase').length;

  const statActive = document.getElementById('statActive');
  const statStuck = document.getElementById('statStuck');
  const statIdea = document.getElementById('statIdea');
  const statShowcase = document.getElementById('statShowcase');

  if (statActive) statActive.textContent = activeCount;
  if (statStuck) statStuck.textContent = stuckCount;
  if (statIdea) statIdea.textContent = ideaCount;
  if (statShowcase) statShowcase.textContent = showcaseCount;
}

function renderTableView() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  const query = ui.globalSearch.value.trim();
  const statusFilter = ui.statusFilter.value;
  const sortBy = ui.sortBy.value;

  const filtered = getActiveProjects().filter((project) => {
    if (statusFilter !== "all" && project.status !== statusFilter) return false;
    return matchesSearch(project, query);
  });
  const sorted = sortProjects(filtered, sortBy);

  // Render table with inline editing helpers
  tableBody.innerHTML = sorted.map(project => {
    const pendingActions = project.nextActions.filter(a => !a.done).length;
    const isSelected = project.id === state.selectedId;

    // Helper to generate select options
    const createOptions = (obj, current) => Object.entries(obj).map(([key, label]) =>
      `<option value="${key}" ${key === current ? 'selected' : ''}>${label}</option>`
    ).join('');

    // Specialized heat options
    const heatOptions = [1, 2, 3].map(v =>
      `<option value="${v}" ${String(project.heat) === String(v) ? 'selected' : ''}>${'🔥'.repeat(v)}</option>`
    ).join('');

    return `
      <tr data-id="${project.id}" class="${isSelected ? 'selected' : ''}">
        <td class="title-cell">
          <span class="clickable-title" onclick="window.selectProjectFromTable('${project.id}')">${project.title}</span>
        </td>
        <td>
          <select onchange="window.updateProjectInline('${project.id}', 'status', this.value)">
            ${createOptions(STATUS_LABELS, project.status)}
          </select>
        </td>
        <td>
          <select onchange="window.updateProjectInline('${project.id}', 'priority', this.value)">
            ${createOptions(PRIORITY_LABELS, project.priority)}
          </select>
        </td>
        <td class="heat-cell">
          <select onchange="window.updateProjectInline('${project.id}', 'heat', this.value)">
            ${heatOptions}
          </select>
        </td>
        <td>
          <input type="date" value="${project.dueDate || ''}" onchange="window.updateProjectInline('${project.id}', 'dueDate', this.value)" />
        </td>
        <td>${pendingActions}</td>
        <td class="date-cell">${formatDate(project.updatedAt)}</td>
      </tr>
    `;
  }).join('');
}

window.updateProjectInline = function (id, field, value) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;

  const updates = {};
  updates[field] = value;

  // Reuse existing logic (including timeline/archive checks)
  if (field === 'status') {
    // We need to simulate the "updateProjectFromForm" logic but specifically for this field
    if (value !== project.status) {
      addTimelineEntry(project, "status_changed", `${STATUS_LABELS[project.status]} → ${STATUS_LABELS[value]}`);
      if (value === "done" && !project.archived) {
        updates.archived = true;
        updates.archivedAt = nowIso();
        addTimelineEntry(project, "archived", "完了により自動アーカイブ");
        showToast("完了したプロジェクトをアーカイブに移動しました");
      } else if (value !== "done" && project.archived) {
        updates.archived = false;
        updates.archivedAt = null;
        addTimelineEntry(project, "unarchived", "ステータス変更によりアーカイブ解除");
      }
    }
  }

  updateProject(project, updates);
};

function switchView(view) {
  currentView = view;
  const cardView = document.getElementById('cardView');
  const tableView = document.getElementById('tableView');
  const cardBtn = document.getElementById('viewCardBtn');
  const tableBtn = document.getElementById('viewTableBtn');

  if (view === 'table') {
    if (cardView) cardView.classList.add('hidden');
    if (tableView) tableView.classList.remove('hidden');
    if (cardBtn) cardBtn.classList.remove('active');
    if (tableBtn) tableBtn.classList.add('active');
    renderTableView();
  } else {
    if (cardView) cardView.classList.remove('hidden');
    if (tableView) tableView.classList.add('hidden');
    if (cardBtn) cardBtn.classList.add('active');
    if (tableBtn) tableBtn.classList.remove('active');
  }
}

window.selectProjectFromTable = function (projectId) {
  setSelected(projectId);
  switchView('card'); // Switch to card view
  if (window.innerWidth <= 1024) toggleSidebar(false);
};

function render() {
  renderProjectList();
  renderProjectDetail();
  renderProjectDetailMore();
  updateDashboardStats();
  if (currentView === 'table') {
    renderTableView();
  }
  const selectedProject = getSelectedProject();
  if (selectedProject) {
    renderTimeline(selectedProject);
  }
  ui.sampleDataBtn.style.display = getActiveProjects().length ? "none" : "inline-flex";
}

function toggleSidebar(force) {
  const sidebar = document.querySelector(".sidebar");
  let overlay = document.querySelector(".sidebar-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => toggleSidebar(false));
  }
  const isOpen = force !== undefined ? force : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  overlay.classList.toggle("show", isOpen);
}

async function createFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    // 簡易的なAIパースの真似事
    const lines = text.split("\n");
    let title = lines[0].replace(/^(#|\d\.)\s*/, "").substring(0, 40);
    let summary = text.substring(0, 200);

    const newProject = {
      id: createId(),
      title: title || "クリップボードから作成",
      summary: summary,
      tags: ["AI連携"],
      status: "idea",
      priority: "medium",
      heat: "3",
      dueDate: "",
      stuckReason: "",
      resumeMemo: "クリップボードからの記録: " + new Date().toLocaleString(),
      contextSnapshot: text.substring(0, 150),
      nextActions: [],
      links: [],
      attachments: [],
      archived: false,
      archivedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.projects.unshift(newProject);
    setSelected(newProject.id);
    showToast("クリップボードの内容から概ね推測して作成しました。");
  } catch (error) {
    console.error(error);
    showToast("クリップボードの読み取りに失敗しました。");
  }
}

function bindEvents() {
  ui.newProjectBtn.addEventListener("click", createProject);
  ui.deleteProjectBtn.addEventListener("click", deleteProject);
  ui.globalSearch.addEventListener("input", renderProjectList);
  ui.statusFilter.addEventListener("change", renderProjectList);
  ui.sortBy.addEventListener("change", renderProjectList);
  ui.sampleDataBtn.addEventListener("click", initSampleData);

  // Specific listeners for select interactions (Heat, Priority, etc)
  // 'change' event is needed for <select> to trigger immediate save
  [
    ui.statusInput,
    ui.priorityInput,
    document.getElementById("heatInput"),
  ].forEach(input => {
    if (!input) return;
    input.addEventListener("change", () => {
      updateProjectFromForm();
      if (entraSettings.autoSync) forceSaveToOneDrive();
    });
  });

  // Text inputs - blur triggers immediate save
  const heatInput = document.getElementById("heatInput"); // Kept for reference if it becomes input later
  const resumeMemoInput = document.getElementById("resumeMemoInput");
  const contextSnapshotInput = document.getElementById("contextSnapshotInput");
  const stuckReasonInput = document.getElementById("stuckReasonInput");

  [
    ui.titleInput,
    ui.summaryInput,
    ui.tagsInput,
    ui.dueDateInput,
    stuckReasonInput,
    resumeMemoInput,
    contextSnapshotInput
  ].forEach(input => {
    if (!input) return;
    input.addEventListener("input", updateProjectFromForm);
    input.addEventListener("blur", () => {
      updateProjectFromForm();
      if (entraSettings.autoSync) forceSaveToOneDrive();
    });
  });

  document.addEventListener("keydown", (event) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      ui.globalSearch.focus();
    }
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      createProject();
    }
    if (event.key.toLowerCase() === "v" && modifier && event.shiftKey) {
      event.preventDefault();
      createFromClipboard();
    }
  });

  // View toggle (Phase 2)
  const viewCardBtn = document.getElementById('viewCardBtn');
  const viewTableBtn = document.getElementById('viewTableBtn');
  if (viewCardBtn) viewCardBtn.addEventListener('click', () => switchView('card'));
  if (viewTableBtn) viewTableBtn.addEventListener('click', () => switchView('table'));
}

function updateEntraButtonsVisibility() {
  const isAutoSync = entraSettings.autoSync;
  if (ui.entraLoadBtn) ui.entraLoadBtn.style.display = isAutoSync ? 'none' : 'inline-flex';
  if (ui.entraSaveBtn) ui.entraSaveBtn.style.display = isAutoSync ? 'none' : 'inline-flex';
}

async function init() {
  loadSettings();
  loadEntraSettings();
  renderEntraSettings();
  if (ui.entraAutoSyncToggle) ui.entraAutoSyncToggle.checked = entraSettings.autoSync;
  updateEntraButtonsVisibility();
  loadState();
  if (!state.projects.length) {
    ui.sampleDataBtn.style.display = "inline-flex";
  }
  render();
  bindEvents();

  // Auto-load from OneDrive on startup (Ippo Dashboard pattern)
  if (entraSettings.autoSync && entraSettings.clientId && navigator.onLine) {
    addLog("起動時自動同期: OneDriveからデータを読み込み中...", "info");
    try {
      await loadFromOneDrive();
    } catch (err) {
      console.warn("Auto-load from OneDrive failed:", err);
    }
  }

  updateSyncIndicator();
}

// ==========================================
// AI Coach (Manual AI Bridge)
// ==========================================

/**
 * Generate an AI coaching prompt for the selected project
 * Uses clipboard-based "Manual AI Bridge" pattern from SEED v5
 */
function generateAiCoachPrompt(project) {
  if (!project) return null;

  const pendingActions = project.nextActions
    .filter(a => !a.done)
    .map(a => `- ${a.text}`)
    .join('\n');

  const completedActions = project.nextActions
    .filter(a => a.done)
    .map(a => `- ${a.text}`)
    .join('\n');

  const prompt = `
## 相談: ${project.title}

### 現在の状況
- **ステータス**: ${STATUS_LABELS[project.status] || project.status}
- **熱量**: ${'🔥'.repeat(parseInt(project.heat || 2))}
- **優先度**: ${PRIORITY_LABELS[project.priority] || project.priority}
- **期限**: ${project.dueDate || '未設定'}

### 概要
${project.summary || '(未記入)'}

### やりかけのこと (未完了タスク)
${pendingActions || '(なし)'}

### 完了したこと
${completedActions || '(なし)'}

### 停滞理由
${project.stuckReason || '(なし)'}

### 再開時メモ
${project.resumeMemo || '(なし)'}

---

**質問**: このプロジェクトを前に進めるために、次に何をすべきですか？
優先度を考慮して、具体的な1〜3個のアクションを提案してください。
`.trim();

  return prompt;
}

/**
 * Copy AI coaching prompt to clipboard
 */
async function askAiCoach() {
  const project = getSelectedProject();
  if (!project) {
    showToast('プロジェクトを選択してください');
    return;
  }

  const prompt = generateAiCoachPrompt(project);
  if (!prompt) return;

  try {
    await navigator.clipboard.writeText(prompt);
    showToast('💡 AIへの相談プロンプトをコピーしました！ChatGPT等に貼り付けてください');
    addLog(`AI相談プロンプト生成: ${project.title}`, 'success');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('コピーに失敗しました');
  }
}

// Expose for inline onclick or dynamic binding
window.askAiCoach = askAiCoach;

// ============================
// Phase 5: Hobby Project Ecosystem
// ============================

/**
 * Calculate project health score (0-100)
 * Based on: completed actions / total actions
 */
function calculateHealth(project) {
  const total = project.nextActions?.length || 0;
  if (total === 0) return 100; // No actions = healthy
  const done = project.nextActions.filter(a => a.done).length;
  return Math.round((done / total) * 100);
}

/**
 * Get all showcase (殿堂入り) projects
 */
function getShowcaseProjects() {
  return state.projects.filter(p => p.status === 'showcase' && !p.archived);
}

/**
 * Generate weekly activity summary
 */
function generateWeeklySummary() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentlyUpdated = state.projects.filter(p =>
    new Date(p.updatedAt) >= oneWeekAgo
  );
  const completed = recentlyUpdated.filter(p => p.status === 'done' || p.status === 'showcase');
  const newProjects = state.projects.filter(p =>
    new Date(p.createdAt) >= oneWeekAgo
  );

  return {
    updated: recentlyUpdated.length,
    completed: completed.length,
    newProjects: newProjects.length,
    mostActive: recentlyUpdated.sort((a, b) =>
      (parseInt(b.heat) || 2) - (parseInt(a.heat) || 2)
    ).slice(0, 3)
  };
}

/**
 * Export showcase projects as JSON for AI analysis
 */
function exportShowcase() {
  const showcaseItems = getShowcaseProjects().map(p => ({
    title: p.title,
    summary: p.summary,
    tags: p.tags,
    completedActions: p.nextActions?.filter(a => a.done).map(a => a.text) || [],
    completedAt: p.updatedAt,
    heat: p.heat
  }));

  const stats = {
    totalCompleted: showcaseItems.length,
    allTags: [...new Set(showcaseItems.flatMap(p => p.tags))],
    avgHeat: showcaseItems.length > 0
      ? (showcaseItems.reduce((sum, p) => sum + (parseInt(p.heat) || 2), 0) / showcaseItems.length).toFixed(1)
      : 0
  };

  return { showcaseItems, stats };
}

/**
 * Generate AI prompt from showcase for new idea generation
 */
function generateIdeaPrompt() {
  const { showcaseItems, stats } = exportShowcase();

  if (showcaseItems.length === 0) {
    return null;
  }

  const projectList = showcaseItems.map((p, i) =>
    `### ${i + 1}. ${p.title}
- 概要: ${p.summary || '(なし)'}
- タグ: ${p.tags.join(', ') || '(なし)'}
- 完了したこと: ${p.completedActions.slice(0, 5).join(', ') || '(なし)'}`
  ).join('\n\n');

  const prompt = `
# 🎨 私の完成プロジェクト一覧（趣味）

${projectList}

---

## 📊 統計
- 完成プロジェクト数: ${stats.totalCompleted}
- よく使うタグ: ${stats.allTags.join(', ')}
- 平均熱量: ${stats.avgHeat}🔥

---

## 質問

これらの完成プロジェクトを見て:

1. **傾向分析**: 私の興味・スキルの傾向はどう見えますか？
2. **次のアイデア**: これらを踏まえて、次に挑戦すると面白そうなプロジェクトを3つ提案してください
3. **発展形**: 既存プロジェクトを発展・拡張するアイデアはありますか？

具体的に、すぐ始められる形で提案してください！
`.trim();

  return prompt;
}

/**
 * Copy idea generation prompt to clipboard
 */
async function askForNewIdeas() {
  const prompt = generateIdeaPrompt();

  if (!prompt) {
    showToast('🏆 殿堂入りプロジェクトがありません。まずプロジェクトを完成させて殿堂入りにしましょう！');
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    showToast('🚀 アイデア生成プロンプトをコピーしました！AIに貼り付けて新しいプロジェクトアイデアをもらおう');
    addLog(`アイデア生成プロンプト: ${getShowcaseProjects().length}件の殿堂入りから生成`, 'success');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('コピーに失敗しました');
  }
}

/**
 * Generate reflection prompt for weekly review
 */
function generateReflectionPrompt() {
  const summary = generateWeeklySummary();

  const activeList = summary.mostActive.map(p =>
    `- ${p.title} (熱量: ${'🔥'.repeat(parseInt(p.heat) || 2)})`
  ).join('\n');

  const prompt = `
# 📅 今週の振り返り

## 今週の活動
- 更新したプロジェクト: ${summary.updated}件
- 完成したプロジェクト: ${summary.completed}件
- 新しく始めたプロジェクト: ${summary.newProjects}件

## 最もアクティブなプロジェクト
${activeList || '(なし)'}

---

## 質問

1. 今週一番楽しかった作業は何でしたか？
2. 来週の休みにやりたいことは？
3. 停滞しているプロジェクトはどう動かす？

気楽に、趣味だから楽しむことを最優先で！
`.trim();

  return prompt;
}

/**
 * Copy weekly reflection prompt to clipboard
 */
async function weeklyReflection() {
  const prompt = generateReflectionPrompt();

  try {
    await navigator.clipboard.writeText(prompt);
    showToast('📅 週間振り返りプロンプトをコピーしました！');
    addLog('週間振り返りプロンプト生成', 'success');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('コピーに失敗しました');
  }
}

// Expose Phase 5 functions
window.askForNewIdeas = askForNewIdeas;
window.weeklyReflection = weeklyReflection;
window.calculateHealth = calculateHealth;

// ============================
// OneDrive Settings Save (Corrected)
// ============================
function saveOneDriveSettings() {
  // Update global state
  entraSettings.clientId = ui.entraClientIdInput?.value || '';
  entraSettings.tenantId = ui.entraTenantIdInput?.value || 'common';
  entraSettings.drivePath = ui.entraDrivePathInput?.value || 'ProjectHub/projects.json';
  entraSettings.redirectUri = ui.entraRedirectUriInput?.value || window.location.origin + window.location.pathname;
  entraSettings.useAppFolder = ui.entraAppFolderToggle?.checked || false;
  entraSettings.autoSync = ui.entraAutoSyncToggle?.checked || false; // Default to false if unchecked

  // Persist to correct key
  persistEntraSettings();

  showToast('✅ OneDrive設定を保存しました');
  addLog('設定保存: OneDrive同期設定', 'success');

  // Update UI visibility based on new settings
  updateEntraButtonsVisibility();
}

// Function to load settings into UI (using existing loadEntraSettings logic)
function syncUiWithEntraSettings() {
  // Ensure settings are loaded from storage first
  loadEntraSettings();

  if (ui.entraClientIdInput) ui.entraClientIdInput.value = entraSettings.clientId || '';
  if (ui.entraTenantIdInput) ui.entraTenantIdInput.value = entraSettings.tenantId || 'common';
  if (ui.entraDrivePathInput) ui.entraDrivePathInput.value = entraSettings.drivePath || '';
  if (ui.entraRedirectUriInput) ui.entraRedirectUriInput.value = entraSettings.redirectUri || '';
  if (ui.entraAppFolderToggle) ui.entraAppFolderToggle.checked = entraSettings.useAppFolder || false;
  if (ui.entraAutoSyncToggle) ui.entraAutoSyncToggle.checked = entraSettings.autoSync || false;

  updateEntraButtonsVisibility();
}

// Bind save settings button
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', saveOneDriveSettings);
}

// Bind connect button
const entraConnectBtn = document.getElementById('entraConnectBtn');
if (entraConnectBtn) {
  entraConnectBtn.addEventListener('click', entraLogin);
}

// Check for existing MSAL session and update UI
async function checkExistingSession() {
  syncUiWithEntraSettings();

  // Only check if settings are configured
  if (!entraSettings.clientId) return;

  try {
    const msalApp = await ensureMsalInstance();
    if (!msalApp) return;

    const accounts = msalApp.getAllAccounts();
    if (accounts && accounts.length > 0) {
      const account = accounts[0];
      msalApp.setActiveAccount(account);
      if (ui.entraStatus) {
        ui.entraStatus.textContent = `接続中: ${account.username}`;
        ui.entraStatus.classList.remove('offline');
        ui.entraStatus.classList.add('connected');
      }
      addLog(`セッション復元: ${account.username}`, 'success');

      // Auto-load if enabled
      if (entraSettings.autoSync && navigator.onLine) {
        loadFromOneDrive();
      }
    }
  } catch (e) {
    console.log('No existing session:', e);
  }
}

// Load settings and check session on page load
document.addEventListener('DOMContentLoaded', checkExistingSession);

init();
