/**
 * Portal Petugas & Pengurusan Kirim Doa — Yayasan An Nabawi
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  auth, 
  db, 
  googleProvider, 
  DEFAULT_ALLOWED_ADMIN_EMAILS 
} from './src/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  orderBy, 
  query, 
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';

const STORAGE_KEY = 'yan_kirim_doa_records';
const ADMIN_EMAILS_STORAGE_KEY = 'yan_admin_allowed_emails';
const COLLECTION_NAME = 'kirimDoa';

// Default Seed fallback
const SEED_DATA = [
  {
    id: 'seed-1',
    pengirim: 'Haji Ramli',
    telefon: '012-3456789',
    nama: ['Hajah Zainab binti Kassim', 'Ahmad bin Ramli'],
    jenisHajat: 'Kesihatan',
    hajat: 'Semoga dikurniakan kesembuhan penyakit dan keafiatan berpanjangan.',
    cawangan: 'Machang',
    sumbangan: 50,
    status: 'dibayar',
    dibaca: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'seed-2',
    pengirim: 'Nurul Huda',
    telefon: '019-8765432',
    nama: ['Allahyarham Ibrahim bin Sulaiman'],
    jenisHajat: 'Untuk arwah',
    hajat: 'Mohon tahlil dan doa agar arwah ayahanda diampunkan dosa dan ditempatkan bersama orang beriman.',
    cawangan: 'Shah Alam',
    sumbangan: 30,
    status: 'dibayar',
    dibaca: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'seed-3',
    pengirim: 'Khairul Anwar',
    telefon: '013-4455667',
    nama: ['Khairul Anwar & Siti Mariam'],
    jenisHajat: 'Rezeki',
    hajat: 'Dipermudahkan urusan perniagaan dan rezeki halal barakah.',
    cawangan: 'Jerantut',
    sumbangan: 0,
    status: 'baru',
    dibaca: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  }
];

function getStoredRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
      return SEED_DATA;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_DATA;
  } catch (err) {
    console.warn('Gagal membaca rekod tempatan:', err);
    return SEED_DATA;
  }
}

function updateRecordInStorage(id, partial) {
  const current = getStoredRecords();
  const updated = current.map((item) => (item.id === id ? { ...item, ...partial } : item));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Gagal menyimpan rekod:', err);
  }
  return updated;
}

function deleteRecordsFromStorage(idsToDelete) {
  const idSet = new Set(idsToDelete);
  const current = getStoredRecords();
  const updated = current.filter((item) => !idSet.has(item.id));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Gagal menyimpan rekod selepas padam:', err);
  }
  return updated;
}

async function deleteRecordsFromFirestore(idsToDelete) {
  const promises = idsToDelete.map(async (id) => {
    if (id.startsWith('seed-')) return;
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Gagal memadam dari Firestore:', id, err);
    }
  });
  await Promise.allSettled(promises);
}

function getAllowedAdminEmails() {
  try {
    const raw = localStorage.getItem(ADMIN_EMAILS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Tapis keluar emel lalai lama seperti admin@yayasanannabawi.com
        const cleaned = parsed
          .map((e) => (e || '').toLowerCase().trim())
          .filter((e) => e && e !== 'admin@yayasanannabawi.com');
        if (!cleaned.includes('salam@yayasanannabawi.com')) {
          cleaned.unshift('salam@yayasanannabawi.com');
        }
        return cleaned;
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return ['salam@yayasanannabawi.com'];
}

function saveAllowedAdminEmails(list) {
  try {
    let cleanList = (list || [])
      .map((e) => (e || '').toLowerCase().trim())
      .filter((e) => e && e !== 'admin@yayasanannabawi.com');
    if (!cleanList.includes('salam@yayasanannabawi.com')) {
      cleanList.unshift('salam@yayasanannabawi.com');
    }
    localStorage.setItem(ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.warn(e);
  }
}

// State
let allRecords = getStoredRecords();
let selectedIds = new Set();
let unsubscribeListener = null;
let unsubscribeSettingsListener = null;

// Melanggan kemas kini senarai emel admin dari Firestore secara masa-nyata
function subscribeToAllowedEmails() {
  if (unsubscribeSettingsListener) return;
  try {
    const docRef = doc(db, 'settings', 'allowedEmails');
    unsubscribeSettingsListener = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.emails)) {
          let firestoreEmails = data.emails
            .map((e) => (e || '').toLowerCase().trim())
            .filter((e) => e && e !== 'admin@yayasanannabawi.com');
          if (!firestoreEmails.includes('salam@yayasanannabawi.com')) {
            firestoreEmails.unshift('salam@yayasanannabawi.com');
          }
          saveAllowedAdminEmails(firestoreEmails);
          renderAllowedEmails();
        }
      }
    }, (err) => {
      console.warn('Realtime settings listener warning:', err);
    });
  } catch (err) {
    console.warn('Gagal melanggan settings/allowedEmails:', err);
  }
}

// DOM Elements
const authGate = document.getElementById('adminAuthGate');
const mainDashboard = document.getElementById('adminMainDashboard');
const userSection = document.getElementById('adminUserSection');
const userEmailEl = document.getElementById('adminUserEmail');
const authErrorMsg = document.getElementById('authErrorMsg');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');

const statTotal = document.getElementById('statTotal');
const statUnread = document.getElementById('statUnread');
const statRead = document.getElementById('statRead');
const statDonations = document.getElementById('statDonations');

const statusFilter = document.getElementById('adminStatusFilter');
const dateFilter = document.getElementById('adminDateFilter');
const dateFromInput = document.getElementById('adminDateFrom');
const dateToInput = document.getElementById('adminDateTo');
const searchInput = document.getElementById('adminSearchInput');

const selectAllCheckbox = document.getElementById('selectAllRows');
const selectedCountBadge = document.getElementById('selectedCountBadge');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkDeleteBtnText = document.getElementById('bulkDeleteBtnText');
const tableBody = document.getElementById('adminTableBody');

const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const manageEmailsBtn = document.getElementById('adminManageEmailsBtn');

// Emails modal
const emailModal = document.getElementById('emailManagementModal');
const closeEmailModalBtn = document.getElementById('closeEmailMgmtBtn');
const newEmailInput = document.getElementById('newAdminEmailInput');
const addEmailBtn = document.getElementById('addAdminEmailBtn');
const allowedEmailsList = document.getElementById('allowedEmailsList');

const SUPER_ADMIN_EMAIL = 'salam@yayasanannabawi.com';

// 1. Auth Handling (Google / Email Login Only)
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const rawEmail = (user.email || user.providerData?.[0]?.email || '').toLowerCase().trim();
    const email = rawEmail;
    const isSuperAdmin = (email === SUPER_ADMIN_EMAIL);

    let allowed = getAllowedAdminEmails().map((e) => e.toLowerCase().trim());
    if (!allowed.includes(SUPER_ADMIN_EMAIL)) {
      allowed.unshift(SUPER_ADMIN_EMAIL);
      saveAllowedAdminEmails(allowed);
    }
    let isAllowed = isSuperAdmin || allowed.includes(email);

    // Ambil senarai terkini dari Firestore settings/allowedEmails
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'allowedEmails'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.emails)) {
          let firestoreEmails = data.emails
            .map((e) => (e || '').toLowerCase().trim())
            .filter((e) => e && e !== 'admin@yayasanannabawi.com');

          if (!firestoreEmails.includes(SUPER_ADMIN_EMAIL)) {
            firestoreEmails.unshift(SUPER_ADMIN_EMAIL);
          }

          // Jika dalam Firestore tiada salam@yayasanannabawi.com atau masih ada admin@..., kemas kini terus
          if (!data.emails.includes(SUPER_ADMIN_EMAIL) || data.emails.includes('admin@yayasanannabawi.com')) {
            setDoc(doc(db, 'settings', 'allowedEmails'), {
              emails: firestoreEmails,
              updatedAt: serverTimestamp()
            }).catch(console.warn);
          }

          saveAllowedAdminEmails(firestoreEmails);
          allowed = firestoreEmails;
          isAllowed = isSuperAdmin || allowed.includes(email);
        }
      } else {
        await setDoc(doc(db, 'settings', 'allowedEmails'), {
          emails: [SUPER_ADMIN_EMAIL],
          updatedAt: serverTimestamp()
        });
        saveAllowedAdminEmails([SUPER_ADMIN_EMAIL]);
        allowed = [SUPER_ADMIN_EMAIL];
        isAllowed = isSuperAdmin || allowed.includes(email);
      }
    } catch (err) {
      console.warn('Gagal membaca Firestore settings/allowedEmails:', err);
    }

    if (isAllowed) {
      if (authGate) authGate.style.display = 'none';
      if (mainDashboard) mainDashboard.style.display = 'block';
      if (userSection) userSection.style.display = 'flex';
      if (userEmailEl) userEmailEl.textContent = email;
      if (authErrorMsg) authErrorMsg.style.display = 'none';

      // Daftarkan/kemas kini rekod dalam admins/{uid} untuk pengesahan security rules
      try {
        await setDoc(doc(db, 'admins', user.uid), {
          email: email,
          role: 'admin',
          lastLogin: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Gagal mendaftar admins/{uid}:', err);
      }

      subscribeToAllowedEmails();
      startRealtimeListener();
      renderDashboard();
    } else {
      if (authGate) authGate.style.display = 'block';
      if (mainDashboard) mainDashboard.style.display = 'none';
      if (userSection) userSection.style.display = 'flex';
      if (userEmailEl) userEmailEl.textContent = email;
      if (authErrorMsg) {
        authErrorMsg.style.display = 'block';
        authErrorMsg.textContent = `Akaun (${email}) belum didaftarkan sebagai petugas. Sila hubungi pihak pentadbir Yayasan An Nabawi.`;
      }
    }
  } else {
    if (authGate) authGate.style.display = 'block';
    if (mainDashboard) mainDashboard.style.display = 'none';
    if (userSection) userSection.style.display = 'none';
    if (userEmailEl) userEmailEl.textContent = '';
    if (authErrorMsg) authErrorMsg.style.display = 'none';

    if (unsubscribeListener) {
      unsubscribeListener();
      unsubscribeListener = null;
    }
    if (unsubscribeSettingsListener) {
      unsubscribeSettingsListener();
      unsubscribeSettingsListener = null;
    }
  }
});

googleSignInBtn?.addEventListener('click', async () => {
  if (authErrorMsg) authErrorMsg.style.display = 'none';
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error('Google Sign-In Error:', err);
    if (authErrorMsg) {
      authErrorMsg.style.display = 'block';
      const msg = err.message || String(err);
      if (msg.includes('unauthorized-domain') || err.code === 'auth/unauthorized-domain') {
        authErrorMsg.innerHTML = `
          <strong>Domain Belum Didaftarkan di Firebase Auth:</strong><br>
          Sila daftarkan domain <code>${window.location.hostname}</code> (atau <code>vercel.app</code>) ke dalam <strong>Authorized Domains</strong> di Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains.
        `;
      } else {
        authErrorMsg.textContent = 'Gagal log masuk: ' + msg;
      }
    }
  }
});

adminLogoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn(err);
  }
  if (authGate) authGate.style.display = 'block';
  if (mainDashboard) mainDashboard.style.display = 'none';
  if (userSection) userSection.style.display = 'none';
  if (userEmailEl) userEmailEl.textContent = '';
  if (authErrorMsg) authErrorMsg.style.display = 'none';
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }
});

// 2. Realtime Listener
function startRealtimeListener() {
  if (unsubscribeListener) return;
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    unsubscribeListener = onSnapshot(q, (snapshot) => {
      const records = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
        });
      });

      if (records.length > 0) {
        allRecords = records;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        renderDashboard();
      }
    }, (err) => {
      console.warn('Realtime listener warning, using local data:', err);
    });
  } catch (e) {
    console.warn('Failed to start listener:', e);
  }
}

// 3. Helper: Date Filter matching (Hanya Semua, Hari Ini, dan Pilih Range Tarikh)
function matchesDateFilter(recordDateIso, preset, fromVal, toVal) {
  if (!recordDateIso) return true;
  if (preset === 'semua') return true;

  const itemDate = new Date(recordDateIso);
  const now = new Date();

  // Helper untuk mendapatkan format YYYY-MM-DD waktu tempatan
  const getLocalDateStr = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const itemDateStr = getLocalDateStr(itemDate);
  const todayStr = getLocalDateStr(now);

  if (preset === 'hari-ini') {
    return itemDateStr === todayStr;
  }

  if (preset === 'custom') {
    if (fromVal && itemDateStr < fromVal) return false;
    if (toVal && itemDateStr > toVal) return false;
    return true;
  }

  return true;
}

function formatDisplayDate(dateIso) {
  if (!dateIso) {
    return {
      dateStr: '-',
      dayStr: '',
      timeStr: '',
      fullText: '-',
      pdfText: '-'
    };
  }
  try {
    const d = new Date(dateIso);
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    const month = monthNames[d.getMonth()] || '';
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHour = hours % 12 || 12;
    const dayNames = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const dayName = dayNames[d.getDay()];

    const dateStr = `${day} ${month} ${year}`;
    const timeStr = `${formattedHour}:${minutes} ${ampm}`;
    const fullText = `${dateStr}, ${timeStr} (${dayName})`;
    const pdfText = `${dateStr}\n${timeStr} (${dayName})`;

    return {
      dateStr,
      dayStr: dayName,
      timeStr,
      fullText,
      pdfText
    };
  } catch {
    return {
      dateStr: String(dateIso),
      dayStr: '',
      timeStr: '',
      fullText: String(dateIso),
      pdfText: String(dateIso)
    };
  }
}

// 4. Get Current Filtered Records
function getFilteredRecords() {
  const statusVal = statusFilter?.value || 'Semua';
  const datePreset = dateFilter?.value || 'semua';
  const fromVal = dateFromInput?.value || '';
  const toVal = dateToInput?.value || '';
  const q = (searchInput?.value || '').toLowerCase().trim();

  return allRecords.filter((r) => {
    // Status
    if (statusVal === 'belum' && r.dibaca) return false;
    if (statusVal === 'dibaca' && !r.dibaca) return false;
    // Date
    if (!matchesDateFilter(r.createdAt, datePreset, fromVal, toVal)) {
      return false;
    }
    // Search query
    if (q) {
      const matchPengirim = (r.pengirim || '').toLowerCase().includes(q);
      const matchHajat = (r.hajat || '').toLowerCase().includes(q);
      const matchNama = (r.nama || []).some((n) => (n || '').toLowerCase().includes(q));
      const matchTel = (r.telefon || '').includes(q);
      if (!matchPengirim && !matchHajat && !matchNama && !matchTel) return false;
    }
    return true;
  });
}

// 5. Render Dashboard
function renderDashboard() {
  const filtered = getFilteredRecords();

  // Statistics
  const total = allRecords.length;
  const unread = allRecords.filter((r) => !r.dibaca).length;
  const read = allRecords.filter((r) => r.dibaca).length;
  const totalDonations = allRecords
    .filter((r) => r.status === 'dibayar')
    .reduce((sum, r) => sum + (Number(r.sumbangan) || 0), 0);

  if (statTotal) statTotal.textContent = total;
  if (statUnread) statUnread.textContent = unread;
  if (statRead) statRead.textContent = read;
  if (statDonations) statDonations.textContent = `RM${totalDonations.toLocaleString()}`;

  // Update selected count badge
  updateSelectedCountUI(filtered);

  if (!tableBody) return;
  tableBody.innerHTML = '';

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:48px 16px; color:var(--muted);">
          <div style="font-size:15px; font-weight:600; margin-bottom:4px;">Tiada Rekod Dijumpai</div>
          <div style="font-size:13px;">Sila ubah pilihan tapisan tarikh, status atau carian anda di atas.</div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((item, idx) => {
    const isChecked = selectedIds.has(item.id);
    const tr = document.createElement('tr');
    if (item.dibaca) tr.classList.add('is-read');
    if (isChecked) tr.classList.add('is-selected');

    const dateInfo = formatDisplayDate(item.createdAt);
    const namesHtml = (item.nama || [])
      .map((n) => `<span class="tbl-name-item">${escapeHtml(n)}</span>`)
      .join('');

    const methodHtml = item.kaedah ? `<div style="font-size:11px; color:#027A48; font-weight:600; margin-top:2px;">${escapeHtml(item.kaedah)}</div>` : '';

    const isQr = item.kaedah === 'Dibayar ke QR' || item.kaedah === 'DuitNow QR' || (item.status === 'dibayar' && (!item.sumbangan || Number(item.sumbangan) === 0));

    const statusBadge =
      isQr
        ? `<span class="badge badge--dibayar" style="background:#ECFDF3; color:#027A48; font-weight:700; border:1px solid #A6F4C5;">Dibayar ke QR</span>`
        : item.status === 'dibayar'
        ? `<span class="badge badge--dibayar">RM${item.sumbangan} (FPX)</span>`
        : item.sumbangan > 0
        ? `<span class="badge badge--menunggu">RM${item.sumbangan} (Menunggu)</span>`
        : `<span class="badge" style="background:#F2F4F7; color:#475467;">Percuma</span>`;

    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="row-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} aria-label="Pilih doa ${idx + 1}">
      </td>
      <td style="text-align:center;"><strong>${idx + 1}</strong></td>
      <td class="tbl-date">
        <strong class="date-main">${dateInfo.dateStr}</strong>
        <span class="date-sub">${dateInfo.dayStr} · ${dateInfo.timeStr}</span>
      </td>
      <td class="tbl-names-col">${namesHtml}</td>
      <td><span class="badge badge--hajat">${escapeHtml(item.jenisHajat || '-')}</span></td>
      <td class="tbl-hajat-col">
        <div class="hajat-snippet" title="${escapeHtml(item.hajat || '')}">
          ${item.hajat ? escapeHtml(item.hajat) : '<span style="color:#999; font-style:italic;">(Tiada catatan khusus)</span>'}
        </div>
      </td>
      <td>
        <div style="font-weight:600; font-size:13.5px; color:var(--ink);">${escapeHtml(item.pengirim || '-')}</div>
        ${item.telefon ? `<div style="font-size:12px; color:var(--muted);">${escapeHtml(item.telefon)}</div>` : ''}
      </td>
      <td>${statusBadge}</td>
      <td style="text-align:center;">
        <button type="button" class="btn btn--sm" data-toggle-read="${item.id}" style="min-height:28px; font-size:11.5px; padding:0 8px; border-radius:6px; font-weight:600; cursor:pointer; ${item.dibaca ? 'background:#ECFDF3; color:#027A48; border:1px solid #A6F4C5;' : 'background:#FEF3F2; color:#B42318; border:1px solid #FECDCA;'}" title="Klik untuk tukar status">
          ${item.dibaca ? '✓ Selesai' : 'Belum Selesai'}
        </button>
      </td>
      <td style="text-align:center;">
        <button type="button" class="row-delete-btn" data-delete-row="${item.id}" title="Padam rekod ${escapeHtml(item.pengirim || '')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach row events
  tableBody.querySelectorAll('.row-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
      renderDashboard();
    });
  });

  tableBody.querySelectorAll('[data-toggle-read]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.toggleRead;
      const target = allRecords.find((r) => r.id === id);
      if (target) {
        const nextState = !target.dibaca;
        updateRecordInStorage(id, { dibaca: nextState, waktuDibaca: new Date().toISOString() });
        allRecords = getStoredRecords();
        renderDashboard();
        try {
          const docRef = doc(db, COLLECTION_NAME, id);
          await updateDoc(docRef, { dibaca: nextState, waktuDibaca: new Date().toISOString() });
        } catch (err) {
          console.warn('Firestore update error:', err);
        }
      }
    });
  });

  tableBody.querySelectorAll('[data-delete-row]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.deleteRow;
      const target = allRecords.find((r) => r.id === id);
      const name = target ? (target.pengirim || 'rekod ini') : 'rekod ini';
      const confirmed = confirm(`Adakah anda pasti ingin memadam rekod kiriman doa (${name}) secara kekal? Tindakan ini tidak boleh dikembalikan.`);
      if (!confirmed) return;

      selectedIds.delete(id);
      allRecords = deleteRecordsFromStorage([id]);
      renderDashboard();

      showToastNotification(`Sedang memadam rekod (${name})...`);
      await deleteRecordsFromFirestore([id]);
      showToastNotification(`✓ Rekod doa (${name}) telah berjaya dipadam.`);
      renderDashboard();
    });
  });
}

function updateSelectedCountUI(filteredList) {
  const count = selectedIds.size;
  if (selectedCountBadge) {
    if (count > 0) {
      selectedCountBadge.textContent = `${count} doa dipilih`;
      selectedCountBadge.hidden = false;
    } else {
      selectedCountBadge.textContent = `Semua (${filteredList.length}) rekod dipaparkan`;
      selectedCountBadge.hidden = false;
    }
  }

  if (bulkDeleteBtn) {
    if (count > 0) {
      bulkDeleteBtn.style.display = 'inline-flex';
      if (bulkDeleteBtnText) {
        bulkDeleteBtnText.textContent = `Padam (${count}) Rekod Terpilih`;
      }
    } else {
      bulkDeleteBtn.style.display = 'none';
    }
  }

  if (selectAllCheckbox) {
    if (filteredList.length > 0 && filteredList.every((r) => selectedIds.has(r.id))) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (count > 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }
}

// Bulk Delete Handler bagi rekod yang dipilih
bulkDeleteBtn?.addEventListener('click', async () => {
  const count = selectedIds.size;
  if (count === 0) {
    alert('Sila tandakan sekurang-kurangnya satu rekod kiriman doa untuk dipadam.');
    return;
  }

  const confirmed = confirm(`Adakah anda pasti ingin memadam ${count} rekod kiriman doa terpilih ini secara kekal dari pangkalan data cloud? Tindakan ini tidak boleh dikembalikan.`);
  if (!confirmed) return;

  const idsToDelete = Array.from(selectedIds);

  // 1. Padam secara serta-merta dari storan tempatan
  allRecords = deleteRecordsFromStorage(idsToDelete);
  selectedIds.clear();
  renderDashboard();

  // 2. Padam secara kekal dari Firestore Cloud
  showToastNotification(`Sedang memadam ${count} rekod doa dari pangkalan data...`);
  await deleteRecordsFromFirestore(idsToDelete);
  showToastNotification(`✓ ${count} rekod doa terpilih telah berjaya dipadam secara kekal.`);
  renderDashboard();
});

// Select all toggle
selectAllCheckbox?.addEventListener('change', (e) => {
  const filtered = getFilteredRecords();
  if (e.target.checked) {
    filtered.forEach((r) => selectedIds.add(r.id));
  } else {
    filtered.forEach((r) => selectedIds.delete(r.id));
  }
  renderDashboard();
});

// Filter change listeners
statusFilter?.addEventListener('change', renderDashboard);

const resetDateRangeBtn = document.getElementById('resetDateRangeBtn');
const dateChips = document.querySelectorAll('[data-date-chip]');

function updateDateFilterUI(val) {
  const customBox = document.getElementById('customDateRangeWrap');
  if (customBox) {
    customBox.style.display = val === 'custom' ? 'flex' : 'none';
  }
  dateChips.forEach((chip) => {
    if (chip.dataset.dateChip === val) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

dateFilter?.addEventListener('change', () => {
  const val = dateFilter.value;
  updateDateFilterUI(val);
  if (val === 'custom') {
    if (dateFromInput && !dateFromInput.value) {
      const today = new Date().toISOString().slice(0, 10);
      dateFromInput.value = today;
      if (dateToInput) dateToInput.value = today;
    }
  }
  renderDashboard();
});

dateChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const preset = chip.dataset.dateChip;
    if (dateFilter) {
      dateFilter.value = preset;
    }
    updateDateFilterUI(preset);
    if (preset === 'custom') {
      if (dateFromInput && !dateFromInput.value) {
        const today = new Date().toISOString().slice(0, 10);
        dateFromInput.value = today;
        if (dateToInput) dateToInput.value = today;
      }
    }
    renderDashboard();
  });
});

resetDateRangeBtn?.addEventListener('click', () => {
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
  if (dateFilter) dateFilter.value = 'semua';
  updateDateFilterUI('semua');
  renderDashboard();
});

dateFromInput?.addEventListener('change', renderDashboard);
dateToInput?.addEventListener('change', renderDashboard);
searchInput?.addEventListener('input', renderDashboard);

// 4 Cawangan Rasmi Yayasan An Nabawi untuk agihan bacaan doa huffaz
const TAHFIZ_BRANCHES = [
  'Maahad Tahfiz Integrasi Al-Azhari Machang',
  'Maahad Tahfiz An Nabawi Shah Alam',
  'Maahad Tahfiz An Nabawi Jerantut',
  'Maahad Tahfiz An Nabawi Langkawi'
];

/**
 * Agihkan senarai doa kepada cawangan tahfiz secara rawak dan sama rata
 */
