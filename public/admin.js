// ========================
// GLOBAL VARIABLES
// ========================
let currentItems = [];
let mode = 'delete';
let currentUserRole = null;

const form = document.getElementById('uploadForm');
const status = document.getElementById('status');
const adminCards = document.getElementById('adminCards');
const toggleBtn = document.getElementById('toggleModeBtn');
const uploadCard = document.getElementById('uploadCard');
const logoutBtn = document.getElementById('logoutBtn');

// ========================
// SESSION CHECK & ROLE SETUP
// ========================
async function checkSession() {
  try {
    const res = await fetch('/api/session');
    if (!res.ok) return window.location.href = '/login.html';
    const user = await res.json();
    currentUserRole = user.role;
    setupRoleUI();
  } catch(err){
    window.location.href = '/login.html';
  }
}

function setupRoleUI() {
  if(['admin','moderator','editor'].includes(currentUserRole)) {
    uploadCard.style.display = 'block';
  }
}

// ========================
// LOGOUT
// ========================
logoutBtn.addEventListener('click', async () => {
  await fetch('/logout', { method:'POST' });
  window.location.href = '/login.html';
});

// ========================
// UPLOAD FORM
// ========================
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!['admin','moderator','editor'].includes(currentUserRole)) {
    status.style.color = '#f87171';
    status.textContent = 'You do not have permission to upload.';
    return;
  }

  const data = new FormData(form);
  status.style.color = '#facc15';
  status.textContent = 'Uploading...';

  try {
    const res = await fetch('/api/upload', { method:'POST', body: data });
    let j;
    try { j = await res.json(); } 
    catch(parseErr){
      status.style.color = '#f87171';
      status.textContent = 'Unexpected server response.';
      console.error(parseErr);
      return;
    }

    if (res.ok) {
      status.style.color = '#34d399';
      status.textContent = `✅ Upload successful: ${j.item.filename}`;
      form.reset();
      loadAdminFiles();
    } else {
      status.style.color = '#f87171';
      status.textContent = `❌ Upload failed: ${j.error || 'Unknown error'}`;
    }
  } catch(err){
    status.style.color = '#f87171';
    status.textContent = `Network error: ${err.message}`;
    console.error(err);
  }
});

// ========================
// TOGGLE MODE
// ========================
toggleBtn.addEventListener('click', () => {
  mode = mode === 'delete' ? 'upload' : 'delete';
  toggleBtn.textContent = mode === 'delete' ? 'Switch to Upload Mode' : 'Switch to Delete Mode';
  if(mode === 'delete'){
    toggleBtn.classList.remove('upload-mode');
    toggleBtn.classList.add('delete-mode');
    if(currentUserRole === 'admin') uploadCard.style.display = 'none';
  } else {
    toggleBtn.classList.remove('delete-mode');
    toggleBtn.classList.add('upload-mode');
    uploadCard.style.display = 'block';
  }
  renderCards(currentItems);
});

// ========================
// LOAD & RENDER FILES
// ========================
async function loadAdminFiles(){
  try{
    const res = await fetch('/api/items');
    currentItems = await res.json();
    renderCards(currentItems);
  } catch(err){
    adminCards.innerHTML = '<p class="muted">Failed to load uploaded files.</p>';
    console.error(err);
  }
}

function renderCards(items){
  adminCards.innerHTML = '';
  items.forEach(it => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb">${it.title}</div>
      <h3>${it.title}</h3>
      <p class="muted">${it.desc||'No description provided.'}</p>
      <span class="badge">${it.category}</span>
      <div class="actions"></div>
    `;
    const actionsDiv = card.querySelector('.actions');

    // DELETE MODE
    if(mode === 'delete' && currentUserRole === 'admin'){
      const delBtn = document.createElement('button');
      delBtn.className = 'btn card-btn';
      delBtn.innerHTML = '🗑️ Delete';
      delBtn.addEventListener('click', async () => {
        if(!confirm(`Delete "${it.filename}"?`)) return;
        try{
          const res = await fetch(`/api/admin/delete/${encodeURIComponent(it.filename)}`, { method:'DELETE' });
          const j = await res.json();
          if(res.ok){ loadAdminFiles(); alert('Deleted successfully'); } 
          else alert('Failed: ' + (j.error||'Unknown'));
        } catch(err){ alert('Network error: ' + err.message); }
      });
      actionsDiv.appendChild(delBtn);
    }

    // UPLOAD/UPDATE MODE
    if(mode === 'upload' && (currentUserRole === 'admin' || currentUserRole === 'moderator')){
      const updateLabel = document.createElement('label');
      updateLabel.className = 'btn card-btn';
      updateLabel.innerHTML = '⬆️ Update File';
      const inputFile = document.createElement('input');
      inputFile.type = 'file';
      inputFile.style.display = 'none';
      inputFile.addEventListener('change', async () => {
        const file = inputFile.files[0];
        if(!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try{
          const res = await fetch(`/api/admin/update/${encodeURIComponent(it.filename)}`, { method:'POST', body: formData });
          const j = await res.json();
          if(res.ok){ loadAdminFiles(); alert('File updated successfully'); }
          else alert('Failed: ' + (j.error||'Unknown'));
        } catch(err){ alert('Network error: ' + err.message); }
      });
      updateLabel.appendChild(inputFile);
      actionsDiv.appendChild(updateLabel);
    }

    adminCards.appendChild(card);
  });
}

// ========================
// INITIALIZE
// ========================
checkSession();
loadAdminFiles();
