const STORAGE_KEY = "projectHubData";
const SETTINGS_KEY = "projectHubSettings";
const ENTRA_SETTINGS_KEY = "projectHubEntraSettings";
const DB_NAME = "projectHubDB";
const DB_VERSION = 1;
const ATTACH_STORE = "attachments";
const HANDLE_STORE = "handles";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const EXPORT_ATTACHMENT_LIMIT = 1024 * 1024;

const state = {
  projects: [],
  selectedId: null,
};

const settings = {
  autoSync: false,
  lastSyncPath: null,
};

const entraSettings = {
  clientId: "",
  tenantId: "common",
  drivePath: "ProjectHub/projects.json",
};

let syncHandle = null;
let dbPromise = null;
let saveDebounce = null;
let syncDebounce = null;
let msalInstance = null;

const ui = {
  projectList: document.getElementById("projectList"),
  globalSearch: document.getElementById("globalSearch"),
  statusFilter: document.getElementById("statusFilter"),
  sortBy: document.getElementById("sortBy"),
  sampleDataBtn: document.getElementById("sampleDataBtn"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
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
  fileInput: document.getElementById("fileInput"),
  attachmentsList: document.getElementById("attachmentsList"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  pickSyncFileBtn: document.getElementById("pickSyncFileBtn"),
  loadSyncBtn: document.getElementById("loadSyncBtn"),
  saveSyncBtn: document.getElementById("saveSyncBtn"),
  autoSyncToggle: document.getElementById("autoSyncToggle"),
  syncStatus: document.getElementById("syncStatus"),
  exportMetaBtn: document.getElementById("exportMetaBtn"),
  exportFullBtn: document.getElementById("exportFullBtn"),
  importInput: document.getElementById("importInput"),
  toast: document.getElementById("toast"),
  entraLoginBtn: document.getElementById("entraLoginBtn"),
  entraLogoutBtn: document.getElementById("entraLogoutBtn"),
  entraLoadBtn: document.getElementById("entraLoadBtn"),
  entraSaveBtn: document.getElementById("entraSaveBtn"),
  entraStatus: document.getElementById("entraStatus"),
};

const STATUS_LABELS = {
  idea: "アイデア",
  active: "進行中",
  stuck: "停滞",
  done: "完了",
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
    state.projects = parsed.projects || [];
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
    settings.lastSyncPath = parsed.lastSyncPath || null;
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
    })
  );
}

function persistSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      autoSync: settings.autoSync,
      lastSyncPath: settings.lastSyncPath,
    })
  );
}

function scheduleSave() {
  if (saveDebounce) window.clearTimeout(saveDebounce);
  saveDebounce = window.setTimeout(() => {
    persistState();
    if (settings.autoSync) scheduleSyncSave();
  }, 400);
}

function scheduleSyncSave() {
  if (syncDebounce) window.clearTimeout(syncDebounce);
  syncDebounce = window.setTimeout(() => {
    saveToSyncFile();
  }, 1200);
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
    dueDate: "",
    stuckReason: "",
    nextActions: [],
    links: [],
    attachments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.projects.unshift(newProject);
  setSelected(newProject.id);
}

function deleteProject() {
  const project = getSelectedProject();
  if (!project) return;
  if (!confirm("このプロジェクトを削除しますか？")) return;
  state.projects = state.projects.filter((item) => item.id !== project.id);
  state.selectedId = state.projects[0]?.id || null;
  scheduleSave();
  render();
}

function updateProjectFromForm() {
  const project = getSelectedProject();
  if (!project) return;
  if (!ui.titleInput.value.trim()) {
    showToast("タイトルは必須です。");
    return;
  }
  updateProject(project, {
    title: ui.titleInput.value.trim(),
    summary: ui.summaryInput.value.trim(),
    tags: ui.tagsInput.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    status: ui.statusInput.value,
    priority: ui.priorityInput.value,
    dueDate: ui.dueDateInput.value,
    stuckReason: ui.stuckReasonInput.value.trim(),
  });
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
  updateProject(project, { nextActions: project.nextActions });
}

function updateNextAction(actionId, updates) {
  const project = getSelectedProject();
  if (!project) return;
  const action = project.nextActions.find((item) => item.id === actionId);
  if (!action) return;
  Object.assign(action, updates, { updatedAt: nowIso() });
  updateProject(project, { nextActions: project.nextActions });
}

function deleteNextAction(actionId) {
  const project = getSelectedProject();
  if (!project) return;
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
  ui.linkLabelInput.value = "";
  ui.linkUrlInput.value = "";
  updateProject(project, { links: project.links });
}

