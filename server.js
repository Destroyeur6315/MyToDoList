'use strict';

/**
 * Entry point: opens the database, starts the HTTP server and handles
 * graceful shutdown. All application logic lives in `src/`.
 */

const path = require('node:path');
const config = require('./src/config');
const { openDatabase } = require('./src/db/database');
const { createApp } = require('./src/app');

function start() {
  if (config.isProduction && config.trustProxy === 0) {
    // Behind a reverse proxy, every client would share the proxy's IP:
    // rate limiting and HTTPS detection would then be wrong.
    console.warn('Attention : TRUST_PROXY=0. Si l\'application est derrière un reverse proxy, '
      + 'définir TRUST_PROXY au nombre exact de proxys.');
  }

  const db = openDatabase(config.dbPath);
  console.log(`Base de données : ${config.dbPath}`);
  if (config.isProduction && config.dbPath.startsWith(__dirname + path.sep)) {
    // Git-based deployments replace the app folder: the database would be lost.
    console.warn('Attention : la base est dans le dossier de l\'application et peut être '
      + 'écrasée à chaque déploiement. Définir DB_PATH vers un dossier persistant.');
  }
  const app = createApp({ db, config });

  const server = app.listen(config.port, () => {
    console.log(`MyToDoList disponible sur http://localhost:${config.port}`);
  });

  const cleanup = setInterval(app.locals.purgeExpiredSessions, config.session.cleanupIntervalMs);
  cleanup.unref(); // Never keep the process alive just for this timer.

  const shutdown = () => {
    clearInterval(cleanup);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Always start: hosting platforms such as Hostinger load this file through
// their own launcher, so a `require.main === module` guard would never fire.
start();
