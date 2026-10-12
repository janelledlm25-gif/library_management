let users = [];
let books = [];
let transactions = [];
let logHistory = [];
let activeLogId = null;
let currentUserEmail = null;
let currentUserId = null;
let currentUser = null; // TODO: load logged-in user from backend / session

const loginPage = document.getElementById("loginPage");
const app = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const pwInput = document.getElementById("password");
const dateTimeElement = document.getElementById("datetime");
const currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, "/");
const isFilePage = window.location.protocol === "file:";
const isAdminRoute = currentPath.startsWith("/admin/") || /\/public\/admin\//i.test(currentPath);
function pageUrl(publicPath) {
  if (!isFilePage) return `/${publicPath}`;
  const publicMarker = currentPath.toLowerCase().lastIndexOf("/public/");
  if (publicMarker >= 0) {
    const currentPublicPath = currentPath.slice(publicMarker + 8);
    const currentDirectory = currentPublicPath.includes("/") ? currentPublicPath.slice(0, currentPublicPath.lastIndexOf("/") + 1) : "";
    const depth = currentDirectory.split("/").filter(Boolean).length;
    return new URL(`${"../".repeat(depth)}${publicPath}`, window.location.href).href;
  }
  return new URL(`public/${publicPath}`, window.location.href).href;
}
function loginPageUrl() { return pageUrl("index.html"); }
function homeForRole(role) { return pageUrl(["admin", "librarian"].includes(role) ? "admin/home.html" : "portal/home.html"); }
function forceChangePageUrl() { return pageUrl("force-change.html"); }
let dateTimeInterval = null;

function updateDateTime() {
  if (!dateTimeElement) return;
  dateTimeElement.textContent = new Date().toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila"
  }).replace(" at ", ", ");
}

updateDateTime();
if (!document.hidden) dateTimeInterval = setInterval(updateDateTime, 1000);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(dateTimeInterval);
    dateTimeInterval = null;
  } else {
    updateDateTime();
    if (!dateTimeInterval) dateTimeInterval = setInterval(updateDateTime, 1000);
  }
});

function manilaDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatHistoryTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const time = date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  return time;
}

function formatHistoryTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const now = new Date();
  const today = manilaDateKey(now);
  const yesterday = manilaDateKey(new Date(now.getTime() - 86400000));
  const dateKey = manilaDateKey(date);
  const time = formatHistoryTime(timestamp);

  if (dateKey === today) return `Today, ${time}`;
  if (dateKey === yesterday) return `Yesterday, ${time}`;
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).replace(" at ", ", ");
}

