'use strict'

import { parseFloatOrNull, parseIntOrNull, parseJSONOrNull, events } from './utils'

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
        { key: "", url: "", model: "", resource: "", deployment: "", apiVersion: "", stream: true, rawUrl: false },
        [], [],
      ),
      new AIConnectionFactory(
        'openai-text', "OpenAI Text", OpenAITextProvider,
        { key: "", url: "", model: "", stream: true, rawUrl: false }, [],
        [ 'gpt-3.5-turbo-instruct' ],
      ),
      new AIConnectionFactory(
        'openai-chat', "OpenAI Chat", OpenAIChatProvider,
        { key: "", url: "", model: "", stream: true, rawUrl: false },
        [ 'user', 'assistant', 'system' ],
        [
          // https://platform.openai.com/docs/models
          // https://github.com/openai/openai-node/blob/master/src/resources/chat/completions.ts
          'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-4-turbo-preview', // gpt-4 turbo 128k
          'gpt-4-1106-vision-preview', 'gpt-4-vision-preview', // gpt-4 turbo 128k vision
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
        { key: "", resource: "", deployment: "", apiVersion: "", stream: true },
        [ 'user', 'assistant', 'system' ],
        [],
      ),
      new AIConnectionFactory(
        'anthropic-text', "Anthropic Text", AnthropicTextProvider,
        { key: "", url: "", model: "", stream: true, rawUrl: false },
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
        { key: "", url: "", model: "", stream: true, rawUrl: false },
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

  get keyHeader() {
    return 'Authorization';
  }

  async sendRequest(state) {
    return { error: "Provider not implemented" };
  }

  appendURL(url, postfix, rawUrl = false) {
    return rawUrl || url.endsWith(postfix) ? url : url.endsWith("/") ? `${url}${postfix}` : `${url}/${postfix}`;
  }

  createFetchJsonOptions(signal, data) {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    };
    const [ key, keyHeader ] = [ this.config.key, this.keyHeader ];
    if (key?.length > 0 && keyHeader?.length > 0)
      options.headers[keyHeader] = keyHeader == 'Authorization' ? `Bearer ${key}` : key;
    this.setExtraHeaders(options.headers);
    return options;
  }

  setExtraHeaders(headers) { }

  async fetch(url, options) {
    const response = await fetch(this.config.rawUrl ? this.config.url : url, options);
    const headers = {};
    response.headers.forEach((v, k) => headers[k] = v);
    console.log("Received HTTP response:", response, "headers:", headers);
    return response;
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
    const url = this.appendURL(this.proxy.modifyUrl(this.config.url || "https://api.openai.com"), "v1/completions");
    const options = this.createFetchJsonOptions(state.signal, {
      prompt: state.messages.map(m => `${m.text}\n\n`).join(""),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
      //top_p: null,
    });
    let response = null;
    try {
      response = await this.fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const message = parseJSONOrNull(text);
        return this.raiseError("Query failed", new Error(message?.error?.message ?? message.error ?? text?.slice(0, 256)), state, response);
      }
      if (this.config.stream) {
        for await (const event of events(response, options.signal)) {
          const message = event.json;
          switch (message?.object) {
            case 'text_completion':
              this.raiseMessage({ text: message.choices?.[0]?.text ?? "", role: 'assistant', mode: 'append', data: [ message ] });
              break;
            default:
              this.raiseLogMessage({ text: `Event ${message?.object ?? "?"}`, data: [ event ]});
              break;
          }
        }
      } else {
        const message = await response.json();
        return this.raiseMessage({ text: message.choices?.[0]?.text ?? "", role: 'assistant', mode: 'complete' });
      }
      return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class OpenAIChatProvider extends AIProvider {
  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const url = this.appendURL(this.proxy.modifyUrl(this.config.url || "https://api.openai.com"), "v1/chat/completions");
    const options = this.createFetchJsonOptions(state.signal, {
      messages: state.messages.map(m => ({
        role: getMessageRole(m.role),
        content: m.text,
      })),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
      stream: this.config.stream,
      //top_p: null,
    });
    let response = null;
    try {
      response = await this.fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const message = parseJSONOrNull(text);
        return this.raiseError("Query failed", new Error(message?.error?.message ?? message.error ?? text?.slice(0, 256)), state, response);
      }
      if (this.config.stream) {
        for await (const event of events(response, options.signal)) {
          const message = event.json;
          switch (message?.object) {
            case 'chat.completion.chunk':
              this.raiseMessage({ text: message.choices?.[0]?.delta?.content ?? "", role: 'assistant', mode: 'append', data: [ message ] });
              break;
            default:
              this.raiseLogMessage({ text: `Event ${message?.object ?? "?"}`, data: [ event ]});
              break;
          }
        }
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await response.json();
        return this.raiseMessage({ text: message.choices?.[0]?.message?.content ?? "", role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class AzureOpenAIChatProvider extends OpenAIChatProvider {
  get keyHeader() {
    return 'Api-Key';
  }

  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const client = new AzureOpenAIClient(
      this.proxy.modifyUrl(`https://${this.config.resource}.openai.azure.com/`),
      new AzureKeyCredential(this.config.key), {
        apiVersion: this.config.apiVersion,
      });
    const messages = state.messages.map(m => ({
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

export class AnthropicProvider extends AIProvider {
  get keyHeader(){
    return 'X-Api-Key';
  }

  setExtraHeaders(headers) {
    headers['Anthropic-Version'] = "2023-06-01";
  }
}

export class AnthropicTextProvider extends AnthropicProvider {
  async sendRequest(state) {
    const [ humanPrompt, assistentPrompt ] = [ "\n\nHuman:", "\n\nAssistant:" ];
    const getMessageRole = r =>
      (r || '').match(/system/i) ? "" :
      (r || '').match(/user|human/i) ? humanPrompt : assistentPrompt;
    const url = this.appendURL(this.proxy.modifyUrl(this.config.url || 'https://api.anthropic.com'), "v1/complete");
    const options = this.createFetchJsonOptions(state.signal, {
      prompt:
        state.messages.map(m => `${getMessageRole(m.role)} ${m.text}`).join("") +
        (getMessageRole(state.messages.at(-1)?.role) == assistentPrompt ? "" : assistentPrompt),
      model: this.config.model,
      max_tokens_to_sample: this.config.maxTokens,
      temperature: this.config.temperature,
      //top_p: -1,
      //top_k: -1,
      stop_sequences: [ humanPrompt ],
      stream: this.config.stream,
    });
    let response = null;
    try {
      response = await this.fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const message = parseJSONOrNull(text);
        return this.raiseError("Query failed", new Error(message?.error?.message ?? message.error ?? text?.slice(0, 256)), state, response);
      }
      if (this.config.stream) {
        const stream = events(response, options.signal);
        for await (const event of stream) {
          const message = event.json;
          switch (event.type ?? message?.type) {
            case 'completion':
              this.raiseMessage({ text: message.completion ?? "", role: 'assistant', mode: 'append', data: [ message ] });
              break;
            case 'error':
              this.raiseError("Received error", new Error(message?.error?.message), state, response);
              break;
            default:
              this.raiseLogMessage({ text: `Event ${message?.type ?? "?"}`, data: [ event ]});
              break;
          }
        }
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await response.json();
        return this.raiseMessage({ text: message.completion, role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
  }
}

export class AnthropicMessagesProvider extends AnthropicProvider {
  async sendRequest(state) {
    const getMessageRole = r =>
      (r || '').match(/system/i) ? 'system' :
      (r || '').match(/user|human/i) ? 'user' : 'assistant';
    const url = this.appendURL(this.proxy.modifyUrl(this.config.url || 'https://api.anthropic.com'), "v1/messages");
    const options = this.createFetchJsonOptions(state.signal, {
      messages: state.messages.filter(m => getMessageRole(m.role) != 'system').map(m => ({
        role: getMessageRole(m.role),
        content: m.text.trimRight(),
      })),
      system: state.messages.filter(m => getMessageRole(m.role) == 'system').map(m => m.text).join("\n").trim(),
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      //top_p: -1,
      //top_k: -1,
      stream: this.config.stream,
    });
    let response = null;
    try {
      response = await this.fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        const message = parseJSONOrNull(text);
        return this.raiseError("Query failed", new Error(message?.error?.message ?? message.error ?? text?.slice(0, 256)), state, response);
      }
      if (this.config.stream) {
        for await (const event of events(response, options.signal)) {
          const message = event.json;
          switch (event.type ?? message?.type) {
            case 'content_block_delta':
              this.raiseMessage({ text: message.delta?.text ?? "", role: 'assistant', mode: 'append', data: [ message ] });
              break;
            case 'message_start':
              const info = message.message ?? message;
              this.raiseLogMessage({ text: `Message start (model: ${info.model}, input: ${info.usage?.input_tokens} tokens)`, data: [ message ]})
              break;
            case 'message_stop':
              const bedrockMetrics = message['amazon-bedrock-invocationMetrics'];
              const inputTokenCount = message.inputTokenCount ?? bedrockMetrics?.inputTokenCount;
              const outputTokenCount = message.outputTokenCount ?? bedrockMetrics?.outputTokenCount;
              this.raiseLogMessage({ text: `Message stop (input: ${inputTokenCount} tokens, output: ${outputTokenCount})`, data: [ message ]})
              break;
            case 'error':
              this.raiseError("Received error", new Error(message?.error?.message), state, response);
              break;
            default:
              this.raiseLogMessage({ text: `Event ${message?.type ?? "?"}`, data: [ event ]});
              break;
          }
        }
        return this.raiseMessage({ text: "", role: 'assistant', mode: 'done' });
      } else {
        const message = await response.json();
        return this.raiseMessage({ text: message.content?.text, role: 'assistant', mode: 'complete' });
      }
    } catch (ex) {
      return this.raiseError("Query failed", ex, state, response);
    }
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