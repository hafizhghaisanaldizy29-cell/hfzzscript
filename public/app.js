const $ = (id) => document.getElementById(id);

let currentUser = null;
let csrfToken = null;
let authMode = "login";
let editingScriptId = null;
let showingMine = false;

const api = async (url, options = {}) => {
    const headers = {
        ...(options.headers || {})
    };

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    if (["POST", "PUT", "DELETE"].includes(options.method)) {
        headers["X-CSRF-Token"] = csrfToken || "";
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "same-origin"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Terjadi kesalahan.");
    }

    return data;
};

// TOAST
function toast(message) {
    const container = $("toastContainer");
    const item = document.createElement("div");

    item.className = "toast";
    item.textContent = message;

    container.appendChild(item);

    setTimeout(() => {
        item.remove();
    }, 3500);
}

// MODAL
function openModal(id) {
    $(id).classList.remove("hidden");
}

function closeModal(id) {
    $(id).classList.add("hidden");
}

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => {
        closeModal(button.dataset.close);
    });
});

document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.classList.add("hidden");
        }
    });
});

// AUTH INTERFACE
function updateAuthUI() {
    const loggedIn = Boolean(currentUser);

    $("loginBtn").classList.toggle("hidden", loggedIn);
    $("registerBtn").classList.toggle("hidden", loggedIn);
    $("userMenuBtn").classList.toggle("hidden", !loggedIn);
    $("logoutBtn").classList.toggle("hidden", !loggedIn);

    if (loggedIn) {
        $("userMenuBtn").textContent = currentUser.username;
    } else {
        $("userMenuBtn").textContent = "";
    }
}

// OPEN LOGIN
function openAuth(mode = "login") {
    authMode = mode;

    $("authForm").reset();
    updateAuthMode();

    openModal("authModal");
}

function updateAuthMode() {
    const isLogin = authMode === "login";

    $("authTitle").textContent = isLogin
        ? "Welcome Back"
        : "Create Account";

    $("authDescription").textContent = isLogin
        ? "Login ke akun HfzzScript kamu."
        : "Buat akun baru untuk bergabung.";

    $("authSubmit").textContent = isLogin
        ? "Login"
        : "Register";

    $("authSwitch").firstChild.textContent = isLogin
        ? "Belum punya akun? "
        : "Sudah punya akun? ";

    $("switchAuth").textContent = isLogin
        ? "Register"
        : "Login";
}

$("loginBtn").addEventListener("click", () => {
    openAuth("login");
});

$("registerBtn").addEventListener("click", () => {
    openAuth("register");
});

$("switchAuth").addEventListener("click", () => {
    authMode = authMode === "login"
        ? "register"
        : "login";

    updateAuthMode();
});

// LOGIN / REGISTER
$("authForm").addEventListener("submit", async event => {
    event.preventDefault();

    const username = $("authUsername").value.trim();
    const password = $("authPassword").value;

    const endpoint = authMode === "login"
        ? "/api/login"
        : "/api/register";

    const button = $("authSubmit");

    button.disabled = true;
    button.textContent = "Please wait...";

    try {
        const data = await api(endpoint, {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        });

        currentUser = data.user;
        csrfToken = data.csrfToken;

        closeModal("authModal");
        updateAuthUI();

        toast(data.message);

        await loadScripts();

    } catch (error) {
        toast(error.message);

    } finally {
        button.disabled = false;
        updateAuthMode();
    }
});

// LOGOUT
$("logoutBtn").addEventListener("click", async () => {
    try {
        await api("/api/logout", {
            method: "POST"
        });

        currentUser = null;
        csrfToken = null;

        updateAuthUI();
        showingMine = false;

        toast("Berhasil logout.");

        await initialize();

    } catch (error) {
        toast(error.message);
    }
});

// PUBLISH BUTTONS
function openPublish() {
    if (!currentUser) {
        toast("Login terlebih dahulu untuk publish script.");
        openAuth("login");
        return;
    }

    editingScriptId = null;

    $("scriptForm").reset();

    $("editorTitle").textContent = "Publish New Script";
    $("saveScriptBtn").textContent = "Publish Script";

    openModal("editorModal");
}

$("publishBtn").addEventListener("click", openPublish);

$("heroPublishBtn").addEventListener("click", openPublish);

// SCRIPT FORM
$("scriptForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        toast("Silakan login terlebih dahulu.");
        return;
    }

    const payload = {
        title: $("scriptTitle").value.trim(),
        description: $("scriptDescription").value.trim(),
        code: $("scriptCode").value,
        game: $("scriptGame").value,
        category: $("scriptCategory").value
    };

    const button = $("saveScriptBtn");

    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const editing = Boolean(editingScriptId);

        const endpoint = editing
            ? `/api/scripts/${editingScriptId}`
            : "/api/scripts";

        const data = await api(endpoint, {
            method: editing ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });

        closeModal("editorModal");

        toast(data.message);

        editingScriptId = null;

        await loadScripts();

    } catch (error) {
        toast(error.message);

    } finally {
        button.disabled = false;

        button.textContent = editingScriptId
            ? "Save Changes"
            : "Publish Script";
    }
});

// CREATE ELEMENT
function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