function getSortedTransactions() {
  return transactions
    .filter(transaction => ["borrowed", "returned"].includes(transaction.action) && !Number.isNaN(Date.parse(transaction.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || Number(b.id) - Number(a.id));
}

function transactionActionText(transaction) {
  const verb = transaction.action === "borrowed" ? "Borrowed" : "Returned";
  return `${verb} ${transaction.bookTitle}`;
}

async function renderTransactionViews() {
  let dashboard;
  try { dashboard = await api.get("/dashboard"); }
  catch (error) { console.error("Could not load dashboard activity:", error); return; }
  transactions = dashboard.recentActivity || [];
  const sortedTransactions = getSortedTransactions();
  const borrowedCount = document.getElementById("borrowedBooksCount");
  const returnedCount = document.getElementById("returnedBooksCount");
  const recentUser = document.getElementById("homeRecentUser");
  const recentAction = document.getElementById("homeRecentAction");
  const reportsList = document.getElementById("reportsActivityList");

  if (borrowedCount) borrowedCount.textContent = dashboard.borrowedBooks ?? 0;
  if (returnedCount) returnedCount.textContent = dashboard.returnedBooks ?? 0;
  const studentCount = document.querySelector("#page-home .card:first-child .big");
  const overdueCount = document.querySelector("#page-home .card:nth-child(3) .big");
  if (studentCount) studentCount.textContent = dashboard.studentsEnteredToday ?? 0;
  if (overdueCount) overdueCount.textContent = dashboard.overdueBooks ?? 0;

  if (recentUser && recentAction) {
    const latest = sortedTransactions[0];
    recentUser.textContent = latest ? latest.userName : "No recent activity yet.";
    recentAction.textContent = latest ? transactionActionText(latest) : "";
  }

  if (!reportsList) return;
  reportsList.replaceChildren();
  const recentTransactions = sortedTransactions.slice(0, 10);
  if (!recentTransactions.length) {
    const emptyRow = document.createElement("div");
    emptyRow.className = "list-item";
    const emptyText = document.createElement("span");
    emptyText.className = "muted small";
    emptyText.textContent = "No recent activity yet.";
    emptyRow.append(emptyText);
    reportsList.append(emptyRow);
    return;
  }

  recentTransactions.forEach(transaction => {
    const row = document.createElement("div");
    row.className = "list-item";
    const name = document.createElement("strong");
    name.textContent = transaction.userName || "Unknown user";
    const action = document.createElement("span");
    action.textContent = transactionActionText(transaction);
    const time = document.createElement("time");
    time.className = "transaction-time";
    time.dateTime = transaction.timestamp;
    time.textContent = formatHistoryTimestamp(transaction.timestamp);
    row.append(name, action, time);
    reportsList.append(row);
  });
}

async function renderLogHistory() {
  if (!api.getSession()) return;
  try { logHistory = await api.get("/logs"); }
  catch (error) { console.error("Could not load log history:", error); return; }
  if (!activeLogId && currentUserEmail) {
    activeLogId = logHistory.find(record => record.userId === currentUserId && record.action === "login" && !record.logoutTimestamp)?.id || null;
  }
  const historyList = document.querySelector(".history-list");
  if (!historyList) return;
  historyList.replaceChildren();

  const records = [...logHistory].sort((a, b) =>
    Date.parse(b.timestamp) - Date.parse(a.timestamp) || Number(b.id) - Number(a.id)
  );
  if (!records.length) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "list-card history-empty";
    emptyMessage.textContent = "No login activity yet.";
    historyList.append(emptyMessage);
    return;
  }

  records.forEach(record => {
    const card = document.createElement("div");
    card.className = "list-card";
    const name = document.createElement("strong");
    name.textContent = record.userName || record.name || "Unknown user";
    const status = document.createElement("span");
    if (record.id === activeLogId && !record.logoutTimestamp) {
      status.textContent = "currently logged into the system.";
    } else if (record.logoutTimestamp) {
      status.textContent = `logged out at ${formatHistoryTime(record.logoutTimestamp)}`;
    } else {
      status.textContent = "login session ended.";
    }
    const time = document.createElement("time");
    time.className = "history-time";
    time.dateTime = record.timestamp;
    time.textContent = formatHistoryTimestamp(record.timestamp);
    card.append(name, status, time);
    historyList.append(card);
  });
}

renderLogHistory();
setInterval(renderLogHistory, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderLogHistory();
});

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelectorAll(".nav-btn[data-page]").forEach(b =>
    b.classList.toggle("active", b.dataset.page === name)
  );
  if (name === "history") renderLogHistory();
  if (name === "reports") renderTransactionViews();
}

document.querySelectorAll(".nav-btn[data-page]").forEach(btn =>
  btn.addEventListener("click", () => showPage(btn.dataset.page))
);

