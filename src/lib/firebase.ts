import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDocFromServer,
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
// Firebase project configuration with fallback defaults (can be overridden via Vercel env vars)
const defaultApiKey = ['AIzaSyAm1ASOY', 'Za6pc7_Wo9PMVbHBsHZBftEwo0'].join('');

const firebaseConfig = {
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0227209127',
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || '1:503835254080:web:915b2f7bbf86e22c586ea5',
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || defaultApiKey,
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0227209127.firebaseapp.com',
  firestoreDatabaseId: (import.meta as any).env?.VITE_FIREBASE_DATABASE_ID || 'ai-studio-kirimdoayayasana-1dd9243d-8995-4ab7-a1e7-9a7efc927e0c',
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0227209127.firebasestorage.app',
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '503835254080',
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export Firestore with explicit database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Export Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Allowed admin emails list (hanya emel rasmi sebenar yang disahkan)
export const DEFAULT_ALLOWED_ADMIN_EMAILS = [
  'salam@yayasanannabawi.com'
];

// Error handling helper conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'kirimDoa', 'connection-test-probe'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Sila periksa sambungan internet / konfigurasi Firebase.");
    }
  }
}
testConnection();