// SCRIPT CARD
function createScriptCard(script) {
    const card = createElement("article", "script-card");

    const tags = createElement("div", "script-tags");

    tags.append(
        createElement("span", "tag", script.game),
        createElement("span", "tag", script.category)
    );

    const title = createElement("h3", "", script.title);

    const description = createElement(
        "p",
        "",
        script.description || "Tidak ada deskripsi."
    );

    const footer = createElement("div", "script-footer");

    const owner = createElement(
        "span",
        "",
        "By " + script.ownerUsername
    );

    const date = createElement(
        "span",
        "",
        new Date(script.createdAt).toLocaleDateString("id-ID")
    );

    footer.append(owner, date);

    const button = createElement(
        "button",
        "btn-primary full",
        "View Script"
    );

    button.addEventListener("click", () => {
        openDetail(script.id);
    });

    card.append(
        tags,
        title,
        description,
        footer,
        button
    );

    return card;
}

// LOAD SCRIPTS
async function loadScripts() {
    const grid = $("scriptsGrid");

    grid.replaceChildren();

    const params = new URLSearchParams();

    const search = $("searchInput").value.trim();
    const game = $("gameFilter").value;
    const category = $("categoryFilter").value;

    if (search) params.set("search", search);
    if (game) params.set("game", game);
    if (category) params.set("category", category);
    if (showingMine) params.set("mine", "true");

    try {
        const data = await api(
            "/api/scripts?" + params.toString()
        );

        if (data.scripts.length === 0) {
            $("emptyState").classList.remove("hidden");
        } else {
            $("emptyState").classList.add("hidden");

            data.scripts.forEach(script => {
                grid.appendChild(createScriptCard(script));
            });
        }

    } catch (error) {
        toast(error.message);
    }
}

// SCRIPT DETAIL
async function openDetail(id) {
    try {
        const data = await api(`/api/scripts/${id}`);

        const script = data.script;
        const container = $("scriptDetail");

        container.replaceChildren();

        const title = createElement("h2", "", script.title);

        const description = createElement(
            "p",
            "",
            script.description || "Tidak ada deskripsi."
        );

        const information = createElement(
            "p",
            "",
            `${script.game} • ${script.category} • By ${script.ownerUsername}`
        );

        const code = createElement("pre", "detail-code");
        code.textContent = script.code;

        const actions = createElement("div", "detail-actions");

        const copyButton = createElement(
            "button",
            "btn-primary",
            "Copy Code"
        );

        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(script.code);
                toast("Script berhasil disalin!");
            } catch {
                toast("Gagal menyalin script.");
            }
        });

        actions.appendChild(copyButton);

        if (
            currentUser &&
            currentUser.id === script.ownerId
        ) {
            const editButton = createElement(
                "button",
                "btn-outline",
                "Edit"
            );

            editButton.addEventListener("click", () => {
                closeModal("detailModal");
                openEditor(script);
            });

            const deleteButton = createElement(
                "button",
                "btn-outline",
                "Delete"
            );

            deleteButton.addEventListener("click", async () => {
                if (!confirm("Yakin ingin menghapus script ini?")) {
                    return;
                }

                try {
                    const result = await api(
                        `/api/scripts/${script.id}`,
                        { method: "DELETE" }
                    );

                    closeModal("detailModal");

                    toast(result.message);

                    await loadScripts();

                } catch (error) {
                    toast(error.message);
                }
            });

            actions.append(editButton, deleteButton);
        }

        container.append(
            title,
            description,
            information,
            code,
            actions
        );

        openModal("detailModal");

    } catch (error) {
        toast(error.message);
    }
}

// EDIT SCRIPT
function openEditor(script) {
    if (!currentUser) {
        toast("Login terlebih dahulu.");
        return;
    }

    editingScriptId = script.id;

    $("editorTitle").textContent = "Edit Script";
    $("saveScriptBtn").textContent = "Save Changes";

    $("scriptTitle").value = script.title;
    $("scriptDescription").value = script.description;
    $("scriptCode").value = script.code;
    $("scriptGame").value = script.game;
    $("scriptCategory").value = script.category;

    openModal("editorModal");
}

// SEARCH
let searchTimer;

$("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(loadScripts, 350);
});

$("gameFilter").addEventListener("change", loadScripts);

$("categoryFilter").addEventListener("change", loadScripts);

// MY SCRIPTS
$("myScriptsBtn").addEventListener("click", () => {
    if (!currentUser) {
        toast("Login terlebih dahulu.");
        openAuth("login");
        return;
    }

    showingMine = !showingMine;

    $("myScriptsBtn").textContent = showingMine
        ? "All Scripts"
        : "My Scripts";

    loadScripts();
});

// STATISTICS
async function loadStats() {
    try {
        const data = await api("/api/scripts");

        $("scriptCount").textContent = data.scripts.length;

        const creators = new Set(
            data.scripts.map(script => script.ownerUsername)
        );

        $("userCount").textContent = creators.size;

    } catch {
        $("scriptCount").textContent = "0";
        $("userCount").textContent = "0";
    }
}

// INITIALIZE
async function initialize() {
    try {
        const data = await api("/api/session");

        currentUser = data.user;
        csrfToken = data.csrfToken;

        updateAuthUI();

        await loadScripts();
        await loadStats();

    } catch (error) {
        toast("Gagal menghubungkan ke server.");
    }
}

initialize();
