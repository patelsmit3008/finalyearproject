/**
 * One-time script: clear interestedEmployees on all project documents.
 * Uses the project's existing Firebase config. Does NOT touch users collection.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDCciwpypjLW795u45AGWYx-7ABlC0xIaM",
  authDomain: "helix-58312.firebaseapp.com",
  projectId: "helix-58312",
  storageBucket: "helix-58312.firebasestorage.app",
  messagingSenderId: "185838190470",
  appId: "1:185838190470:web:65c360d18dfe7e965af607",
  measurementId: "G-BD4JEKC1ZC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const projectsRef = collection(db, 'projects');
  const snapshot = await getDocs(projectsRef);

  for (const d of snapshot.docs) {
    const data = d.data();
    if (!Object.prototype.hasOwnProperty.call(data, 'interestedEmployees')) continue;

    await updateDoc(doc(db, 'projects', d.id), { interestedEmployees: [] });
    const name = data.name ?? data.projectName ?? d.id;
    console.log('Cleaned:', name, '(id:', d.id + ')');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
