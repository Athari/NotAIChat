<script>
  'use strict';

  import { onMount } from 'svelte'
  import Fa from 'svelte-fa'
  import { loadData, saveData, downloadFile, uploadFile } from './utils'
  import { AIConnectionFactory } from './providers'
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

  AIConnectionFactory.init();

  let options = {
    selectedEndpointIndex: 0,
    selectedProxyIndex: 0,
    multiMessageCount: 10,
    retryMessageCount: 5,
    density: 'compact',
    maxTokens: 1024,
    temperature: 1.0,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
  };

  let endpoints = [ AIConnectionFactory.createDefaultProviderConfig() ];
  let proxies = [ AIConnectionFactory.createDefaultProxyConfig() ];
  let messages = [ { id: 1, role: 'user', text: "Hello GPT-4!" } ];
  let newMessage = { id: 0, role: 'user', text: "" };
  let isSending = false;
  let sendTime = null;
  let sendTimeText = "";
  let currentTime = 0;
  let statusText = "Welcome!";
  let controller = null;
  let isLoaded = false;
  
  let selectedEndpoint = null;
  let selectedProxy = null;
  let elRoot = null;
  let faTheme = { scale: 1.3 };
  let faThemeWithLabel = Object.assign({}, faTheme);
  
  const textAreaHeight = 20;
  const faThemeScaleMap = { compact: 1.3, mobile: 1.7, access: 2.1 };
  const secondNumberFormat0 = new Intl.NumberFormat('en-gb',
    { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 0 });
  const millisecondNumberFormat2 = new Intl.NumberFormat('en-gb',
    { style: 'unit', unit: 'millisecond', unitDisplay: 'short', maximumFractionDigits: 2 });

  onMount(() => {
    messages = loadData('messages', messages);
    endpoints = loadData('endpoints', endpoints);
    proxies = loadData('proxies', proxies);
    options = loadData('options', options);
    try {
      const newEndpointIndex = addEndpointFromSearchParams(new URLSearchParams(location.search));
      if (newEndpointIndex !== null)
        options.selectedEndpointIndex = newEndpointIndex;
      if (location.protocol == 'about:')
        document.querySelector('head style').innerHTML = "";
    }
    catch (ex) {
      console.log(ex);
    }
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
      saveData('proxies', proxies);
      saveData('options', options);
    }
  }

  $: elRoot !== null && (o => elRoot.className = `d-${o.density}`)(options);
  $: options.density !== null && updateAllTextAreaSizes();
  $: faTheme = { scale: faThemeScaleMap[options.density] };
  $: faThemeWithLabel = Object.assign({}, faTheme, { style: "margin: 0 calc(var(--gap) * 1.5) 0 calc(var(--gap) * 0.5)" })
  $: sendTimeText = (() => getTimeText())(currentTime);
  $: selectedEndpoint = endpoints[options.selectedEndpointIndex];
  $: selectedProxy = proxies[options.selectedProxyIndex];

  function log(message, ...args) {
    console.log(message, ...args);
    statusText = message;
  }

  function getFileNameDate() {
    return new Date().toISOString().substring(0, 19).replace('T', ' ').replaceAll(':', '-');
  }

  function saveEndpoints() {
    downloadChatJsonFile("Endpoints", endpoints);
  }

  function saveProxies() {
    downloadChatJsonFile("Proxies", proxies);
  }

  function saveMessages() {
    downloadChatJsonFile("Messages", messages);
  }

  function downloadChatJsonFile(fileName, data) {
    downloadFile('application/json', `NotAIChat ${fileName} ${getFileNameDate()}.json`,
      JSON.stringify(data, null, "  "));
  }  

  async function loadEndpoints(isAppend) {
    const json = await uploadFile('.json, application/json');
    if (!(json instanceof Array && typeof json[0].typeId == 'string'))
      return;
    endpoints = isAppend ? [ ...endpoints, ...json ] : json;
  }

  async function loadProxies(isAppend) {
    const json = await uploadFile('.json, application/json');
    if (!(json instanceof Array && typeof json[0].typeId == 'string'))
      return;
    endpoints = isAppend ? [ ...endpoints, ...json ] : json;
  }

  async function loadMessages(isAppend) {
    const json = await uploadFile('.json, application/json');
    if (!(json instanceof Array && typeof json[0].text == 'string'))
      return;
    messages = isAppend ? [ ...messages, ...json ] : json;
  }

  function getNextMessageId() {
    const currentMaxId = Math.max(...messages.map(m => m.id));
    return Number.isFinite(currentMaxId) ? currentMaxId + 1 : 1;
  }

  async function sendMessageInternal(e, messageCount, stopOnFirstSuccess) {
    log("Sending message");
    addMessage({ target: e.target });
    isSending = true;
    const api = AIConnectionFactory.createConnection(selectedEndpoint, selectedProxy, options);
    if (api == null) {
      log("No endpoint selected");
      return;
    }

    controller = new AbortController();
    const lastMessage = messages.slice(-1)[0];
    let targetMessage = lastMessage?.text == "" ? lastMessage : null;
    let indexText;
    const state = {
      get signal() { return controller.signal },
      get extraText() { return `${indexText} in ${getPreciseTimeText()}` },
      get messages() { return messages },
    };
    Object.assign(api, {
      onMessage(message) {
        if (message.mode != 'done') {
          if (targetMessage == null) {
            targetMessage = { id: getNextMessageId(), text: message.text, role: message.role };
            messages = [ ...messages, targetMessage ];
          } else {
            targetMessage.text += message.text;
            messages = [ ...messages ];
            updateMessageTextAreaSize({ target: [...document.querySelectorAll('.messages textarea')].slice(-1)[0] });
          }
        }
        if (message.mode == 'complete' || message.mode == 'done')
          log(`Received message${state.extraText}`, message);
        else (message.mode == 'append')
          log(`Receiving message${state.extraText}`, message);
      },
      onLogMessage(logMessage) {
        if (logMessage.data)
          log(logMessage.text, ...logMessage.data);
        else
          log(logMessage.text);
      },
      onError(error) {
        log(error.text, error.error);
      },
    });
    for (let iMessage = 0; iMessage < messageCount; iMessage++) {
      indexText = messageCount > 1 ? ` (${iMessage + 1}/${messageCount})` : "";
      [ sendTime, currentTime ] = [ performance.now(), 0 ];
      try {
        await api.sendRequest(state);
      }
      catch (ex) {
        if (ex instanceof DOMException && ex.name == 'AbortError') {
          log(`User cancelled message${state.extraText}`, ex);
          return;
        } else {
          log(`Unexpected error${state.extraText}: ${ex.message} ` +
            `(Console and Network tabs in DevTools may contain extra details)`, ex);
          continue;
        }
      }
      if (controller.signal.aborted || (stopOnFirstSuccess && targetMessage != null))
        break;
    }
    isSending = false;
  }

  async function sendMessage(e) {
    return await sendMessageInternal(e, 1, false);
  }

  async function sendMessageUntilSuccess(e) {
    return await sendMessageInternal(e, +options.retryMessageCount, true);
  }

  async function sendMultiMessage(e) {
    return await sendMessageInternal(e, +options.multiMessageCount, false);
  }

  function stopMessage() {
    if (controller == null)
      return;
    isSending = false;
    controller.abort();
    log("Receiving message cancelled");
  }

  function addMessage(e) {
    if (newMessage.text == "")
      return;
    messages = [ ...messages, { id: getNextMessageId(), text: newMessage.text, role: newMessage.role } ];
    newMessage.text = "";
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

  function addEndpoint() {
    endpoints = [ ...endpoints, AIConnectionFactory.createDefaultProviderConfig() ];
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
    const placeholderKey = AIConnectionFactory.createDefaultProviderConfig().key;
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
  }

  function addProxy() {
    proxies = [ ...proxies, AIConnectionFactory.createDefaultProxyConfig() ];
  }

  function deleteProxy(ip) {
    proxies = proxies.filter((p, i) => i !== ip);
    if (proxies[options.selectedProxyIndex] === undefined)
      options.selectedProxyIndex = null;
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
          <label class=side>
            <input type=radio bind:group={options.selectedEndpointIndex} name=selectedEndpoint value={ie} title="Set endpoint as current">
          </label>
          <label class=over>
            <b>Display name</b>
            <input type=text bind:value={endpoint.name} placeholder="Display name">
          </label>
          <label class=over>
            <b>Provider</b>
            <select bind:value={endpoint.typeId} placeholder="Provider">
              {#each AIConnectionFactory.providers as provider}
                <option value={provider.id}>{provider.displayName}</option>  
              {/each}
            </select>
          </label>
          {#await AIConnectionFactory.getProvider(endpoint.typeId) then provider}
            {#if provider.id == 'openai-text' || provider.id == 'openai-chat' || provider.id == 'chatbotkit' || provider.id == 'anthropic-chat' || provider.id == 'natdev'}
              <label class=over>
                <b>API key</b>
                <input type=text bind:value={endpoint.key} placeholder="API key">
              </label>
              <label class=over>
                <b>Base URL</b>
                <input type=text bind:value={endpoint.url} placeholder="Base URL">
              </label>
            {:else if provider.id == 'steamship-plugin'}
              <label class=over>
                <b>API key</b>
                <input type=text bind:value={endpoint.key} placeholder="API key">
              </label>
              <label class=over>
                <b>Workspace</b>
                <input type=text bind:value={endpoint.workspace} placeholder="Workspace">
              </label>
            {:else if provider.id == 'scale-spellbook' || provider.id == 'scale-spellbook-fish'}
              <label class=over>
                <b>Deployment key</b>
                <input type=text bind:value={endpoint.key} placeholder="Deployment key">
              </label>
              <label class=over>
                <b>Deployment URL</b>
                <input type=text bind:value={endpoint.url} placeholder="Deployment URL">
              </label>
            {:else}
              <b>Choose endpoint provider</b>
            {/if}
            {#if provider.models.length > 0}
              <label class=over>
                <b>Model name</b>
                <input type=text bind:value={endpoint.model} placeholder="Model name" list="{provider.id}-models">
              </label>
            {/if}
            {#if provider.id == 'openai-text' || provider.id == 'openai-chat' || provider.id == 'chatbotkit' || provider.id == 'anthropic-chat'}
              <label class=side>
                <input type=checkbox bind:checked={endpoint.stream}>
                <b>Stream</b>
              </label>
            {/if}
          {/await}
          <div class="buttons">
            <button type=button on:click={() => shareEndpointLink(ie)} title="Share endpoint link">
              <Fa icon={faShareNodes} {...faTheme} />
            </button>
            <button type=button on:click={() => deleteEndpoint(ie)} title="Delete endpoint">
              <Fa icon={faXmarkLarge} {...faTheme} />
            </button>
          </div>
        </div>
      {/each}
      <h3>
        Proxies
        <button on:click={addProxy} title="Add proxy">
          <Fa icon={faPlusLarge} {...faTheme} />
        </button>
      </h3>
      {#each proxies as proxy, ip}
        <div class="endpoint">
          <input type=radio bind:group={options.selectedProxyIndex} name=selectedProxy value={ip} title="Set proxy as current">
          <label class=over>
            <b>Display name</b>
            <input type=text bind:value={proxy.name} placeholder="Display name">
          </label>
          <label class=over>
            <b>Provider</b>
            <select bind:value={proxy.typeId} placeholder="Provider">
              {#each AIConnectionFactory.proxies as proxy}
                <option value={proxy.id}>{proxy.displayName}</option>  
              {/each}
            </select>
          </label>
          {#await AIConnectionFactory.getProxy(proxy.typeId) then provider}
            {#if provider.id == 'cors-anywhere'}
              <label class=over>
                <b>Proxy URL</b>
                <input type=text bind:value={proxy.url} placeholder="Proxy URL">
              </label>
            {:else if provider.id != ''}
              <b>Choose proxy provider</b>
            {/if}
          {/await}
          <div class="buttons">
            <button type=button on:click={() => deleteProxy(ip)} title="Delete proxy">
              <Fa icon={faXmarkLarge} {...faTheme} />
            </button>
          </div>
        </div>
      {/each}
      <h3>Model options</h3>
      <div class="options">
        <div class="option">
          <label for=maxTokens>Max tokens</label>
          <input type=text bind:value={options.maxTokens} id=maxTokens />
        </div>
        <div class="option">
          <label for=temperature>Temperature</label>
          <input type=text bind:value={options.temperature} id=temperature />
        </div>
        <div class="option">
          <label for=frequencyPenalty>Frequency penalty</label>
          <input type=text bind:value={options.frequencyPenalty} id=frequencyPenalty />
        </div>
        <div class="option">
          <label for=presencePenalty>Presence penalty</label>
          <input type=text bind:value={options.presencePenalty} id=presencePenalty />
        </div>
      </div>
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
          <header>Endpoints</header>
          <button type=button on:click={() => loadEndpoints(false)}>
            <Fa icon={faFolderOpen} {...faThemeWithLabel} />Load
          </button>
          <button type=button on:click={() => loadEndpoints(true)}>
            <Fa icon={faFolderOpen} {...faThemeWithLabel} />Append
          </button>
          <button type=button on:click={() => saveEndpoints()}>
            <Fa icon={faFloppyDisk} {...faThemeWithLabel} />Save
          </button>
        </div>
        <div class="option-long">
          <header>Messages</header>
          <button type=button on:click={() => loadMessages(false)}>
            <Fa icon={faFolderOpen} {...faThemeWithLabel} />Load
          </button>
          <button type=button on:click={() => loadMessages(true)}>
            <Fa icon={faFolderOpen} {...faThemeWithLabel} />Append
          </button>
          <button type=button on:click={() => saveMessages()}>
            <Fa icon={faFloppyDisk} {...faThemeWithLabel} />Save
          </button>
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
        <input type=text bind:value={message.role} list=messageRole placeholder="Role" />
        <textarea bind:value={message.text} placeholder="Message #{message.id} text"
                  autocomplete=false use:autoResizeTextArea></textarea>
        <div class="buttons">
          <button on:click={() => swapMessages(im, im - 1)} disabled={im <= 0} title="Move message up">
            <Fa icon={faArrowUp} {...faTheme} />
          </button>
          <button type=button on:click={() => swapMessages(im, im + 1)} disabled={im >= messages.length - 1} title="Move message down">
            <Fa icon={faArrowDown} {...faTheme} />
          </button>
          <button type=button on:click={() => deleteMessage(im)} title="Delete message">
            <Fa icon={faXmarkLarge} {...faTheme} />
          </button>
        </div>
      </div>
    {/each}
  </div>
  <div class="message new-message">
    <input type=text bind:value={newMessage.role} disabled={isSending} list=messageRole placeholder="New message role" />
    <textarea bind:value={newMessage.text} disabled={isSending} placeholder="New message text"
              autocomplete=false use:autoResizeTextArea></textarea>
    <div class="buttons">
      <button type=button on:click={e => sendMessage(e)} disabled={isSending} title="Send message">
        <Fa icon={faPaperPlane} {...faTheme} />
      </button>
      <button type=button on:click={e => sendMultiMessage(e)} disabled={isSending} title="Send message and receive {options.multiMessageCount} messages">
        <Fa icon={faRocketLaunch} {...faTheme} />
      </button>
      <button type=button on:click={e => sendMessageUntilSuccess(e)} disabled={isSending} title="Try sending message {options.retryMessageCount} times">
        <Fa icon={faTurtle} {...faTheme} />
      </button>
      <button type=button on:click={stopMessage} disabled={!isSending} title="Cancel sending">
        <Fa icon={faBan} {...faTheme} />
      </button>
      <button type=button on:click={e => addMessage(e)} disabled={isSending} title="Add message without sending">
        <Fa icon={faPlusLarge} {...faTheme} />
      </button>
      <button type=button on:click={copyMessages} title="Copy all messages to clipboard">
        <Fa icon={faCopy} {...faTheme} flip=vertical />
      </button>
    </div>
  </div>
  <div class="status">
    <p class="message">{statusText}</p>
    <p class="time" style:display={isSending ? 'block' : 'none'}>{sendTimeText}</p>
  </div>
  <datalist id=messageRole>
    {#each AIConnectionFactory.getProvider(selectedEndpoint?.typeId).messageRoles as messageRole}
      <option value={messageRole}>{messageRole}</option>
    {/each}
  </datalist>
  {#each AIConnectionFactory.providers.filter(p => p.models.length > 0) as provider}
    <datalist id="{provider.id}-models">
      {#each provider.models as model}
        <option value={model}>{model}</option>
      {/each}
    </datalist>
  {/each}
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
  header {
    font: inherit;
    font-weight: 400;
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
  .option,
  .buttons {
    display: flex;
    flex-flow: row;
    align-items: stretch;
    gap: 8px;
  }
  .message {
    align-items: flex-start;
    input[type=text][list] {
      flex: 0 0 120px;
    }
  }
  .endpoint {
    flex-flow: row wrap;
  }
  .option {
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
  :is(.endpoint) .buttons {
    padding: calc(1lh + 4px) 0 0 0;
  }
  .new-message {
    margin: 12px 0 0 0;
    .buttons {
      flex: 0 0 calc((var(--button-width) + var(--gap) + 0px) * 3 - var(--gap));
      flex-flow: row wrap;
    }
  }
  label.over {
    display: flex;
    flex-flow: column;
    flex: 1 250px;
    b {
      margin: 0 0 4px 0;
      font-weight: inherit;
    }
  }
  label.side {
    display: flex;
    flex-flow: row;
    align-items: center;
    flex: 0;
    gap: 8px;
    padding: calc(1lh + 4px) 0 0 0;
    b {
      font-weight: inherit;
    }
    input:is([type=checkbox], [type=radio]) {
      width: 20px;
      min-height: 20px;
      padding: 0;
      margin: 0;
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