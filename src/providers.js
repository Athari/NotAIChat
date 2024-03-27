'use strict'

import {
  Anthropic as AnthropicClient,
  AI_PROMPT as AnthropicAssistantPrompt,
  HUMAN_PROMPT as AnthropicHumanPrompt,
} from "@anthropic-ai/sdk";
import { OpenAI } from 'openai';
//import { OpenAIClient as AzureOpenAIClient, AzureKeyCredential } from "@azure/openai";
import { delay, timeout, generateUuid, parseFloatOrNull, parseIntOrNull } from './utils'

export class AIConnectionFactory {
  static providers = [];
  static proxies = [];

  displayName;
  id;
  defaultConfig;
  messageRoles;
  models;
  runner;

  constructor(id, displayName, runner, configGetter, messageRoles, models) {
    Object.assign(this, { id, displayName, runner, configGetter, messageRoles, models });
  }

  static init() {
    AIConnectionFactory.providers = [
      new AIConnectionFactory(
        '', "", EmptyAIProvider,
        {}, [], [],
      ),
      new AIConnectionFactory(
        'openai-text', "OpenAI Text", OpenAITextProvider,
        { key: "", url: "", model: "", stream: false }, [],
        [ 'gpt-3.5-turbo-instruct' ],
      ),
      new AIConnectionFactory(
        'openai-chat', "OpenAI Chat", OpenAIChatProvider,
        { key: "", url: "", model: "", stream: false, rawUrl: false },
        [ 'user', 'assistant', 'system' ],
        [
          // https://platform.openai.com/docs/models
          // https://github.com/openai/openai-node/blob/master/src/resources/chat/completions.ts
          'gpt-4-1106-preview', 'gpt-4-vision-preview', // gpt-4 turbo 128k
          'gpt-4', 'gpt-4-0314', 'gpt-4-0613', 'gpt-4-32k', 'gpt-4-32k-0314', 'gpt-4-32k-0613', // gpt-4 8k / 16k
          'gpt-3.5-turbo-1106', 'gpt-3.5-turbo-16k', // gpt-3.5 16k
          'gpt-3.5-turbo', // gpt-3.5 4k
          'gpt-3.5-turbo-0301', 'gpt-3.5-turbo-0613', 'gpt-3.5-turbo-1106', 'gpt-3.5-turbo-16k-0613', // legacy gpt-3.5
          // Compat
          'gemini-pro', 'mistral-medium'
        ],
      ),
      new AIConnectionFactory(
        'azure-openai-chat', "Azure OpenAI Chat", AzureOpenAIChatProvider,
        { key: "", resource: "", deployment: "", apiVersion: "", stream: false },
        [ 'user', 'assistant', 'system' ],
        [],
      ),
      new AIConnectionFactory(
        'anthropic-text', "Anthropic Text", AnthropicTextProvider,
        { key: "", url: "", model: "", stream: false },
        [ 'human', 'assistant', 'system' ],
        [
          'claude-1.0', 'claude-1.2', 'claude-1.3', // claude-1
          'claude-1.3-100k', // claude-1 100k
          'claude-instant-1.0', 'claude-instant-1.1', 'claude-instant-1.2', // claude-instant
          'claude-instant-1-100k', 'claude-instant-1.1-100k', // claude-instant 100k
          'claude-2.0', 'claude-2.1', // claude-2 100k / 200k
          // AWS
          'anthropic.claude-v1', 'anthropic.claude-v2', 'anthropic.claude-v2:1',
        ],
      ),
      new AIConnectionFactory(
        'anthropic-messages', "Anthropic Messages", AnthropicMessagesProvider,
        { key: "", url: "", model: "", stream: false },
        [ 'user', 'assistant', 'system' ],
        [
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
          // AWS
          'anthropic.claude-v2', 'anthropic.claude-v2:1',
          'anthropic.claude-3-sonnet-20240229-v1:0',
          'anthropic.claude-3-haiku-20240307-v1:0',
          'anthropic.claude-instant-v1',
        ],
      ),
      new AIConnectionFactory(
        'natdev', "Nat.dev", NatDevChatProvider,
        { key: "", url: "", model: "", stream: false }, [],
        [
          'textgeneration:llama-65b', 'replicate:alpaca-7b', 'replicate:llama-13b', 'huggingface:bigscience/bloomz',
          'openai:gpt-3.5-turbo', 'openai:gpt-4', 'openai:text-davinci-002',, 'openai:text-davinci-003',
          'anthropic:claude-instant-v1.0', 'anthropic:claude-v1.2',
        ],
      ),
      new AIConnectionFactory(
        'steamship-plugin', "SteamShip Plugin", SteamShipPluginProvider,
        { key: "", workspace: "", model: "" }, [],
        [ 'gpt-3', 'gpt-4' ],
      ),
      new AIConnectionFactory(
        'scale-spellbook', "Scale Spellbook", ScaleSpellbookProvider,
        { key: "", url: "" }, [], [],
      ),
      new AIConnectionFactory(
        'scale-spellbook-fish', "Scale Spellbook (Fish proxy)", ScaleSpellbookFishProvider,
        { key: "", url: "" }, [], [],
      ),
      new AIConnectionFactory(
        'chatbotkit', "ChatBotKit", ChatBotKitProvider,
        { key: "", url: "", model: "", stream: false },
        [ 'user', 'bot', 'context', 'instruction', 'backstory' ],
        [ 'gpt-4', 'gbt-3.5-turbo', 'text-davinci-003', 'text-davinci-002', 'text-algo-003', 'text-algo-002', 'text-algo-001' ],
      ),
    ];
  
    AIConnectionFactory.proxies = [
      new AIConnectionFactory(
        '', "Direct", DirectProxy,
        {},
      ),
      new AIConnectionFactory(
        'cors-anywhere', "CORS Anywhere", CorsAnywhereProxy,
        { url: "" },
      ),
    ];
  }

