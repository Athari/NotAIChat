// ==UserScript==
// @name         [Ath] SpellBook Scale - Auto Run
// @version      1.0
// @description  Create app infrastructure automatically
// @author       Athari
// @match        https://spellbook.scale.com/?autorun
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scale.com
// @grant        none
// ==/UserScript==

(async () => {
  const nameSuffix = prompt("Enter hierarchy name suffix");
  if (nameSuffix == null || nameSuffix.length == 0)
    return;

  const appName = `ChatApp${nameSuffix}`;
  const variantName = i => `ChatAppVariant${nameSuffix}${i}`;
  const depName = i => `ChatAppDep${nameSuffix}${i}`;
  const depDisplayName = i => `Scale Spellbook ${nameSuffix} ${i}`;
  const depUri = i => `cht${nameSuffix}${i}`;
  const tokenSizes = prompt("Enter token sizes", "256,512,768,1024,2048,3072,4096").split(",");
  const temperature = +prompt("Enter temperature", "1.0");
  const userTemplate = prompt("Enter user template", '{{ input }}');
  const systemTemplate = prompt("Enter system template", "");

  const now = new Date().toISOString();
  async function queryApi(api, method, params, body = null) {
    const response = await fetch(`https://dashboard.scale.com/spellbook/api/trpc/${api}?${new URLSearchParams(params)}`, {
      method,
      credentials: 'include',
      cache: 'no-cache',
      referrer: 'https://spellbook.scale.com/',
      headers: { 'Content-Type': 'application/json' },
      body : body !== null ? JSON.stringify(body) : null,
    });
    return await response.json();
  }
  const findArg = { json: null, meta: { values: [ 'undefined' ] } };
  const stateJson = await queryApi('app.findVisible,v2.variant.findAll,v2.deployment.findAll,v2.data.info.findAll', 'GET', {
    batch: 1,
    input: JSON.stringify({ 0: findArg, 1: findArg, 2: findArg, 3: findArg }),
  });
  console.log("State", stateJson);
  const getJson = (d, i = 0) => d[i].result.data.json;
  const getState = i => getJson(stateJson, i);
  let [ curApps, curVariants, curDeps, curVds ] = [ getState(0), getState(1), getState(2), getState(3) ];
  console.log("Apps", curApps);
  console.log("Variants", curVariants);
  console.log("Deps", curDeps);
  console.log("Vds", curVds);

  let app = curApps.filter(a => a.name == appName)[0];
  if (app == null) {
    const appJson = await queryApi('app.create', 'POST', { batch: 1 }, {
      0: {
        json: {
          name: appName,
          shortName: null,
          description: null,
          readme: null,
          taskType: 'Classification',
          createdAt: now,
          modifiedAt: now,
          modelId: 'GPT4',
          version: 'V2',
          isPublic: false,
        },
        meta: {
          values: { createdAt: [ 'Date' ], modifiedAt: [ 'Date' ] },
          referentialEqualities: { createdAt: [ 'modifiedAt' ] }
        },
      }
    });
    app = getJson(appJson);
    console.log("Created app", app, app.id);
  }
  console.log("Current app id", app.id);

  let variants = tokenSizes.map(i => curVariants.filter(v => v.name == variantName(i))[0]);
  for (let iv = 0; iv < variants.length; iv++) {
    let [ variant, tokenSize ] = [ variants[iv], tokenSizes[iv] ];
    if (variant == null) {
      const variantJson = await queryApi('v2.variant.create', 'POST', { batch: 1 }, {
        0: {
          json: {
            name: variantName(tokenSize),
            appId: app.id,
            taxonomy: null,
            prompt: {
              template: userTemplate,
              systemMessage: systemTemplate,
              exampleVariables: {},
              variablesSourceData: null,
              variablesSourceDataId: null,
            },
            modelParameters: {
              modelId: 'GPT4',
              modelType: 'OpenAi',
              temperature: temperature,
              maxTokens: tokenSize,
              //stop: "stop",
              //logitBias: null,
              //logprobs: null,
              //suffix: null,
              //topP: null,
            },
          },
          meta: { values: { taxonomy: [ 'undefined' ] } },
        }
      });
      variants[iv] = variant = getJson(variantJson);
      console.log("Created variant", variant, variant.id);
    }
  }
  console.log("Current variant ids", ...variants.map(v => v.id));

  let deps = tokenSizes.map(i => curDeps.filter(d => d.name == depName(i))[0]);
  for (let id = 0; id < deps.length; id++) {
    let [ dep, tokenSize ] = [ deps[id], tokenSizes[id] ];
    if (dep == null) {
      const depJson = await queryApi('v2.deployment.create', 'POST', { batch: 1 }, {
        0: {
          json: {
            name: depName(tokenSize),
            uri: depUri(tokenSize),
            variantId: variants[id].id,
          },
        },
      });
      deps[id] = dep = getJson(depJson);
      console.log("Created dep", dep, dep.id);
    }
  }
  console.log("Current dep ids", ...deps.map(d => d.id));

  downloadFile('application/json',
    `NotAIChat Endpoints ${now.substring(0, 19).replace('T', ' ').replaceAll(':', '-')}`,
    JSON.stringify(deps.map((d, id) => ({
      name: depDisplayName(tokenSizes[id]),
      typeId: 'scale-spellbook',
      key: d.accessKey,
      url: `https://dashboard.scale.com/spellbook/api/v2/deploy/${d.uri}`,
    })), null, "  "));

  function downloadFile(type, filename, data) {
    const blob = new Blob([ data ], { type });
    const elDownloadLink = window.document.createElement('a');
    elDownloadLink.href = window.URL.createObjectURL(blob);
    elDownloadLink.download = filename;
    document.body.appendChild(elDownloadLink);
    elDownloadLink.click();
    document.body.removeChild(elDownloadLink);
  }
})();