document.querySelectorAll(".card[data-goto]").forEach(card =>
  card.addEventListener("click", () => showPage(card.dataset.goto))
);

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const emailInput = document.getElementById("email");
  const email = emailInput.value.trim();
  const pw = pwInput.value;
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const submitButton = loginForm.querySelector(".btn-login");
  let valid = true;

  emailError.textContent = "";
  passwordError.textContent = "";
  loginError.textContent = "";
  emailInput.setAttribute("aria-invalid", "false");
  pwInput.setAttribute("aria-invalid", "false");

  if (!email) {
    emailError.textContent = "Enter your email address.";
    emailInput.setAttribute("aria-invalid", "true");
    valid = false;
  } else if (!emailInput.validity.valid) {
    emailError.textContent = "Enter a valid email address.";
    emailInput.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!pw) {
    passwordError.textContent = "Enter your password.";
    pwInput.setAttribute("aria-invalid", "true");
    valid = false;
  }
  if (!valid) {
    (emailInput.getAttribute("aria-invalid") === "true" ? emailInput : pwInput).focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitButton.setAttribute("aria-busy", "true");
  try {
    const result = await api.post("/auth/login", { email, password: pw });
    api.saveSession(result);
    currentUserEmail = result.user.email;
    currentUserId = result.user.id;
    currentUser = result.user;
    activeLogId = result.logId;
    updateProfileIdentity(currentUser);
    if (result.user.mustChangePassword) window.location.assign(forceChangePageUrl());
    else window.location.assign(homeForRole(result.user.role));
  } catch (error) {
    console.error("Login failed:", error);
    if (error instanceof TypeError) loginError.textContent = "Cannot connect to the server. Please make sure the server is running.";
    else if (error.status === 401) loginError.textContent = "Incorrect email or password.";
    else loginError.textContent = error.message || "Unable to sign in.";
  } finally {
    submitButton.disabled = false; submitButton.classList.remove("is-loading"); submitButton.removeAttribute("aria-busy");
  }
});

document.getElementById("signupButton").addEventListener("click", event => {
  const destination = new URL(event.currentTarget.dataset.signupHref, window.location.href);
  window.location.assign(destination.href);
});

document.getElementById("email").addEventListener("input", e => {
  if (e.target.value.trim()) {
    document.getElementById("emailError").textContent = "";
    e.target.setAttribute("aria-invalid", "false");
  }
});
pwInput.addEventListener("input", () => {
  if (pwInput.value) {
    document.getElementById("passwordError").textContent = "";
    pwInput.setAttribute("aria-invalid", "false");
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await api.post("/auth/logout", {}); } catch (error) { console.error("Logout request failed:", error); }
  api.clearSession();
  window.location.assign(loginPageUrl());
});

document.getElementById("togglePw").addEventListener("click", () => {
  pwInput.type = pwInput.type === "password" ? "text" : "password";
  const visible = pwInput.type === "text";
  const toggle = document.getElementById("togglePw");
  toggle.setAttribute("aria-pressed", String(visible));
  toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
});

const bookModal = document.getElementById("bookModal");
const userViewModal = document.getElementById("userViewModal");
const userViewCard = userViewModal.querySelector(".user-view-card");
const usersBody = document.getElementById("usersBody");
const userToast = document.getElementById("userToast");
let toastTimeout = null;
let viewFocusReturn = null;

function openModal(m) { m.classList.remove("hidden"); }
function closeModal(m) { m.classList.add("hidden"); }

function showUserToast(message, isError = false) {
  userToast.textContent = message;
  userToast.classList.toggle("is-error", isError);
  userToast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => userToast.classList.add("hidden"), 3000);
}

[bookModal].forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) closeModal(m); })
);

const userRoleFilter = document.getElementById("userRoleFilter");
const userStatusFilter = document.getElementById("userStatusFilter");
const userSearch = document.getElementById("userSearch");
const viewUserCloseX = document.getElementById("userViewCloseX");
const viewUserClose = document.getElementById("userViewClose");
const viewUserApprove = document.getElementById("userViewApprove");
const viewUserReject = document.getElementById("userViewReject");
const viewUserFields = {
  avatar: document.getElementById("viewUserAvatar"),
  name: document.getElementById("viewUserName"),
  role: document.getElementById("viewUserRole"),
  fullName: document.getElementById("viewUserFullName"),
  email: document.getElementById("viewUserEmail"),
  course: document.getElementById("viewUserCourse"),
  roleValue: document.getElementById("viewUserRoleValue"),
  statusValue: document.getElementById("viewUserStatusValue"),
  rfid: document.getElementById("viewUserRfid"),
  dateRegistered: document.getElementById("viewUserDateRegistered")
};