  createConfig() {
    return Object.assign({}, { typeId: this.id, name: "Name" }, this.defaultConfig);
  }

  static createConnection(providerConfig, proxyConfig, options) {
    if (providerConfig == null)
      return null;
    const provider = AIConnectionFactory.getProvider(providerConfig.typeId);
    if (provider.runner === EmptyAIProvider)
      return null;
    const proxy = AIConnectionFactory.getProxy(proxyConfig?.typeId);
    const modelOptions = {
      maxTokens: parseIntOrNull(options.maxTokens),
      temperature: parseFloatOrNull(options.temperature),
      frequencyPenalty: parseFloatOrNull(options.frequencyPenalty),
      presencePenalty: parseFloatOrNull(options.presencePenalty),
    }
    return new provider.runner(Object.assign(modelOptions, providerConfig), new proxy.runner(proxyConfig));
  }

  static getProvider(id) {
    return AIConnectionFactory.providers.filter(p => p.id == id)[0] ?? AIConnectionFactory.providers[0];
  }

  static getProxy(id) {
    return AIConnectionFactory.proxies.filter(p => p.id == id)[0] ?? AIConnectionFactory.proxies[0];
  }

  static createDefaultProviderConfig() {
    return AIConnectionFactory.providers[0].createConfig();
  }

  static createDefaultProxyConfig() {
    return AIConnectionFactory.proxies[0].createConfig();
  }
}

export class AIProvider {
  config;
  proxy;
  onMessage;
  onLogMessage;
  onError;

  constructor(config, proxy) {
    if (this.constructor === AIProvider)
      throw new AbstractClassError(this);
    Object.assign(this, { config, proxy });
  }

  async sendRequest(state) {
    return { error: "Provider not implemented" };
  }

  async fetch(input, init) {
    const response = await fetch(input, init);
    const headers = {};
    response.headers.forEach((v, k) => headers[k] = v);
    console.log("Received HTTP response:", response, "headers:", headers);
    return response;
  }

  async handleJsonResponse(state, response) {
    let text;
    try {
      text = await response.text();
    }
    catch (ex) {
      this.raiseError("Failed to decode message", ex, state, response);
      return false;
    }
    try{
      return await this.handleJson(JSON.parse(text), state, response);
    }
    catch (ex) {
      this.raiseError(text.length > 4096 ? "Failed to parse message" : text, ex, state, response);
      return false;
    }
  }

  async handleJson(json, state, response) {
    throw new NotImplementedError('handleJson');
  }

