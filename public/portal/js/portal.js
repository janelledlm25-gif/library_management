const portalRoles = ['student', 'faculty', 'staff'];
const isFilePage = location.protocol === 'file:';
function pageUrl(publicPath) {
  if (!isFilePage) return `/${publicPath}`;
  const currentPath = decodeURIComponent(location.pathname).replace(/\\/g, '/');
  const publicMarker = currentPath.toLowerCase().lastIndexOf('/public/');
  if (publicMarker >= 0) {
    const currentPublicPath = currentPath.slice(publicMarker + 8);
    const currentDirectory = currentPublicPath.includes('/') ? currentPublicPath.slice(0, currentPublicPath.lastIndexOf('/') + 1) : '';
    const depth = currentDirectory.split('/').filter(Boolean).length;
    return new URL(`${'../'.repeat(depth)}${publicPath}`, location.href).href;
  }
  return new URL(`public/${publicPath}`, location.href).href;
}
let currentPortalUser = null; // TODO: load logged-in user from backend / session
const portalTitles = { home: 'Home', books: 'Book Catalog', 'my-books': 'My Books', history: 'My History', profile: 'Profile' };
const portalDate = value => new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const get = path => api.get(`/portal${path}`);

function showPortalPage(name) {
  document.querySelectorAll('.portal-view').forEach(section => section.classList.toggle('active', section.id === `portal-${name}`));
  document.querySelectorAll('.portal-nav').forEach(button => button.classList.toggle('active', button.dataset.page === name));
  document.getElementById('portalPageTitle').textContent = portalTitles[name] || 'Home';
  if (name === 'home') loadDashboard();
  if (name === 'books') loadCatalog();
  if (name === 'my-books') loadMyBooks();
  if (name === 'history') loadHistory();
  if (name === 'profile') loadProfile();
  history.replaceState(null, '', `#${name}`);
}

function node(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el; }
function showMessage(id, value, error = false) { const el = document.getElementById(id); el.textContent = value; el.classList.toggle('is-error', error); }
function showError(error) { console.error(error); window.alert(error.message || 'Something went wrong.'); }

async function loadDashboard() {
  try {
    const data = await get('/dashboard');
    document.getElementById('borrowedCount').textContent = data.borrowedCount;
    document.getElementById('dueSoonCount').textContent = data.dueSoonCount;
    document.getElementById('overdueCount').textContent = data.overdue.length;
    const list = document.getElementById('overdueList'); list.replaceChildren();
    if (!data.overdue.length) list.append(node('p', 'portal-muted', 'No overdue books.'));
    data.overdue.forEach(tx => {
      const row = node('div', 'portal-list-item portal-overdue'); const info = node('div');
      info.append(node('strong', '', tx.bookTitle), node('small', '', `Due ${portalDate(tx.dueDate)}`)); row.append(info, node('span', 'portal-badge borrowed', 'Overdue')); list.append(row);
    });
  } catch (error) { showError(error); }
}

let catalogItems = [];
async function loadCatalog() {
  try {
    const query = new URLSearchParams(); const q = document.getElementById('catalogSearch').value.trim(); const category = document.getElementById('catalogCategory').value;
    if (q) query.set('q', q); if (category) query.set('category', category);
    catalogItems = await get(`/books${query.size ? `?${query}` : ''}`);
    const categorySelect = document.getElementById('catalogCategory'); const selected = categorySelect.value;
    const categories = [...new Set(catalogItems.map(book => book.category).filter(Boolean))].sort();
    categorySelect.replaceChildren(new Option('All categories', ''), ...categories.map(item => new Option(item, item)));
    categorySelect.value = selected;
    const grid = document.getElementById('catalogResults'); grid.replaceChildren();
    if (!catalogItems.length) grid.append(node('p', 'portal-muted', 'No books match your search.'));
    catalogItems.forEach(book => {
      const card = node('article', 'portal-book'); card.append(node('span', `portal-badge ${book.status}`, book.status));
      card.append(node('h3', '', book.title), node('p', 'book-meta', `${book.author}\nISBN: ${book.isbn || '—'}\nAccession: ${book.accessionNo}\n${book.category || ''}`)); grid.append(card);
    });
  } catch (error) { showError(error); }
}

