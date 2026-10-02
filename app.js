// ===== Kirim Doa — Yayasan An Nabawi =====
// Ubah maklumat di CONFIG sahaja. Semua teks placeholder di halaman diisi dari sini.

import { 
  db, 
  auth, 
  googleProvider, 
  DEFAULT_ALLOWED_ADMIN_EMAILS, 
  handleFirestoreError, 
  OperationType 
} from './src/lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';

const BILLPLZ_STORAGE_KEY = 'yan_billplz_config';

function getStoredBillplzConfig() {
  try {
    const raw = localStorage.getItem(BILLPLZ_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(e);
  }
  const envUrl = import.meta.env?.VITE_BILLPLZ_URL;
  return {
    paymentUrl: envUrl || 'https://www.billplz.com/kirimdoa-yan?amount={amount}&billcode={id}',
    collectionId: 'kirimdoa-yan'
  };
}

const currentBillplzCfg = getStoredBillplzConfig();

export const CONFIG = {
  jadual: 'Setiap Isnin & Khamis sebelum waktu berbuka puasa (puasa sunat)',
  gateway: 'Billplz & DuitNow QR',
  alamat: 'No 23-3, Jalan Pegaga B U12/B, Desa Alam, Seksyen U12, 40170 Shah Alam, Selangor',
  telefon: '014-9200024',
  links: {
    social: 'https://www.facebook.com/tahfizannabawi/',
    facebook: 'https://www.facebook.com/tahfizannabawi/',
    instagram: 'https://instagram.com/yayasanannabawi',
    tiktok: 'https://www.tiktok.com/@yayasanannabawi',
  },
  // URL pembayaran sebenar. {amount} dan {id} akan diganti secara automatik.
  paymentUrl: currentBillplzCfg.paymentUrl,
  collection: 'kirimDoa',
  maxNames: 3,
};

// Google Analytics 4 (GA4) Tracking Helper
export function trackGAEvent(eventName, params = {}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  } catch (err) {
    console.debug('GA tracking error:', err);
  }
}

// ---------- Default Sample Data for Realistic Testing ----------
const SEED_DATA = [
  {
    id: 'doa-1001',
    pengirim: 'Hj. Ismail bin Wahab',
    telefon: '012-3849120',
    nama: ['Ismail bin Wahab', 'Khadijah binti Omar'],
    jenisHajat: 'Kesihatan',
    hajat: 'Semoga dikurniakan kesembuhan daripada strok ringan dan kesihatan berpanjangan.',
    cawangan: 'Shah Alam',
    sumbangan: 50,
    status: 'dibayar',
    dibaca: true,
    sumber: 'direct',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'doa-1002',
    pengirim: 'Norazlina Binti Kassim',
    telefon: '019-9482110',
    nama: ['Muhammad Hariz bin Zulkifli'],
    jenisHajat: 'Kejayaan',
    hajat: 'Semoga dipermudahkan menjawab peperiksaan SPM dan dikurniakan kefahaman ilmu yang terang.',
    cawangan: 'Machang',
    sumbangan: 30,
    status: 'dibayar',
    dibaca: false,
    sumber: 'facebook',
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: 'doa-1003',
    pengirim: 'Farhan Azim',
    telefon: null,
    nama: ['Allahyarham Azim bin Sulaiman', 'Allahyarhamah Ramlah binti Salleh'],
    jenisHajat: 'Untuk arwah',
    hajat: 'Mohon tahlil ringkas dan doa keampunan buat kedua arwah ibu bapa tercinta di alam barzakh.',
    cawangan: 'Semua cawangan',
    sumbangan: 0,
    status: 'baru',
    dibaca: false,
    sumber: 'direct',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'doa-1004',
    pengirim: 'Siti Sarah binti Idris',
    telefon: '013-5529011',
    nama: ['Siti Sarah binti Idris', 'Ahmad Daniyal bin Ridzwan'],
    jenisHajat: 'Zuriat',
    hajat: 'Memohon doa agar dikurniakan zuriat yang soleh dan solehah setelah 5 tahun mendirikan rumahtangga.',
    cawangan: 'Jerantut',
    sumbangan: 100,
    status: 'dibayar',
    dibaca: false,
    sumber: 'instagram',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'doa-1005',
    pengirim: 'Kamal Ariffin',
    telefon: null,
    nama: ['Kamal Ariffin bin Mansur'],
    jenisHajat: 'Rezeki',
    hajat: 'Semoga perniagaan bengkel kecil dipermudahkan dan bebas daripada belenggu hutang.',
    cawangan: 'Langkawi',
    sumbangan: 0,
    status: 'baru',
    dibaca: false,
    sumber: 'whatsapp',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
];

// ---------- Storage Management ----------
const STORAGE_KEY = 'yan_kirim_doa_records';

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

function saveRecordToStorage(record) {
  const current = getStoredRecords();
  const updated = [record, ...current];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Gagal menyimpan rekod:', err);
  }
  return updated;
}

