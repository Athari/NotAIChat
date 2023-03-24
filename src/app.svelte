<script>
  'use strict';
  import { onMount } from 'svelte'
  import Fa from 'svelte-fa'
  import { faArrowDown } from '@fortawesome/pro-solid-svg-icons/faArrowDown'
  import { faArrowUp } from '@fortawesome/pro-solid-svg-icons/faArrowUp'
  import { faBan } from '@fortawesome/pro-solid-svg-icons/faBan'
  import { faCopy } from '@fortawesome/pro-regular-svg-icons/faCopy'
  import { faFloppyDisk } from '@fortawesome/pro-regular-svg-icons/faFloppyDisk'
  import { faFolderOpen } from '@fortawesome/pro-regular-svg-icons/faFolderOpen'
  import { faPaperPlane } from '@fortawesome/pro-solid-svg-icons/faPaperPlane'
  import { faPlusLarge } from '@fortawesome/pro-solid-svg-icons/faPlusLarge'
  import { faRocketLaunch } from '@fortawesome/pro-regular-svg-icons/faRocketLaunch'
  import { faShareNodes } from '@fortawesome/pro-regular-svg-icons/faShareNodes'
  import { faTurtle } from '@fortawesome/pro-regular-svg-icons/faTurtle'
  import { faXmarkLarge } from '@fortawesome/pro-solid-svg-icons/faXmarkLarge'

  let options = {
    selectedEndpointIndex: 0,
    selectedProxyIndex: 0,
    multiMessageCount: 10,
    retryMessageCount: 5,
    density: 'compact',
  };
  let endpoints = [
    getEndpointPlaceholder()
  ];
  let messages = [
    { id: 1, text: "Hello GPT-4!" },
  ];
  let newMessageText = "";
  let isSending = false;
  let sendTime = null;
  let sendTimeText = "";
  let currentTime = 0;
  let statusText = "Welcome!";
  let controller = null;
  let isLoaded = false;
  let elRoot = null;
  let faTheme = {
    scale: 1.3,
  };
  const textAreaHeight = 20;
  const faThemeScaleMap = { compact: 1.3, mobile: 1.7, access: 2.1 };
  const secondNumberFormat0 = new Intl.NumberFormat('en-gb',
    { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 0 });
  const millisecondNumberFormat2 = new Intl.NumberFormat('en-gb',
    { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 2 });

  onMount(() => {
    let newEndpointIndex;
    try {
      newEndpointIndex = addEndpointFromSearchParams(new URL(location.href).searchParams);
      if (location.protocol == 'about:')
        document.querySelector('head style').innerHTML = "";
    }
    catch (ex) { /* Loading below must always run */ }
    messages = loadData('messages', messages);
    endpoints = loadData('endpoints', endpoints);
    options = loadData('options', options);
    if (newEndpointIndex !== null)
      options.selectedEndpointIndex = newEndpointIndex;
    isLoaded = true;
    elRoot = document.documentElement;
    setInterval(() => {
      if (isSending)
        currentTime++;
    }, 1000);
  });

  $: {
    if (isLoaded) {
      saveData('messages', messages);
      saveData('endpoints', endpoints);
      saveData('options', options);
    }
  }

  $: elRoot !== null && (o => elRoot.className = `d-${o.density}`)(options);
  $: options.density !== null && updateAllTextAreaSizes();
  $: faTheme = { scale: faThemeScaleMap[options.density] };
  $: sendTimeText = (() => getTimeText())(currentTime);

  function log(message, ...args) {
    console.log(message, ...args);
    statusText = message;
  }

  function loadData(id, defaultData) {
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

  function saveData(id, data) {
    try {
      localStorage.setItem(id, JSON.stringify(data));
    } catch (ex) {
      log(`Warning: Failed to save ${id} to localStorage: ${ex.message}`, ex);
    }
  }

  function getFileNameDate() {
    return new Date().toISOString().substring(0, 19).replace('T', ' ').replaceAll(':', '-');
  }

  function backupEndpoints() {
    downloadFile('application/json', `NotAIChat Endpoints ${getFileNameDate()}.json`,
      JSON.stringify(endpoints, null, "  "));
  }

  function backupMessages() {
    downloadFile('application/json', `NotAIChat Messages ${getFileNameDate()}.json`,
      JSON.stringify(messages, null, "  "));
  }

  async function restoreEndpoints() {
    const json = await uploadFile('.json, application/json');
    if (json instanceof Array && typeof json[0].key == 'string')
      endpoints = json;
  }

  async function restoreMessages() {
    const json = await uploadFile('.json, application/json');
    if (json instanceof Array && typeof json[0].text == 'string')
      messages = json;
  }

  function downloadFile(type, filename, data) {
    const blob = new Blob([ data ], { type });
    const elDownloadLink = window.document.createElement('a');
    elDownloadLink.href = window.URL.createObjectURL(blob);
    elDownloadLink.download = filename;
    document.body.appendChild(elDownloadLink);
    elDownloadLink.click();
    document.body.removeChild(elDownloadLink);
  }

  function uploadFile(type) {
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

  function getNextMessageId() {
    const currentMaxId = Math.max(...messages.map(m => m.id));
    return Number.isFinite(currentMaxId) ? currentMaxId + 1 : 1;
  }

  async function sendRequest(endpoint) {
    let url;
    if (endpoint.provider == 'openai') {
      url = endpoint.url;
    } else if (endpoint.provider == 'steamship') {
      url = 'https://api.steamship.com/api/v1/plugin/instance/generate';
      if (options.selectedProxyIndex == 1)
        url = `https://cors-anywhere.herokuapp.com/${url}`;
    } else if (endpoint.provider == 'scale') {
      url = endpoint.url;
      if (options.selectedProxyIndex == 1)
        url = `https://cors-anywhere.herokuapp.com/${url}`;
      else if (options.selectedProxyIndex == 2)
        url = `https://fishtailprotocol.com/projects/betterGPT4/scale-api.php`;
    }

    let messageText = messages.map(m => m.text).join("\n");
    let data;
    if (endpoint.provider == 'openai') {
      // TODO OpenAI data
    } else if (endpoint.provider == 'steamship') {
      data = { appendOutputToFile: false, text: messageText, pluginInstance: endpoint.url };
    } else if (endpoint.provider == 'scale') {
      data = { input: { input: messageText } };
    }
    if (options.selectedProxyIndex == 2)
      data = { OAIToken: endpoint.key, scaleURL: endpoint.url, chatLog: messageText };

    let headers;
    if (endpoint.provider == 'openai') {
      // TODO OpenAI headers
    } else if (endpoint.provider == 'steamship') {
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${endpoint.key}`,
        'X-Workspace-Handle': endpoint.url,
      }
    } else if (endpoint.provider == 'scale') {
      headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + endpoint.key,
      };
      if (options.selectedProxyIndex == 2)
        delete headers.Authorization;
    }

    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (endpoint.provider == 'openai') {
      // TODO OpenAI response
    } else if (endpoint.provider == 'steamship') {
      let json = await response.json();
      console.log("SteamShip init: ", json);
      const { status } = json;
      if (status != null) {
        let prevState = '';
        const { taskId } = status;
        while (true) {
          response = await fetch('https://api.steamship.com/api/v1/task/status', {
            method: 'POST',
            headers,
            body: JSON.stringify({ taskId }),
            signal: controller.signal,
          });
          const responseClone = response.clone();
          json = await response.json();
          console.log("SteamShip task:", json.status.state, json);
          if (json.data != null) {
            // TODO make sendRequest function return data in consistent JSON format instead of raw Response object
            json = {
              role: json.data.blocks[0].tags.filter(t => t.kind == 'role')[0]?.name ?? 'assistant',
              output: json.data.blocks[0].text,
            };
            response = responseClone;
            response.text = async () => JSON.stringify(json);
            response.json = async () => json;
            return response;
          } else if (json.status.state == 'failed') {
            json = {
              message: `${json.status.statusCode}: ${json.status.statusMessage}`,
            };
            response = responseClone;
            response.text = async () => JSON.stringify(json);
            response.json = async () => json;
            return response;
          }
          if (prevState != json.status.state) {
            prevState = json.status.state;
            log(`Sending message (${prevState})`);
          }
          await delay(2000);
        }
      }
    } else if (endpoint.provider == 'scale') {
      return response;
    }
  }

  async function displayMessage(e, lastMessage, response, extraText) {
    let httpErrorText = response.ok ? "" : ` (HTTP code: ${response.status}${` ${response.statusText}`.trim()})`
    let text, json;
    try {
      text = await response.text();
    }
    catch (ex) {
      log(`Failed to decode message${extraText}: ${ex.message}${httpErrorText}`, ex);
      return lastMessage;
    }
    try{
      json = JSON.parse(text);
      if (json.response != null)
        json = json.response;
    }
    catch (ex) {
      if (text.length > 4096) {
        log(`Failed to parse message${extraText}: ${ex.message}${httpErrorText}`, ex);
        return lastMessage;
      }
      json = { message: text };
    }
    if (json.error != null) {
      log(`Received error${extraText}: ${json.error.code}: ${json.error.message}${httpErrorText}`);
    } else if (json.message != null) {
      log(`Received error${extraText}: ${json.message}${httpErrorText}`);
    } else if (json.output != null) {
      if (lastMessage == null) {
        lastMessage = { id: getNextMessageId(), text: json.output };
        messages = [ ...messages, lastMessage ];
      } else {
        lastMessage.text += ` ${json.output}`;
        messages = [ ...messages ];
        updateMessageTextAreaSize({ target: [...document.querySelectorAll('.messages textarea')].slice(-1)[0] });
      }
      log(`Received message${extraText}`, json);
    } else {
      log(`Failed to interpret message${extraText}${httpErrorText}`, json);
    }
    return lastMessage;
  }

  async function sendMessageChunkedInternal(e, messageCount, stopOnFirstSuccess) {
    log("Sending message");
    addMessage({ target: e.target });
    isSending = true;
    const selectedEndpoint = endpoints[options.selectedEndpointIndex];
    if (selectedEndpoint == null)
      throw new Error("No endpoint selected");
    controller = new AbortController();
    let lastMessage = null;
    for (let iMessage = 0; iMessage < messageCount; iMessage++) {
      const indexText = messageCount > 1 ? ` (${iMessage + 1}/${messageCount})` : "";
      [ sendTime, currentTime ] = [ performance.now(), 0 ];
      let response;
      try {
        response = await sendRequest(selectedEndpoint);
      }
      catch (ex) {
        if (ex instanceof DOMException && ex.name == 'AbortError') {
          log(`User cancelled message${indexText} in ${getPreciseTimeText()}`, ex);
          return;
        } else {
          log(`Failed to receive message${indexText} in ${getPreciseTimeText()}: ${ex.message} ` +
            `(Console and Network tabs in DevTools may contain extra details)`, ex);
          continue;
        }
      }
      if (controller.signal.aborted)
        break;
      lastMessage = await displayMessage(e, lastMessage, response, `${indexText} in ${getPreciseTimeText()}`);
      if (stopOnFirstSuccess && lastMessage != null)
        break;
    }
    isSending = false;
  }

  async function sendMessage(e) {
    return await sendMessageChunkedInternal(e, 1, false);
  }

  async function sendMessageUntilSuccess(e) {
    return await sendMessageChunkedInternal(e, +options.retryMessageCount, true);
  }

  async function sendMultiMessage(e) {
    return await sendMessageChunkedInternal(e, +options.multiMessageCount, false);
  }

  function stopMessage() {
    if (controller == null)
      return;
    isSending = false;
    controller.abort();
    log("Receiving message cancelled");
  }

  function addMessage(e) {
    if (newMessageText == "")
      return;
    messages = [ ...messages, { id: getNextMessageId(), text: newMessageText } ];
    newMessageText = "";
    updateMessageTextAreaSize(e);
  }

  function deleteMessage(im) {
    messages = messages.filter((m, i) => i !== im);
  }

  function swapMessages(im1, im2) {
    if (messages[im1] === undefined || messages[im2] === undefined)
      return;
    [ messages[im1], messages[im2] ] = [ messages[im2], messages[im1] ];
    messages = [ ...messages ];
  }

  async function copyMessages() {
    try {
      await navigator.clipboard.writeText(messages.map(m => m.text).join("\n"));
      log("Messages copied to clipboard");
    } catch (ex) {
      log(`Failed to copy messages to clipboard: ${ex.message}`, ex);
    }
  }

  function updateMessageTextAreaSize(e) {
    updateTextAreaSizeDelayed({ target: e.target.closest('.message').querySelector('textarea') });
  }

  function getEndpointPlaceholder() {
    return { name: "Pretty name", provider: "", key: "", url: "" };
  }

  function addEndpoint() {
    endpoints = [ ...endpoints, getEndpointPlaceholder() ];
  }

  function addEndpointFromSearchParams(params) {
    const endpoint = {
      name: params.get('name') ?? "Shared endpoint",
      provider: params.get('provider'),
      key: params.get('key'),
      url: params.get('url'),
    };
    const sameEndpointIndex = endpoints.findIndex(e => e.key == endpoint.key);
    if (sameEndpointIndex != -1)
      return sameEndpointIndex;
    else if (endpoint.key == null)
      return null;
    const placeholderKey = getEndpointPlaceholder().key;
    endpoints = [ ...endpoints.filter(e => e.key != placeholderKey), endpoint ];
    return endpoints.length - 1;
  }

  async function shareEndpointLink(ie) {
    const endpoint = endpoints[ie];
    const searchParams = new URLSearchParams({ name: endpoint.name, provider: endpoint.provider, key: endpoint.key, url: endpoint.url });
    const urlString = `${location.origin}${location.pathname}?${searchParams}`;
    try {
      await navigator.clipboard.writeText(urlString);
      log(`Endpoint share link copied to clipboard: ${urlString}`);
    } catch (ex) {
      log(`Failed to copy endpoint share link to clipboard: ${ex.message}`, ex);
    }
  }

  function deleteEndpoint(ie) {
    endpoints = endpoints.filter((e, i) => i !== ie);
    if (endpoints[options.selectedEndpointIndex] === undefined)
      options.selectedEndpointIndex = null;
    options = { ...options };
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getTimeText() {
    return secondNumberFormat0.format((performance.now() - sendTime) / 1000);
  }

  function getPreciseTimeText() {
    return millisecondNumberFormat2.format(performance.now() - sendTime);
  }

  function updateTextAreaSize({ target }) {
    const oldPageOffset = window.pageYOffset;
    target.style.height = '0';
    target.style.overflow = 'hidden';
    target.style.height = `${Math.max(target.scrollHeight, textAreaHeight) + 2}px`;
    target.style.overflow = '';
    window.scrollTo(window.pageXOffset, oldPageOffset);
  }

  function updateTextAreaSizeDelayed({ target }) {
    updateTextAreaSize({ target });
    setTimeout(() => { updateTextAreaSize({ target }) }, 50);
  }

  function updateAllTextAreaSizes(){
    for (const target of document.querySelectorAll('textarea'))
      updateTextAreaSize({ target });
  }

  function autoResizeTextArea(el) {
    updateTextAreaSizeDelayed({ target: el });
    el.addEventListener('input', updateTextAreaSize);
    return {
      destroy: () => el.removeEventListener('input', updateTextAreaSize),
    }
  }
</script>

<svelte:window on:resize={updateAllTextAreaSizes} />

<div class="app">
  <details open>
    <summary>Options</summary>
    <div class="endpoints">
      <h3>
        API Endpoints
        <button on:click={addEndpoint} title="Add endpoint">
          <Fa icon={faPlusLarge} {...faTheme} />
        </button>
      </h3>
      {#each endpoints as endpoint, ie}
        <div class="endpoint">
          <input type=radio bind:group={options.selectedEndpointIndex} name=selectedEndpoint value={ie} title="Set endpoint as current">
          <input type=text bind:value={endpoint.name} placeholder="Display name">
          <select bind:value={endpoint.provider} placeholder="Provider">
            <option value={''}></option>
            <option value={'openai'}>OpenAI</option>
            <option value={'steamship'}>SteamShip</option>
            <option value={'scale'}>Scale</option>
          </select>
          <input type=text bind:value={endpoint.key} placeholder="API Key">
          <input type=text bind:value={endpoint.url} placeholder="Endpoint URL">
          <button on:click={() => shareEndpointLink(ie)} title="Share endpoint link">
            <Fa icon={faShareNodes} {...faTheme} />
          </button>
          <button on:click={() => deleteEndpoint(ie)} title="Delete endpoint">
            <Fa icon={faXmarkLarge} {...faTheme} />
          </button>
        </div>
      {/each}
      <h3>Behavior</h3>
      <div class="options">
        <div class="option">
          <label for=density>UI Density</label>
          <select bind:value={options.density} id=density>
            <option value={'compact'}>Compact</option>
            <option value={'mobile'}>Comfortable</option>
            <option value={'access'}>Accessible</option>
          </select>
        </div>
        <div class="option">
          <label for=selectedProxyIndex>Proxy</label>
          <select bind:value={options.selectedProxyIndex} id=selectedProxyIndex>
            <option value={0}>Direct</option>
            <option value={1}>CORS demo</option>
            <option value={2}>Web proxy</option>
          </select>
        </div>
        <div class="option">
          <label for=multiMessageCount>Multi-message count</label>
          <input type=text bind:value={options.multiMessageCount} id=multiMessageCount />
        </div>
        <div class="option">
          <label for=retryMessageCount>Retry message count</label>
          <input type=text bind:value={options.retryMessageCount} id=retryMessageCount />
        </div>
      </div>
      <h3>Backups</h3>
      <div class="options">
        <div class="option-long">
          <button on:click={backupEndpoints}><Fa icon={faFloppyDisk} {...faTheme} style="margin: 0 8px 0 0" /> Backup endpoints</button>
          <button on:click={restoreEndpoints}><Fa icon={faFolderOpen} {...faTheme} style="margin: 0 8px 0 0" /> Restore endpoints</button>
          <button on:click={backupMessages}><Fa icon={faFloppyDisk} {...faTheme} style="margin: 0 8px 0 0" /> Backup messages</button>
          <button on:click={restoreMessages}><Fa icon={faFolderOpen} {...faTheme} style="margin: 0 8px 0 0" /> Restore messages</button>
        </div>
      </div>
    </div>
    <details>
      <summary>Instructions</summary>
      <h3>Scale API keys</h3>
      <p>You can use one of the public keys or provide your own. Having your own keys gives more flexibility and better privacy.
      <ol>
        <li>Register on <a href="https://spellbook.scale.com/">Scale Spellbook</a>.
        <li>Create an "app".
        <li>Add a "prompt" with <code>model=GPT-4</code>, <code>max_tokens=512</code>, <code>temperature=1</code>,
          <code>user_template={'{{'}input{'}}'}</code>.
          <ul>
            <li>Max token limit drastically (non-linearly) affects how fast the website responds. You can try lowering it,
              especially if you plan to use it for chat, but forget about going above 1024 tokens.
            <li>Temperature affects how wild the generations are, where 0.0 generates consistent responses and 2.0 is completely nuts.
              Default value in OpenAI interface is 0.7. Recommended values are 0.4–1.0.
            <li>Adjust the template if you plan to use the app for chat or other purposes. GPT-4 model will see the text
              around <code>{'{{'}input{'}}'}</code>, but the chat app will not.
          </ul>
        <li>Add a "deployment" with this "prompt".
        <li>Add a new Scale API endpoint in the chat's options and copy API key and URL from Scale website.
      </ol>
      <h3>Proxy</h3>
      <p>The method of bypassing CORS restrictions for the chat script. One is enough.
      <ul>
        <li><b>Direct</b>:
          <ul>
            <li><b>User script</b> <i>(desktop/mobile)</i>:
              Install <a href="https://athari.github.io/ScaleChat/userscripts/bypasscors.user.js">Bypass CORS</a> userscript.
              Install <a href="https://www.tampermonkey.net/">TamperMonkey</a> extension or any other user script manager first,
              in case you don't an option to install the script when you click the link.
              This method enables bypassing CORS only for specific user script and domain, however running locally is impossible
              and running on another server requires editing the user script.
            <li><b>Extension</b> <i>(desktop)</i>:
              Install <a href="https://microsoftedge.microsoft.com/addons/detail/cors-unblock/hkjklmhkbkdhlgnnfbbcihcajofmjgbh">CORS Unblock</a>
              extension. Click on the extension's button to enable it.
              This method allows to choose what websites bypass CORS and when. It allows running the script locally or on any server.
            <li><b>Command Line</b> <i>(desktop)</i>:
              Close all Chrome windows, then run it with <b><code>chrome --no-web-security</code></b> command line.
              This method applies to all websites until you restart Chrome.
          </ul>
        <li><b>CORS demo</b> <i>(desktop/mobile)</i>:
          Go to <a href="https://cors-anywhere.herokuapp.com/corsdemo">CORS Anywhere Demo</a> page and click on the button to enable it.
          You may be asked to solve CAPTCHA. Note that CORS Demo can timeout way earlier than actual API.
          This method allows all websites using that specific website to bypass CORS.
        <li><b>Web proxy</b> <i>(desktop/mobile)</i>:
          Use <a href="https://fishtailprotocol.com/projects/betterGPT4/">Web proxy by Feril</a>. No configuration required. This
          method works exclusively with Scale API.
      </ul>
      <h3>Privacy</h3>
      <p>Privacy does not exist.
      <ul>
        <li>All your prompts and responses are visible to the owner of the Scale API key.
        <li>All your prompts, responses and keys are visible to the company that owns Scale API.
        <li>All your prompts, responses and keys are visible to the owner of CORS and web proxies.
      </ul>
      <p>Recommendations for maximum privacy:
      <ul>
        <li>Do not use public Scale API keys.
        <lI>Do not use proxies owned by people you don't trust.
        <li>Do not send any information which could be used to identify you.
        <li>Do register on Scale with fake data, including fake email.
        <li>Do live in countries where FBI can't reach you and put in jail for having bad thoughts.
      </ul>
  </details>
  </details>
  <div class="messages">
    {#each messages as message, im}
      <div class="message">
        <textarea bind:value={message.text} placeholder="Message #{message.id} text"
                  autocomplete=false use:autoResizeTextArea></textarea>
        <div class="buttons">
          <button on:click={() => swapMessages(im, im - 1)} disabled={im <= 0} title="Move message up">
            <Fa icon={faArrowUp} {...faTheme} />
          </button>
          <button on:click={() => swapMessages(im, im + 1)} disabled={im >= messages.length - 1} title="Move message down">
            <Fa icon={faArrowDown} {...faTheme} />
          </button>
          <button on:click={() => deleteMessage(im)} title="Delete message">
            <Fa icon={faXmarkLarge} {...faTheme} />
          </button>
        </div>
      </div>
    {/each}
  </div>
  <div class="message new-message">
    <textarea bind:value={newMessageText} disabled={isSending} placeholder="New message text"
              autocomplete=false use:autoResizeTextArea></textarea>
    <div class="buttons">
      <button on:click={e => sendMessage(e)} disabled={isSending} title="Send message">
        <Fa icon={faPaperPlane} {...faTheme} />
      </button>
      <button on:click={e => sendMultiMessage(e)} disabled={isSending} title="Send message and receive {options.multiMessageCount} messages">
        <Fa icon={faRocketLaunch} {...faTheme} />
      </button>
      <button on:click={e => sendMessageUntilSuccess(e)} disabled={isSending} title="Try sending message {options.retryMessageCount} times">
        <Fa icon={faTurtle} {...faTheme} />
      </button>
      <button on:click={stopMessage} disabled={!isSending} title="Cancel sending">
        <Fa icon={faBan} {...faTheme} />
      </button>
      <button on:click={e => addMessage(e)} disabled={isSending} title="Add message without sending">
        <Fa icon={faPlusLarge} {...faTheme} />
      </button>
      <button on:click={copyMessages} title="Copy all messages to clipboard">
        <Fa icon={faCopy} {...faTheme} flip=vertical />
      </button>
    </div>
  </div>
  <div class="status">
    <p class="message">{statusText}</p>
    <p class="time" style:display={isSending ? 'block' : 'none'}>{sendTimeText}</p>
  </div>
</div>

<style lang="less">
  :global(:root) {
    --button-width: 38px;
    --gap: 8px;
    color-scheme: dark;
    overflow-wrap: break-word;
    font: 15px/1.2 Segoe UI, sans-serif;
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
  }
  .app {
    border: solid 1px #666;
    background: #111;
    padding: 8px;
    border-radius: 8px;
  }
  details {
    border: solid 1px #666;
    background: #222;
    padding: 8px;
    margin: 0 0 8px 0;
    border-radius: 8px;
    > details {
      margin: 8px 0 0 0;
    }
    > summary {
      cursor: pointer;
    }
    &[open] > summary {
      padding: 0 0 8px 0;
      font-weight: 700;
    }
  }
  h3 {
    font: inherit;
    font-weight: 500;
    font-size: 1.2em;
    margin: 2px 0;
  }
  .messages,
  .endpoints,
  .options {
    display: flex;
    flex-flow: column;
    gap: 8px;
  }
  .options {
    flex-flow: row wrap;
    gap: 8px 24px;
  }
  .message,
  .endpoint,
  .option,
  .buttons {
    display: flex;
    flex-flow: row;
    align-items: flex-start;
    gap: 8px;
  }
  .option {
    align-items: center;
    width: 400px;
    label {
      flex: 1;
    }
  }
  .option-long {
    display: flex;
    flex-flow: row wrap;
    gap: 8px;
    align-items: center;
    button {
      width: auto;
      padding: 0 12px;
    }
  }
  .new-message {
    margin: 12px 0 0 0;
    .buttons {
      flex: 0 0 calc((var(--button-width) + var(--gap) + 0px) * 3 - var(--gap));
      flex-flow: row wrap;
    }
  }
  textarea,
  input[type=text],
  select {
    flex: 1;
    border-style: solid;
    border-width: 1px;
    border-radius: 4px;
    padding: 2px 6px;
    font: inherit;
    resize: none;
    overflow: hidden;
  }
  input[type=radio] {
    align-self: stretch;
  }
  textarea:hover {
    overflow-y: overlay;
  }
  .status {
    display: flex;
    flex-flow: row;
    opacity: 0.6;
    .message {
      flex: 1;
    }
    .time {
      white-space: nowrap;
    }
  }
  button {
    height: 26px;
    width: var(--button-width);
    font-size: 1em;
  }
  p,
  ul {
    margin: 4px 0;
  }

  :global(:root.d-compact) {
    @media (max-width: 740px) {
      .buttons {
        flex-flow: column;
      }
      .endpoint {
        flex-flow: row wrap;
        input[type=text] {
          flex: 200px 1;
        }
      }
    }
    @media (max-width: 480px) {
      .option {
        width: 100%;
      }
    }
  }

  :global(:root:is(.d-mobile, .d-access)) {
    --button-width: 48px;
    line-height: 1.4;
    button {
      height: 32px;
    }
    textarea,
    input[type=text],
    select {
      padding: 4px 8px;
    }
    p,
    ul {
      margin: 10px 0;
    }
    li {
      margin: 6px 0;
    }
    @media (max-width: 840px) {
      .buttons {
        flex-flow: column;
      }
      .endpoint {
        flex-flow: row wrap;
        input[type=text] {
          flex: 260px 1;
        }
      }
      .new-message {
        .buttons {
          flex: 0 0 var(--button-width);
        }
      }
    }
    @media (max-width: 500px) {
      .option {
        width: 100%;
      }
    }
  }

  :global(:root.d-access) {
    --button-width: 52px;
    font-size: 17px;
    line-height: 1.6;
    button {
      height: 38px;
    }
  }
</style>