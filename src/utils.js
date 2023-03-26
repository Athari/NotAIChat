'use strict'

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  document.querySelector('#uploadFile')?.remove();
  document.body.insertAdjacentHTML('beforeEnd', `
    <input type="file" id="uploadFile" accept="${type}" style="position: absolute; width: 0; height: 0; overflow: hidden" />
  `);
  const elUploadFile = document.querySelector('#uploadFile');
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