function updateRecordInStorage(id, partial) {
  const current = getStoredRecords();
  const updated = current.map((item) => (item.id === id ? { ...item, ...partial } : item));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Gagal kemas kini rekod:', err);
  }
  return updated;
}

// ---------- Fill Placeholders from CONFIG ----------
document.querySelectorAll('[data-config]').forEach((el) => {
  el.textContent = CONFIG[el.dataset.config] ?? '';
});
document.querySelectorAll('[data-config-href]').forEach((el) => {
  const href = CONFIG.links[el.dataset.configHref];
  if (href) {
    el.href = href;
    if (href !== '#') {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  }
});
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Admin & Settings Management ----------
const ADMIN_EMAILS_STORAGE_KEY = 'yan_admin_allowed_emails';

function getAllowedAdminEmails() {
  try {
    const raw = localStorage.getItem(ADMIN_EMAILS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn(e);
  }
  return DEFAULT_ALLOWED_ADMIN_EMAILS;
}

function saveAllowedAdminEmails(list) {
  try {
    localStorage.setItem(ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn(e);
  }
}

// Live memory state of records
let currentRecordsList = getStoredRecords();
let unsubscribeKirimDoaListener = null;

// ---------- Firebase Initialization & Realtime Sync ----------
let saveFn = async (data) => {
  const customId = 'doa-' + Date.now();
  const docData = {
    ...data,
    createdAt: serverTimestamp(),
  };

  try {
    const docRef = doc(db, CONFIG.collection, customId);
    await setDoc(docRef, docData);
  } catch (err) {
    console.warn('Firestore setDoc failed, saving to local fallback:', err);
  }

  const localRecord = {
    id: customId,
    ...data,
    createdAt: new Date().toISOString(),
  };
  saveRecordToStorage(localRecord);
  return customId;
};

// Update record helper
async function updateRecordBoth(id, partial) {
  updateRecordInStorage(id, partial);
  try {
    const docRef = doc(db, CONFIG.collection, id);
    await updateDoc(docRef, partial);
  } catch (err) {
    console.warn('Update doc in Firestore failed, updated locally:', err);
  }
}

// Delete record helper
async function deleteRecordBoth(id) {
  const current = getStoredRecords();
  const updated = current.filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  currentRecordsList = updated;
  try {
    const docRef = doc(db, CONFIG.collection, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Delete in Firestore failed:', err);
  }
}

// ---------- DOM Elements ----------
const heroSection = document.querySelector('.hero');
const form = document.getElementById('doaForm');
const namesList = document.getElementById('namesList');
const addNameBtn = document.getElementById('addName');
const submitBtn = document.getElementById('submitBtn');
const errorEl = document.getElementById('formError');
const successEl = document.getElementById('success');

// Post-submission summary elements
const summaryPengirim = document.getElementById('summaryPengirim');
const summaryNama = document.getElementById('summaryNama');
const summaryHajat = document.getElementById('summaryHajat');

// Post-submission Tabs
const tabQrBtn = document.getElementById('tabQrBtn');
const tabBillplzBtn = document.getElementById('tabBillplzBtn');
const paneQr = document.getElementById('paneQr');
const paneBillplz = document.getElementById('paneBillplz');

// QR Option elements
const bankAccNo = document.getElementById('bankAccNo');
const copyAccBtn = document.getElementById('copyAccBtn');
const confirmQrPaidBtn = document.getElementById('confirmQrPaidBtn');

// Billplz Option elements
const postBillplzAmounts = document.getElementById('postBillplzAmounts');
const postCustomAmtWrap = document.getElementById('postCustomAmtWrap');
const postCustomAmt = document.getElementById('postCustomAmt');
const postBillplzAmtLabel = document.getElementById('postBillplzAmtLabel');
const btnBillplzAmtText = document.getElementById('btnBillplzAmtText');
const postBillplzBtn = document.getElementById('postBillplzBtn');
const paidReceiptNotice = document.getElementById('paidReceiptNotice');
const receiptText = document.getElementById('receiptText');

// State
const state = {
  jenisHajat: 'Kesihatan',
  cawangan: 'Semua cawangan',
  lastSubmittedId: null,
  lastSubmittedPengirim: '',
  formLoadTime: Date.now(),
};

let postDonationAmount = 30;

// ---------- Dynamic Name Inputs ----------
function addNameRow(focus = false) {
  const count = namesList.children.length;
  if (count >= CONFIG.maxNames) return;
  const i = count + 1;
  const row = document.createElement('div');
  row.className = 'name-row';
  row.innerHTML = `
    <label class="sr-only" for="nama-${i}">Nama ${i}</label>
    <input id="nama-${i}" name="nama" type="text" maxlength="80"
      placeholder="${i === 1 ? 'cth. Ahmad bin Ali (atau nama arwah/keluarga)' : 'Nama tambahan ke-' + i}" aria-label="Nama ${i}">
    ${i > 1 ? `<button type="button" class="remove" aria-label="Buang nama ${i}" title="Buang nama">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>` : ''}`;
  row.querySelector('label').style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
  row.querySelector('.remove')?.addEventListener('click', () => {
    row.remove();
    syncAddBtn();
  });
  namesList.appendChild(row);
  if (focus) row.querySelector('input').focus();
  syncAddBtn();
}

function syncAddBtn() {
  if (addNameBtn) {
    addNameBtn.hidden = namesList.children.length >= CONFIG.maxNames;
  }
}

if (addNameBtn) {
  addNameBtn.addEventListener('click', () => addNameRow(true));
  addNameRow();
}

// ---------- Chip Group Handlers (Hajat) ----------
document.querySelectorAll('[data-group="jenisHajat"]').forEach((group) => {
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    state.jenisHajat = chip.dataset.value;
  });
});

// ---------- Form Validation & Submission (100% Free Initial Submission) ----------
function showError(msg, field) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  if (field) {
    field.classList.add('invalid');
    field.focus();
  }
}

if (form) {
  form.addEventListener('input', (e) => {
    e.target.classList?.remove('invalid');
    errorEl.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    // 1. Anti-spam Check: Honeypot check
    const honeypot = form.elements['web_site_trap']?.value;
    if (honeypot && honeypot.trim().length > 0) {
      console.warn('Bot submission blocked via honeypot.');
      return;
    }

    // 2. Anti-spam Check: submission too fast (under 1.2 seconds from page load)
    const timeTaken = Date.now() - state.formLoadTime;
    if (timeTaken < 1200) {
      showError('Sila semak semula maklumat anda sebelum menghantar.');
      return;
    }

    const pengirim = form.pengirim.value.trim();
    const telefon = form.telefon.value.trim();
    const nameInputs = [...namesList.querySelectorAll('input')];
    const nama = nameInputs.map((i) => i.value.trim()).filter(Boolean);
    const hajat = form.hajat.value.trim();
    const consent = document.getElementById('consent');

    if (!pengirim) return showError('Sila isi nama anda.', form.pengirim);
    if (pengirim.length > 80) return showError('Nama pengirim terlalu panjang (maksimum 80 aksara).', form.pengirim);
    if (telefon && !/^[0-9+\-\s()]{8,20}$/.test(telefon)) {
      return showError('Sila masukkan nombor WhatsApp yang sah (cth. 012 345 6789).', form.telefon);
    }
    if (!nama.length) return showError('Sila isi sekurang-kurangnya satu nama untuk didoakan.', nameInputs[0]);
    if (!consent.checked) return showError('Sila tandakan persetujuan privasi sebelum meneruskan.', consent);

    // Initial record is 100% free!
    const data = {
      pengirim,
      telefon: telefon || null,
      nama,
      jenisHajat: state.jenisHajat,
      hajat: hajat || null,
      cawangan: state.cawangan,
      sumbangan: 0,
      status: 'baru',
      dibaca: false,
      sumber: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Menghantar hajat…';

    try {
      const id = await saveFn(data);
      state.lastSubmittedId = id;
      state.lastSubmittedPengirim = pengirim;
      state.lastSubmittedTelefon = telefon;
      
      // Track conversion event in Google Analytics
      trackGAEvent('kirim_doa_submit', {
        event_category: 'Engagement',
        jenis_hajat: state.jenisHajat,
        bilangan_nama: nama.length,
        ada_telefon: !!telefon
      });

      showSuccess(id, pengirim, nama, state.jenisHajat);
    } catch (err) {
      console.error(err);
      showError('Maaf, sistem sedang sibuk. Sila cuba lagi sebentar.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Hantar Hajat Percuma <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
    }
  });
}

// ---------- Show Success & Post-Submission Screen ----------
function showSuccess(id, pengirim, nama, jenisHajat) {
  form.hidden = true;
  successEl.hidden = false;
  paidReceiptNotice.hidden = true;
  heroSection?.classList.add('has-submitted');

  // Fill Snapshot
  if (summaryPengirim) summaryPengirim.textContent = pengirim;
  if (summaryNama) summaryNama.textContent = nama.join(', ');
  if (summaryHajat) summaryHajat.textContent = jenisHajat;

  // Initialize Post-Submission Tabs: QR Tab is active initially
  activateTab('qr');

  // Reset Billplz Amount to 30
  updateBillplzAmount(30);

  successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  successEl.focus({ preventScroll: true });
}

// ---------- Post-Submission Tab Switching ----------
function activateTab(tabName) {
  if (tabName === 'qr') {
    tabQrBtn?.classList.add('is-active');
    tabQrBtn?.setAttribute('aria-selected', 'true');
    tabBillplzBtn?.classList.remove('is-active');
    tabBillplzBtn?.setAttribute('aria-selected', 'false');
    if (paneQr) paneQr.hidden = false;
    if (paneBillplz) paneBillplz.hidden = true;
  } else {
    tabBillplzBtn?.classList.add('is-active');
    tabBillplzBtn?.setAttribute('aria-selected', 'true');
    tabQrBtn?.classList.remove('is-active');
    tabQrBtn?.setAttribute('aria-selected', 'false');
    if (paneBillplz) paneBillplz.hidden = false;
    if (paneQr) paneQr.hidden = true;
  }
}

tabQrBtn?.addEventListener('click', () => activateTab('qr'));
tabBillplzBtn?.addEventListener('click', () => activateTab('billplz'));

// ---------- Option 1: QR Payment Helpers ----------
copyAccBtn?.addEventListener('click', async () => {
  const acc = bankAccNo?.textContent?.trim() || '562106860036';
  try {
    await navigator.clipboard.writeText(acc.replace(/\s+/g, ''));
    copyAccBtn.textContent = 'Disalin!';
    setTimeout(() => {
      copyAccBtn.textContent = 'Salin';
    }, 2000);
  } catch (err) {
    console.warn('Clipboard failed:', err);
  }
});

confirmQrPaidBtn?.addEventListener('click', () => {
  if (state.lastSubmittedId) {
    updateRecordInStorage(state.lastSubmittedId, { status: 'dibayar', sumbangan: 10, kaedah: 'DuitNow QR' });
    paidReceiptNotice.hidden = false;
    if (receiptText) {
      receiptText.textContent = `Jazakumullahu khair. Pembayaran DuitNow QR anda telah disahkan di bawah nama ${state.lastSubmittedPengirim}.`;
    }
  }
});

// ---------- Option 2: Billplz Amount & Checkout Helpers ----------
postBillplzAmounts?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-post-amt]');
  if (!chip) return;
  postBillplzAmounts.querySelectorAll('[data-post-amt]').forEach((c) => {
    c.setAttribute('aria-pressed', String(c === chip));
  });

  const val = chip.dataset.postAmt;
  if (val === 'lain') {
    if (postCustomAmtWrap) postCustomAmtWrap.hidden = false;
    if (postCustomAmt) {
      postCustomAmt.focus();
      const customVal = Math.max(1, Number(postCustomAmt.value) || 25);
      updateBillplzAmount(customVal);
    }
  } else {
    if (postCustomAmtWrap) postCustomAmtWrap.hidden = true;
    updateBillplzAmount(Number(val) || 30);
  }
});