  raiseLogMessage(logMessage) {
    this.onLogMessage?.call(this, logMessage);
  }

  raiseMessage(message) {
    this.onMessage?.call(this, message);
    return true;
  }

  raiseError(errorMessage, error, state, response) {
    const httpErrorText = response == null || response.ok ? "" :
      ` (HTTP code: ${response.status}${` ${response.statusText}`.trim()})`;
    this.onError?.call(this, {
      text: `${errorMessage}${state.extraText}: ${error?.message}${httpErrorText}`,
      error,
    });
    return false;
  }
}

export class EmptyAIProvider extends AIProvider {
  async sendRequest(state) {
    return { error: "Provider not set" };
  }
}

export class OpenAITextProvider extends AIProvider {
  async sendRequest(state) {
    const rawFetch = (url, opts) => {
      opts.headers['Api-Key'] = this.config.key;
      return this.fetch(this.config.rawUrl ? this.config.url : url, opts);
    };
    const client = new OpenAI({
      apiKey: this.config.key,
      baseURL: this.proxy.modifyUrl(this.config.url || 'https://api.openai.com'),
      dangerouslyAllowBrowser: true,
      fetch: rawFetch,
    });
    client.config = this.config;
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    const params = {
      prompt: allMessages.map(m => `${m.text}\n\n`).join(""),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
      //top_p: null,
    };
    let response = null;
    try {
      if (this.config.stream) {
        const stream = await client.completions.create({ ...params, stream: true });
        state.signal.addEventListener('abort', () => stream.controller.abort());
        for await (const message of stream)
          this.raiseMessage({ text: message.choices[0]?.text ?? "", role: 'assistant', mode: 'append' });
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await client.completions.create({ ...params, stream: false });
        return this.raiseMessage({ text: message.choices[0]?.text ?? "", role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class OpenAIChatProvider extends AIProvider {
  async sendRequest(state) {
    const rawFetch = (url, opts) => {
      if (this.config.key != "-")
        opts.headers['Api-Key'] = this.config.key;
      else
        delete opts.headers['Authorization'];
      return this.fetch(this.config.rawUrl ? this.config.url : url, opts);
    };
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const client = new OpenAI({
      apiKey: this.config.key,
      baseURL: this.proxy.modifyUrl(this.config.url || 'https://api.openai.com'),
      dangerouslyAllowBrowser: true,
      fetch: rawFetch,
    });
    client.config = this.config;
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    const params = {
      messages: allMessages.map(m => ({
        role: getMessageRole(m.role),
        content: m.text,
      })),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
      //top_p: null,
    };
    let response = null;
    try {
      if (this.config.stream) {
        const stream = await client.chat.completions.create({ ...params, stream: true });
        state.signal.addEventListener('abort', () => stream.controller.abort());
        for await (const message of stream)
          this.raiseMessage({ text: message.choices[0]?.delta?.content ?? "", role: 'assistant', mode: 'append' });
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await client.chat.completions.create({ ...params, stream: false });
        return this.raiseMessage({ text: message.choices[0]?.message?.content ?? "", role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class AzureOpenAIChatProvider extends AIProvider {
  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const client = new AzureOpenAIClient(
      this.proxy.modifyUrl(`https://${this.config.resource}.openai.azure.com/`),
      new AzureKeyCredential(this.config.key), {
        apiVersion: this.config.apiVersion,
      });
    const messages = state.messages.filter(m => m.text?.length > 0).map(m => ({
      role: getMessageRole(m.role),
      content: m.text,
    }));
    const params = {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      frequencyPenalty: this.config.frequencyPenalty,
      presencePenalty: this.config.presencePenalty,
      abortSignal: state.signal,
    };
    let response = null;
    try {
      if (this.config.stream) {
        const stream = await client.streamChatCompletions(this.config.deployment, messages, params);
        state.signal.addEventListener('abort', () => stream.cancel());
        for await (const message of stream)
          this.raiseMessage({ text: message.choices[0]?.delta?.content ?? "", role: 'assistant', mode: 'append' });
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await client.getChatCompletions(this.config.deployment, messages, params);
        return this.raiseMessage({ text: message.choices[0]?.message?.content ?? "", role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class AnthropicTextProvider extends AIProvider {
  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? "" :
      (r || '').match(/user|human/i) ? AnthropicHumanPrompt : AnthropicAssistantPrompt;
    const client = new AnthropicClient({
      apiKey: this.config.key,
      baseURL: this.proxy.modifyUrl(this.config.url || 'https://api.anthropic.com'),
    });
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    const params = {
      prompt: allMessages.map(m => `${getMessageRole(m.role)}${m.text}`).join("") +
        (getMessageRole(allMessages.at(-1)?.role) == AnthropicAssistantPrompt ? "" : AnthropicAssistantPrompt),
      model: this.config.model,
      max_tokens_to_sample: this.config.maxTokens,
      temperature: this.config.temperature,
      //top_p: -1,
      //top_k: -1,
      stop_sequences: [ AnthropicHumanPrompt ],
    };
    let response = null;
    try {
      if (this.config.stream) {
        const stream = await client.completions.create({ ...params, stream: true });
        response = stream.response;
        state.signal.addEventListener('abort', () => stream.controller.abort());
        for await (const message of stream)
          this.raiseMessage({ text: message.completion, role: 'assistant', mode: 'append' });
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await client.completions.create({ ...params, stream: false });
        return this.raiseMessage({ text: message.completion, role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class AnthropicMessagesProvider extends AIProvider {
  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const client = new AnthropicClient({
      apiKey: this.config.key,
      baseURL: this.proxy.modifyUrl(this.config.url || 'https://api.anthropic.com'),
      fetch: (url, opts) => this.fetch(url, opts),
    });
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    const params = {
      messages: allMessages.filter(m => getMessageRole(m.role) != 'system').map(m => ({
        role: getMessageRole(m.role),
        content: m.text.trimRight(),
      })),
      system: allMessages.filter(m => getMessageRole(m.role) == 'system').map(m => m.text).join("\n").trim(),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      //top_p: -1,
      //top_k: -1,
    };
    let response = null;
    try {
      if (this.config.stream) {
        const stream = await client.messages.create({ ...params, stream: true }).withResponse();
        response = stream.response;
        state.signal.addEventListener('abort', () => stream.data.controller.abort());
        for await (const message of stream.data) {
          switch (message.type) {
            case 'content_block_delta':
              this.raiseMessage({ text: message?.delta?.text ?? "", role: 'assistant', mode: 'append' });
              break;
            case 'message_start':
              this.raiseLogMessage({ text: `Message sent (input: ${message.usage?.input_tokens} tokens)`, data: [ message ]})
              break;
            case 'message_stop':
              this.raiseLogMessage({ text: `Message received (input: ${message.inputTokenCount} tokens, output: ${message.outputTokenCount})`, data: [ message ]})
              break;
            default:
              this.raiseLogMessage({ text: `Event ${message.type}`, data: [ message ]})
              break;
          }
          console.log("event", message);
        }
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await client.messages.create({ ...params, stream: false }).withResponse();
        response = message.response;
        return this.raiseMessage({ text: message.data.content, role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class NatDevChatProvider extends AIProvider {
  constructor(config, proxy) {
    super(config, proxy);
  }

  async sendRequest(state) {
    let response, json;
    console.log(this);
    response = await this.fetch(this.proxy.modifyUrl("https://clerk.nat.dev/v1/client?_clerk_js_version=4.35.0"), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Origin': 'https://nat.dev',
        'Referer': 'https://nat.dev/',
      },
      signal: state.signal,
    });
    console.log(await response.json());
    /*[ response, json ] = await this.callApi(state, 'GET', 'all_models', null);
    if (json === false)
      return;*/
    console.log("All models", json);
  }

  async sendAsyncApi(state) {
    const connectTimeoutMs = 10000;
    if (this.pusher != null)
      return;
    const pusherConfig = {
      key: 'a9198d6754ae6285290b',
      cluster: 'mt1'
    };
    const pusherParams = new URLSearchParams({
      protocol: 7,
      client: 'js',
      version: '8.0.1',
    });
    let resolveConnectionEstablshed = null;
    this.pusher = new WebSocket(`wss://ws-${pusherConfig.cluster}.pusher.com/app/${pusherConfig.key}?${pusherParams}`);
    this.pusher.addEventListener('message', e => {
      if (state.signal.aborted) {
        this.pusher.close();
        return;
      }
      const message = JSON.parse(e.data);
      const data = typeof message.data === 'string' ? JSON.parse(message.data) : null;
      console.log("Pusher message", message, "data", data);
      switch (message.event) {
        case 'pusher:connection_established':
          resolveConnectionEstablshed?.call();
          break;
        case 'batchTokensBegin':
          console.log("Pusher begin tokens", message.channel);
          break;
        case 'batchTokensAvailable':
          const tokensText = data.tokens.join("");
          console.log("Pusher tokens", message.channel, tokensText);
          this.raiseMessage({ text: tokensText, role: 'bot', mode: 'append' });
          break;
        case 'batchTokensEnd':
          console.log("Pusher end tokens", message.channel, data.messageId);
          this.pusher.close();
          break;
      }
    });
    this.pusher.addEventListener('error', e => {
      this.raiseError("Pusher error", new Error(`${e}`), state, null);
    });
    console.log(this.pusher);
    await Promise.race([
      timeout(connectTimeoutMs),
      new Promise(resolve => { resolveConnectionEstablshed = resolve }),
    ]);
    // {"event":"pusher:connection_established","data":"{\"socket_id\":\"445294.25458239\",\"activity_timeout\":120}"}
    // OUT {"event":"pusher:subscribe","data":{"auth":"","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}}
    // {"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // {"event":"batchTokensBegin","data":"{}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // {"event":"batchTokensAvailable","data":"{\"tokens\":[\" a\",\"b\"]}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}	
    // {"event":"batchTokensEnd","data":"{\"messageId\":\"clfqr6we1000kl90fssqx1qmb\"}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // OUT {"event":"pusher:ping","data":{}}
    // {"event":"pusher:pong","data":"{}"}
  }

  async callApi(state, method, apiPath, data) {
    const baseUrl = this.config.url || 'https://nat.dev/api/';
    const response = await this.fetch(this.proxy.modifyUrl(new URL(apiPath, baseUrl).toString()), {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.key}`,
        'Origin': 'https://nat.dev',
        'Referer': 'https://nat.dev/',
      },
      body: method == 'POST' && data != null ? JSON.stringify(data) : null,
      signal: state.signal,
    });
    const json = await this.handleJsonResponse(state, response);
    return [ response, json ];
  }

  async handleJson(json, state, response) {
    /*if (json?.status?.state == 'failed') {
      const { statusCode, statusMessage } = json.status;
      const errorMessage = `${statusCode != null ? `${statusCode}: ` : ""}${statusMessage}`;
      return this.raiseError("Received error message", new Error(errorMessage), state, response);
    }*/
    return json;
  }
}

export class SteamShipPluginProvider extends AIProvider {
  async sendRequest(state) {
    const pollDelayMs = 2000;

    // Plugin: instance: create
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    let [ response, json ] = await this.callApi(state, 'plugin/instance/generate', {
      appendOutputToFile: false,
      text: allMessages.map(m => m.text).join("\n"),
      pluginInstance: this.config.workspace,
    })
    if (json === false)
      return false;
    console.log("SteamShip init", json);
    const taskId = json?.status?.taskId;
    if (taskId == null)
      return this.raiseError("Failed to generate", new Error("No task id"), state, response);
    else
      this.raiseLogMessage({ text: "Sending message (done: generate)" });

    // Task: status
    let prevState = '';
    while (true) {
      [ response, json ] = await this.callApi(state, 'task/status', { taskId });
      if (json === false)
        return;
      console.log("SteamShip poll", json.status.state, json);

      if (json.data != null) {
        const block = json.data.blocks[0];
        return this.raiseMessage({
          text: block.text,
          role: block.tags.filter(t => t.kind == 'role')[0]?.name ?? 'assistant',
          mode: 'complete',
        });
      }

      if (prevState != json.status.state) {
        prevState = json.status.state;
        this.raiseLogMessage({ text: `Sending message (${prevState})` });
      }
      await delay(pollDelayMs);
    }
  }

  async callApi(state, apiPath, data) {
    const baseUrl = this.config.url || 'https://api.steamship.com/api/v1/';
    const response = await this.fetch(this.proxy.modifyUrl(new URL(apiPath, baseUrl).toString()), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.key}`,
        'X-Workspace-Handle': this.config.workspace,
      },
      body: JSON.stringify(data),
      signal: state.signal,
    });
    const json = await this.handleJsonResponse(state, response);
    return [ response, json ];
  }

  async handleJson(json, state, response) {
    if (json?.status?.state == 'failed') {
      const { statusCode, statusMessage } = json.status;
      const errorMessage = `${statusCode != null ? `${statusCode}: ` : ""}${statusMessage}`;
      return this.raiseError("Received error message", new Error(errorMessage), state, response);
    }
    return json;
  }
}

export class ScaleSpellbookProvider extends AIProvider {
  async sendRequest(state) {
    let messageText = state.messages.map(m => m.text).join("\n");
    let response = await this.getResponse(state, messageText);    
    return await this.handleJsonResponse(state, response);
  }

  async getResponse(state, messageText) {
    return await this.fetch(this.proxy.modifyUrl(this.config.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + this.config.key,
      },
      body: JSON.stringify({ input: { input: messageText } }),
      signal: state.signal,
    });
  }

  async handleJson(json, state, response) {
    if (json.output == null || json.message != null)
      return this.raiseError("Received error message", new Error(json.message || "Unknown"), state, response);
    else
      return this.raiseMessage({ text: json.output, role: "", mode: 'complete' });
  }
}

export class ScaleSpellbookFishProvider extends AIProvider {
  pusher;

  async getResponse(state, messageText) {
    return await this.fetch(`https://fishtailprotocol.com/projects/betterGPT4/scale-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ OAIToken: this.config.key, scaleURL: this.config.url, chatLog: messageText }),
      signal: state.signal,
    });
  }

  async handleJson(json, state, response) {
    return super.handleJson(json.response, state, response);
  }
}

export class ChatBotKitProvider extends AIProvider {
  static baseApiUrl = 'https://api.chatbotkit.com/v1/';

  async sendRequest(state) {
    const messageRoleMap = { assistant: 'bot', system: 'backstory' };
    const isSystemRole = role => role == 'backstory' || role == 'system';
    let response, json;

    // Conversation: create
    const allMessages = state.messages.filter(m => m.text?.length > 0);
    const chatMessages = allMessages.filter(m => !isSystemRole(m.role));
    const systemMessages = allMessages.filter(m => isSystemRole(m.role));
    const prevMessages = chatMessages.slice(0, -1);
    [ response, json ] = await this.callApi(state, 'conversation/create', {
      backstory: systemMessages.map(m => m.text).join("\n"),
      model: this.config.model,
      datasetId: "",
      skillsetId: "",
      messages: prevMessages.map(m => ({
        type: messageRoleMap[m.role] || m.role || 'user',
        text: m.text,
      }))
    });
    if (json === false)
      return false;
    const convId = json.id;

    let message = null;
    try {
      // Conversation: send
      const newMessage = chatMessages.slice(-1)[0];
      [ response, json ] = await this.callApi(state, `conversation/${convId}/send`, {
        text: newMessage.text,
        entities: [],
      });
      if (json === false)
        return false;

      if (this.config.stream) {
        // Conversation: receive (stream)
        try {
          await this.connectToPusher(state);
        }
        catch (ex) {
          this.raiseError("Failed to receive message", ex, state, null);
          return false;
        }
        const channelId = generateUuid();
        this.pusher.send(JSON.stringify({ event: 'pusher:subscribe', data: { auto: '', channel: channelId } }));
        [ response, json ] = await this.callApi(state, `conversation/${convId}/receive`, {
          parse: false,
          channel: channelId,
        });
        message = { text: "", role: 'bot', mode: 'done' };
      } else {
        // Conversation: receive
        [ response, json ] = await this.callApi(state, `conversation/${convId}/receive`, {
          parse: false,
        });
        if (json === false)
          return false;
        message = { role: 'bot', text: json.text, mode: 'complete' };
      }
    } finally {
      // Conversation: delete
      try {
        [ response, json ] = await this.callApi(state, `conversation/${convId}/delete`, {}, false);
      } finally {
        if (message != null)
          this.raiseMessage(message);
      }
    }

    return true;
  }

  async connectToPusher(state) {
    const pusherConnectTimeoutMs = 10000;
    if (this.pusher != null)
      return;
    const pusherConfig = {
      key: 'a9198d6754ae6285290b',
      cluster: 'mt1'
    };
    const pusherParams = new URLSearchParams({
      protocol: 7,
      client: 'js',
      version: '8.0.1',
    });
    let resolveConnectionEstablshed = null;
    this.pusher = new WebSocket(`wss://ws-${pusherConfig.cluster}.pusher.com/app/${pusherConfig.key}?${pusherParams}`);
    this.pusher.addEventListener('message', e => {
      if (state.signal.aborted) {
        this.pusher.close();
        return;
      }
      const message = JSON.parse(e.data);
      const data = typeof message.data === 'string' ? JSON.parse(message.data) : null;
      console.log("Pusher message", message, "data", data);
      switch (message.event) {
        case 'pusher:connection_established':
          resolveConnectionEstablshed?.call();
          break;
        case 'batchTokensBegin':
          console.log("Pusher begin tokens", message.channel);
          break;
        case 'batchTokensAvailable':
          const tokensText = data.tokens.join("");
          console.log("Pusher tokens", message.channel, tokensText);
          this.raiseMessage({ text: tokensText, role: 'bot', mode: 'append' });
          break;
        case 'batchTokensEnd':
          console.log("Pusher end tokens", message.channel, data.messageId);
          this.pusher.close();
          break;
      }
    });
    this.pusher.addEventListener('error', e => {
      this.raiseError("Pusher error", new Error(`${e}`), state, null);
    });
    console.log(this.pusher);
    await Promise.race([
      timeout(pusherConnectTimeoutMs),
      new Promise(resolve => { resolveConnectionEstablshed = resolve }),
    ]);
    // {"event":"pusher:connection_established","data":"{\"socket_id\":\"445294.25458239\",\"activity_timeout\":120}"}
    // OUT {"event":"pusher:subscribe","data":{"auth":"","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}}
    // {"event":"pusher_internal:subscription_succeeded","data":"{}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // {"event":"batchTokensBegin","data":"{}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // {"event":"batchTokensAvailable","data":"{\"tokens\":[\" a\",\"b\"]}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}	
    // {"event":"batchTokensEnd","data":"{\"messageId\":\"clfqr6we1000kl90fssqx1qmb\"}","channel":"b92249d1-0994-505e-9c6a-45e1789269c9"}
    // OUT {"event":"pusher:ping","data":{}}
    // {"event":"pusher:pong","data":"{}"}
  }

  async callApi(state, apiPath, data, isLogged = true) {
    const baseUrl = this.config.url || ChatBotKitProvider.baseApiUrl;
    const response = await this.fetch(this.proxy.modifyUrl(new URL(apiPath, baseUrl).toString()), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.key}`,
      },
      body: JSON.stringify(data),
      signal: state.signal,
    });
    const taskName = apiPath.replace(/\/(.*\/)?/, ' - ');
    const json = await this.handleJsonResponse(state, response);
    if (json !== false && isLogged)
      this.raiseLogMessage({ text: `Sending message (done: ${taskName})`, data: [ json ] });
    return [ response, json ];
  }

  async handleJson(json, state, response) {
    if (json.message != null)
      return this.raiseError("Received error message", new Error(`${json.code}: ${json.message}`), state, response);
    return json;
  }
}

export class Proxy {
  config;

  constructor(config) {
    if (this.constructor === Proxy)
      throw new AbstractClassError(this);
    Object.assign(this, { config });
  }

  modifyUrl(url) {
    return url;
  }
}

export class DirectProxy extends Proxy {
}

export class CorsAnywhereProxy extends Proxy {
  modifyUrl(url) {
    return (this.config.url || "https://cors-anywhere.herokuapp.com/") + url;
  }
}

class NotImplementedError extends Error {
  constructor(methodName) {
    super(`Method ${methodName} not impleented`);
  }
}

class AbstractClassError extends Error {
  constructor(self) {
    super(`Can not instantiate abstract class ${self.constructor.name}`);
  }
}