function deleteLink(linkId) {
  const project = getSelectedProject();
  if (!project) return;
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
}

async function removeAttachment(attachmentId) {
  const project = getSelectedProject();
  if (!project) return;
  const target = project.attachments.find((att) => att.id === attachmentId);
  if (!target) return;
  if (!confirm("この添付ファイルを削除しますか？")) return;
  project.attachments = project.attachments.filter((att) => att.id !== attachmentId);
  if (target.stored) await deleteAttachmentBlob(target.id);
  updateProject(project, { attachments: project.attachments });
  ui.attachmentPreview.innerHTML = "<p>ファイルを選択するとプレビューが表示されます。</p>";
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
  if (sortBy === "priority") {
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

function renderProjectList() {
  const query = ui.globalSearch.value.trim();
  const statusFilter = ui.statusFilter.value;
  const sortBy = ui.sortBy.value;
  const filtered = state.projects.filter((project) => {
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
        <span class="${isOverdue ? "due-over" : ""}">期限: ${project.dueDate || "-"}</span>
        <span>未完了: ${pendingActions}</span>
      </div>
      <div class="meta">更新: ${formatDate(project.updatedAt)}</div>
      <div class="meta">
        ${project.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
    `;
    if (project.status === "stuck") {
      card.style.borderColor = "#fca5a5";
    }
    card.addEventListener("click", () => setSelected(project.id));
    ui.projectList.appendChild(card);
  });
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
  project.links.forEach((link) => {
    const item = document.createElement("li");
    item.className = "link-item";
    item.innerHTML = `
      <span>${link.label}</span>
      <a href="${link.url}" target="_blank" rel="noopener">開く</a>
      <div class="actions">
        <button class="ghost" data-action="copy">コピー</button>
        <button class="ghost" data-action="delete">削除</button>
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
    state.projects = payload.projects || [];
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

async function ensureSyncHandle() {
  if (syncHandle) return syncHandle;
  syncHandle = await loadSyncHandle();
  return syncHandle;
}

async function pickSyncFile() {
  if (!window.showOpenFilePicker && !window.showSaveFilePicker) {
    showToast("このブラウザは同期機能に対応していません。");
    return;
  }
  try {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        multiple: false,
      });
      syncHandle = handle;
    } else {
      syncHandle = await window.showSaveFilePicker({
        suggestedName: "projects.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
    }
    await saveSyncHandle(syncHandle);
    ui.syncStatus.textContent = "同期ファイルを設定しました。";
  } catch (error) {
    console.error(error);
    showToast("同期ファイルの選択に失敗しました。");
  }
}

async function loadFromSyncFile() {
  const handle = await ensureSyncHandle();
  if (!handle) {
    showToast("同期ファイルが未設定です。");
    return;
  }
  try {
    const file = await handle.getFile();
    await importData(file);
    ui.syncStatus.textContent = "同期ファイルを読み込みました。";
  } catch (error) {
    console.error(error);
    showToast("同期ファイルの読み込みに失敗しました。");
  }
}

async function saveToSyncFile() {
  const handle = await ensureSyncHandle();
  if (!handle) return;
  try {
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      showToast("同期ファイルへの権限がありません。");
      return;
    }
    const payload = await buildExportPayload(false);
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    ui.syncStatus.textContent = "同期ファイルへ保存しました。";
  } catch (error) {
    console.error(error);
    showToast("同期ファイルへの保存に失敗しました。");
  }
}

function ensureMsalInstance() {
  if (!window.msal) {
    showToast("MSALが読み込まれていません。ネットワーク接続を確認してください。");
    return null;
  }
  if (msalInstance) return msalInstance;
  msalInstance = new window.msal.PublicClientApplication({
    auth: {
      clientId: entraSettings.clientId,
      authority: `https://login.microsoftonline.com/${entraSettings.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "localStorage" },
  });
  return msalInstance;
}

function ensureEntraConfig() {
  if (!entraSettings.clientId) {
    entraSettings.clientId = prompt("EntraアプリのClient IDを入力してください")?.trim() || "";
  }
  if (!entraSettings.tenantId) {
    entraSettings.tenantId = "common";
  }
  if (!entraSettings.drivePath) {
    entraSettings.drivePath = "ProjectHub/projects.json";
  }
  if (!entraSettings.clientId) {
    showToast("Client IDが設定されていません。");
    return false;
  }
  persistEntraSettings();
  return true;
}

async function entraLogin() {
  if (!ensureEntraConfig()) return;
  const msalApp = ensureMsalInstance();
  if (!msalApp) return;
  try {
    const result = await msalApp.loginPopup({
      scopes: ["User.Read", "Files.ReadWrite"],
    });
    msalApp.setActiveAccount(result.account);
    ui.entraStatus.textContent = `サインイン中: ${result.account.username}`;
  } catch (error) {
    console.error(error);
    showToast("サインインに失敗しました。");
  }
}

async function entraLogout() {
  if (!msalInstance) return;
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) return;
  await msalInstance.logoutPopup({ account });
  ui.entraStatus.textContent = "未サインイン";
}

async function getGraphToken() {
  if (!ensureEntraConfig()) return null;
  const msalApp = ensureMsalInstance();
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
    throw new Error(`Graph API error: ${response.status}`);
  }
  return response;
}

async function loadFromOneDrive() {
  try {
    const path = encodeURIComponent(entraSettings.drivePath);
    const response = await graphRequest(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`
    );
    if (!response) return;
    const blob = await response.blob();
    await importData(blob);
    ui.entraStatus.textContent = "OneDriveから読み込みました。";
  } catch (error) {
    console.error(error);
    showToast("OneDrive読み込みに失敗しました。");
  }
}

async function saveToOneDrive() {
  try {
    const path = encodeURIComponent(entraSettings.drivePath);
    const payload = await buildExportPayload(false);
    await graphRequest(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload, null, 2),
    });
    ui.entraStatus.textContent = "OneDriveへ保存しました。";
  } catch (error) {
    console.error(error);
    showToast("OneDrive保存に失敗しました。");
  }
}

function render() {
  renderProjectList();
  renderProjectDetail();
  ui.sampleDataBtn.style.display = state.projects.length ? "none" : "inline-flex";
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
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.projects = [sample];
  state.selectedId = sample.id;
  scheduleSave();
  render();
}

function bindEvents() {
  ui.newProjectBtn.addEventListener("click", createProject);
  ui.deleteProjectBtn.addEventListener("click", deleteProject);
  ui.globalSearch.addEventListener("input", renderProjectList);
  ui.statusFilter.addEventListener("change", renderProjectList);
  ui.sortBy.addEventListener("change", renderProjectList);
  ui.sampleDataBtn.addEventListener("click", initSampleData);

  [
    ui.titleInput,
    ui.summaryInput,
    ui.tagsInput,
    ui.statusInput,
    ui.priorityInput,
    ui.dueDateInput,
    ui.stuckReasonInput,
  ].forEach((input) => {
    input.addEventListener("input", updateProjectFromForm);
    input.addEventListener("change", updateProjectFromForm);
  });

  ui.addActionBtn.addEventListener("click", () => {
    addNextAction(ui.quickActionInput.value);
    ui.quickActionInput.value = "";
  });

  ui.quickActionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addNextAction(ui.quickActionInput.value);
      ui.quickActionInput.value = "";
    }
  });

  ui.copyIncompleteBtn.addEventListener("click", () => copyText(buildCopyText(false)));
  ui.copyAllBtn.addEventListener("click", () => copyText(buildCopyText(true)));
  ui.copySummaryBtn.addEventListener("click", () => copyText(buildSummaryCopy()));

  ui.addLinkBtn.addEventListener("click", addLink);

  ui.fileInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) handleFiles(files);
    ui.fileInput.value = "";
  });

  ui.pickSyncFileBtn.addEventListener("click", pickSyncFile);
  ui.loadSyncBtn.addEventListener("click", loadFromSyncFile);
  ui.saveSyncBtn.addEventListener("click", saveToSyncFile);
  ui.autoSyncToggle.addEventListener("change", () => {
    settings.autoSync = ui.autoSyncToggle.checked;
    persistSettings();
    if (settings.autoSync) scheduleSyncSave();
  });

  ui.exportMetaBtn.addEventListener("click", () => exportData(false));
  ui.exportFullBtn.addEventListener("click", () => exportData(true));
  ui.importInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importData(file);
    ui.importInput.value = "";
  });

  ui.entraLoginBtn.addEventListener("click", entraLogin);
  ui.entraLogoutBtn.addEventListener("click", entraLogout);
  ui.entraLoadBtn.addEventListener("click", loadFromOneDrive);
  ui.entraSaveBtn.addEventListener("click", saveToOneDrive);

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
  });
}

async function init() {
  loadSettings();
  loadEntraSettings();
  ui.autoSyncToggle.checked = settings.autoSync;
  loadState();
  syncHandle = await loadSyncHandle();
  if (syncHandle) {
    ui.syncStatus.textContent = "同期ファイルが設定されています。";
  }
  if (!state.projects.length) {
    ui.sampleDataBtn.style.display = "inline-flex";
  }
  render();
  bindEvents();
}

init();