postCustomAmt?.addEventListener('input', () => {
  const val = Math.max(1, Number(postCustomAmt.value) || 1);
  updateBillplzAmount(val);
});

// Reset form to send another prayer
document.getElementById('againBtn')?.addEventListener('click', () => {
  heroSection?.classList.remove('has-submitted');
  form.reset();
  namesList.innerHTML = '';
  addNameRow();
  document.querySelectorAll('[data-group="jenisHajat"]').forEach((g) => {
    const firstChip = g.querySelector('.chip');
    if (firstChip) firstChip.click();
  });
  successEl.hidden = true;
  form.hidden = false;
  state.formLoadTime = Date.now();
  form.pengirim.focus();
});

// Share button
document.getElementById('shareBtn')?.addEventListener('click', async () => {
  const shareData = {
    title: 'Kirim Doa — Yayasan An Nabawi',
    text: 'Jom kirim nama & hajat kita untuk didoakan oleh anak-anak tahfiz di 4 cawangan Yayasan An Nabawi. 100% Percuma:',
    url: window.location.href.split('#')[0],
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      trackGAEvent('share_campaign', { method: 'WebShare' });
      return;
    } catch (e) {
      // fallback to WhatsApp
    }
  }
  trackGAEvent('share_campaign', { method: 'WhatsApp' });
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
});

