<script>
  'use strict';
  import { onMount } from "svelte";

  let options = {
    selectedEndpointIndex: 0,
    selectedProxyIndex: 0,
    multiMessageCount: 10,
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
  let statusText = "Welcome!";
  let controller = null;
  let isLoaded = false;
  let elRoot = null;
  const textAreaHeight = 20;
  
  onMount(() => {
    isLoaded = true;
    if (location.protocol == 'about:')
      document.querySelector('head style').innerHTML = "";
    messages = loadData('messages', messages);
    endpoints = loadData('endpoints', endpoints);
    options = loadData('options', options);
    elRoot = document.documentElement;
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

  function getNextMessageId() {
    const currentMaxId = Math.max(...messages.map(m => m.id));
    return Number.isFinite(currentMaxId) ? currentMaxId + 1 : 1;
  }

  async function sendRequest(endpoint) {
    let url = endpoint.url;
    if (options.selectedProxyIndex == 1)
      url = `https://cors-anywhere.herokuapp.com/${url}`;
    /*else if (options.selectedProxyIndex == 2)
      url = `https://fishtailprotocol.com/projects/scaleProxy/${url}`;*/
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + endpoint.key,
      },
      body: JSON.stringify({
        input: {
          input: messages.map(m => m.text).join("\n"),
        },
      }),
      signal: controller.signal,
    });
  }

  async function displayMessage(e, lastMessage, response, extraText) {
    const json = await response.json();
    if (json.error != null) {
      log(`Received error${extraText}: ${json.error.code}: ${json.error.message}`);
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
      const timer = performance.now();
      let response;
      try {
        response = await sendRequest(selectedEndpoint);
      }
      catch (ex) {
        log(`Failed to receive message${indexText}: ${ex.message}`, ex);
        continue;
      }
      const timeText = `${(performance.now() - timer).toFixed(2)} ms`;
      if (controller.signal.aborted)
        return;
      else if (response.ok)
        lastMessage = await displayMessage(e, lastMessage, response, `${indexText} in ${timeText}`);
      else
        log(`Received HTTP error${indexText} in ${timeText}: ${response.status} ${response.statusText}`);
      if (stopOnFirstSuccess && lastMessage != null)
        return;
    }
    isSending = false;
  }

  async function sendMessage(e) {
    return await sendMessageChunkedInternal(e, 1, false);
  }

  async function sendMessageUntilSuccess(e) {
    return await sendMessageChunkedInternal(e, +options.multiMessageCount, true);
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
    return { name: "Pretty name", key: "KEY", url: "https://dashboard.scale.com/spellbook/api/v2/deploy/URL" };
  }
  
  function addEndpoint() {
    endpoints = [ ...endpoints, getEndpointPlaceholder() ];
  }

  function deleteEndpoint(ie) {
    endpoints = endpoints.filter((e, i) => i !== ie);
    if (endpoints[options.selectedEndpointIndex] === undefined)
      options.selectedEndpointIndex = null;
    options = { ...options };
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
    //el.addEventListener('change', updateTextAreaSize);
    return {
      destroy: () => el.removeEventListener('input', updateTextAreaSize),
    }
  }
</script>

<svelte:head>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
</svelte:head>

<svelte:window on:resize={updateAllTextAreaSizes} />