async function loadMyBooks() {
  try {
    const books = await get('/my-books'); const list = document.getElementById('myBooksList'); list.replaceChildren();
    if (!books.length) list.append(node('p', 'portal-muted', 'You have no books currently borrowed.'));
    books.forEach(tx => {
      const overdue = tx.dueDate && Date.parse(tx.dueDate) < Date.now(); const row = node('div', `portal-list-item ${overdue ? 'portal-overdue' : ''}`); const info = node('div');
      info.append(node('strong', '', tx.bookTitle), node('small', '', `Accession: ${tx.book?.accessionNo || '—'} · Due ${portalDate(tx.dueDate)}`)); row.append(info, node('span', `portal-badge ${overdue ? 'borrowed' : ''}`, overdue ? 'Overdue' : 'Borrowed')); list.append(row);
    });
  } catch (error) { showError(error); }
}

async function loadHistory() {
  try {
    const records = await get('/history'); const rows = document.getElementById('historyRows'); rows.replaceChildren();
    if (!records.length) { const row = node('tr'); const cell = node('td', 'portal-muted', 'No borrowing history yet.'); cell.colSpan = 4; row.append(cell); rows.append(row); return; }
    records.forEach(tx => {
      const row = node('tr'); row.append(node('td', '', tx.bookTitle), node('td', '', tx.action));
      const timeCell = node('td'); const time = node('time', '', portalDate(tx.timestamp)); time.dateTime = tx.timestamp; timeCell.append(time);
      row.append(timeCell, node('td', '', tx.dueDate ? portalDate(tx.dueDate) : '—')); rows.append(row);
    });
  } catch (error) { showError(error); }
}

async function loadProfile() {
  try {
    const user = await get('/profile'); const form = document.getElementById('profileForm');
    for (const key of ['firstName', 'lastName', 'email', 'course']) form.elements[key].value = user[key] || '';
    document.getElementById('profileRfid').value = user.rfidUid ? `Registered (${user.rfidUid})` : 'Not registered';
  } catch (error) { showError(error); }
}

// Sidebar profile menu and accessible profile dialog.
const profileMenuButton = document.getElementById('profileMenuButton');
const profileDropdown = document.getElementById('profileDropdown');
const profileViewButton = document.getElementById('profileViewButton');
const profileModal = document.getElementById('profileModal');
const profileModalForm = document.getElementById('profileModalForm');
const profileEditableFields = ['profileFirstName', 'profileLastName', 'profileEmail', 'profileSex', 'profileCourse'];
const profilePasswordFields = ['profileCurrentPassword', 'profileNewPassword', 'profileConfirmPassword'];
let profileFocusReturn = null;
let profileSnapshot = null;
let profileToastTimer;

function updateProfileIdentity(user) {
  if (!user) return;
  const initial = (user.firstName || '?').trim().charAt(0).toUpperCase() || '?';
  const initials = `${user.firstName?.trim().charAt(0) || ''}${user.lastName?.trim().charAt(0) || ''}`.toUpperCase() || '?';
  const fullName = [user.firstName, user.middleName || user.middleInitial, user.lastName].filter(Boolean).join(' ').trim() || 'Profile';
  const isStudent = user.role === 'student';
  const course = user.course || user.program || user.department || '';
  document.getElementById('sidebarProfileAvatar').textContent = initial;
  document.getElementById('profileModalAvatar').textContent = initials;
  document.getElementById('profileModalName').textContent = fullName;
  document.getElementById('profileModalRole').textContent = user.role || 'User';
  document.getElementById('profileViewEmail').textContent = user.email || '—';
  document.getElementById('profileViewRole').textContent = user.role || '—';
  document.getElementById('profileViewSex').textContent = user.sex || '—';
  document.getElementById('profileViewStudentNo').textContent = user.studentNo || '—';
  document.getElementById('profileViewProgram').textContent = isStudent ? course || '—' : '—';
  document.getElementById('profileViewEmployeeId').textContent = user.employeeId || '—';
  document.getElementById('profileViewDepartment').textContent = !isStudent ? course || '—' : '—';
  document.getElementById('profileViewStudentNoTile').hidden = !isStudent;
  document.getElementById('profileViewProgramTile').hidden = !isStudent;
  document.getElementById('profileViewEmployeeIdTile').hidden = isStudent || !user.employeeId;
  document.getElementById('profileViewDepartmentTile').hidden = isStudent || !course;
  document.getElementById('profileFirstName').value = user.firstName || '';
  document.getElementById('profileLastName').value = user.lastName || '';
  document.getElementById('profileEmail').value = user.email || '';
  document.getElementById('profileSex').value = user.sex || '';
  document.getElementById('profileCourse').value = course;
  document.getElementById('profileCourseLabel').textContent = isStudent ? 'Program' : 'Department';
  document.getElementById('profileRole').value = user.role || '—';
  document.getElementById('profileStudentNo').value = user.studentNo || '—';
  document.getElementById('profileEmployeeId').value = user.employeeId || '—';
  document.getElementById('profileStudentNoTile').hidden = !isStudent;
  document.getElementById('profileEmployeeIdTile').hidden = isStudent;
  document.getElementById('portalWelcome').textContent = `Welcome, ${fullName}`;
}

