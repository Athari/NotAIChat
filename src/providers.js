'use strict';

import { delay } from './utils'

export class AIConnectionFactory {
  static providers = [];
  static proxies = [];

  displayName;
  id;
  defaultConfig;
  runner;

  constructor(id, displayName, runner, configGetter) {
    Object.assign(this, { id, displayName, runner, configGetter });
  }

  static init() {
    AIConnectionFactory.providers = [
      new AIConnectionFactory(
        '', "", EmptyAIProvider,
        {},
      ),
      new AIConnectionFactory(
        'openai-text', "OpenAI Text", OpenAITextProvider,
        { key: "", url: "" },
      ),
      new AIConnectionFactory(
        'openai-chat', "OpenAI Chat", OpenAIChatProvider,
        { key: "", url: "" },
      ),
      new AIConnectionFactory(
        'steamship-plugin', "SteamShip Plugin", SteamShipPluginProvider,
        { key: "", workspace: "" },
      ),
      new AIConnectionFactory(
        'scale-spellbook', "Scale Spellbook", ScaleSpellbookProvider,
        { key: "", url: "" },
      ),
      new AIConnectionFactory(
        'scale-spellbook-fish', "Scale Spellbook (Fish proxy)", ScaleSpellbookFishProvider,
        { key: "", url: "" },
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

  static createConnection(providerConfig, proxyConfig) {
    if (providerConfig == null)
      return null;
    const provider = AIConnectionFactory.getProvider(providerConfig.typeId);
    if (provider.runner === EmptyAIProvider)
      return null;
    const proxy = AIConnectionFactory.getProxy(proxyConfig?.typeId);
    return new provider.runner(providerConfig, new proxy.runner(proxyConfig));
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

  async handleJsonResponse(state, response) {
    let text;
    try {
      text = await response.text();
    }
    catch (ex) {
      this.raiseError("Failed to decode message", ex, state, response);
      return;
    }
    try{
      await this.handleJson(JSON.parse(text), state, response);
    }
    catch (ex) {
      this.raiseError(text.length > 4096 ? "Failed to parse message" : text, ex, state, response);
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
  }

  raiseError(errorMessage, error, state, response) {
    const httpErrorText = response == null || response.ok ? "" :
      ` (HTTP code: ${response.status}${` ${response.statusText}`.trim()})`;
    this.onError?.call(this, {
      text: `${errorMessage}${state.extraText}: ${error.message}${httpErrorText}`,
      error,
    });
  }
}

export class EmptyAIProvider extends AIProvider {
  async sendRequest(state) {
    return { error: "Provider not set" };
  }
}

export class OpenAITextProvider extends AIProvider {
}

export class OpenAIChatProvider extends AIProvider {
}

export class SteamShipPluginProvider extends AIProvider {
  async sendRequest(state) {
    const baseUrl = 'https://api.steamship.com/api/v1/';
    const pollDelayMs = 2000;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.key}`,
      'X-Workspace-Handle': this.config.workspace,
    };

    let response;
    let taskId;
    try {
      response = await fetch(this.proxy.modifyUrl(`${baseUrl}plugin/instance/generate`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          appendOutputToFile: false,
          text: state.messages.map(m => m.text).join("\n"),
          pluginInstance: this.config.workspace,
        }),
        signal: state.signal,
      });
      const json = await response.json();
      console.log("SteamShip init", json);
      taskId = json?.status?.taskId;
      if (taskId == null)
        throw new Error("No task id");
    } catch (ex) {
      this.raiseError("Failed to generate", ex, state, response);
    }

    let prevState = '';
    while (true) {
      response = await fetch(this.proxy.modifyUrl(`${baseUrl}task/status`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ taskId }),
        signal: state.signal,
      });
      const json = await response.json();
      console.log("SteamShip poll", json.status.state, json);

      if (json.data != null) {
        const block = json.data.blocks[0];
        this.raiseMessage({
          text: block.text,
          role: block.tags.filter(t => t.kind == 'role')[0]?.name ?? 'assistant',
        });
        return;
      } else if (json.status.state == 'failed') {
        const errorMessage = `${json.status.statusCode}: ${json.status.statusMessage}`;
        this.raiseError("Failed to generate message", new Error(errorMessage), state, response);
        return;
      }

      if (prevState != json.status.state) {
        prevState = json.status.state;
        this.raiseLogMessage({ text: `Sending message (${prevState})` });
      }
      await delay(pollDelayMs);
    }
  }
}

export class ScaleSpellbookProvider extends AIProvider {
  async sendRequest(state) {
    let messageText = state.messages.map(m => m.text).join("\n");
    let response = await this.getResponse(state, messageText);    
    await this.handleJsonResponse(state, response);
  }

  async getResponse(state, messageText) {
    return await fetch(this.proxy.modifyUrl(this.config.url), {
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
      this.raiseError("Received error message", new Error(json.message || "Unknown"), state, response);
    else
      this.raiseMessage({ text: json.output, role: "" });
  }
}

export class ScaleSpellbookFishProvider extends AIProvider {
  async getResponse(state, messageText) {
    return await fetch(`https://fishtailprotocol.com/projects/betterGPT4/scale-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ OAIToken: this.config.key, scaleURL: this.config.url, chatLog: messageText }),
      signal: state.signal,
    });
  }

  async handleJson(json, state, response) {
    super.handleJson(json.response, state, response);
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
    return (this.config.url?.length > 0 ? this.config.url : "https://cors-anywhere.herokuapp.com/") + url;
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