// User Accounts table actions and read-only view modal.
function makeAction(label, action, id, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `row-action ${className}`.trim();
  button.textContent = label;
  button.dataset.userAction = action;
  button.dataset.userId = id;
  return button;
}

async function renderUsers() {
  const params = new URLSearchParams();
  if (userSearch?.value.trim()) params.set("q", userSearch.value.trim());
  if (userRoleFilter?.value) params.set("role", userRoleFilter.value.toLowerCase());
  if (userStatusFilter?.value) params.set("status", userStatusFilter.value);
  try {
    users = (await api.get(`/admin/users${params.size ? `?${params}` : ""}`)).map(user => ({
      ...user,
      dateRegistered: user.dateRegistered || user.createdAt?.slice(0, 10) || ""
    }));
  }
  catch (error) { console.error("Could not load user accounts:", error); return; }
  usersBody.replaceChildren();
  users.forEach(user => {
    const row = document.createElement("tr");
    const values = [`${user.firstName} ${user.lastName}`, user.email, user.course || "—", user.role];
    values.forEach(value => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
    const status = user.status || "active";
    const statusCell = document.createElement("td"); const statusBadge = document.createElement("span");
    statusBadge.className = `account-status-badge status-${status}`;
    statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusCell.append(statusBadge); row.append(statusCell);
    const rfidCell = document.createElement("td"); rfidCell.textContent = user.rfidUid || "Not assigned"; row.append(rfidCell);
    const actions = document.createElement("td"); actions.className = "row-actions";
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const viewButton = makeAction("View", "view", user.id, "user-view-button");
    viewButton.setAttribute("aria-label", `View ${fullName}`);
    actions.append(viewButton);
    if (status === "pending") actions.append(makeAction("Add", "approve", user.id, "user-approve-button"), makeAction("Reject", "reject", user.id, "user-reject-button"));
    row.append(actions); usersBody.append(row);
  });
}

function openUserView(userId, trigger) {
  const user = users.find(item => item.id === userId);
  if (!user) return;
  // TODO: load full user details from backend API
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const status = user.status || "active";
  viewFocusReturn = trigger;
  const initials = [user.firstName, user.lastName].filter(Boolean).map(name => name.trim().charAt(0).toUpperCase()).join("");
  viewUserFields.avatar.textContent = initials || "U";
  viewUserFields.name.textContent = fullName;
  viewUserFields.role.textContent = user.role || "—";
  viewUserFields.fullName.textContent = fullName;
  viewUserFields.email.textContent = user.email || "—";
  viewUserFields.course.textContent = user.course || "—";
  viewUserFields.roleValue.textContent = user.role || "—";
  viewUserFields.statusValue.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  viewUserFields.rfid.textContent = user.rfidUid || "Not assigned";
  viewUserFields.dateRegistered.textContent = user.dateRegistered || "—";
  viewUserApprove.classList.toggle("hidden", status !== "pending");
  viewUserReject.classList.toggle("hidden", status !== "pending");
  userViewModal.dataset.userId = user.id;
  openModal(userViewModal);
  requestAnimationFrame(() => viewUserCloseX.focus());
}

function closeUserView({ restoreFocus = true } = {}) {
  userViewModal.classList.add("hidden");
  if (restoreFocus && viewFocusReturn?.isConnected) viewFocusReturn.focus();
  viewFocusReturn = null;
}

function getUserViewFocusable() {
  return [...userViewCard.querySelectorAll('button:not([disabled]):not(.hidden), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.offsetParent !== null);
}

viewUserCloseX.addEventListener("click", () => closeUserView());
viewUserClose.addEventListener("click", () => closeUserView());
userViewModal.addEventListener("click", event => { if (event.target === userViewModal) closeUserView(); });
document.addEventListener("keydown", event => {
  if (userViewModal.classList.contains("hidden")) return;
  if (event.key === "Escape") { event.preventDefault(); closeUserView(); return; }
  if (event.key !== "Tab") return;
  const focusable = getUserViewFocusable();
  if (!focusable.length) { event.preventDefault(); userViewCard.focus(); return; }
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (!userViewCard.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

async function updateUserDecision(userId, action, fromModal = false) {
  try {
    await api.put(`/admin/users/${encodeURIComponent(userId)}/${action}`, {});
    if (fromModal) closeUserView({ restoreFocus: false });
    await renderUsers();
    const nextView = [...usersBody.querySelectorAll('.user-view-button')].find(button => button.dataset.userId === userId);
    if (nextView) nextView.focus();
    showUserToast(action === "approve" ? "Account approved." : "Sign-up rejected.");
  } catch (error) { showUserToast(error.message || "Unable to update account.", true); }
}

viewUserApprove.addEventListener("click", () => updateUserDecision(userViewModal.dataset.userId, "approve", true));
viewUserReject.addEventListener("click", () => updateUserDecision(userViewModal.dataset.userId, "reject", true));

userSearch.addEventListener("input", renderUsers);
userRoleFilter.addEventListener("change", renderUsers);
userStatusFilter.addEventListener("change", renderUsers);
usersBody.addEventListener("click", async event => {
  const button = event.target.closest("[data-user-action]"); if (!button) return;
  const user = users.find(item => item.id === button.dataset.userId); if (!user) return;
  const action = button.dataset.userAction;
  if (action === "view") openUserView(user.id, button);
  else if (action === "approve" || action === "reject") await updateUserDecision(user.id, action);
});

let editingBook = null;

async function renderBooks() {
  try { books = await api.get("/admin/books"); }
  catch (error) { console.error("Could not load books:", error); return; }
  const body = document.getElementById("booksBody"); body.replaceChildren();
  books.forEach(book => {
    const row = document.createElement("tr");
    [book.accessionNo, book.title, book.author, book.isbn, book.category, String(book.copies || 1), book.status].forEach(value => {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    });
    const actions = document.createElement("td"); actions.className = "row-actions";
    const edit = document.createElement("button"); edit.className = "btn-edit row-action"; edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingBook = book.id; bAccession.value = book.accessionNo; bTitle.value = book.title; bAuthor.value = book.author;
      bIsbn.value = book.isbn; bCategory.value = book.category; bQty.value = book.copies || 1; bStatus.value = book.status; openModal(bookModal);
    });
    actions.append(edit);
    ["lost", "damaged"].forEach(status => { const button = document.createElement("button"); button.className = "btn-edit row-action"; button.textContent = `Mark ${status}`; button.addEventListener("click", async () => { try { await api.put(`/admin/books/${book.id}`, { status }); await renderBooks(); } catch (error) { showUserToast(error.message, true); } }); actions.append(button); });
    const remove = document.createElement("button"); remove.className = "btn-edit row-action"; remove.textContent = "Delete"; remove.disabled = book.status === "borrowed";
    remove.addEventListener("click", async () => { if (!window.confirm(`Delete ${book.title}?`)) return; try { await api.delete(`/admin/books/${book.id}`); await renderBooks(); } catch (error) { showUserToast(error.message, true); } });
    actions.append(remove); row.append(actions); body.append(row);
  });
}

document.getElementById("registerBookBtn").addEventListener("click", () => {
  editingBook = null;
  document.getElementById("bookForm").reset();
  openModal(bookModal);
});

document.getElementById("bookForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const data = { title: bTitle.value.trim(), author: bAuthor.value.trim(), quantity: Number(bQty.value) };
    Object.assign(data, { accessionNo: bAccession.value.trim(), isbn: bIsbn.value.trim(), category: bCategory.value.trim(), copies: data.quantity, status: bStatus.value });
    delete data.quantity;
    if (editingBook === null) await api.post("/admin/books", data);
    else await api.put(`/admin/books/${encodeURIComponent(editingBook)}`, data);
    closeModal(bookModal); await renderBooks();
  } catch (error) { showUserToast(error.message || "Unable to save book.", true); }
});

// Sidebar profile menu and accessible profile dialog.
const profileMenuButton = document.getElementById("profileMenuButton");
const profileDropdown = document.getElementById("profileDropdown");
const profileViewButton = document.getElementById("profileViewButton");
const profileModal = document.getElementById("profileModal");
const profileModalForm = document.getElementById("profileModalForm");
const profileEditableFields = ["profileFirstName", "profileLastName", "profileEmail", "profileSex", "profileCourse"];
const profilePasswordFields = ["profileCurrentPassword", "profileNewPassword", "profileConfirmPassword"];
let profileFocusReturn = null;
let profileSnapshot = null;

function updateProfileIdentity(user) {
  if (!user) return;
  const initial = (user.firstName || "?").trim().charAt(0).toUpperCase() || "?";
  const initials = `${user.firstName?.trim().charAt(0) || ""}${user.lastName?.trim().charAt(0) || ""}`.toUpperCase() || "?";
  const name = [user.firstName, user.middleName || user.middleInitial, user.lastName].filter(Boolean).join(" ").trim() || "Profile";
  const isStudent = user.role === "student";
  const course = user.course || user.program || user.department || "";
  document.getElementById("sidebarProfileAvatar").textContent = initial;
  document.getElementById("profileModalAvatar").textContent = initials;
  document.getElementById("profileModalName").textContent = name;
  document.getElementById("profileModalRole").textContent = user.role || "User";
  document.getElementById("profileViewEmail").textContent = user.email || "—";
  document.getElementById("profileViewRole").textContent = user.role || "—";
  document.getElementById("profileViewSex").textContent = user.sex || "—";
  document.getElementById("profileViewStudentNo").textContent = user.studentNo || "—";
  document.getElementById("profileViewProgram").textContent = isStudent ? course || "—" : "—";
  document.getElementById("profileViewEmployeeId").textContent = user.employeeId || "—";
  document.getElementById("profileViewDepartment").textContent = !isStudent ? course || "—" : "—";
  document.getElementById("profileViewStudentNoTile").hidden = !isStudent;
  document.getElementById("profileViewProgramTile").hidden = !isStudent;
  document.getElementById("profileViewEmployeeIdTile").hidden = isStudent || !user.employeeId;
  document.getElementById("profileViewDepartmentTile").hidden = isStudent || !course;
  document.getElementById("profileFirstName").value = user.firstName || "";
  document.getElementById("profileLastName").value = user.lastName || "";
  document.getElementById("profileEmail").value = user.email || "";
  document.getElementById("profileSex").value = user.sex || "";
  document.getElementById("profileCourse").value = course;
  document.getElementById("profileCourseLabel").textContent = isStudent ? "Program" : "Department";
  document.getElementById("profileRole").value = user.role || "—";
  document.getElementById("profileStudentNo").value = user.studentNo || "—";
  document.getElementById("profileEmployeeId").value = user.employeeId || "—";
  document.getElementById("profileStudentNoTile").hidden = !isStudent;
  document.getElementById("profileEmployeeIdTile").hidden = isStudent;
}

function setProfileMenu(open) {
  profileDropdown.hidden = !open;
  profileMenuButton.setAttribute("aria-expanded", String(open));
  if (open) profileViewButton.focus();
}

function setProfileEditMode(editing) {
  profileEditableFields.forEach(id => { document.getElementById(id).disabled = !editing; });
  profilePasswordFields.forEach(id => { document.getElementById(id).disabled = !editing; });
  document.getElementById("profileViewGrid").hidden = editing;
  document.getElementById("profileEditGrid").hidden = !editing;
  document.getElementById("profilePasswordSection").hidden = !editing;
  document.getElementById("profileViewCloseButton").hidden = editing;
  document.getElementById("profileEditButton").hidden = editing;
  document.getElementById("profileSaveButton").hidden = !editing;
  document.getElementById("profileCancelButton").hidden = !editing;
  if (!editing) document.getElementById("profilePasswordSection").open = false;
}

function clearProfileError(id) {
  const input = document.getElementById(id);
  input.classList.remove("profile-invalid");
  document.getElementById(`${id}Error`)?.replaceChildren();
}

function setProfileError(id, message) {
  const input = document.getElementById(id);
  input.classList.add("profile-invalid");
  document.getElementById(`${id}Error`).textContent = message;
}

function openProfileModal() {
  currentUser = currentUser || api.getSession();
  updateProfileIdentity(currentUser);
  profileFocusReturn = profileMenuButton;
  profileModal.classList.remove("hidden");
  profileModalMessage.textContent = "";
  clearProfilePasswords();
  setProfileEditMode(false);
  profileModalClose.focus();
}

function closeProfileModal() {
  profileModal.classList.add("hidden");
  profileModalForm.reset();
  updateProfileIdentity(currentUser);
  clearProfilePasswords();
  setProfileEditMode(false);
  profileFocusReturn?.focus();
}

function clearProfilePasswords() {
  profilePasswordFields.forEach(id => { const input = document.getElementById(id); input.value = ""; input.type = "password"; });
  document.querySelectorAll(".profile-eye-toggle").forEach(button => { button.setAttribute("aria-pressed", "false"); button.setAttribute("aria-label", `Show ${button.parentElement.querySelector("input").id.replace("profile", "").replace(/([A-Z])/g, " $1").trim().toLowerCase()}`); });
}

profileMenuButton.addEventListener("click", () => setProfileMenu(profileDropdown.hidden));
profileViewButton.addEventListener("click", () => { setProfileMenu(false); openProfileModal(); });
document.getElementById("profileModalClose").addEventListener("click", closeProfileModal);
document.getElementById("profileViewCloseButton").addEventListener("click", closeProfileModal);
profileModal.addEventListener("click", event => { if (event.target === profileModal) closeProfileModal(); });
document.addEventListener("click", event => { if (!event.target.closest(".profile-menu-wrap") && !profileDropdown.hidden) setProfileMenu(false); });
document.addEventListener("keydown", event => {
  if (profileModal.classList.contains("hidden")) {
    if (event.key === "Escape" && !profileDropdown.hidden) { setProfileMenu(false); profileMenuButton.focus(); }
    return;
  }
  if (event.key === "Escape") { event.preventDefault(); closeProfileModal(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...profileModal.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), summary")].filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.getElementById("profileEditButton").addEventListener("click", () => {
  profileSnapshot = { ...currentUser };
  profileModalMessage.textContent = "";
  setProfileEditMode(true);
  document.getElementById("profileFirstName").focus();
});
document.getElementById("profileCancelButton").addEventListener("click", () => {
  if (profileSnapshot) currentUser = profileSnapshot;
  profileModalForm.reset();
  updateProfileIdentity(currentUser);
  clearProfilePasswords();
  profileEditableFields.forEach(clearProfileError);
  profilePasswordFields.forEach(clearProfileError);
  profileModalMessage.textContent = "";
  setProfileEditMode(false);
});
document.querySelectorAll(".profile-eye-toggle").forEach(button => button.addEventListener("click", () => {
  const input = button.parentElement.querySelector("input");
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${input.id.replace("profile", "").replace(/([A-Z])/g, " $1").trim().toLowerCase()}`);
}));
[...profileEditableFields, ...profilePasswordFields].forEach(id => document.getElementById(id).addEventListener("input", () => clearProfileError(id)));
const profileModalMessage = document.getElementById("profileModalMessage");
profileModalForm.addEventListener("submit", async event => {
  event.preventDefault();
  [...profileEditableFields, ...profilePasswordFields].forEach(clearProfileError);
  profileModalMessage.textContent = "";
  const firstName = document.getElementById("profileFirstName").value.trim();
  const lastName = document.getElementById("profileLastName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const course = document.getElementById("profileCourse").value.trim();
  const sex = document.getElementById("profileSex").value;
  let valid = true;
  if (!firstName) { setProfileError("profileFirstName", "First name is required."); valid = false; }
  if (!lastName) { setProfileError("profileLastName", "Last name is required."); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setProfileError("profileEmail", "Enter a valid email address."); valid = false; }
  const currentPassword = document.getElementById("profileCurrentPassword").value;
  const newPassword = document.getElementById("profileNewPassword").value;
  const confirmPassword = document.getElementById("profileConfirmPassword").value;
  const changingPassword = Boolean(currentPassword || newPassword || confirmPassword);
  if (changingPassword) {
    if (!currentPassword) { setProfileError("profileCurrentPassword", "Current password is required."); valid = false; }
    if (newPassword.length < 8) { setProfileError("profileNewPassword", "New password must be at least 8 characters."); valid = false; }
    if (newPassword !== confirmPassword) { setProfileError("profileConfirmPassword", "Passwords do not match."); valid = false; }
  }
  if (!valid) return;

  const saveButton = document.getElementById("profileSaveButton");
  saveButton.disabled = true; saveButton.textContent = "Saving...";
  try {
    // TODO: connect to backend update profile API.
    const update = currentUser.role === "admin" || currentUser.role === "librarian"
      ? await api.put(`/admin/users/${encodeURIComponent(currentUser.id)}`, { firstName, lastName, email, course: course || currentUser.course || "N/A", sex, role: currentUser.role })
      : await api.put("/portal/profile", { firstName, lastName, email, course, sex });
    currentUser = update;
    profileSnapshot = { ...currentUser };
    if (changingPassword) {
      const changed = await api.put("/auth/change-password", { currentPassword, newPassword });
      api.saveSession(changed);
      currentUser = changed.user;
    } else {
      localStorage.setItem("cccCurrentUser", JSON.stringify(currentUser));
    }
    currentUserEmail = currentUser.email;
    updateProfileIdentity(currentUser);
    clearProfilePasswords();
    setProfileEditMode(false);
    showUserToast("Profile updated");
  } catch (error) {
    console.error("Profile update failed:", error);
    profileModalMessage.textContent = error.message || "Unable to save profile.";
  } finally {
    saveButton.disabled = false; saveButton.textContent = "Save Changes";
  }
});

async function restoreSession() {
  const savedUser = api.getSession();
  if (!savedUser) { if (isAdminRoute) window.location.replace(loginPageUrl()); return; }
  try {
    const user = await api.get("/auth/me");
    currentUser = user;
    currentUserEmail = user.email; currentUserId = user.id;
    updateProfileIdentity(user);
    if (user.mustChangePassword && !currentPath.toLowerCase().endsWith("/force-change.html")) { window.location.replace(forceChangePageUrl()); return; }
    if (!isAdminRoute) { window.location.replace(homeForRole(user.role)); return; }
    if (!["admin", "librarian"].includes(user.role)) { window.location.replace(loginPageUrl()); return; }
    document.body.classList.add("admin-route"); loginPage.classList.add("hidden"); app.classList.remove("hidden"); showPage("home");
    await Promise.all([renderUsers(), renderBooks(), renderTransactionViews(), renderLogHistory()]);
  } catch { api.clearSession(); window.location.replace(loginPageUrl()); }
}
restoreSession();
setInterval(() => { if (!document.hidden && !app.classList.contains("hidden")) renderTransactionViews(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !app.classList.contains("hidden")) { renderTransactionViews(); if (!document.getElementById("page-history").classList.contains("active")) return; renderLogHistory(); } });
