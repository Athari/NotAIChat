<script>
  import { onMount } from "svelte";

  let endpoints = [];
  let selectedEndpointIndex = 0;
  let messages = [];
  let newMessageText = "";
  let isSending = false;
  let statusText = "";
  let timer;
  let controller = null;
  let textAreaHeight = 20;
  let isLoaded = false;
  
  onMount(() => {
    isLoaded = true;
    if (location.protocol == 'about:')
      document.querySelector('head style').innerHTML = "";
    messages = loadData('messages', [
      { id: 1, text: "Hello" },
      { id: 2, text: "This is a svelte app" },
      { id: 3, text: "You can edit and delete messages" },
    ]);
    endpoints = loadData('endpoints', [
      { name: "Pretty name", key: "KEY", url: "https://dashboard.scale.com/spellbook/api/v2/deploy/URL" },
    ]);
    log("Loaded data");
  });

  $: {
    if (isLoaded) {
      saveData('messages', messages);
      saveData('endpoints', endpoints);
      log("Saved data");
    }
  }
  
  function log(message, ...args) {
    console.log(message, ...args);
    statusText = message;
  }
  
  function loadData(id, defaultData) {
    try {
      return JSON.parse(localStorage.getItem(id));
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

  async function sendMessage(e) {
    isSending = true;
    timer = performance.now();
    try {
      const selectedEndpoint = endpoints[selectedEndpointIndex];
      if (selectedEndpoint == null)
        throw new Error("No endpoint selected");      
      controller = new AbortController();
      const response = await fetch(selectedEndpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + selectedEndpoint.key,
        },
        body: JSON.stringify({
          input: {
            input: messages.map(m => m.text).join("\n"),
          },
        }),
        signal: controller.signal,
      });
      const timeText = `${(performance.now() - timer).toFixed(2)} ms`;
      if (response.ok) {
        const json = await response.json();
        if (json.error != null) {
          log(`Received error in ${timeText}: ${json.error.code}: ${json.error.message}`);
        } else if (json.output != null) {
          const nextMessageId = getNextMessageId();
          addMessage({ target: e.target });
          messages = [ ...messages, { id: nextMessageId + 1, text: json.output } ];
          log(`Received message in ${timeText}`, json);
        }
      } else {
        throw new Error(`${response.status} ${response.statusText}`);
      }
    } catch (ex) {
      log(`Error: ${ex.message}`, ex);
    }
    isSending = false;
  }

  function stopMessage() {
    if (controller == null)
      return;
    isSending = false;
    info = "Receiving message cancelled";
    controller.abort();
  }
  
  function addMessage(e) {
    if (newMessageText == "")
      return;
    messages = [ ...messages, { id: getNextMessageId(), text: newMessageText } ];
    newMessageText = "";
    setTimeout(() => updateTextAreaSize({ target: e.target.closest('.message').querySelector('textarea') }), 1);
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
  
  function addEndpoint(ie) {
    endpoints = [ ...endpoints, { key: "", url: "" } ];
  }

  function deleteEndpoint(ie) {
    endpoints = endpoints.filter((e, i) => i !== ie);
    if (endpoints[selectedEndpointIndex] === undefined)
      selectedEndpointIndex = null;
  }
  
  function updateTextAreaSize({ target }) {
    target.style.height = '0';
    target.style.height = `${Math.max(target.scrollHeight, textAreaHeight)}px`;
  }

  function autoResizeTextArea(el) {
    updateTextAreaSize({ target: el });
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

<!-- HTML template for displaying elements -->
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
          <button on:click={e => deleteEndpoint(ie)} title="Delete endpoint"><i class="fa fa-trash-o"></i></button>
        </div>
      {/each}
    </div>
  </details>
  <div class="messages">
    {#each messages as message, im}
      <div class="message">
        <textarea bind:value={message.text} autocomplete="false" use:autoResizeTextArea></textarea>
        <button on:click={e => swapMessages(im, im - 1)} disabled={im <= 0} title="Move message up">
          <i class="fa fa-arrow-up"></i>
        </button>
        <button on:click={e => swapMessages(im, im + 1)} disabled={im >= messages.length - 1} title="Move message down">
          <i class="fa fa-arrow-down"></i>
        </button>
        <button on:click={e => deleteMessage(im)} title="Delete message">
          <i class="fa fa-trash-o"></i>
        </button>
      </div>
    {/each}
  </div>
  <div class="message new-message">
    <textarea bind:value={newMessageText} disabled={isSending} autocomplete="false" use:autoResizeTextArea></textarea>
    <button on:click={e => sendMessage(e)} disabled={isSending} title="Send message">
      <i class="fa fa-paper-plane"></i>
    </button>
    <button on:click={stopMessage} disabled={!isSending} title="Cancel sending">
      <i class="fa fa-ban"></i>
    </button>
    <button on:click={e => addMessage(e)} disabled={isSending} title="Add message without sending">
      <i class="fa fa-plus"></i>
    </button>
    <button on:click={copyMessages} title="Copy messages to clipboard">
      <i class="fa fa-clipboard fa-lg"></i>
    </button>
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
  .endpoints {
    display: flex;
    flex-flow: column;
    gap: 8px;
  }
  .message,
  .endpoint {
    display: flex;
    flex-flow: row;
    align-items: flex-start;
    gap: 8px;
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
</style>