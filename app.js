import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Completeaza valorile de mai jos din Firebase Console > Project settings > Your apps.
// Foloseste configuratia proiectului MayerDistributionTest, nu pe cea a aplicatiei v1.5.
const firebaseConfig = {
  apiKey: "AIzaSyCmLpq1RTxUTkR1GI3L6Pq_CXlNvFeGcPg",
  authDomain: "mayerdistributiontest.firebaseapp.com",
  projectId: "mayerdistributiontest",
  appId: "1:750431683253:web:94b358203a8b4a7a79f4fc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const authPanel = $("authPanel");
const dataPanel = $("dataPanel");
const loginForm = $("loginForm");
const recordForm = $("recordForm");
const authMessage = $("authMessage");
const dataMessage = $("dataMessage");
const recordsList = $("recordsList");
const emptyState = $("emptyState");
const recordCount = $("recordCount");
const connectionStatus = $("connectionStatus");
let unsubscribeRecords = null;
let recordsCache = [];
let editingId = null;

function showMessage(el, message, type = "") {
  el.textContent = message;
  el.className = `message ${type}`.trim();
}
function setConnection(text, connected = false) {
  connectionStatus.textContent = text;
  connectionStatus.classList.toggle("connected", connected);
}
function resetRecordForm() {
  editingId = null;
  recordForm.reset();
  $("formTitle").textContent = "Adauga o inregistrare";
  $("saveButton").textContent = "Salveaza in cloud";
  $("cancelEditButton").hidden = true;
}
function escapeText(value) {
  return String(value ?? "");
}
function renderRecords(records) {
  recordsCache = records;
  recordsList.replaceChildren();
  recordCount.textContent = String(records.length);
  emptyState.hidden = records.length > 0;

  for (const record of records) {
    const card = document.createElement("article");
    card.className = "record-card";

    const title = document.createElement("h4");
    title.textContent = escapeText(record.name);
    const details = document.createElement("p");
    details.textContent = escapeText(record.details) || "Fara detalii";
    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.textContent = record.updatedAt?.toDate
      ? `Ultima modificare: ${record.updatedAt.toDate().toLocaleString("ro-RO")}`
      : "Inregistrare de test";

    const actions = document.createElement("div");
    actions.className = "record-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Editeaza";
    edit.addEventListener("click", () => {
      editingId = record.id;
      $("recordName").value = escapeText(record.name);
      $("recordDetails").value = escapeText(record.details);
      $("formTitle").textContent = "Editeaza inregistrarea";
      $("saveButton").textContent = "Salveaza modificarile";
      $("cancelEditButton").hidden = false;
      $("recordName").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary delete-button";
    remove.textContent = "Sterge";
    remove.addEventListener("click", async () => {
      if (!confirm(`Stergi inregistrarea de test "${escapeText(record.name)}"?`)) return;
      try {
        await deleteDoc(doc(db, "syncTest", record.id));
        showMessage(dataMessage, "Inregistrare stearsa; modificarea se sincronizeaza.", "success");
      } catch (error) {
        showMessage(dataMessage, friendlyError(error), "error");
      }
    });

    actions.append(edit, remove);
    card.append(title, details, meta, actions);
    recordsList.append(card);
  }
}
function friendlyError(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-credential") return "Date de autentificare incorecte.";
  if (code === "auth/too-many-requests") return "Prea multe incercari. Incearca mai tarziu.";
  if (code === "auth/network-request-failed") return "Eroare de retea. Verifica conexiunea.";
  if (code === "permission-denied" || code === "firestore/permission-denied")
    return "Acces refuzat de regulile Firestore. Verifica autentificarea si UID-ul autorizat.";
  return `${error?.message || "A aparut o eroare."} (${code || "eroare"})`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(authMessage, "Se verifica autentificarea...");
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    loginForm.reset();
    showMessage(authMessage, "");
  } catch (error) {
    showMessage(authMessage, friendlyError(error), "error");
  }
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
    resetRecordForm();
    showMessage(dataMessage, "");
  } catch (error) {
    showMessage(dataMessage, friendlyError(error), "error");
  }
});

$("cancelEditButton").addEventListener("click", resetRecordForm);

recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("recordName").value.trim();
  const details = $("recordDetails").value.trim();
  if (!name) {
    showMessage(dataMessage, "Introdu o denumire.", "error");
    return;
  }
  $("saveButton").disabled = true;
  showMessage(dataMessage, "Se salveaza in cloud...");
  try {
    if (editingId) {
      await updateDoc(doc(db, "syncTest", editingId), {
        name, details, updatedAt: serverTimestamp()
      });
      showMessage(dataMessage, "Modificare salvata; celelalte dispozitive se vor actualiza.", "success");
    } else {
      await addDoc(collection(db, "syncTest"), {
        name, details, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        createdBy: auth.currentUser.uid
      });
      showMessage(dataMessage, "Inregistrare salvata; celelalte dispozitive se vor actualiza.", "success");
    }
    resetRecordForm();
  } catch (error) {
    showMessage(dataMessage, friendlyError(error), "error");
  } finally {
    $("saveButton").disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  authPanel.hidden = !!user;
  dataPanel.hidden = !user;
  if (unsubscribeRecords) {
    unsubscribeRecords();
    unsubscribeRecords = null;
  }
  if (!user) {
    setConnection("Neconectat");
    renderRecords([]);
    return;
  }
  setConnection("Conectat", true);
  showMessage(dataMessage, "Conectat. Se incarca inregistrarile...");
  const recordsQuery = query(collection(db, "syncTest"), orderBy("createdAt", "desc"));
  unsubscribeRecords = onSnapshot(recordsQuery, (snapshot) => {
    const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderRecords(records);
    showMessage(dataMessage, "Sincronizare activa.", "success");
  }, (error) => {
    setConnection("Eroare acces");
    showMessage(dataMessage, friendlyError(error), "error");
  });
});
