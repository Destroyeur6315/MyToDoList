# Trois pipelines GitHub Actions : CI / Security / Quality

Copier le dossier `.github` à la racine de votre dépôt GitHub.

## CI — ci.yml

- `npm ci`, puis `node --test tests/api.test.js tests/validation.test.js`.
- Utilise les tests fournis, basés sur `node:test` (pas Jest).
- `api.test.js` lance un Express éphémère et une SQLite temporaire ; le workflow CI n'a pas besoin d'un `npm start` séparé.
- Le code doit se trouver dans `src/` et le dossier `tests/` doit contenir les deux fichiers.

## Sécurité — security.yml

Trois jobs indépendants :
- Semgrep CE (`p/default`, bloque dès qu'un résultat est détecté), rapport JSON.
- `npm audit --audit-level=high` (bloque sur high/critical), rapport JSON.
- OWASP ZAP Full Scan, contre Express lancé DANS le runner, via Docker `--network host` (Linux), rapport HTML et JSON.

**Configurer le job ZAP :** variables `APP_PORT`, `APP_HEALTH_PATH`, `APP_START_COMMAND` dans `security.yml`. Par défaut : port 3000, chemin `/`, `npm start`. Le script npm `start` doit exister. Le chemin de santé doit répondre en HTTP 2xx (sans redirection). Si Express ne démarre pas avec ces paramètres, adapter le job.

**Isolation obligatoire :** utiliser une base SQLite de test et aucun secret/service externe de production. `NODE_ENV=test` est défini mais ne garantit pas, à lui seul, l'isolation : vérifier le code de démarrage et sa configuration DB. Les tests ZAP sont actifs et peuvent modifier/supprimer des données. Le scan par défaut est NON authentifié et ne couvre pas complètement les routes réservées aux utilisateurs ; il faut une configuration de session ZAP pour cela.

**Politique de blocage ZAP :** `-I` évite les échecs sur les warnings, ceux-ci restent dans les rapports. ZAP classe par défaut ses alertes en WARN ; **le scan ne bloque donc pas sur les vulnérabilités détectées par défaut**. Pour l'utiliser comme garde-fou, fournir un fichier de règles ZAP avec les règles à `FAIL` (option `-c`) et retirer/adapter `-I` selon la politique souhaitée. En revanche, une erreur technique de scan échoue le job.

La durée du full scan peut être élevée ; `-m 3` limite le spider traditionnel, `-T 5` l'attente de démarrage/passif. `timeout-minutes: 45` limite le job entier.

## Qualité — quality.yml

SonarQube **Cloud**. Créer un projet sur https://sonarcloud.io puis renseigner dans GitHub :

- **Settings > Secrets and variables > Actions > Variables** : `SONAR_PROJECT_KEY`, `SONAR_ORGANIZATION`.
- **Settings > Secrets and variables > Actions > Secrets** : `SONAR_TOKEN`.

Le workflow passe les propriétés directement à l'action : pas besoin de `sonar-project.properties`. Il analyse `src/`, déclare `tests/` comme tests et attend le Quality Gate.

**Pas de rapport de couverture déclaré** : les tests partagés ne montrent pas de génération d'un rapport LCOV. Il faudra ajouter la couverture ultérieurement si vous souhaitez l'afficher dans SonarQube.

Les PR provenant de forks n'ont généralement pas accès aux secrets : le job SonarQube échouera sans `SONAR_TOKEN`. Prévoir une politique dédiée si vous acceptez des contributions externes. Ne pas utiliser `pull_request_target` pour analyser du code non fiable avec des secrets.

## Déclenchement

Les trois workflows s'exécutent séparément : push sur `main`/`master`, PR vers ces branches, ou lancement manuel. Aucun n'attend les autres. Pour protéger `main`, configurer les vérifications requises dans les règles de protection des branches GitHub.

## Pré-requis

Node 22, un `package-lock.json` et un `package.json` à la racine, code sous `src/`, fichiers `tests/api.test.js` et `tests/validation.test.js`.

Les workflows n'ont pas été exécutés sur le dépôt complet (non fourni), notamment la commande `npm start` du job ZAP reste à valider.

Documentation :
- https://docs.github.com/en/actions
- https://www.zaproxy.org/docs/docker/full-scan/
- https://semgrep.dev/docs/
- https://github.com/SonarSource/sonarqube-scan-action