// ---------- Admin Portal Auth & Realtime Sync Logic ----------
const adminAuthGate = document.getElementById('adminAuthGate');
const adminMainContent = document.getElementById('adminMainContent');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authErrorMsg = document.getElementById('authErrorMsg');
const adminUserSection = document.getElementById('adminUserSection');
const adminUserEmail = document.getElementById('adminUserEmail');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const dbStatusBadge = document.getElementById('dbStatusBadge');

// Email Management Elements
const adminManageEmailsBtn = document.getElementById('adminManageEmailsBtn');
const emailManagementModal = document.getElementById('emailManagementModal');
const closeEmailMgmtBtn = document.getElementById('closeEmailMgmtBtn');
const newAdminEmailInput = document.getElementById('newAdminEmailInput');
const addAdminEmailBtn = document.getElementById('addAdminEmailBtn');
const allowedEmailsList = document.getElementById('allowedEmailsList');

// Billplz Settings Elements
const adminBillplzSettingsBtn = document.getElementById('adminBillplzSettingsBtn');
const billplzSettingsModal = document.getElementById('billplzSettingsModal');
const closeBillplzSettingsBtn = document.getElementById('closeBillplzSettingsBtn');
const billplzBaseUrlInput = document.getElementById('billplzBaseUrlInput');
const billplzCollectionIdInput = document.getElementById('billplzCollectionIdInput');
const saveBillplzSettingsBtn = document.getElementById('saveBillplzSettingsBtn');