function setProfileMenu(open) {
  profileDropdown.hidden = !open;
  profileMenuButton.setAttribute('aria-expanded', String(open));
  if (open) profileViewButton.focus();
}

function setProfileEditMode(editing) {
  profileEditableFields.forEach(id => { document.getElementById(id).disabled = !editing; });
  profilePasswordFields.forEach(id => { document.getElementById(id).disabled = !editing; });
  document.getElementById('profileViewGrid').hidden = editing;
  document.getElementById('profileEditGrid').hidden = !editing;
  document.getElementById('profilePasswordSection').hidden = !editing;
  document.getElementById('profileViewCloseButton').hidden = editing;
  document.getElementById('profileEditButton').hidden = editing;
  document.getElementById('profileSaveButton').hidden = !editing;
  document.getElementById('profileCancelButton').hidden = !editing;
  if (!editing) document.getElementById('profilePasswordSection').open = false;
}

function clearProfileError(id) {
  document.getElementById(id).classList.remove('profile-invalid');
  document.getElementById(`${id}Error`)?.replaceChildren();
}

function setProfileError(id, message) {
  document.getElementById(id).classList.add('profile-invalid');
  document.getElementById(`${id}Error`).textContent = message;
}

function clearProfilePasswords() {
  profilePasswordFields.forEach(id => { const input = document.getElementById(id); input.value = ''; input.type = 'password'; });
  document.querySelectorAll('.profile-eye-toggle').forEach(button => {
    const name = button.parentElement.querySelector('input').id.replace('profile', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `Show ${name}`);
  });
}

function openProfileModal() {
  currentPortalUser = currentPortalUser || api.getSession();
  updateProfileIdentity(currentPortalUser);
  profileFocusReturn = profileMenuButton;
  profileModal.classList.remove('hidden');
  document.getElementById('profileModalMessage').textContent = '';
  clearProfilePasswords(); setProfileEditMode(false); document.getElementById('profileModalClose').focus();
}

function closeProfileModal() {
  profileModal.classList.add('hidden'); profileModalForm.reset(); updateProfileIdentity(currentPortalUser); clearProfilePasswords(); setProfileEditMode(false); profileFocusReturn?.focus();
}

