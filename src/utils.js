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

export function parseJSONOrNull(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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

export function linkify(s) {
  const tags = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
  const reLink = /https?:\/\/(\S+)/ig;
  const escape = s => s.replace(/[&<>"]/g, t => tags[t] || t);
  let m = null, i = 0, html = "";
  while ((m = reLink.exec(s)) != null) {
    html += `${escape(s.slice(i, m.index))}<a href="${escape(m[0])}">${escape(m[1])}</a>`
    i = m.index + m[0].length;
  }
  html += escape(s.slice(i));
  return html;
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

export async function* events(res, signal) {
  if (!res.body)
    return;
  const iter = streamToAsyncIterator(res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream({ allowCR: true })));

  let event = null;
  for await (const line of iter) {
    if (signal && signal.aborted)
      break;

    if (line.length == 0) {
      if (event != null) {
        if (event.data?.length > 0)
          event.json = parseJSONOrNull(event.data);
        yield event;
      }
      event = null;
      continue;
    }

    const match = /[:]\s*/.exec(line);
    if (!(match?.index > 0))
      continue;
    const field = line.substring(0, match.index);
    const value = line.substring(match.index + match[0].length);

    if (field == 'data') {
      event ||= {};
      event[field] = event[field]?.length > 0 ? `${event[field]}\n${value}` : value;
    }
    else if (field == 'event') {
      event ||= {};
      event[field] = value;
    }
    else if (field == 'id') {
      event ||= {};
      event[field] = +value || value;
    }
    else if (field == 'retry') {
      event ||= {};
      event[field] = +value || undefined;
    }
  }
}

export async function stream(input, init) {
  let req = new Request(input, init);
  fallback(req.headers, 'Accept', 'text/event-stream');
  fallback(req.headers, 'Content-Type', 'application/json');
  return events(await fetch(req), req.signal);
  
  function fallback(headers, key, value) {
    if (!headers.get(key))
      headers.set(key, value);
  }
}

async function* streamToAsyncIterator(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        return;
      yield value;
    }
  }
  finally {
    reader.releaseLock();
  }
}

class TextLineStream extends TransformStream {
  #currentLine = "";

  constructor(options = { allowCR: false }) {
    super({
      transform: (chars, controller) => {
        chars = this.#currentLine + chars;
        while (true) {
          const lfIndex = chars.indexOf("\n");
          const crIndex = options.allowCR ? chars.indexOf("\r") : -1;
          if (
            crIndex !== -1 && crIndex !== (chars.length - 1) &&
            (lfIndex === -1 || (lfIndex - 1) > crIndex)
          ) {
            controller.enqueue(chars.slice(0, crIndex));
            chars = chars.slice(crIndex + 1);
            continue;
          }
          if (lfIndex === -1)
            break;
          const endIndex = chars[lfIndex - 1] === "\r" ? lfIndex - 1 : lfIndex;
          controller.enqueue(chars.slice(0, endIndex));
          chars = chars.slice(lfIndex + 1);
        }
        this.#currentLine = chars;
      },
      flush: (controller) => {
        if (this.#currentLine === "") return;
        const currentLine = options.allowCR && this.#currentLine.endsWith("\r")
          ? this.#currentLine.slice(0, -1) : this.#currentLine;
        controller.enqueue(currentLine);
      },
    });
  }
}