let currentAdminUser = null;

// Track auth state
onAuthStateChanged(auth, (user) => {
  currentAdminUser = user;
  if (user) {
    const email = (user.email || '').toLowerCase();
    const allowed = getAllowedAdminEmails().map((e) => e.toLowerCase());
    const isAllowed = allowed.includes(email);

    if (isAllowed) {
      if (adminAuthGate) adminAuthGate.style.display = 'none';
      if (adminMainContent) adminMainContent.style.display = 'block';
      if (adminUserSection) adminUserSection.style.display = 'flex';
      if (adminUserEmail) adminUserEmail.textContent = email;
      if (authErrorMsg) authErrorMsg.style.display = 'none';

      // Start Realtime Firestore listener once authenticated as admin
      startKirimDoaRealtimeListener();
    } else {
      if (adminAuthGate) adminAuthGate.style.display = 'block';
      if (adminMainContent) adminMainContent.style.display = 'none';
      if (adminUserSection) adminUserSection.style.display = 'flex';
      if (adminUserEmail) adminUserEmail.textContent = email;
      if (authErrorMsg) {
        authErrorMsg.style.display = 'block';
        authErrorMsg.textContent = `Akaun (${email}) belum didaftarkan sebagai petugas yang dibenarkan. Sila hubungi pentadbir Yayasan An Nabawi.`;
      }
    }
  } else {
    if (adminAuthGate) adminAuthGate.style.display = 'block';
    if (adminMainContent) adminMainContent.style.display = 'none';
    if (adminUserSection) adminUserSection.style.display = 'none';
    if (adminUserEmail) adminUserEmail.textContent = '';
    if (authErrorMsg) authErrorMsg.style.display = 'none';

    if (unsubscribeKirimDoaListener) {
      unsubscribeKirimDoaListener();
      unsubscribeKirimDoaListener = null;
    }
  }
});

// Google Sign-In button
googleSignInBtn?.addEventListener('click', async () => {
  if (authErrorMsg) authErrorMsg.style.display = 'none';
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error('Google Sign-In Error:', err);
    if (authErrorMsg) {
      authErrorMsg.style.display = 'block';
      authErrorMsg.textContent = 'Gagal log masuk dengan Google: ' + (err.message || String(err));
    }
  }
});

// Admin Log Out button
adminLogoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn(err);
  }
});

// Start Firestore Realtime Listener
function startKirimDoaRealtimeListener() {
  if (unsubscribeKirimDoaListener) return;
  try {
    const q = query(collection(db, CONFIG.collection), orderBy('createdAt', 'desc'));
    unsubscribeKirimDoaListener = onSnapshot(q, (snapshot) => {
      const liveRecords = [];
      snapshot.forEach((docSnap) => {
        const itemData = docSnap.data();
        liveRecords.push({
          id: docSnap.id,
          ...itemData,
          createdAt: itemData.createdAt?.toDate ? itemData.createdAt.toDate().toISOString() : itemData.createdAt || new Date().toISOString(),
        });
      });

      if (liveRecords.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(liveRecords));
        currentRecordsList = liveRecords;
      }
    }, (error) => {
      console.warn('Realtime sync warning (using cached data):', error);
    });
  } catch (e) {
    console.warn('Cannot establish Firestore listener:', e);
  }
}

