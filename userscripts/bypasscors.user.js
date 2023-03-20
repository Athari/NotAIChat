// ==UserScript==
// @name         Scale Chat - Bypass CORS
// @version      1.0
// @description  Bypass CORS in Scale Chat app. Add extra matches to enable on other domains.
// @author       Athari
// @match        https://athari.github.io/ScaleChat/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scale.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      dashboard.scale.com
// @connect      *
// @run-at       document-start
// @require      https://raw.githubusercontent.com/mitchellmebane/GM_fetch/master/GM_fetch.min.js
// ==/UserScript==
window.fetch = GM_fetch;
unsafeWindow.fetch = GM_fetch;
