import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp({ config });

app.listen(config.port, () => {
  console.info(`[api] listening on http://localhost:${config.port}`);
});