// Render Allowed Admin Emails in Management Modal
function renderAllowedEmailsList() {
  if (!allowedEmailsList) return;
  const emails = getAllowedAdminEmails();
  allowedEmailsList.innerHTML = '';
  emails.forEach((em) => {
    const div = document.createElement('div');
    div.className = 'email-row-item';
    div.innerHTML = `
      <span>${escapeHtml(em)}</span>
      <button type="button" data-remove-email="${escapeHtml(em)}" title="Padam e-mel">&times; Padam</button>
    `;
    allowedEmailsList.appendChild(div);
  });

  // Attach remove events
  allowedEmailsList.querySelectorAll('[data-remove-email]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const emailToRemove = e.currentTarget.dataset.removeEmail;
      const filtered = getAllowedAdminEmails().filter((item) => item.toLowerCase() !== emailToRemove.toLowerCase());
      if (filtered.length === 0) {
        alert('Sekurang-kurangnya satu e-mel admin mesti dikekalkan.');
        return;
      }
      saveAllowedAdminEmails(filtered);
      renderAllowedEmailsList();
    });
  });
}

// Open/Close Email Management
adminManageEmailsBtn?.addEventListener('click', () => {
  renderAllowedEmailsList();
  if (emailManagementModal) emailManagementModal.hidden = false;
});
closeEmailMgmtBtn?.addEventListener('click', () => {
  if (emailManagementModal) emailManagementModal.hidden = true;
});

// Add new admin email
addAdminEmailBtn?.addEventListener('click', () => {
  const emailVal = (newAdminEmailInput?.value || '').trim().toLowerCase();
  if (!emailVal || !emailVal.includes('@')) {
    alert('Sila masukkan format e-mel yang sah.');
    return;
  }
  const current = getAllowedAdminEmails();
  if (!current.map((e) => e.toLowerCase()).includes(emailVal)) {
    current.push(emailVal);
    saveAllowedAdminEmails(current);
    renderAllowedEmailsList();
    if (newAdminEmailInput) newAdminEmailInput.value = '';
  } else {
    alert('E-mel ini sudah berada dalam senarai.');
  }
});

// Open/Close Billplz Settings
adminBillplzSettingsBtn?.addEventListener('click', () => {
  const cfg = getStoredBillplzConfig();
  if (billplzBaseUrlInput) billplzBaseUrlInput.value = cfg.paymentUrl;
  if (billplzCollectionIdInput) billplzCollectionIdInput.value = cfg.collectionId;
  if (billplzSettingsModal) billplzSettingsModal.hidden = false;
});
closeBillplzSettingsBtn?.addEventListener('click', () => {
  if (billplzSettingsModal) billplzSettingsModal.hidden = true;
});

// Save Billplz Settings
saveBillplzSettingsBtn?.addEventListener('click', () => {
  const newUrl = (billplzBaseUrlInput?.value || '').trim();
  const newCol = (billplzCollectionIdInput?.value || '').trim();
  if (!newUrl) {
    alert('Sila masukkan URL pembayaran Billplz.');
    return;
  }
  const newCfg = { paymentUrl: newUrl, collectionId: newCol };
  localStorage.setItem(BILLPLZ_STORAGE_KEY, JSON.stringify(newCfg));
  CONFIG.paymentUrl = newUrl;
  alert('Tetapan Billplz berjaya disimpan dan diaktifkan!');
  if (billplzSettingsModal) billplzSettingsModal.hidden = true;
});

// Update Billplz button url dynamically
function updateBillplzAmount(amt) {
  postDonationAmount = amt;
  if (postBillplzAmtLabel) postBillplzAmtLabel.textContent = `RM${amt}`;
  if (btnBillplzAmtText) btnBillplzAmtText.textContent = `RM${amt}`;

  const currentCfg = getStoredBillplzConfig();
  const generatedUrl = (currentCfg.paymentUrl || CONFIG.paymentUrl)
    .replace('{amount}', amt)
    .replace('{id}', encodeURIComponent(state.lastSubmittedId || 'demo'));
  if (postBillplzBtn) postBillplzBtn.href = generatedUrl;
}