function distributeRecordsToBranches(records, branchList = TAHFIZ_BRANCHES) {
  const activeBranches = (branchList && branchList.length > 0) ? branchList : TAHFIZ_BRANCHES;

  // 1. Kocok secara rawak (Fisher-Yates Shuffle)
  const shuffled = [...records];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 2. Agihkan secara bergilir (round-robin) kepada cawangan yang dipilih
  const distribution = {};
  activeBranches.forEach((branchName) => {
    distribution[branchName] = [];
  });

  shuffled.forEach((record, index) => {
    const branchName = activeBranches[index % activeBranches.length];
    distribution[branchName].push({
      ...record,
      assignedBranch: branchName
    });
  });

  return distribution;
}

/**
 * Papar notifikasi toast ringkas bagi maklum balas tindakan admin
 */
function showToastNotification(message) {
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Tanda secara automatik rekod yang telah dimuat turun sebagai 'Selesai' (dibaca = true)
 */
async function markRecordsAsDownloadedAndRead(records) {
  if (!records || records.length === 0) return;
  const nowIso = new Date().toISOString();

  // 1. Kemas kini storan tempatan serta-merta
  records.forEach((r) => {
    updateRecordInStorage(r.id, {
      dibaca: true,
      waktuDibaca: nowIso,
      dimuatTurunPada: nowIso
    });
    const target = allRecords.find((item) => item.id === r.id);
    if (target) {
      target.dibaca = true;
      target.waktuDibaca = nowIso;
      target.dimuatTurunPada = nowIso;
    }
  });

  allRecords = getStoredRecords();
  selectedIds.clear();
  renderDashboard();

  // Makluman visual
  showToastNotification(`✓ ${records.length} doa telah dimuat turun & ditandakan sebagai Selesai.`);

  // 2. Kemas kini pangkalan data Firestore secara kekal
  const updatePromises = records.map(async (r) => {
    if (r.id.startsWith('seed-')) return;
    try {
      const docRef = doc(db, COLLECTION_NAME, r.id);
      await updateDoc(docRef, {
        dibaca: true,
        waktuDibaca: nowIso,
        dimuatTurunPada: nowIso
      });
    } catch (err) {
      console.warn('Gagal mengemas kini status Firestore bagi ID:', r.id, err);
    }
  });

  await Promise.allSettled(updatePromises);
}

// 6. MUAT TURUN CSV (DENGAN AGIHAN 4 CAWANGAN TAHFIZ)
exportCsvBtn?.addEventListener('click', async () => {
  const filtered = getFilteredRecords();
  const recordsToExport = selectedIds.size > 0
    ? filtered.filter((r) => selectedIds.has(r.id))
    : filtered;

  if (!recordsToExport.length) {
    alert('Tiada rekod untuk dimuat turun ke CSV.');
    return;
  }

  // Agihkan doa secara rawak kepada 4 cawangan
  const distributed = distributeRecordsToBranches(recordsToExport);

  const headers = [
    'No',
    'Cawangan Agihan (Tahfiz)',
    'Nama Didoakan',
    'Jenis Hajat',
    'Catatan Hajat',
    'Tarikh Submission',
    'Pengirim',
    'WhatsApp / Tel'
  ];

  let counter = 1;
  const rows = [];

  TAHFIZ_BRANCHES.forEach((branchName) => {
    const branchItems = distributed[branchName] || [];
    branchItems.forEach((r) => {
      const dInfo = formatDisplayDate(r.createdAt);
      rows.push([
        counter++,
        `"${branchName.replace(/"/g, '""')}"`,
        `"${(r.nama || []).join('; ').replace(/"/g, '""')}"`,
        `"${(r.jenisHajat || '').replace(/"/g, '""')}"`,
        `"${(r.hajat || '').replace(/"/g, '""')}"`,
        `"${dInfo.fullText}"`,
        `"${(r.pengirim || '').replace(/"/g, '""')}"`,
        `"${(r.telefon || '-').replace(/"/g, '""')}"`,
      ]);
    });
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `Halaqah-Bacaan-Doa-Tahlil-4-Cawangan-YAN-${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Tanda selesai secara automatik bagi nama yang telah dimuat turun
  await markRecordsAsDownloadedAndRead(recordsToExport);
});

// 7. MUAT TURUN PDF (A4 KEMAS — PILIHAN MENGIKUT CAWANGAN TAHFIZ)
const pdfBranchModal = document.getElementById('pdfBranchModal');
const closePdfBranchBtn = document.getElementById('closePdfBranchBtn');
const cancelPdfBranchBtn = document.getElementById('cancelPdfBranchBtn');
const confirmGeneratePdfBtn = document.getElementById('confirmGeneratePdfBtn');
const toggleAllBranchesBtn = document.getElementById('toggleAllBranchesBtn');

closePdfBranchBtn?.addEventListener('click', () => {
  if (pdfBranchModal) pdfBranchModal.hidden = true;
});

cancelPdfBranchBtn?.addEventListener('click', () => {
  if (pdfBranchModal) pdfBranchModal.hidden = true;
});

toggleAllBranchesBtn?.addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('input[name="pdfBranch"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });
  toggleAllBranchesBtn.textContent = !allChecked ? 'Nyahpilih Semua' : 'Pilih Semua (4 Cawangan)';
});

exportPdfBtn?.addEventListener('click', () => {
  const filtered = getFilteredRecords();
  const recordsToExport = selectedIds.size > 0
    ? filtered.filter((r) => selectedIds.has(r.id))
    : filtered;

  if (!recordsToExport.length) {
    alert('Tiada rekod untuk dimuat turun ke PDF.');
    return;
  }

  if (pdfBranchModal) {
    pdfBranchModal.hidden = false;
  }
});

confirmGeneratePdfBtn?.addEventListener('click', async () => {
  const selectedBranches = Array.from(document.querySelectorAll('input[name="pdfBranch"]:checked'))
    .map(cb => cb.value);

  if (selectedBranches.length === 0) {
    alert('Sila pilih sekurang-kurangnya satu cawangan untuk agihan senarai doa.');
    return;
  }

  const filtered = getFilteredRecords();
  const recordsToExport = selectedIds.size > 0
    ? filtered.filter((r) => selectedIds.has(r.id))
    : filtered;

  if (!recordsToExport.length) {
    alert('Tiada rekod untuk dimuat turun ke PDF.');
    if (pdfBranchModal) pdfBranchModal.hidden = true;
    return;
  }

  if (pdfBranchModal) pdfBranchModal.hidden = true;

  await generatePdfForBranches(recordsToExport, selectedBranches);
});

async function generatePdfForBranches(recordsToExport, selectedBranches) {
  // Agihkan doa secara rawak kepada cawangan yang dipilih sahaja
  const distributed = distributeRecordsToBranches(recordsToExport, selectedBranches);

  // Cipta Dokumen PDF Saiz A4 Portrait (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm

  const currentDateStr = new Date().toLocaleDateString('ms-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const currentTimeStr = new Date().toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  let isFirstBranch = true;

  selectedBranches.forEach((branchName) => {
    const branchItems = distributed[branchName] || [];

    // Setiap cawangan bermula di muka surat baharu supaya mudah dicetak dan diserahkan
    if (!isFirstBranch) {
      doc.addPage();
    }
    isFirstBranch = false;

    // 1. Kepala Dokumen (Tajuk: Halaqah Bacaan Doa & Tahlil)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(22, 24, 29);
    doc.text('Halaqah Bacaan Doa & Tahlil', 14, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(2, 122, 72); // Hijau status mustajab
    doc.text('YAYASAN AN NABAWI · WAKTU MUSTAJAB SEBELUM BERBUKA PUASA SUNAT', 14, 19.5);

    // 2. Kotak Cawangan Yang Menyerlah & Kemas
    doc.setFillColor(248, 247, 244);
    doc.setDrawColor(220, 224, 230);
    doc.roundedRect(14, 23, pageWidth - 28, 23, 2, 2, 'FD');

    // Nama Cawangan Penuh
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(27, 43, 107); // Biru tua berwibawa
    doc.text(branchName.toUpperCase(), 18, 31);

    // Metadata: Tarikh Dijana
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Tarikh Dijana: ${currentDateStr} (${currentTimeStr})   |   Jumlah Agihan: ${branchItems.length} Doa   |   Waktu: Isnin & Khamis 6:45 Petang`, 18, 38);
    doc.text('Arahan: Sila bacakan dan aminkan nama serta hajat di bawah bersama para pelajar sebelum azan Maghrib.', 18, 43);

    // 3. Sediakan Data Jadual (Ringkas: Nama Didoakan, Jenis Hajat, Catatan Hajat)
    let tableData;
    if (branchItems.length === 0) {
      tableData = [[
        '-',
        'Tiada Rekod',
        '-',
        'Tiada permohonan doa diagihkan untuk cawangan ini bagi sesi semasa.'
      ]];
    } else {
      tableData = branchItems.map((r, idx) => {
        const names = (r.nama || []).join('\n');
        const jenis = r.jenisHajat || '-';
        const hajat = r.hajat || '(Tiada catatan khusus — mohon doakan kebaikan umum dunia dan akhirat)';
        return [
          idx + 1,
          names,
          jenis,
          hajat
        ];
      });
    }

    // 4. Jana Jadual Kemas (A4) Menggunakan AutoTable
    autoTable(doc, {
      startY: 49,
      head: [[
        'No',
        'Nama Didoakan',
        'Jenis Hajat',
        'Catatan Hajat'
      ]],
      body: tableData,
      margin: { left: 14, right: 14, bottom: 18 },
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 3.5,
        textColor: [22, 24, 29],
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        valign: 'top',
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [22, 24, 29], // Dark slate navy
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },   // No
        1: { cellWidth: 54, fontStyle: 'bold' }, // Nama Didoakan
        2: { cellWidth: 32 },                    // Jenis Hajat
        3: { cellWidth: 'auto' }                 // Catatan Hajat (luas & kemas)
      },
      alternateRowStyles: {
        fillColor: [250, 249, 246],
      },
      didDrawPage: (data) => {
        // Footer bagi setiap halaman
        const totalPages = doc.internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Halaqah Bacaan Doa & Tahlil (${branchName}) — Yayasan An Nabawi`, 14, pageHeight - 8);
        doc.text(`Halaman ${data.pageNumber} daripada ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
      }
    });
  });

  const dateFileStr = new Date().toISOString().slice(0, 10);
  const branchCountStr = selectedBranches.length === TAHFIZ_BRANCHES.length ? 'Semua-4-Cawangan' : `${selectedBranches.length}-Cawangan`;
  doc.save(`Halaqah-Bacaan-Doa-Tahlil-${branchCountStr}-YAN-${dateFileStr}.pdf`);

  // Tanda selesai secara automatik bagi nama yang telah dimuat turun
  await markRecordsAsDownloadedAndRead(recordsToExport);
}

