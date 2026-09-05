/* db.js - 本地存储：localStorage 存结构化数据，IndexedDB 存照片 Blob */
'use strict';

const DATA_KEY = 'bjd_wardrobe_data_v1';
const PHOTO_DB = 'bjd_wardrobe_photos';
const PHOTO_STORE = 'photos';

function defaultData(){
  return {
    version: 1,
    dolls: [],      // {id,name,size,status,shop,purchaseDate,purchaseAmount,note,photos:[photoId],createdAt,updatedAt}
    items: [],      // {id,dollId,name,category(主分类),categories(多分类数组),brand,shop,sizeNotes,status,purchaseDate,tags,note,photos:[photoId],createdAt,updatedAt}
    payments: [],   // {id,itemId,type,amount,paidDate,note,createdAt}
    reminders: []   // {id,itemId,kind,title,dueDate,workdays,startDate,note,done,doneAt,createdAt}
  };
}

function loadData(){
  try{
    const raw = localStorage.getItem(DATA_KEY);
    if(raw){
      const d = JSON.parse(raw);
      return Object.assign(defaultData(), d);
    }
  }catch(e){ /* 损坏则重建 */ }
  return defaultData();
}

function saveData(data){
  try{
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  }catch(e){
    return false;
  }
}

function clearLocalData(){
  localStorage.removeItem(DATA_KEY);
}

/* ---------- IndexedDB 照片 ---------- */
function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(PHOTO_STORE)){
        const st = db.createObjectStore(PHOTO_STORE, {keyPath: 'id'});
        st.createIndex('itemId', 'itemId', {unique: false});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function photoPut(rec){
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(rec);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

function photoGet(id){
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}

function photoGetAll(){
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}

function photoDelete(id){
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

function photoClearAll(){
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

async function photosByItem(itemId){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const idx = tx.objectStore(PHOTO_STORE).index('itemId');
    const req = idx.getAll(itemId);
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