// Handle Direct Billplz FPX API Checkout when button clicked
postBillplzBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const amt = postDonationAmount || 30;
  
  // Track GA donation checkout event
  trackGAEvent('tajaan_iftar_billplz_click', {
    event_category: 'Donation',
    amount: amt,
    currency: 'MYR'
  });

  const originalHtml = postBillplzBtn.innerHTML;
  postBillplzBtn.style.pointerEvents = 'none';
  postBillplzBtn.innerHTML = `Menghubungkan FPX... <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`;

  const userEmail = (document.getElementById('postBillplzEmail')?.value || '').trim();

  try {
    const res = await fetch('/api/billplz/create-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amt,
        doaId: state.lastSubmittedId || ('doa-' + Date.now()),
        pengirim: state.lastSubmittedPengirim || 'Hamba Allah',
        telefon: state.lastSubmittedTelefon || '',
        email: userEmail
      })
    });

    const data = await res.json();

    if (data.ok && data.url) {
      window.location.href = data.url;
      return;
    }

    if (data.error === 'BILLPLZ_NOT_CONFIGURED') {
      // If API key is not configured in Vercel yet, prompt admin or fallback to Open Collection
      const currentCfg = getStoredBillplzConfig();
      if (currentCfg.paymentUrl && !currentCfg.paymentUrl.includes('kirimdoa-yan?')) {
        const directUrl = currentCfg.paymentUrl.replace('{amount}', amt).replace('{id}', encodeURIComponent(state.lastSubmittedId || 'demo'));
        window.location.href = directUrl;
        return;
      }

      alert('Makluman Pentadbir:\n\nKunci BILLPLZ_API_KEY dan BILLPLZ_COLLECTION_ID belum dimasukkan di Vercel.\n\nSila tetapkan di Vercel Environment Variables untuk menggunakan FPX automatik, atau gunakan DuitNow QR.');
      return;
    }

    alert('Ralat sistem Billplz: ' + (data.details || data.error || 'Sila cuba lagi sebentar.'));
  } catch (err) {
    console.warn('API billplz call error, falling back:', err);
    const currentCfg = getStoredBillplzConfig();
    const fallbackUrl = (currentCfg.paymentUrl || CONFIG.paymentUrl).replace('{amount}', amt).replace('{id}', encodeURIComponent(state.lastSubmittedId || 'demo'));
    window.location.href = fallbackUrl;
  } finally {
    postBillplzBtn.style.pointerEvents = 'auto';
    postBillplzBtn.innerHTML = originalHtml;
  }
});

// Check Billplz Return Status on Page Load
async function checkBillplzReturnStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const isReturn = urlParams.get('billplz_return') === '1' || urlParams.has('billplz[id]');
  const isPaid = urlParams.get('billplz[paid]') === 'true' || urlParams.get('status') === 'completed' || urlParams.get('billplz_return') === '1';
  const doaId = urlParams.get('doa_id');
  const amount = Number(urlParams.get('amount')) || 30;

  if (isReturn && isPaid) {
    if (doaId && doaId !== 'general') {
      try {
        await updateRecordBoth(doaId, {
          status: 'dibayar',
          sumbangan: amount,
          kaedah: 'Billplz FPX'
        });
      } catch (e) {
        console.warn('Firestore update on return:', e);
      }
    }

    if (heroSection) heroSection.classList.add('has-submitted');
    if (form) form.hidden = true;
    if (successEl) successEl.hidden = false;
    if (paidReceiptNotice) {
      paidReceiptNotice.hidden = false;
      if (receiptText) {
        receiptText.textContent = `Alhamdulillah, jazakumullahu khair! Sumbangan RM${amount} anda melalui Billplz FPX telah berjaya diterima & disahkan dalam sistem.`;
      }
    }
    successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
checkBillplzReturnStatus();

// QR Paid Confirm
confirmQrPaidBtn?.addEventListener('click', async () => {
  if (state.lastSubmittedId) {
    await updateRecordBoth(state.lastSubmittedId, { status: 'dibayar', sumbangan: 0, kaedah: 'Dibayar ke QR' });
    
    trackGAEvent('tajaan_iftar_qr_confirm', {
      event_category: 'Donation',
      method: 'DuitNow QR',
      currency: 'MYR'
    });

    paidReceiptNotice.hidden = false;
    if (receiptText) {
      receiptText.textContent = `Jazakumullahu khair. Pengesahan sumbangan QR anda telah direkodkan di bawah nama ${state.lastSubmittedPengirim}.`;
    }
  }
});

// ==========================================
// BACKGROUND AUDIO PLAYER (AUDIO SAHAJA - USTAZ AHMAD DUSUKI)
// Video ID: RIdSFoH6M34, Autoplay @ 70% Volume
// ==========================================
let ytAudioPlayerInstance = null;
let audioIsPlaying = false;
let audioVolume = 70; // Set to 70% as requested
let audioIsMuted = false;

const playToggleBtn = document.getElementById('audioPlayToggleBtn');
const playIcon = document.getElementById('audioPlayIcon');
const pauseIcon = document.getElementById('audioPauseIcon');
const equalizer = document.getElementById('audioEqualizer');
const statusLabel = document.getElementById('audioStatusLabel');
const muteBtn = document.getElementById('audioMuteBtn');
const volHighSvg = document.getElementById('audioVolHighSvg');
const volMuteSvg = document.getElementById('audioVolMuteSvg');
const volSlider = document.getElementById('audioVolumeSlider');
const volValue = document.getElementById('audioVolumeValue');
const minimizeBtn = document.getElementById('audioMinimizeBtn');
const widgetBar = document.getElementById('audioWidgetBar');
const miniBadge = document.getElementById('audioMiniBadge');

function updateAudioUI(playing) {
  audioIsPlaying = playing;
  if (playing) {
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'inline-block';
    if (equalizer) equalizer.classList.add('is-playing');
    if (statusLabel) statusLabel.textContent = 'Play';
  } else {
    if (playIcon) playIcon.style.display = 'inline-block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (equalizer) equalizer.classList.remove('is-playing');
    if (statusLabel) statusLabel.textContent = 'Pause';
  }
}

function updateVolumeUI(vol, isMuted) {
  if (volSlider) volSlider.value = vol;
  if (volValue) volValue.textContent = isMuted ? 'Bisu' : `${vol}%`;
  if (volHighSvg) volHighSvg.style.display = isMuted ? 'none' : 'inline-block';
  if (volMuteSvg) volMuteSvg.style.display = isMuted ? 'inline-block' : 'none';
}

function setupAudioPlayer() {
  if (typeof window.YT !== 'undefined' && window.YT.Player) {
    createYTPlayer();
  } else {
    const existingOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (typeof existingOnReady === 'function') existingOnReady();
      createYTPlayer();
    };
  }
}