function showProfileToast(message) {
  const toast = document.getElementById('portalProfileToast');
  toast.textContent = message; toast.hidden = false; clearTimeout(profileToastTimer);
  profileToastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

profileMenuButton.addEventListener('click', () => setProfileMenu(profileDropdown.hidden));
profileViewButton.addEventListener('click', () => { setProfileMenu(false); openProfileModal(); });
document.getElementById('profileModalClose').addEventListener('click', closeProfileModal);
document.getElementById('profileViewCloseButton').addEventListener('click', closeProfileModal);
profileModal.addEventListener('click', event => { if (event.target === profileModal) closeProfileModal(); });
document.addEventListener('click', event => { if (!event.target.closest('.profile-menu-wrap') && !profileDropdown.hidden) setProfileMenu(false); });
document.addEventListener('keydown', event => {
  if (profileModal.classList.contains('hidden')) {
    if (event.key === 'Escape' && !profileDropdown.hidden) { setProfileMenu(false); profileMenuButton.focus(); }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); closeProfileModal(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...profileModal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), summary')].filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.getElementById('profileEditButton').addEventListener('click', () => {
  profileSnapshot = { ...currentPortalUser }; document.getElementById('profileModalMessage').textContent = '';
  setProfileEditMode(true); document.getElementById('profileFirstName').focus();
});
document.getElementById('profileCancelButton').addEventListener('click', () => {
  if (profileSnapshot) currentPortalUser = profileSnapshot;
  profileModalForm.reset(); updateProfileIdentity(currentPortalUser); clearProfilePasswords();
  profileEditableFields.forEach(clearProfileError); profilePasswordFields.forEach(clearProfileError);
  document.getElementById('profileModalMessage').textContent = ''; setProfileEditMode(false);
});
document.querySelectorAll('.profile-eye-toggle').forEach(button => button.addEventListener('click', () => {
  const input = button.parentElement.querySelector('input'), visible = input.type === 'password';
  input.type = visible ? 'text' : 'password'; button.setAttribute('aria-pressed', String(visible));
  const name = input.id.replace('profile', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${name}`);
}));
[...profileEditableFields, ...profilePasswordFields].forEach(id => document.getElementById(id).addEventListener('input', () => clearProfileError(id)));
profileModalForm.addEventListener('submit', async event => {
  event.preventDefault(); [...profileEditableFields, ...profilePasswordFields].forEach(clearProfileError);
  const message = document.getElementById('profileModalMessage'); message.textContent = '';
  const firstName = document.getElementById('profileFirstName').value.trim();
  const lastName = document.getElementById('profileLastName').value.trim();
  const email = document.getElementById('profileEmail').value.trim();
  const course = document.getElementById('profileCourse').value.trim();
  const sex = document.getElementById('profileSex').value;
  let valid = true;
  if (!firstName) { setProfileError('profileFirstName', 'First name is required.'); valid = false; }
  if (!lastName) { setProfileError('profileLastName', 'Last name is required.'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setProfileError('profileEmail', 'Enter a valid email address.'); valid = false; }
  const currentPassword = document.getElementById('profileCurrentPassword').value;
  const newPassword = document.getElementById('profileNewPassword').value;
  const confirmPassword = document.getElementById('profileConfirmPassword').value;
  const changingPassword = Boolean(currentPassword || newPassword || confirmPassword);
  if (changingPassword) {
    if (!currentPassword) { setProfileError('profileCurrentPassword', 'Current password is required.'); valid = false; }
    if (newPassword.length < 8) { setProfileError('profileNewPassword', 'New password must be at least 8 characters.'); valid = false; }
    if (newPassword !== confirmPassword) { setProfileError('profileConfirmPassword', 'Passwords do not match.'); valid = false; }
  }
  if (!valid) return;
  const saveButton = document.getElementById('profileSaveButton'); saveButton.disabled = true; saveButton.textContent = 'Saving...';
  try {
    // TODO: connect to backend update profile API.
    currentPortalUser = await api.put('/portal/profile', { firstName, lastName, email, course, sex });
    profileSnapshot = { ...currentPortalUser };
    if (changingPassword) {
      const changed = await api.put('/auth/change-password', { currentPassword, newPassword });
      api.saveSession(changed); currentPortalUser = changed.user;
    } else localStorage.setItem('cccCurrentUser', JSON.stringify(currentPortalUser));
    updateProfileIdentity(currentPortalUser); clearProfilePasswords(); setProfileEditMode(false); showProfileToast('Profile updated');
  } catch (error) {
    console.error('Profile update failed:', error); message.textContent = error.message || 'Unable to save profile.';
  } finally { saveButton.disabled = false; saveButton.textContent = 'Save Changes'; }
});

async function initializePortal() {
  if (!api.getSession()) { location.replace(pageUrl('index.html')); return; }
  try {
    const user = await api.get('/auth/me');
    if (!portalRoles.includes(user.role)) { location.replace(pageUrl('admin/home.html')); return; }
    if (user.mustChangePassword) { location.replace(pageUrl('force-change.html')); return; }
    currentPortalUser = user; updateProfileIdentity(user);
    document.getElementById('portalWelcome').textContent = `Welcome, ${user.firstName} ${user.lastName}`;
    showPortalPage(location.hash.slice(1) || 'home');
  } catch { api.clearSession(); location.replace(pageUrl('index.html')); }
}

document.querySelectorAll('.portal-nav').forEach(button => button.addEventListener('click', () => showPortalPage(button.dataset.page)));
let searchTimer; document.getElementById('catalogSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadCatalog, 220); });
document.getElementById('catalogCategory').addEventListener('change', loadCatalog);
document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
  try { await api.put('/portal/profile', body); showMessage('profileMessage', 'Profile updated.'); } catch (error) { showMessage('profileMessage', error.message, true); }
});
document.getElementById('portalPasswordForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  try { const result = await api.put('/auth/change-password', Object.fromEntries(new FormData(form))); api.saveSession(result); form.reset(); showMessage('passwordMessage', 'Password changed successfully.'); }
  catch (error) { showMessage('passwordMessage', error.message, true); }
});
document.getElementById('portalLogout').addEventListener('click', async () => { try { await api.post('/auth/logout', {}); } catch {} api.clearSession(); location.replace(pageUrl('index.html')); });
initializePortal();
