import App from './app.svelte';
import './global.css';

const app = new App({
  target: document.querySelector('#root'),
});

export default app;