function createYTPlayer() {
  try {
    ytAudioPlayerInstance = new window.YT.Player('ytAudioPlayer', {
      height: '1',
      width: '1',
      videoId: 'RIdSFoH6M34',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        playsinline: 1,
        loop: 1,
        playlist: 'RIdSFoH6M34',
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          // Set volume to 70% as requested
          event.target.setVolume(70);
          updateVolumeUI(70, false);
          
          // Attempt automatic playback
          try {
            event.target.playVideo();
          } catch (e) {
            console.warn('Autoplay prevented by browser policy:', e);
          }
          
          setupAutoplayFallback();
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            updateAudioUI(true);
            removeAutoplayFallback();
          } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
            updateAudioUI(false);
          }
        },
        onError: (err) => {
          console.warn('YouTube Player error:', err);
        }
      }
    });
  } catch (err) {
    console.error('Error creating YouTube player:', err);
  }
}

// Fallback for strict browser autoplay policies
let fallbackTriggered = false;
function triggerAutoplayFallback() {
  if (fallbackTriggered) return;
  if (ytAudioPlayerInstance && typeof ytAudioPlayerInstance.playVideo === 'function') {
    const state = typeof ytAudioPlayerInstance.getPlayerState === 'function' ? ytAudioPlayerInstance.getPlayerState() : -1;
    if (state !== window.YT.PlayerState.PLAYING) {
      ytAudioPlayerInstance.setVolume(70);
      ytAudioPlayerInstance.playVideo();
    }
    fallbackTriggered = true;
    removeAutoplayFallback();
  }
}

function setupAutoplayFallback() {
  const events = ['click', 'touchstart', 'scroll', 'keydown'];
  events.forEach((evt) => {
    window.addEventListener(evt, triggerAutoplayFallback, { capture: true, passive: true });
  });
}

function removeAutoplayFallback() {
  const events = ['click', 'touchstart', 'scroll', 'keydown'];
  events.forEach((evt) => {
    window.removeEventListener(evt, triggerAutoplayFallback, { capture: true });
  });
}

// Controls listeners
playToggleBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!ytAudioPlayerInstance || typeof ytAudioPlayerInstance.playVideo !== 'function') return;
  if (audioIsPlaying) {
    ytAudioPlayerInstance.pauseVideo();
  } else {
    ytAudioPlayerInstance.setVolume(audioVolume);
    ytAudioPlayerInstance.playVideo();
  }
});

muteBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!ytAudioPlayerInstance) return;
  audioIsMuted = !audioIsMuted;
  if (audioIsMuted) {
    ytAudioPlayerInstance.mute();
    updateVolumeUI(audioVolume, true);
  } else {
    ytAudioPlayerInstance.unMute();
    ytAudioPlayerInstance.setVolume(audioVolume);
    updateVolumeUI(audioVolume, false);
  }
});

volSlider?.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10) || 0;
  audioVolume = val;
  if (ytAudioPlayerInstance) {
    if (audioIsMuted && val > 0) {
      audioIsMuted = false;
      ytAudioPlayerInstance.unMute();
    }
    ytAudioPlayerInstance.setVolume(val);
  }
  updateVolumeUI(val, audioIsMuted);
});

minimizeBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (widgetBar) widgetBar.style.display = 'none';
  if (miniBadge) miniBadge.style.display = 'inline-flex';
});

miniBadge?.addEventListener('click', () => {
  if (widgetBar) widgetBar.style.display = 'flex';
  if (miniBadge) miniBadge.style.display = 'none';
  if (!audioIsPlaying && ytAudioPlayerInstance && typeof ytAudioPlayerInstance.playVideo === 'function') {
    ytAudioPlayerInstance.setVolume(audioVolume);
    ytAudioPlayerInstance.playVideo();
  }
});

// Initialize YouTube Audio Player
setupAudioPlayer();

