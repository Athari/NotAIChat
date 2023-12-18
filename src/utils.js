'use strict'

export function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout ${ms} ms`)), ms);
  });
}

export function parseFloatOrNull(s) {
  const r = parseFloat(s);
  return !Number.isNaN(r) && Number.isFinite(r) ? r : null;
}

export function parseIntOrNull(s) {
  const r = parseInt(s, 10);
  return !Number.isNaN(r) && Number.isFinite(r) ? r : null;
}

export function generateUuid() {
  try {
    return crypto.randomUUID();
  } catch {
    try {
      return ([ 1e7 ] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    } catch {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }
}

export function loadData(id, defaultData) {
  try {
    const data = JSON.parse(localStorage.getItem(id));
    return data !== null &&
      typeof data === typeof defaultData &&
      data.constructor.name === defaultData.constructor.name ?
        data.constructor.name === 'Object' ?
          Object.assign(defaultData, data) :
          data : defaultData;
  } catch (ex) {
    log(`Warning: Failed to load ${id} from localStorage: ${ex.message}`, ex);
    return defaultData;
  }
}

export function saveData(id, data) {
  try {
    localStorage.setItem(id, JSON.stringify(data));
  } catch (ex) {
    log(`Warning: Failed to save ${id} to localStorage: ${ex.message}`, ex);
  }
}

export function downloadFile(type, filename, data) {
  const blob = new Blob([ data ], { type });
  const elDownloadLink = window.document.createElement('a');
  elDownloadLink.href = window.URL.createObjectURL(blob);
  elDownloadLink.download = filename;
  document.body.appendChild(elDownloadLink);
  elDownloadLink.click();
  document.body.removeChild(elDownloadLink);
}

export function uploadFile(type) {
  const styleOutOfSight = "position: absolute; width: 0; height: 0; overflow: hidden;";
  document.querySelector('#uploadFileUtil')?.remove();
  document.body.insertAdjacentHTML('beforeEnd', 
    `<input type="file" id="uploadFileUtil" accept="${type}" style="${styleOutOfSight}" />`);
  const elUploadFile = document.querySelector('#uploadFileUtil');
  return new Promise((resolve, reject) => {
    let isChanged = false;
    elUploadFile.addEventListener('change', async () => {
      isChanged = true;
      try {
        resolve(JSON.parse(await elUploadFile.files[0].text()));
      }
      catch (ex) {
        reject(ex);
      }
      elUploadFile.remove();
    }, { once: true });
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (isChanged)
          return;
        resolve(null);
        elUploadFile.remove();
      }, 300);
    }, { once: true });
    elUploadFile.click();
  });
}