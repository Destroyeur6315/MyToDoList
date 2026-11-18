# CI sécurité : Node.js / Express

Le workflow `.github/workflows/security.yml` lance trois jobs en parallèle :

- **Semgrep (SAST)** : règles OWASP Top 10 et JavaScript ; échec si Semgrep trouve des résultats.
- **npm audit (SCA)** : échec à partir de vulnérabilités `high` ou `critical`.
- **OWASP ZAP Full Scan (DAST)** : démarre l'application dans le runner GitHub, puis lance un scan actif. Les rapports sont téléchargeables depuis l'onglet **Actions** > exécution > **Artifacts**.

## Pré-requis

1. `package.json` et `package-lock.json` à la **racine** du dépôt (`npm ci` doit fonctionner).
2. `npm start` doit démarrer Express et maintenir le serveur actif.
3. L'application doit écouter `PORT` (par défaut ici `3000`) et proposer une URL HTTP accessible.
4. Si l'app dépend d'une BDD, d'API ou de secrets, configure **uniquement** des instances/identifiants de test. Ne jamais lancer le scan actif contre la production.

Si ton code Node.js est dans un sous-dossier, adapte les commandes `npm ci`, `npm start` et le répertoire de travail des jobs.

## Personnalisation dans le workflow

Dans `jobs.zap.env` :

```yaml
APP_PORT: '3000'
APP_START_COMMAND: 'npm start'
APP_HEALTH_PATH: '/'
NODE_ENV: test
```

- Change `APP_START_COMMAND` si ton application utilise `npm run dev`, `node server.js`, etc.
- Change `APP_HEALTH_PATH` si tu as `/health` ou `/api/health` (idéalement une route HTTP 200).
- Fournis des variables de test au job ZAP si le démarrage en requiert.
- Les routes protégées par login **ne sont pas analysées en mode authentifié** dans cette version.

## Conditions d'échec

- Semgrep : tout résultat détecté avec `--error` (les règles doivent éventuellement être ajustées après triage).
- npm audit : au moins un niveau `high` ou `critical`.
- ZAP : `-I` ignore les alertes WARN pour le code de retour ; les alertes classées FAIL continuent de faire échouer le scan. Les alertes ne sont pas ignorées dans le rapport.

Le scan ZAP Full Scan est **actif et potentiellement destructif** : utilisez des comptes, une base de données et des services isolés. Il peut créer, modifier ou supprimer des données selon les endpoints accessibles.

## Lancer

Copie `.github/workflows/security.yml` dans ton dépôt, puis pousse la branche ou ouvre une pull request. Il est aussi possible de déclencher manuellement depuis **Actions > Security - SAST, SCA, DAST > Run workflow**.

## Limites

Les trois outils ne prouvent pas qu'une app est exempte de failles ; ZAP sans authentification ne couvre pas les routes réservées aux utilisateurs. Pour les contrôler, il faut ajouter un contexte d'authentification ZAP et des scénarios dédiés.