<div class="app">
  <details open>
    <summary>Options</summary>
    <div class="endpoints">
      <h3>Scale Endpoints <button on:click={addEndpoint} title="Add endpoint"><i class="fa fa-plus"></i></button></h3>
      {#each endpoints as endpoint, ie}
        <div class="endpoint">
          <input type=radio bind:group={options.selectedEndpointIndex} name=selectedEndpoint value={ie} title="Set endpoint as current">
          <input type=text bind:value={endpoint.name} placeholder="Display name">
          <input type=text bind:value={endpoint.key} placeholder="API Key">
          <input type=text bind:value={endpoint.url} placeholder="Endpoint URL">
          <button on:click={() => deleteEndpoint(ie)} title="Delete endpoint"><i class="fa fa-trash-o"></i></button>
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
            <option value={1}>CORS Demo</option>
            <!--<option value={2}>Web proxy</option>-->
          </select>
        </div>
        <div class="option">
          <label for=multiMessageCount>Multi-message count</label>
          <input type=text bind:value={options.multiMessageCount} id=multiMessageCount />
        </div>
      </div>
    </div>
    <details>
      <summary>Instructions</summary>
      <h3>Proxy</h3>
      <p>The method of bypassing CORS restrictions for the chat script. One is enough.
      <ul>
        <li><b>Direct</b>:
          <ul>
            <li><b>User Script</b> <i>(desktop/mobile)</i>:
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
        <li><b>CORS Demo</b> <i>(desktop/mobile)</i>:
          Go to <a href="https://cors-anywhere.herokuapp.com/corsdemo">CORS Anywhere Demo</a> page and click on the button to enable it.
          You may be asked to solve CAPTCHA. Note that CORS Demo can timeout way earlier than actual Scale API.
          This method allows all websites using that specific website to bypass CORS.
        <!--<li><b>Web Proxy</b> <i>(desktop/mobile)</i>:
          Use <a href="https://fishtailprotocol.com/projects/scaleProxy/">Web proxy by Feril</a>. No configuration required. This
          method affects only requests to Scale API.-->
      </ul>
    </details>
  </details>
  <div class="messages">
    {#each messages as message, im}
      <div class="message">
        <textarea bind:value={message.text} autocomplete=false use:autoResizeTextArea></textarea>
        <div class="buttons">
          <button on:click={() => swapMessages(im, im - 1)} disabled={im <= 0} title="Move message up">
            <i class="fa fa-arrow-up"></i>
          </button>
          <button on:click={() => swapMessages(im, im + 1)} disabled={im >= messages.length - 1} title="Move message down">
            <i class="fa fa-arrow-down"></i>
          </button>
          <button on:click={() => deleteMessage(im)} title="Delete message">
            <i class="fa fa-trash-o"></i>
          </button>
        </div>
      </div>
    {/each}
  </div>
  <div class="message new-message">
    <textarea bind:value={newMessageText} disabled={isSending} autocomplete=false use:autoResizeTextArea></textarea>
    <div class="buttons">
      <button on:click={e => sendMessage(e)} disabled={isSending} title="Send message">
        <i class="fa fa-paper-plane"></i>
      </button>
      <button on:click={e => sendMultiMessage(e)} disabled={isSending} title="Send message and receive {options.multiMessageCount} messages">
        <i class="fa fa-rocket"></i>
      </button>
      <button on:click={e => sendMessageUntilSuccess(e)} disabled={isSending} title="Try sending message {options.multiMessageCount} times">
        <i class="fa fa-ambulance"></i>
      </button>
      <button on:click={stopMessage} disabled={!isSending} title="Cancel sending">
        <i class="fa fa-ban"></i>
      </button>
      <button on:click={e => addMessage(e)} disabled={isSending} title="Add message without sending">
        <i class="fa fa-plus"></i>
      </button>
      <button on:click={copyMessages} title="Copy messages to clipboard">
        <i class="fa fa-clone"></i>
      </button>
    </div>
  </div>
  <p class="status">{statusText}</p>
</div>

<style lang="less">
  :global(:root) {
    color-scheme: dark;
    font: 15px/1.2 Segoe UI, sans-serif;
    *, *::before, *::after {
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
    margin: 0;
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
  .option {
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
  .buttons {
    display: contents;
  }
  .new-message {
    margin: 12px 0 0 0;
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
    opacity: 0.6;
  }
  button {
    height: 26px;
    .fa {
      font-size: 18px;
      font-weight: 100;
      width: 18px;
    }
  }
  p,
  ul {
    margin: 4px 0;
  }
  :global(:root.d-compact) {
    @media (max-width: 740px) {
      .buttons {
        display: flex;
        flex-flow: column;
        gap: 8px;
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
    line-height: 1.4;
    button {
      height: 32px;
      .fa {
        font-size: 22px;
        width: 28px;
      }
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
        display: flex;
        flex-flow: column;
        gap: 8px;
      }
      .endpoint {
        flex-flow: row wrap;
        input[type=text] {
          flex: 260px 1;
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
    font-size: 17px;
    line-height: 1.6;
    button {
      height: 38px;
      .fa {
        font-size: 26px;
        width: 30px;
      }
    }
  }
</style>