// 8. Senarai Petugas (Email Management)
function renderAllowedEmails() {
  if (!allowedEmailsList) return;
  const emails = getAllowedAdminEmails();
  allowedEmailsList.innerHTML = '';
  emails.forEach((em) => {
    const isPrimary = em.toLowerCase().trim() === 'salam@yayasanannabawi.com';
    const div = document.createElement('div');
    div.className = 'email-row-item';
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-weight:${isPrimary ? '700' : '500'}; color:var(--ink);">${escapeHtml(em)}</span>
        ${isPrimary ? '<span class="badge" style="background:#ECFDF3; color:#027A48; font-size:11px; padding:2px 8px; border-radius:999px; font-weight:700;">Petugas Utama</span>' : ''}
      </div>
      ${isPrimary 
        ? '<span style="font-size:11.5px; color:var(--muted); font-style:italic;">(Kekal)</span>'
        : `<button type="button" data-remove-email="${escapeHtml(em)}" title="Padam e-mel">&times; Padam</button>`
      }
    `;
    allowedEmailsList.appendChild(div);
  });

  allowedEmailsList.querySelectorAll('[data-remove-email]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const emailToRemove = (e.currentTarget.dataset.removeEmail || '').toLowerCase().trim();
      const currentList = getAllowedAdminEmails();
      const filtered = currentList.filter((item) => item.toLowerCase().trim() !== emailToRemove);
      if (filtered.length === 0) {
        alert('Sekurang-kurangnya satu e-mel admin mesti dikekalkan.');
        return;
      }
      saveAllowedAdminEmails(filtered);
      renderAllowedEmails();

      // Kemas kini ke Firestore cloud secara mutlak (tanpa merge semula)
      try {
        await setDoc(doc(db, 'settings', 'allowedEmails'), {
          emails: filtered,
          updatedAt: serverTimestamp()
        });
        showToastNotification(`✓ E-mel (${emailToRemove}) telah dipadam dari pangkalan data cloud.`);
      } catch (err) {
        console.warn('Gagal kemas kini padam ke Firestore:', err);
        showToastNotification(`Amaran: Gagal simpan ke Cloud (${err.message})`);
      }
    });
  });
}

manageEmailsBtn?.addEventListener('click', () => {
  renderAllowedEmails();
  if (emailModal) emailModal.hidden = false;
});

closeEmailModalBtn?.addEventListener('click', () => {
  if (emailModal) emailModal.hidden = true;
});

addEmailBtn?.addEventListener('click', async () => {
  const emailVal = (newEmailInput?.value || '').trim().toLowerCase();
  if (!emailVal || !emailVal.includes('@')) {
    alert('Sila masukkan format e-mel yang sah.');
    return;
  }
  const current = getAllowedAdminEmails();
  if (!current.map((e) => e.toLowerCase()).includes(emailVal)) {
    current.push(emailVal);
    saveAllowedAdminEmails(current);
    renderAllowedEmails();
    if (newEmailInput) newEmailInput.value = '';

    // Simpan ke Firestore cloud secara automatik agar user boleh akses dari mana-mana peranti
    try {
      await setDoc(doc(db, 'settings', 'allowedEmails'), {
        emails: current,
        updatedAt: serverTimestamp()
      });
      showToastNotification(`✓ E-mel (${emailVal}) berjaya didaftarkan ke pangkalan data cloud.`);
    } catch (err) {
      console.warn('Gagal menyimpan ke Firestore settings/allowedEmails:', err);
      showToastNotification(`E-mel disimpan secara setempat (Cloud sync: ${err.message})`);
    }
  } else {
    alert('E-mel ini sudah berada dalam senarai.');
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Google Analytics (GA4) Configuration Logic
const adminGaConfigBtn = document.getElementById('adminGaConfigBtn');
const gaConfigModal = document.getElementById('gaConfigModal');
const closeGaConfigBtn = document.getElementById('closeGaConfigBtn');
const saveGaConfigBtn = document.getElementById('saveGaConfigBtn');
const gaMeasurementIdInput = document.getElementById('gaMeasurementIdInput');

adminGaConfigBtn?.addEventListener('click', () => {
  if (gaMeasurementIdInput) {
    gaMeasurementIdInput.value = localStorage.getItem('yan_ga_measurement_id') || '';
  }
  if (gaConfigModal) gaConfigModal.hidden = false;
});

closeGaConfigBtn?.addEventListener('click', () => {
  if (gaConfigModal) gaConfigModal.hidden = true;
});

saveGaConfigBtn?.addEventListener('click', () => {
  const val = (gaMeasurementIdInput?.value || '').trim();
  if (val) {
    localStorage.setItem('yan_ga_measurement_id', val);
    alert(`Google Analytics Measurement ID (${val}) berjaya disimpan!`);
  } else {
    localStorage.removeItem('yan_ga_measurement_id');
    alert('Tetapan Google Analytics telah ditetapkan semula ke nilai lalai.');
  }
  if (gaConfigModal) gaConfigModal.hidden = true;
});

// Initial boot
renderDashboard();
