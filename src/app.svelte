<script>
  import { onMount } from "svelte";

  let endpoints = [];
  let selectedEndpointIndex = 0;
  let multiMessageCount = 10;
  let messages = [];
  let newMessageText = "";
  let isSending = false;
  let statusText = "Welcome!";
  let controller = null;
  let isLoaded = false;
  const textAreaHeight = 20;
  
  onMount(() => {
    isLoaded = true;
    if (location.protocol == 'about:')
      document.querySelector('head style').innerHTML = "";
    messages = loadData('messages', [
      { id: 1, text: "Hello GPT-4!" },
    ]);
    endpoints = loadData('endpoints', [
      getEndpointPlaceholder(),
    ]);
    ({ selectedEndpointIndex, multiMessageCount } = loadData('options', {
      selectedEndpointIndex, multiMessageCount,
    }));
    //log("Loaded data");
  });

  $: {
    if (isLoaded) {
      saveData('messages', messages);
      saveData('endpoints', endpoints);
      saveData('options', { selectedEndpointIndex, multiMessageCount });
      //log("Saved data");
    }
  }
  
  function log(message, ...args) {
    console.log(message, ...args);
    statusText = message;
  }
  
  function loadData(id, defaultData) {
    try {
      const data = JSON.parse(localStorage.getItem(id)) ?? defaultData;
      return typeof data === typeof defaultData && data.constructor.name === defaultData.constructor.name ?
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
    return (Math.max(...messages.map(m => m.id)) ?? 0) + 1;
  }

  async function sendRequest(endpoint) {
    return await fetch(endpoint.url, {
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
        addMessage({ target: e.target });
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

  async function sendMessageChunkedInternal(e, messageCount) {
    isSending = true;
    try {
      const selectedEndpoint = endpoints[selectedEndpointIndex];
      if (selectedEndpoint == null)
        throw new Error("No endpoint selected");
      let lastMessage = null;
      for (let iMessage = 0; iMessage < messageCount; iMessage++) {
        const indexText = messageCount > 1 ? ` (${iMessage + 1}/${messageCount})` : "";
        controller = new AbortController();
        const timer = performance.now();
        const response = await sendRequest(selectedEndpoint);
        const timeText = `${(performance.now() - timer).toFixed(2)} ms`;
        if (controller.signal.aborted)
          return;
        else if (response.ok)
          lastMessage = await displayMessage(e, lastMessage, response, `${indexText} in ${timeText}`);
        else
          throw new Error(`${response.status} ${response.statusText}`);
      }
    } catch (ex) {
      log(`Error: ${ex.message}`, ex);
    }
    isSending = false;
  }

  async function sendMessage(e) {
    return await sendMessageChunkedInternal(e, 1);
  }

  async function sendMessageChunked(e) {
    return await sendMessageChunkedInternal(e, +multiMessageCount);
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
    if (endpoints[selectedEndpointIndex] === undefined)
      selectedEndpointIndex = null;
  }
  
  function updateTextAreaSize({ target }) {
    const oldPageOffset = window.pageYOffset;
    target.style.height = '0';
    target.style.overflow = 'hidden';
    target.style.height = `${Math.max(target.scrollHeight, textAreaHeight)}px`;
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
          <input type=radio bind:group={selectedEndpointIndex} name=selectedEndpoint value={ie} title="Set endpoint as current">
          <input type=text bind:value={endpoint.name} placeholder="Display name">
          <input type=text bind:value={endpoint.key} placeholder="API Key">
          <input type=text bind:value={endpoint.url} placeholder="Endpoint URL">
          <button on:click={() => deleteEndpoint(ie)} title="Delete endpoint"><i class="fa fa-trash-o"></i></button>
        </div>
      {/each}
      <h3>Behavior</h3>
      <div class="options">
        <div class="option">
          <label for=multiMessageCount>Multi-message count</label>
          <input type=text bind:value={multiMessageCount} id=multiMessageCount />
        </div>
      </div>
    </div>
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
      <button on:click={e => sendMessageChunked(e)} disabled={isSending} title="Send message and receive {multiMessageCount} messages">
        <i class="fa fa-rocket"></i>
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

<style>
  :root {
    color-scheme: dark;
    font: 15px Segoe UI, sans-serif;
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
  }
  details[open] summary {
    padding: 0 0 8px 0;
    font-weight: 700;
    cursor: pointer;
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
    flex-flow: column wrap;
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
  }
  .option label {
    flex: 1;
  }
  .buttons {
    display: contents;
  }
  .new-message {
    margin: 12px 0 0 0;
  }
  textarea,
  input[type=text] {
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
  }
  button .fa {
    font-size: 18px;
    font-weight: 100;
    width: 18px;
  }
  @media (max-width: 640px) {
    .buttons {
      display: flex;
      flex-flow: column;
      gap: 8px;
    }
    .endpoint {
      flex-flow: row wrap;
    }
    .endpoint input[type=text] {
      flex: 200px 1;
    }
  }
  @media (max-width: 480px) {
    .option {
      width: auto;
    }
  }
</style>