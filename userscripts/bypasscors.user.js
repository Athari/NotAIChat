// ==UserScript==
// @name         Scale Chat - CORS
// @version      1.0
// @description  Bypass CORS
// @author       Athari
// @match        https://athari.github.io/ScaleChat/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scale.com
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// @require      https://raw.githubusercontent.com/mitchellmebane/GM_fetch/master/GM_fetch.min.js
// ==/UserScript==
window.fetch = GM_fetch;
unsafeWindow.fetch = GM_fetch;
