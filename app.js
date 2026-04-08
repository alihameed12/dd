(function () {
  "use strict";

  const STORAGE_KEY = "board-resolutions";

  // State
  let resolutions = loadResolutions();

  // DOM
  const listEl = document.getElementById("resolutionsList");
  const emptyStateEl = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const filterStatus = document.getElementById("filterStatus");
  const sortBy = document.getElementById("sortBy");
  const newBtn = document.getElementById("newResolutionBtn");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const form = document.getElementById("resolutionForm");
  const exportBtn = document.getElementById("exportBtn");
  const importInput = document.getElementById("importInput");

  // Form fields
  const fId = document.getElementById("resolutionId");
  const fNumber = document.getElementById("resNumber");
  const fTitle = document.getElementById("resTitle");
  const fDate = document.getElementById("resDate");
  const fStatus = document.getElementById("resStatus");
  const fVotesFor = document.getElementById("resVotesFor");
  const fVotesAgainst = document.getElementById("resVotesAgainst");
  const fProposedBy = document.getElementById("resProposedBy");
  const fContent = document.getElementById("resContent");

  // --- Persistence ---
  function loadResolutions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load resolutions:", e);
      return [];
    }
  }

  function saveResolutions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolutions));
  }

  // --- Rendering ---
  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const statusFilter = filterStatus.value;
    const sort = sortBy.value;

    let filtered = resolutions.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!query) return true;
      return (
        r.title.toLowerCase().includes(query) ||
        r.number.toLowerCase().includes(query) ||
        r.content.toLowerCase().includes(query)
      );
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case "date-asc": return a.date.localeCompare(b.date);
        case "date-desc": return b.date.localeCompare(a.date);
        case "number-asc": return a.number.localeCompare(b.number);
        case "title-asc": return a.title.localeCompare(b.title);
        default: return 0;
      }
    });

    updateStats();

    // Clear existing cards (keep the empty state element)
    listEl.querySelectorAll(".resolution-card").forEach((el) => el.remove());

    if (filtered.length === 0) {
      emptyStateEl.style.display = "";
      if (resolutions.length > 0) {
        emptyStateEl.querySelector("h2").textContent = "No matching resolutions";
        emptyStateEl.querySelector("p").textContent = "Try adjusting your search or filters.";
      } else {
        emptyStateEl.querySelector("h2").textContent = "No resolutions yet";
        emptyStateEl.querySelector("p").textContent = 'Click "New Resolution" to record your first board resolution.';
      }
      return;
    }

    emptyStateEl.style.display = "none";
    filtered.forEach((r) => listEl.appendChild(renderCard(r)));
  }

  function renderCard(r) {
    const card = document.createElement("article");
    card.className = `resolution-card status-${r.status}`;

    const head = document.createElement("div");
    head.className = "resolution-head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "resolution-title";
    title.textContent = `#${r.number} — ${r.title}`;
    titleWrap.appendChild(title);

    const badge = document.createElement("span");
    badge.className = `status-badge ${r.status}`;
    badge.textContent = r.status;

    head.appendChild(titleWrap);
    head.appendChild(badge);

    const meta = document.createElement("p");
    meta.className = "resolution-meta";
    const parts = [
      `<span>Date: ${escapeHtml(r.date)}</span>`,
      r.proposedBy ? `<span>Proposed by: ${escapeHtml(r.proposedBy)}</span>` : "",
      `<span>Votes: ${r.votesFor} for / ${r.votesAgainst} against</span>`,
    ].filter(Boolean);
    meta.innerHTML = parts.join("");

    const content = document.createElement("p");
    content.className = "resolution-content";
    content.textContent = r.content;

    const actions = document.createElement("div");
    actions.className = "resolution-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openModal(r.id));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteResolution(r.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(content);
    card.appendChild(actions);

    return card;
  }

  function updateStats() {
    document.getElementById("statTotal").textContent = resolutions.length;
    document.getElementById("statPassed").textContent = resolutions.filter((r) => r.status === "passed").length;
    document.getElementById("statPending").textContent = resolutions.filter((r) => r.status === "pending").length;
    document.getElementById("statRejected").textContent = resolutions.filter((r) => r.status === "rejected").length;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Modal / CRUD ---
  function openModal(id) {
    if (id) {
      const r = resolutions.find((x) => x.id === id);
      if (!r) return;
      modalTitle.textContent = "Edit Resolution";
      fId.value = r.id;
      fNumber.value = r.number;
      fTitle.value = r.title;
      fDate.value = r.date;
      fStatus.value = r.status;
      fVotesFor.value = r.votesFor;
      fVotesAgainst.value = r.votesAgainst;
      fProposedBy.value = r.proposedBy || "";
      fContent.value = r.content;
    } else {
      modalTitle.textContent = "New Resolution";
      form.reset();
      fId.value = "";
      fDate.value = new Date().toISOString().slice(0, 10);
      fVotesFor.value = 0;
      fVotesAgainst.value = 0;
    }
    modal.classList.remove("hidden");
    fNumber.focus();
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  function handleSubmit(e) {
    e.preventDefault();
    const id = fId.value || generateId();
    const data = {
      id,
      number: fNumber.value.trim(),
      title: fTitle.value.trim(),
      date: fDate.value,
      status: fStatus.value,
      votesFor: parseInt(fVotesFor.value, 10) || 0,
      votesAgainst: parseInt(fVotesAgainst.value, 10) || 0,
      proposedBy: fProposedBy.value.trim(),
      content: fContent.value.trim(),
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = resolutions.findIndex((r) => r.id === id);
    if (existingIndex >= 0) {
      resolutions[existingIndex] = { ...resolutions[existingIndex], ...data };
    } else {
      data.createdAt = new Date().toISOString();
      resolutions.push(data);
    }

    saveResolutions();
    render();
    closeModal();
  }

  function deleteResolution(id) {
    const r = resolutions.find((x) => x.id === id);
    if (!r) return;
    if (!confirm(`Delete resolution #${r.number} — "${r.title}"?`)) return;
    resolutions = resolutions.filter((x) => x.id !== id);
    saveResolutions();
    render();
  }

  function generateId() {
    return "res-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // --- Import / Export ---
  function exportJson() {
    const blob = new Blob([JSON.stringify(resolutions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-resolutions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error("Expected an array");
        const valid = data.filter(
          (r) => r && typeof r.title === "string" && typeof r.number === "string"
        );
        if (valid.length === 0) {
          alert("No valid resolutions found in file.");
          return;
        }
        if (!confirm(`Import ${valid.length} resolution(s)? This will merge with existing data.`)) return;

        // Merge by id, or add new ids if missing
        valid.forEach((r) => {
          if (!r.id) r.id = generateId();
          const idx = resolutions.findIndex((x) => x.id === r.id);
          if (idx >= 0) resolutions[idx] = r;
          else resolutions.push(r);
        });
        saveResolutions();
        render();
      } catch (err) {
        alert("Failed to import: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // --- Event listeners ---
  newBtn.addEventListener("click", () => openModal());
  closeModalBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
  form.addEventListener("submit", handleSubmit);
  searchInput.addEventListener("input", render);
  filterStatus.addEventListener("change", render);
  sortBy.addEventListener("change", render);
  exportBtn.addEventListener("click", exportJson);
  importInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importJson(file);
    e.target.value = "";
  });

  // Initial render
  render();
})();
